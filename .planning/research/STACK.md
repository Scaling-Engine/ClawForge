# Stack Research

**Domain:** AI agent gateway -- Docker Engine API dispatch, Layer 2 context hydration, named volumes
**Milestone:** v1.4 Docker Engine Foundation
**Researched:** 2026-03-06
**Confidence:** HIGH for dockerode integration; HIGH for context hydration (bash-only changes); HIGH for named volumes (Docker Compose config)

---

## Scope

This document covers **additions and changes** needed for v1.4 Docker Engine Foundation only. The existing stack (LangGraph `createReactAgent`, SQLite checkpointer, Next.js API routes, Drizzle ORM, Slack/Telegram/Web adapters, REPOS.json resolver, `yaml` package, instance generation pipeline) is validated from v1.0-v1.3 and not re-researched here.

Three new capability areas:

1. **Docker Engine API dispatch** -- replace GitHub Actions as primary job dispatch with direct Docker socket calls
2. **Layer 2 context hydration** -- inject STATE.md + ROADMAP.md + recent git history into job container prompts
3. **Named volumes** -- persistent repo clones across jobs for warm-start containers

---

## Recommended Stack

### New Addition: Dockerode

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `dockerode` | `^4.0.9` | Docker Engine API client for Node.js | The de facto standard Node.js Docker client. 2.7M weekly downloads. Promise-based API. Covers container lifecycle (create, start, wait, logs, remove), volume management (create, inspect, list, remove), and image operations. The upstream thepopebot uses Docker Engine API dispatch in production (`lib/tools/docker.js`), validating this approach. |

**No other new npm dependencies are needed for v1.4.**

### Why Dockerode Over Alternatives

| Criterion | `dockerode` v4.0.9 | `node-docker-api` | Raw HTTP to socket | Docker CLI subprocess |
|-----------|--------------------|--------------------|--------------------|-----------------------|
| Weekly downloads | 2.7M | 12K | N/A | N/A |
| Maintained | Yes (last publish ~5 months ago) | Stale (last update years ago) | N/A | N/A |
| Promise support | Native (callback + promise) | Promise-only (thinner API surface) | Manual | Manual JSON parsing |
| Volume management | Full API (`docker.createVolume`, `docker.listVolumes`) | Partial | Manual | Shell parsing fragile |
| Stream handling | Built-in demuxing for container logs | Basic | Manual | Buffered only |
| Container wait | `container.wait()` returns StatusCode promise | Supported | Manual | Blocking subprocess |
| Community/docs | Extensive GitHub issues, 4.8K stars | Limited | N/A | N/A |

**Verdict:** Dockerode is the only serious option. `node-docker-api` uses the same underlying `docker-modem` but has a fraction of the community and maintenance. Raw HTTP or CLI subprocess wrapping adds unnecessary complexity.

### Core Technologies (Existing -- No Change)

| Technology | Version | Purpose | v1.4 Relevance |
|------------|---------|---------|----------------|
| `@langchain/langgraph` | `^1.1.4` | ReAct agent orchestration | `create_job` tool gains dispatch_method parameter |
| `@langchain/core` | `^1.1.24` | Tool framework, message types | Zod schema update for create_job |
| `zod` | `^4.3.6` | Tool schema validation | New optional `dispatch_method` field |
| `uuid` | `^9.0.0` | Job ID generation | Unchanged -- still generates UUIDs for job branches |
| `better-sqlite3` | `^12.6.2` | SQLite storage | `job_outcomes` table gains `dispatch_method` column |
| `drizzle-orm` | `^0.44.0` | Database ORM | Schema update for new column |

### Layer 2 Context Hydration (No New Libraries)

Context hydration is entirely a **bash entrypoint change** in `templates/docker/job/entrypoint.sh`. No Node.js libraries needed.

| Capability | Implementation | Notes |
|------------|----------------|-------|
| Fetch STATE.md from target repo | `gh api` in entrypoint.sh | Already have `gh auth setup-git` in entrypoint; `gh api` uses the same auth. Fetch via GitHub Contents API raw mode. |
| Fetch ROADMAP.md from target repo | `gh api` in entrypoint.sh | Same pattern as STATE.md |
| Recent git history | `git log --oneline -20` after clone | Shallow clone with `--depth 20` instead of `--depth 1` gives us commit history |
| Inject into FULL_PROMPT | Bash string concatenation | New sections between Stack and Task in the 5-section prompt |

**Why `gh api` over `curl`:** The `gh` CLI is already installed in the job container Dockerfile (line 29-32) and authenticated via `gh auth setup-git` (entrypoint line 26). Using `gh api repos/{owner}/{repo}/contents/.planning/STATE.md` avoids duplicating auth header logic and handles rate limiting gracefully. The GitHub Contents API returns raw file content with `Accept: application/vnd.github.raw`.

**Why not fetch from the volume clone:** For same-repo jobs, STATE.md is in the working tree. For cross-repo jobs, STATE.md is in the target repo which gets cloned separately. Using `gh api` works uniformly for both cases and fetches from the default branch (main) rather than the job branch, which is the correct source for project state.

### Named Volumes (Docker Compose + Dockerode Config)

| Capability | Implementation | Notes |
|------------|----------------|-------|
| Persistent repo clones | Docker named volumes | One volume per `{instance}-{repo-slug}` combination (e.g., `noah-clawforge-repo`, `noah-neurostory-repo`) |
| Volume creation | `docker.createVolume()` via dockerode | Created on first job for a repo; reused on subsequent jobs |
| Volume mount in container | `HostConfig.Binds` in `createContainer()` | Maps named volume to `/workspace` in container |
| Warm clone detection | Entrypoint checks if `/workspace/.git` exists | If exists: `git fetch && git checkout` instead of fresh `git clone` |

**Volume naming convention:** `clawforge-{instance}-{repo-slug}` (e.g., `clawforge-noah-neurostory`). Prefix with `clawforge-` to avoid collisions with other Docker volumes on the host.

---

## Docker Engine API Integration Architecture

### Connection: Unix Socket (Sibling Container Pattern)

The event handler container connects to the Docker daemon on the host via the Unix socket `/var/run/docker.sock`. This is the "sibling container" pattern -- the event handler does not run Docker-in-Docker; it asks the host's Docker daemon to create sibling containers.

```javascript
// lib/tools/docker.js
import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
```

**docker-compose.yml change for event handler services:**
```yaml
noah-event-handler:
  volumes:
    - noah-data:/app/data
    - noah-config:/app/config
    - /var/run/docker.sock:/var/run/docker.sock  # NEW: Docker Engine API access
```

Note: Traefik already mounts `/var/run/docker.sock` (docker-compose.yml line 38), so this pattern is established in the codebase.

### Container Lifecycle

```
1. docker.createVolume({ Name: volumeName })     // Idempotent -- no-op if exists
2. docker.createContainer({                       // Configure job container
     Image: 'clawforge-job:latest',
     Env: [...secrets, ...config],
     HostConfig: {
       Binds: [`${volumeName}:/workspace`],
       NetworkMode: `${instance}-net`,
       AutoRemove: true,                          // Clean up after exit
     },
   })
3. container.start()                              // Non-blocking
4. container.wait()                               // Returns { StatusCode }
5. container.logs({ stdout: true, stderr: true }) // Capture output for notifications
```

### Dispatch Method Selection

The `create_job` tool gains an optional `dispatch_method` parameter:

| Value | Behavior | When |
|-------|----------|------|
| `"docker"` (default) | Docker Engine API dispatch | Standard jobs -- fast start, volume-mounted |
| `"actions"` | GitHub Actions dispatch (existing) | Repos needing CI integration, fallback |
| `"auto"` | Docker if available, Actions fallback | Future -- health-check Docker socket first |

For v1.4, default to `"docker"`. Keep the entire GitHub Actions pipeline intact as fallback. The `create-job.js` module branches on dispatch method:

```javascript
// lib/tools/create-job.js (conceptual)
if (dispatchMethod === 'docker') {
  return await createDockerJob(enrichedDescription, options);
} else {
  return await createActionsJob(enrichedDescription, options);  // existing flow
}
```

### Job Branch Still Required

Even with Docker dispatch, the job branch (`job/{UUID}`) is still created via GitHub API. The entrypoint clones this branch. This preserves:
- Git-as-audit-trail (all changes are commits on a branch)
- PR creation flow (container pushes to the job branch, opens PR)
- Notification pipeline (GitHub webhooks fire on PR events)
- `getJobStatus()` lookups via the `job_outcomes` table

The difference is only in **how the container is started**: Docker API instead of GitHub Actions workflow trigger.

---

## Entrypoint Changes for Context Hydration

### New Sections in FULL_PROMPT

The current 5-section prompt structure (Target, Docs, Stack, Task, GSD Hint) expands to 7 sections:

```
1. Target (repo slug)
2. Repository Documentation (CLAUDE.md)
3. Stack (package.json dependencies)
4. Project State (STATE.md)          # NEW
5. Recent History (git log)           # NEW
6. Task (job description)
7. GSD Hint
```

### Fetching STATE.md and ROADMAP.md

```bash
# After clone, before building FULL_PROMPT
# Derive owner/repo from REPO_URL for API calls
PROJECT_STATE=""
if gh api "repos/${REPO_SLUG}/contents/.planning/STATE.md" \
   --header "Accept: application/vnd.github.raw" 2>/dev/null > /tmp/state.md; then
    PROJECT_STATE=$(head -c 4000 /tmp/state.md)
fi

PROJECT_ROADMAP=""
if gh api "repos/${REPO_SLUG}/contents/.planning/ROADMAP.md" \
   --header "Accept: application/vnd.github.raw" 2>/dev/null > /tmp/roadmap.md; then
    PROJECT_ROADMAP=$(head -c 6000 /tmp/roadmap.md)
fi
```

Character caps: STATE.md at 4000 chars (~1000 tokens), ROADMAP.md at 6000 chars (~1500 tokens). These match the caps used by `get_project_state` in Layer 1 (`lib/tools/github.js:200-201`).

### Fetching Git History

```bash
# Change clone depth from 1 to 20 for history
git clone --single-branch --branch "$BRANCH" --depth 20 "$REPO_URL" /job

# After clone
GIT_HISTORY=$(cd /job && git log --oneline -15 --no-decorate 2>/dev/null || echo "[no history available]")
```

**Why `--depth 20` not unlimited:** Shallow clone with 20 commits gives enough context for recent activity without downloading full repo history. The job container does not need ancient commits. 20 commits covers roughly 1-2 weeks of active development.

### Warm Clone with Named Volumes

When a named volume is mounted at `/workspace`, the entrypoint detects an existing clone and updates it instead of cloning fresh:

```bash
WORK_DIR="/workspace"  # or /job for non-volume jobs

if [ -d "${WORK_DIR}/.git" ]; then
    echo "Warm clone detected -- fetching updates"
    cd "${WORK_DIR}"
    git fetch origin
    git checkout -B "${BRANCH}" "origin/${BRANCH}" 2>/dev/null || \
    git checkout -B "${BRANCH}" "origin/main"
    git log --oneline -5
else
    echo "Cold clone -- initial setup"
    git clone --single-branch --branch "$BRANCH" --depth 20 "$REPO_URL" "${WORK_DIR}"
    cd "${WORK_DIR}"
fi
```

**Warm start benefit:** Skip the `git clone` step entirely (~10-30s depending on repo size). Only fetch new commits.

---

## Installation

```bash
# The one new runtime dependency
npm install dockerode@^4.0.9
```

No dev dependency additions. No peer dependency changes. No build tooling changes.

Dockerode's dependencies (`docker-modem`, `tar-fs`, `uuid`, `@grpc/grpc-js`, `protobufjs`) are all pulled transitively. The `uuid` dependency in dockerode (v10) does not conflict with ClawForge's `uuid@^9.0.0` -- they coexist via npm's nested node_modules resolution.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Docker API client | `dockerode` ^4.0.9 | `node-docker-api` | 200x fewer weekly downloads; uses same `docker-modem` underneath; thinner API surface means more manual work for volume management |
| Docker API client | `dockerode` ^4.0.9 | Raw `http.request` to Unix socket | Reinventing docker-modem; error handling, stream demuxing, and auth all manual |
| Docker API client | `dockerode` ^4.0.9 | `child_process.exec('docker ...')` | Shell parsing fragile; no streaming; harder to test; subprocess overhead per call |
| Context hydration source | `gh api` (GitHub Contents API) | `curl` with PAT header | `gh` already installed and authenticated; `curl` requires manual auth header construction |
| Context hydration source | `gh api` (GitHub Contents API) | Read from volume after clone | Volume clone is the job branch, not main; STATE.md should come from main (default branch) |
| Clone depth | `--depth 20` | `--depth 1` (current) | Depth 1 has no history for context injection |
| Clone depth | `--depth 20` | Full clone (no depth) | Full history wastes bandwidth and time; 20 commits is sufficient context |
| Volume naming | `clawforge-{instance}-{repo}` | `{repo}` only | Risk of collision if two instances target the same repo |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `docker-compose` npm package | Wraps CLI subprocess; we need container-level API control, not compose orchestration | `dockerode` for direct Docker Engine API |
| `@docker/sdk` or official Docker SDK | Does not exist for Node.js as of March 2026 | `dockerode` is the community standard |
| `kubernetes-client` | ClawForge explicitly targets Docker Compose, not k8s (see VISION.md) | `dockerode` |
| Container orchestration libraries (Nomad, etc.) | Overengineered for 2 instances on a single host | Direct Docker API via dockerode |
| `simple-git` or `isomorphic-git` | Context hydration runs in bash entrypoint, not Node.js; git CLI already present in container | `git` CLI commands in entrypoint.sh |
| Any new bash utilities in container | Job container Dockerfile already has `git`, `jq`, `curl`, `gh` -- everything needed for context hydration | Existing tools |

---

## Docker Socket Security Considerations

Mounting `/var/run/docker.sock` gives the event handler container **full control over the Docker daemon**. This is acceptable because:

1. The event handler already runs as a trusted component (it has GitHub tokens, LLM API keys, Slack tokens)
2. Traefik in the same docker-compose.yml already mounts the socket (established pattern)
3. The event handler is not exposed to untrusted input -- all messages come through authenticated channels (Slack signing secret, Telegram webhook secret, NextAuth credentials)
4. Container creation is scoped programmatically -- the code only creates containers from the `clawforge-job` image with controlled env vars

For defense in depth, the dockerode client should be instantiated once and scoped to job-related operations only. No arbitrary container management exposed to the LLM agent.

---

## Database Schema Addition

The `job_outcomes` table gains a `dispatch_method` column to track how each job was dispatched:

```javascript
// lib/db/schema.js addition
dispatch_method: text('dispatch_method').default('actions'),  // 'docker' | 'actions'
```

This enables:
- Monitoring Docker vs Actions dispatch ratio
- Fallback detection (if Docker dispatch fails, retry via Actions)
- Future analytics on dispatch method performance

Migration: Add column with `DEFAULT 'actions'` so existing rows are correctly classified.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `dockerode@^4.0.9` | Node 18+ | Tested with Node 22 (job container base image) |
| `dockerode@^4.0.9` | Docker Engine API 1.24+ | Docker 1.12+; production hosts run Docker 24+ |
| `dockerode@^4.0.9` | `"type": "module"` | Dockerode uses CommonJS but imports fine via Node's ESM interop (`import Docker from 'dockerode'`) |
| `dockerode@^4.0.9` | Existing `uuid@^9.0.0` | Dockerode depends on `uuid@^10.0.0` internally; npm resolves both without conflict |

---

## Sources

- [dockerode GitHub repository](https://github.com/apocas/dockerode) -- v4.0.9, 4.8K stars, 2.7M weekly downloads (HIGH confidence -- official source)
- [dockerode npm page](https://www.npmjs.com/package/dockerode) -- version and dependency verification (HIGH confidence)
- [npm trends: dockerode vs alternatives](https://npmtrends.com/docker-modem-vs-dockerode-vs-node-docker-api) -- download comparison (HIGH confidence)
- [Docker Volumes documentation](https://docs.docker.com/engine/storage/volumes/) -- named volume lifecycle and management (HIGH confidence -- official Docker docs)
- Direct codebase inspection: `docker-compose.yml` -- Traefik already mounts `/var/run/docker.sock` at line 38 (HIGH confidence)
- Direct codebase inspection: `templates/docker/job/entrypoint.sh` -- current 5-section prompt structure, clone logic, `gh auth` usage (HIGH confidence)
- Direct codebase inspection: `templates/docker/job/Dockerfile` -- `gh` CLI installed at lines 29-32, Node 22 base image (HIGH confidence)
- Direct codebase inspection: `lib/tools/github.js` -- `fetchRepoFile()` at lines 234-264 validates GitHub Contents API pattern for STATE.md/ROADMAP.md (HIGH confidence)
- Direct codebase inspection: `lib/ai/tools.js` -- `getProjectStateTool` at lines 185-235 validates char caps (4000/6000) for STATE.md/ROADMAP.md (HIGH confidence)
- Direct codebase inspection: `.planning/VISION.md` -- upstream thepopebot Docker Engine API dispatch confirmed in production (HIGH confidence)
- Direct codebase inspection: `.planning/PROJECT.md` -- v1.4 requirements and existing architecture (HIGH confidence)
- [Docker sibling container pattern](https://medium.com/@andreacolangelo/sibling-docker-container-2e664858f87a) -- socket mount approach for container spawning (MEDIUM confidence -- community article, pattern validated by Traefik usage in codebase)
- `npm view dockerode version` -- confirmed 4.0.9 as latest (HIGH confidence -- direct npm registry query)
- `npm view dockerode dependencies` -- confirmed dependency tree: docker-modem, tar-fs, uuid, grpc-js, protobufjs (HIGH confidence)

---

*Stack research for: ClawForge v1.4 Docker Engine Foundation*
*Researched: 2026-03-06*
