# Architecture Patterns

**Domain:** Docker Engine API dispatch, Layer 2 context hydration, named volumes for ClawForge v1.4
**Researched:** 2026-03-06

## Current Architecture (Baseline)

```
User -> Channel (Slack/Telegram/Web)
  -> Layer 1: Event Handler (LangGraph ReAct agent, Next.js, PM2)
    -> create-job.js: GitHub API creates job/{UUID} branch with logs/{UUID}/job.md
    -> (optional) target.json sidecar for cross-repo jobs
  -> GitHub Actions run-job.yml triggers on branch creation
    -> Pulls Docker image, runs container with SECRETS/LLM_SECRETS env vars
    -> entrypoint.sh: clone repo -> build 5-section FULL_PROMPT -> claude -p -> commit -> PR
  -> notify-pr-complete.yml / auto-merge.yml -> webhook to Event Handler
    -> summarizeJob() -> route notification back to originating thread
```

**Key bottleneck:** GitHub Actions cold start (~60s queue + pull + clone). Every job clones fresh.

## Target Architecture (v1.4)

```
User -> Channel
  -> Layer 1: Event Handler
    -> NEW: lib/tools/docker.js -- Docker Engine API via Unix socket
      -> createContainer() with named volume mount -> start() -> wait() -> collect results
      -> Container uses SAME entrypoint.sh (modified for volume-aware clone)
    -> RETAINED: GitHub Actions fallback for CI-integrated repos
  -> NEW: entrypoint.sh hydrates STATE.md + ROADMAP.md + git history into prompt
  -> NEW: Named volumes persist repo clones across jobs (warm start)
  -> RETAINED: Same notification flow (webhook to Event Handler)
```

## Component Boundaries

| Component | Responsibility | New/Modified | Communicates With |
|-----------|---------------|--------------|-------------------|
| `lib/tools/docker.js` | **NEW** -- Docker Engine API wrapper (create, start, wait, logs, cleanup) | New file | Docker socket, Event Handler |
| `lib/ai/tools.js` (create_job) | Dispatch decision: Docker API vs GitHub Actions | Modified | docker.js OR create-job.js |
| `lib/tools/create-job.js` | GitHub API branch+file creation (retained as fallback) | Unchanged | GitHub API |
| `templates/docker/job/entrypoint.sh` | Context assembly + claude execution | Modified | Named volume, GitHub API, Claude CLI |
| `docker-compose.yml` | Named volume definitions, socket mount | Modified | Docker Engine |
| `api/index.js` (github webhook) | Receive job completion notifications | Possibly modified | LangGraph memory, channels |
| `lib/tools/github.js` (getJobStatus) | Job status lookup | Modified | Docker API (new) + GitHub API (existing) |

## Recommended Architecture

### 1. Docker Engine API Dispatch (`lib/tools/docker.js`)

Use **dockerode** (npm) to communicate with the Docker Engine via Unix socket at `/var/run/docker.sock`.

The Event Handler container already has the socket mounted (Traefik uses it). Job containers do NOT need socket access.

```javascript
// lib/tools/docker.js -- Core dispatch function
import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

async function runJobContainer(jobId, { jobDescription, targetRepo, secrets, llmSecrets, image }) {
  const containerName = `clawforge-job-${jobId.slice(0, 8)}`;

  // Determine volume name based on target repo
  const repoSlug = targetRepo ? targetRepo.slug : process.env.GH_REPO;
  const volumeName = `clawforge-repo-${repoSlug}`;

  const container = await docker.createContainer({
    Image: image || process.env.JOB_IMAGE || 'scalingengine/clawforge:job-latest',
    name: containerName,
    Env: [
      `REPO_URL=https://github.com/${targetRepo?.owner || process.env.GH_OWNER}/${repoSlug}.git`,
      `BRANCH=job/${jobId}`,
      `SECRETS=${JSON.stringify(secrets)}`,
      `LLM_SECRETS=${JSON.stringify(llmSecrets)}`,
      `DISPATCH_MODE=docker`,  // Signal to entrypoint that this is Docker-dispatched
    ],
    HostConfig: {
      Binds: [`${volumeName}:/repo-cache`],  // Named volume for repo persistence
      AutoRemove: false,  // We need to inspect exit code before removal
      NetworkMode: 'bridge',
    },
  });

  await container.start();
  const { StatusCode } = await container.wait();

  // Collect logs for debugging
  const logs = await container.logs({ stdout: true, stderr: true });

  await container.remove();

  return { statusCode: StatusCode, logs };
}
```

**Why dockerode:** De facto standard Node.js Docker library. 14M+ weekly downloads. Promise-based API. Direct socket communication. No HTTP overhead. The upstream thepopebot uses it in production (referenced in VISION.md).

**Why NOT raw HTTP to Docker socket:** dockerode handles stream multiplexing, auth, and API versioning. Raw fetch to Unix socket requires manual handling of Docker's chunked transfer encoding and multiplexed streams.

### 2. Dispatch Decision Logic

The `create_job` tool in `tools.js` needs a routing decision: Docker API or GitHub Actions.

```
Decision tree:
1. Is Docker socket available? (check at startup)
   NO  -> GitHub Actions (current path)
   YES -> Continue
2. Is the target repo configured for CI-integrated dispatch?
   YES -> GitHub Actions (needs workflow triggers)
   NO  -> Docker Engine API (fast path)
```

**Implementation approach:** Add a `dispatch` field to `REPOS.json` entries:

```json
{
  "repos": [
    { "slug": "clawforge", "dispatch": "docker" },
    { "slug": "strategyes-lab", "dispatch": "docker" },
    { "slug": "ci-heavy-repo", "dispatch": "actions" }
  ]
}
```

Default to `"docker"` when socket is available. The `create_job` tool still creates the job branch via GitHub API (audit trail), then dispatches the container directly instead of waiting for Actions to trigger.

### 3. Layer 2 Context Hydration (entrypoint.sh changes)

**Current prompt structure (5 sections):**
1. Target (repo slug)
2. Repository Documentation (CLAUDE.md, truncated to 8K chars)
3. Stack (package.json dependencies)
4. Task (job description + prior context)
5. GSD Hint (quick vs plan-phase)

**New prompt structure (7 sections):**
1. Target (repo slug)
2. Repository Documentation (CLAUDE.md)
3. Stack (package.json dependencies)
4. **Project State (STATE.md)** -- NEW
5. **Roadmap Context (ROADMAP.md excerpt)** -- NEW
6. Task (job description + prior context + **recent git history**)
7. GSD Hint

**Implementation in entrypoint.sh:**

```bash
# NEW: Read project state (STATE.md) -- capped at 4K chars
REPO_STATE=""
if [ -f "${WORK_DIR}/.planning/STATE.md" ]; then
    RAW_STATE=$(cat "${WORK_DIR}/.planning/STATE.md")
    if [ "${#RAW_STATE}" -gt 4000 ]; then
        REPO_STATE=$(printf '%s' "$RAW_STATE" | head -c 4000)
        REPO_STATE="${REPO_STATE}\n\n[TRUNCATED]"
    else
        REPO_STATE="$RAW_STATE"
    fi
fi

# NEW: Read roadmap (ROADMAP.md) -- capped at 6K chars
REPO_ROADMAP=""
if [ -f "${WORK_DIR}/.planning/ROADMAP.md" ]; then
    RAW_ROADMAP=$(cat "${WORK_DIR}/.planning/ROADMAP.md")
    if [ "${#RAW_ROADMAP}" -gt 6000 ]; then
        REPO_ROADMAP=$(printf '%s' "$RAW_ROADMAP" | head -c 6000)
        REPO_ROADMAP="${REPO_ROADMAP}\n\n[TRUNCATED]"
    else
        REPO_ROADMAP="$RAW_ROADMAP"
    fi
fi

# NEW: Recent git history (last 10 commits, one-line format)
RECENT_HISTORY=""
if git log --oneline -10 2>/dev/null; then
    RECENT_HISTORY=$(git log --oneline -10 2>/dev/null)
fi
```

**Token budget:** STATE.md (4K chars ~1K tokens) + ROADMAP.md (6K chars ~1.5K tokens) + git history (~200 tokens) = ~2.7K tokens added. Current prompt is ~3-4K tokens. Total ~7K tokens. Well within budget.

### 4. Named Volumes for Warm Start

**Problem:** Every job clones the repo fresh. For a repo like clawforge (~12K LOC), this takes 5-10 seconds. For larger repos, much longer.

**Solution:** Named Docker volumes persist the repo clone between jobs. Subsequent jobs do `git fetch + reset` instead of full clone.

**Volume naming convention:**
```
clawforge-repo-{repo-slug}    # e.g., clawforge-repo-clawforge, clawforge-repo-strategyes-lab
```

**entrypoint.sh changes for volume-aware clone:**

```bash
# Volume-aware clone: reuse cached repo if available
REPO_CACHE="/repo-cache"

if [ -d "${REPO_CACHE}/.git" ]; then
    echo "=== WARM START: Reusing cached repo ==="
    cd "${REPO_CACHE}"
    git fetch origin "${BRANCH}" --depth 1
    git checkout "${BRANCH}"
    git reset --hard "origin/${BRANCH}"
    # Update WORK_DIR to use cache
    ln -sfn "${REPO_CACHE}" /job
else
    echo "=== COLD START: Fresh clone ==="
    git clone --single-branch --branch "$BRANCH" --depth 1 "$REPO_URL" "${REPO_CACHE}"
    ln -sfn "${REPO_CACHE}" /job
fi
```

**Critical: Branch isolation.** Job branches are unique (`job/{UUID}`), so there is no branch collision risk. The volume caches the repo state from `main` (the branch base), and the job branch is fetched on top.

**Critical: Cross-repo volumes.** Each target repo gets its own named volume. The volume name is derived from the repo slug, ensuring isolation.

**docker-compose.yml additions:**

```yaml
services:
  noah-event-handler:
    volumes:
      - noah-data:/app/data
      - noah-config:/app/config
      - /var/run/docker.sock:/var/run/docker.sock  # NEW: Docker socket access
    # Event handler needs socket to dispatch job containers

volumes:
  noah-data:
  noah-config:
  # Job repo cache volumes are created dynamically by dockerode
  # No need to pre-declare them in compose
```

### 5. Notification Flow Changes

**Current flow (GitHub Actions):**
```
run-job.yml completes -> auto-merge.yml -> notify-pr-complete.yml -> curl webhook -> Event Handler
```

**New flow (Docker Engine dispatch):**
```
docker.js: container.wait() returns -> inspect exit code -> read logs/artifacts
  -> If PR created: parse pr-result.json or check GitHub API for PR
  -> Build notification payload (same shape as webhook payload)
  -> Call handleJobCompletion() directly (no HTTP webhook needed)
```

**Key insight:** When dispatching via Docker API, the Event Handler is the process that started the container. It can collect results directly after `container.wait()` resolves. No need for the GH Actions notification workflow.

**Same-repo jobs:** After container exits, check if PR was created via GitHub API. Build the same payload structure used by `handleGithubWebhook()` and call the summarize+notify logic directly.

**Cross-repo jobs:** The entrypoint still creates PRs on target repos and writes `pr-result.json`. The Event Handler reads this from the container's filesystem (via `docker cp` or volume mount) after completion.

### 6. Job Status for Docker-Dispatched Jobs

`getJobStatus()` currently queries GitHub Actions workflow runs. For Docker-dispatched jobs, it needs a parallel lookup.

**Approach:** Track running Docker containers in memory (Map) or query Docker API:

```javascript
// In docker.js
async function getRunningJobs() {
  const containers = await docker.listContainers({
    filters: { name: ['clawforge-job-'] },
  });
  return containers.map(c => ({
    job_id: c.Names[0].replace('/clawforge-job-', ''),
    status: c.State,
    started_at: c.Created,
  }));
}
```

`getJobStatus()` in `github.js` merges results from both sources.

## Data Flow

### Docker-Dispatched Job (Happy Path)

```
1. User sends message in Slack
2. Layer 1 (LangGraph) decides to create job
3. create_job tool:
   a. Creates job/{UUID} branch via GitHub API (audit trail)
   b. Writes job.md to branch
   c. Checks dispatch mode -> "docker"
   d. Calls docker.js runJobContainer()
4. docker.js:
   a. Creates container with named volume mount
   b. Passes env vars (REPO_URL, BRANCH, SECRETS, LLM_SECRETS, DISPATCH_MODE)
   c. Starts container, begins wait()
5. entrypoint.sh (inside container):
   a. Detects /repo-cache/.git -> warm start (fetch+checkout)
   b. Reads STATE.md, ROADMAP.md, git history (NEW context hydration)
   c. Builds 7-section FULL_PROMPT
   d. Runs claude -p
   e. Commits, pushes, creates PR
6. docker.js:
   a. container.wait() resolves with StatusCode
   b. Reads pr-result.json from volume or queries GitHub API
   c. Builds notification payload
   d. Calls summarizeJob() + routes to originating thread
7. Container removed. Volume persists for next job.
```

### Fallback to GitHub Actions

```
1-3. Same as above
3c. Checks dispatch mode -> "actions"
3d. Returns { job_id, branch } (current behavior)
4. GitHub Actions run-job.yml triggers on branch creation
5-7. Existing flow (unchanged)
```

## Patterns to Follow

### Pattern 1: Socket Availability Check at Startup

**What:** Probe Docker socket at Event Handler startup. Set a module-level flag.
**When:** Always. Determines default dispatch mode.
**Example:**
```javascript
// lib/tools/docker.js
let socketAvailable = false;

export async function checkDockerSocket() {
  try {
    const docker = new Docker({ socketPath: '/var/run/docker.sock' });
    await docker.ping();
    socketAvailable = true;
    console.log('Docker socket available -- Docker dispatch enabled');
  } catch {
    socketAvailable = false;
    console.log('Docker socket not available -- falling back to GitHub Actions');
  }
}

export function isDockerAvailable() { return socketAvailable; }
```

### Pattern 2: Entrypoint Backward Compatibility

**What:** All entrypoint.sh changes must be additive. The same entrypoint must work for both Docker-dispatched and Actions-dispatched jobs.
**When:** Always.
**Example:** Use `DISPATCH_MODE` env var to conditionally enable volume-aware clone. If unset, fall through to current `git clone` behavior. Context hydration (STATE.md, ROADMAP.md, git history) is unconditional -- it benefits both dispatch modes.

### Pattern 3: Same Notification Payload Shape

**What:** Docker-dispatched job completions must produce the same JSON payload shape as `notify-pr-complete.yml`.
**When:** Building the completion notification in docker.js.
**Why:** The `handleGithubWebhook()` handler, `summarizeJob()`, `saveJobOutcome()`, and channel notification routing all expect a specific payload shape. Reusing it avoids duplication.

```javascript
// The payload shape both paths must produce:
{
  job_id, branch, status, job, run_url, pr_url,
  changed_files, commit_message, log, merge_result,
  target_repo  // optional
}
```

### Pattern 4: Volume-per-Repo Isolation

**What:** Each target repo gets its own named volume. Never share volumes between repos.
**When:** Creating containers via Docker API.
**Why:** Prevents cross-contamination of repo state. Different repos have different CLAUDE.md, package.json, and .planning/ files.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Bind-Mounting Host Paths

**What:** Using `-v /host/path:/container/path` instead of named volumes.
**Why bad:** Ties container to specific host filesystem layout. Named volumes are portable, Docker-managed, and work consistently across environments.
**Instead:** Use named volumes exclusively. Docker creates and manages them.

### Anti-Pattern 2: Polling for Container Completion

**What:** Using `setInterval` to check if the container is still running.
**Why bad:** Wastes CPU, introduces latency, and races with container cleanup.
**Instead:** Use `container.wait()` which blocks (non-blocking promise) until the container exits.

### Anti-Pattern 3: Passing Secrets as Container Labels or Build Args

**What:** Putting secrets in container metadata visible to `docker inspect`.
**Why bad:** Any process with Docker socket access can read labels. Build args are cached in image layers.
**Instead:** Pass secrets as environment variables to `createContainer()`. They are only visible inside the running container and via `docker inspect` (which requires socket access the Event Handler already has).

### Anti-Pattern 4: Removing Volumes on Every Job

**What:** Deleting the named volume after each job completes.
**Why bad:** Defeats the purpose of warm start. The volume IS the cache.
**Instead:** Only remove volumes during explicit cleanup (e.g., admin action, stale volume pruning).

### Anti-Pattern 5: Dual Notification Paths

**What:** Having Docker-dispatched jobs ALSO trigger the GitHub Actions notification workflow.
**Why bad:** Creates duplicate notifications. The push to the job branch after container commits would trigger `notify-pr-complete.yml`.
**Instead:** For Docker-dispatched jobs, handle notifications directly in `docker.js` after `container.wait()`. The Actions workflows should detect `DISPATCH_MODE=docker` and skip, OR the Event Handler should suppress the webhook for Docker-dispatched jobs.

## Files Changed vs New

| File | Status | Changes |
|------|--------|---------|
| `lib/tools/docker.js` | **NEW** | Docker Engine API wrapper (create, start, wait, logs, cleanup, status) |
| `lib/ai/tools.js` | Modified | Dispatch routing in `create_job` tool: Docker vs Actions |
| `lib/tools/create-job.js` | Unchanged | Still creates job branches (audit trail for both paths) |
| `templates/docker/job/entrypoint.sh` | Modified | Volume-aware clone, STATE.md/ROADMAP.md/git-history hydration |
| `docker-compose.yml` | Modified | Docker socket mount for Event Handler containers |
| `lib/tools/github.js` | Modified | `getJobStatus()` merges Docker + Actions sources |
| `api/index.js` | Possibly modified | Dedup notifications for Docker-dispatched jobs |
| `instances/*/REPOS.json` | Modified | Add `dispatch` field per repo entry |
| `lib/tools/repos.js` | Modified | Parse `dispatch` field from REPOS.json |
| `.env.example` | Modified | Add `JOB_IMAGE` env var |

## Suggested Build Order

Build order respects dependencies. Each phase is independently testable.

### Phase 1: Layer 2 Context Hydration (no Docker API needed)

**Modify:** `templates/docker/job/entrypoint.sh`
**What:** Add STATE.md + ROADMAP.md + git history to FULL_PROMPT
**Test:** Run existing GitHub Actions job pipeline, verify expanded prompt
**Why first:** Zero risk to dispatch mechanism. Benefits both dispatch modes. Immediate value.

### Phase 2: Docker Engine API Dispatch (core)

**New:** `lib/tools/docker.js`
**Modify:** `lib/ai/tools.js`, `docker-compose.yml`
**What:** dockerode wrapper, socket mount, dispatch routing in create_job
**Test:** Dispatch a job via Docker API on the host, verify container runs and PR is created
**Dependency:** Needs entrypoint.sh to work with volume-aware clone (Phase 3), BUT can be tested without volumes first (cold clone into /repo-cache, symlink to /job)

### Phase 3: Named Volumes for Warm Start

**Modify:** `templates/docker/job/entrypoint.sh`, `lib/tools/docker.js`
**What:** Volume-aware clone logic, volume naming convention, volume creation in dockerode
**Test:** Run two jobs against the same repo. Second job should skip clone.
**Dependency:** Phase 2 (needs Docker dispatch to mount volumes)

### Phase 4: Notification + Status Integration

**Modify:** `lib/tools/docker.js`, `lib/tools/github.js`, `api/index.js`
**What:** Direct notification after container.wait(), merged status reporting, dedup guard
**Test:** Full end-to-end: Slack message -> Docker dispatch -> PR -> notification in Slack thread
**Dependency:** Phase 2

### Phase 5: GitHub Actions Fallback + Cleanup

**Modify:** `instances/*/REPOS.json`, `lib/tools/repos.js`
**What:** `dispatch` field, volume pruning, documentation
**Test:** Verify Actions-dispatched jobs still work, verify dispatch routing by repo config
**Dependency:** Phases 2-4

## Scalability Considerations

| Concern | At 2 instances | At 10 instances | At 50+ instances |
|---------|---------------|-----------------|------------------|
| Docker socket | Single socket, sufficient | Single socket, sufficient | Consider Docker API over TCP with TLS |
| Named volumes | ~5-10 volumes | ~50 volumes | Volume pruning policy needed |
| Concurrent containers | 2-3 concurrent jobs fine | Resource limits per container | Container resource quotas, queue |
| Event Handler memory | Negligible | Track running containers in-memory map | Move to Redis/DB for container state |
| Job image pulls | Pull once, cached | Pull once per version | Private registry with pull-through cache |

## Sources

- [Dockerode GitHub](https://github.com/apocas/dockerode) -- Node.js Docker API library, 14M+ weekly downloads
- [Dockerode npm](https://www.npmjs.com/package/dockerode) -- Package details and API reference
- [Docker Engine API SDK Docs](https://docs.docker.com/reference/api/engine/sdk/) -- Official Docker SDK documentation
- [Docker Volumes Documentation](https://docs.docker.com/engine/storage/volumes/) -- Named volume lifecycle and best practices
- [Persisting Container Data](https://docs.docker.com/get-started/docker-concepts/running-containers/persisting-container-data/) -- Docker official guide
- ClawForge `.planning/VISION.md` -- Stripe gap analysis, thepopebot upstream feature inventory
- ClawForge `templates/docker/job/entrypoint.sh` -- Current prompt assembly and execution flow
- ClawForge `lib/ai/tools.js` -- Current dispatch and enrichment logic
- ClawForge `lib/tools/create-job.js` -- Current GitHub API branch creation
