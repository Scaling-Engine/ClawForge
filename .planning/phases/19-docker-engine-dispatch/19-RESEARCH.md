# Phase 19: Docker Engine Dispatch - Research

**Researched:** 2026-03-06
**Domain:** Docker Engine API container lifecycle, dispatch routing, job notification flow
**Confidence:** HIGH

## Summary

Phase 19 replaces GitHub Actions as the primary job dispatch mechanism with direct Docker Engine API calls via the Unix socket. The Event Handler container creates, starts, and waits on job containers directly using dockerode, reducing dispatch latency from ~60 seconds (Actions queue + image pull + clone) to ~10-15 seconds (container create + start with cached image).

The critical insight is that when the Event Handler dispatches containers directly, it becomes the process that owns the container lifecycle. This means notifications flow back directly via `container.wait()` resolution rather than through the GitHub Actions webhook chain (`run-job.yml` -> `auto-merge.yml` -> `notify-pr-complete.yml` -> HTTP webhook). The job branch creation via GitHub API is retained as an audit trail, but the Actions workflow trigger must be suppressed or the notification must be deduplicated for Docker-dispatched jobs.

**Primary recommendation:** Use dockerode@^4.0.9 for Docker Engine API communication. Mount `/var/run/docker.sock` into Event Handler containers. Route dispatch via `REPOS.json` `dispatch` field. Handle notifications inline after `container.wait()` using the same payload shape as the GitHub webhook handler.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCK-01 | Docker Engine API client connects via Unix socket and can ping/version-check | dockerode `new Docker({ socketPath })` + `docker.ping()` -- verified API |
| DOCK-02 | Create and start ephemeral job containers with env vars, network, and labels | dockerode `createContainer()` with `Env`, `HostConfig.NetworkMode`, `Labels` |
| DOCK-03 | Wait for container exit and capture exit code | dockerode `container.wait()` returns `{ StatusCode }` promise |
| DOCK-04 | Container logs retrievable after completion | dockerode `container.logs({ stdout: true, stderr: true })` with stream demuxing |
| DOCK-05 | Containers cleaned up after logs captured | dockerode `container.remove()` after log collection |
| DOCK-06 | Job containers run on instance Docker network | `HostConfig.NetworkMode: '{instance}-net'` matches docker-compose networks |
| DOCK-07 | Container IDs tracked in DB for lifecycle management | New `docker_jobs` table or column on `job_origins` with containerId + status |
| DOCK-08 | Startup reconciliation detects orphaned containers | `docker.listContainers({ filters: { label: ['clawforge=job'] } })` on init |
| DOCK-09 | Container startup time measured and logged | Timestamp diff between `container.start()` and first entrypoint output |
| DOCK-10 | Running containers inspectable for stuck detection | `container.inspect()` returns State.StartedAt, State.Running, State.Status |
| DISP-01 | REPOS.json supports `dispatch` field | Add `dispatch: "docker" | "actions"` to repo entries, default "docker" |
| DISP-02 | createJobTool routes to Docker API or Actions | Check `resolvedTarget.dispatch` or default, then call docker.js or create-job.js |
| DISP-03 | GitHub Actions dispatch path remains unchanged | create-job.js untouched; run-job.yml still triggers on `job/*` branch creation |
| DISP-04 | Docker-dispatched jobs produce identical outputs | Same entrypoint.sh, same commits/PR flow, same notification payload shape |
| DISP-05 | Multiple Docker jobs dispatch in parallel | Each container is independent; `container.wait()` is per-container promise |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dockerode | ^4.0.9 | Docker Engine API client | De facto Node.js Docker client. 2.7M weekly downloads. Promise-based. Stream demuxing built-in. Already decided in REQUIREMENTS.md Out of Scope section. |

### Supporting (Existing -- No New Dependencies)

| Library | Version | Purpose | Phase 19 Role |
|---------|---------|---------|---------------|
| better-sqlite3 | ^12.6.2 | SQLite storage | Track Docker container IDs in `job_origins` or new table |
| drizzle-orm | ^0.44.0 | Database ORM | Schema migration for container tracking columns |
| uuid | ^9.0.0 | Job ID generation | Unchanged -- still generates UUIDs |
| zod | ^4.3.6 | Schema validation | Updated `create_job` tool schema (optional `dispatch_method`) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| dockerode | Raw HTTP to Unix socket | No stream demuxing, manual chunked encoding, no API versioning |
| dockerode | Docker CLI subprocess | Shell parsing fragile, no promise API, process spawning overhead |
| dockerode | node-docker-api | 12K weekly downloads vs 2.7M, stale maintenance, same underlying docker-modem |

**Installation:**
```bash
npm install dockerode@^4.0.9
```

## Architecture Patterns

### Recommended Project Structure (New Files)

```
lib/
  tools/
    docker.js          # NEW: Docker Engine API wrapper
    create-job.js       # UNCHANGED: GitHub API branch creation (audit trail + Actions fallback)
    repos.js            # MODIFIED: parse dispatch field from REPOS.json
  ai/
    tools.js            # MODIFIED: dispatch routing in createJobTool
  db/
    schema.js           # MODIFIED: add container tracking
    docker-jobs.js      # NEW: DB operations for container lifecycle tracking
```

### Pattern 1: Sibling Container Dispatch

**What:** Event Handler container creates sibling containers on the host Docker daemon via Unix socket. Not Docker-in-Docker.
**When to use:** Always for Docker-dispatched jobs.
**Why:** Traefik already uses this pattern in the codebase (docker-compose.yml line 38). Job containers are peers of the Event Handler, managed by the same daemon.

```javascript
// lib/tools/docker.js
import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

async function dispatchJob(jobId, { repoUrl, branch, secrets, llmSecrets, image, networkMode, instanceName }) {
  const containerName = `clawforge-job-${jobId.slice(0, 8)}`;

  const container = await docker.createContainer({
    Image: image || process.env.JOB_IMAGE || 'scalingengine/clawforge:job-latest',
    name: containerName,
    Env: [
      `REPO_URL=${repoUrl}`,
      `BRANCH=${branch}`,
      `SECRETS=${JSON.stringify(secrets)}`,
      `LLM_SECRETS=${JSON.stringify(llmSecrets)}`,
      `DISPATCH_MODE=docker`,
    ],
    Labels: {
      'clawforge': 'job',
      'clawforge.job_id': jobId,
      'clawforge.instance': instanceName,
    },
    HostConfig: {
      NetworkMode: networkMode,   // e.g., 'noah-net'
      AutoRemove: false,          // Must inspect before removal
    },
  });

  return container;
}
```

### Pattern 2: Fire-and-Wait with Inline Notification

**What:** The `createJobTool` dispatches the container and registers a background `container.wait()` promise that handles notification on completion. The tool returns immediately to the user with `job_id`.
**When to use:** All Docker-dispatched jobs.
**Why:** `container.wait()` blocks until container exits. The LangGraph tool must return quickly so the agent can respond to the user. The wait+notify happens in a detached async flow.

```javascript
// In createJobTool handler (tools.js), after dispatch:
// 1. Return job_id to user immediately
// 2. Background: wait for container, then notify

async function waitAndNotify(container, jobId, threadId, platform) {
  try {
    const { StatusCode } = await container.wait();
    const logs = await collectLogs(container);

    // Build same payload shape as notify-pr-complete.yml
    const payload = await buildNotificationPayload(jobId, StatusCode, logs);

    // Reuse existing notification logic
    await handleJobCompletion(jobId, payload, threadId, platform);

    // Cleanup
    await container.remove();
  } catch (err) {
    console.error(`Docker job ${jobId} failed:`, err);
    // Still attempt cleanup
    try { await container.remove(); } catch {}
  }
}
```

### Pattern 3: Dispatch Routing via REPOS.json

**What:** Each repo entry in REPOS.json gets a `dispatch` field ("docker" or "actions"). The `createJobTool` reads this to decide the dispatch path.
**When to use:** Every job dispatch decision.

```json
{
  "repos": [
    {
      "owner": "ScalingEngine",
      "slug": "clawforge",
      "name": "ClawForge",
      "aliases": ["cf"],
      "dispatch": "docker"
    },
    {
      "owner": "ScalingEngine",
      "slug": "neurostory",
      "name": "NeuroStory",
      "aliases": ["ns"],
      "dispatch": "docker"
    }
  ]
}
```

Default to `"docker"` when Docker socket is available, fall back to `"actions"` when not.

### Pattern 4: Container Labeling for Lifecycle Management

**What:** All job containers get labels: `clawforge=job`, `clawforge.job_id={id}`, `clawforge.instance={name}`. This enables listing, filtering, and orphan detection.
**When to use:** Every container creation.
**Why:** `docker.listContainers({ filters: { label: ['clawforge=job'] } })` finds all job containers. Essential for DOCK-08 (orphan detection) and DOCK-10 (stuck detection).

### Pattern 5: Startup Reconciliation

**What:** On Event Handler startup, query Docker for any running containers with `clawforge=job` label. If found, they are orphans from a previous crash. Log them, attempt to collect results, then clean up.
**When to use:** Event Handler initialization (before accepting new jobs).

```javascript
async function reconcileOrphans(instanceName) {
  const containers = await docker.listContainers({
    all: true,
    filters: {
      label: ['clawforge=job', `clawforge.instance=${instanceName}`],
    },
  });

  for (const info of containers) {
    const container = docker.getContainer(info.Id);
    console.warn(`Orphaned container found: ${info.Names[0]} (state: ${info.State})`);

    if (info.State === 'running') {
      // Kill it -- we lost the wait() promise
      await container.kill().catch(() => {});
    }

    // Attempt to retrieve logs before removal
    try {
      const logs = await container.logs({ stdout: true, stderr: true });
      // Log or store for debugging
    } catch {}

    await container.remove({ force: true }).catch(() => {});
  }
}
```

### Anti-Patterns to Avoid

- **Dual notifications:** Docker-dispatched jobs push commits to `job/*` branches, which could trigger `notify-pr-complete.yml` via Actions. The Event Handler also sends notifications inline. Solution: suppress the Actions notification for Docker-dispatched jobs by checking `DISPATCH_MODE` env var in the Actions workflow, OR dedup in the webhook handler using the `dispatch_method` field on `job_origins`.
- **Polling for container status:** Use `container.wait()` promise, not `setInterval` polling.
- **Bind mounts for repo cache:** Use named volumes only (REQUIREMENTS.md explicitly prohibits bind mounts).
- **AutoRemove: true:** Must be `false` because we need to read logs and inspect exit code before removing.
- **Blocking the LangGraph tool:** The `createJobTool` must return immediately. The wait+notify flow runs in a detached promise.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Docker API communication | Raw HTTP to Unix socket | dockerode | Stream demuxing, API versioning, error handling |
| Container log demuxing | Manual stdout/stderr splitting | dockerode `container.logs()` with `follow: false` | Docker multiplexes stdout/stderr into a single stream with headers |
| Notification payload construction | New payload format | Same shape as `notify-pr-complete.yml` produces | `handleGithubWebhook()`, `summarizeJob()`, `saveJobOutcome()` all expect this shape |
| Job status merging | Separate status endpoints | Extend existing `getJobStatus()` in github.js | One unified status response for the agent |

**Key insight:** The notification system already works. Docker dispatch must produce the same payload shape and reuse the same `summarizeJob()` + `saveJobOutcome()` + channel routing code. The only difference is the source of the payload: container wait vs webhook HTTP request.

## Common Pitfalls

### Pitfall 1: Dual Notification on Docker-Dispatched Jobs

**What goes wrong:** The entrypoint pushes commits to the `job/*` branch. This triggers `notify-pr-complete.yml` via Actions AND the inline notification from `container.wait()`. User gets two notifications.
**Why it happens:** The Actions workflow triggers on `push` to `job/**` branches, regardless of how the container was started.
**How to avoid:** Either (a) add a `DISPATCH_MODE` check in the Actions notification workflow to skip when set to "docker", or (b) dedup in the `handleGithubWebhook()` handler by checking if the job was Docker-dispatched (via `job_origins` dispatch_method column), or (c) mark Docker-dispatched jobs as already-notified in the DB and skip the webhook notification.
**Recommended approach:** Option (b) -- dedup in the webhook handler. The Actions workflows continue to run (they also handle auto-merge), but the notification step checks if the job was already notified via Docker dispatch.

### Pitfall 2: Container Wait Promise Lost on Event Handler Crash

**What goes wrong:** Event Handler crashes or restarts while a Docker job is running. The `container.wait()` promise is lost. Container finishes but nobody collects results.
**Why it happens:** The wait promise lives in Node.js process memory. No persistence.
**How to avoid:** DOCK-07 (track container IDs in DB) + DOCK-08 (startup reconciliation). On restart, find orphaned containers, collect any results, clean up. Accept that some notifications may be lost on crash -- the PR still exists and auto-merge still works.
**Warning signs:** `docker ps` shows `clawforge-job-*` containers with no Event Handler tracking them.

### Pitfall 3: Network Isolation Mismatch

**What goes wrong:** Job container created on the wrong Docker network. It can't reach GitHub API (needs internet) or ends up on another instance's network.
**Why it happens:** Docker networks in docker-compose are prefixed with the project name (e.g., `clawforge_noah-net`). Passing `NetworkMode: 'noah-net'` doesn't match the actual network name.
**How to avoid:** Use the full network name including the Compose project prefix. Discover it via `docker.listNetworks({ filters: { name: ['noah-net'] } })` at startup and cache the actual name. Or use the Docker Compose project label to find networks.
**Warning signs:** Container starts but fails at `git clone` or `gh auth` steps.

### Pitfall 4: Secret Injection Mismatch

**What goes wrong:** Docker-dispatched jobs don't have the same secrets available as Actions-dispatched jobs because the secret sourcing differs.
**Why it happens:** In Actions, secrets come from `${{ secrets.AGENT_* }}` repository secrets filtered by prefix. In Docker dispatch, secrets must be sourced from the Event Handler's environment.
**How to avoid:** The Event Handler needs access to AGENT_* secrets as environment variables, or they must be stored in a shared location (DB, env file). Map the existing `SECRETS` and `LLM_SECRETS` JSON env vars through to the container exactly as the Actions workflow does.
**Warning signs:** Claude Code auth failures, MCP tools failing, API calls returning 401.

### Pitfall 5: Image Not Found / Stale Image

**What goes wrong:** `docker.createContainer()` fails because the job image isn't available locally, or it uses a stale version.
**Why it happens:** Actions always `docker pull` before `docker run`. Docker dispatch relies on locally cached images.
**How to avoid:** Pull the image on Event Handler startup and periodically. Or add a `docker.pull()` call before container creation (adds latency but ensures freshness). Consider pulling in the background on a schedule.
**Warning signs:** `Error: No such image` on first Docker dispatch after deploy.

## Code Examples

### Docker Socket Initialization and Health Check

```javascript
// lib/tools/docker.js
import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
let dockerAvailable = false;

export async function initDocker() {
  try {
    const info = await docker.ping();
    dockerAvailable = true;
    console.log('Docker Engine connected via Unix socket');

    // Reconcile orphaned containers from previous crash
    await reconcileOrphans();
  } catch (err) {
    dockerAvailable = false;
    console.warn('Docker socket not available, falling back to GitHub Actions:', err.message);
  }
}

export function isDockerAvailable() { return dockerAvailable; }
```

### Container Creation with Full Config

```javascript
// Source: dockerode README + Docker Engine API reference
async function createJobContainer(jobId, opts) {
  const { repoUrl, branch, secrets, llmSecrets, image, networkMode, instanceName } = opts;

  const startTime = Date.now();

  const container = await docker.createContainer({
    Image: image,
    name: `clawforge-job-${jobId.slice(0, 8)}`,
    Env: [
      `REPO_URL=${repoUrl}`,
      `BRANCH=job/${jobId}`,
      `SECRETS=${JSON.stringify(secrets)}`,
      `LLM_SECRETS=${JSON.stringify(llmSecrets)}`,
      `DISPATCH_MODE=docker`,
    ],
    Labels: {
      'clawforge': 'job',
      'clawforge.job_id': jobId,
      'clawforge.instance': instanceName,
      'clawforge.started_at': new Date().toISOString(),
    },
    HostConfig: {
      NetworkMode: networkMode,
      AutoRemove: false,
    },
  });

  await container.start();

  const dispatchMs = Date.now() - startTime;
  console.log(`Container started in ${dispatchMs}ms for job ${jobId.slice(0, 8)}`);

  return { container, dispatchMs };
}
```

### Log Collection with Stream Demuxing

```javascript
// dockerode returns multiplexed streams; we need to demux stdout/stderr
async function collectLogs(container) {
  return new Promise((resolve, reject) => {
    container.logs(
      { stdout: true, stderr: true, follow: false },
      (err, stream) => {
        if (err) return reject(err);

        // For non-TTY containers, logs are multiplexed
        // dockerode provides demuxStream helper
        let stdout = '';
        let stderr = '';

        // If stream is a Buffer (non-streaming mode), convert directly
        if (Buffer.isBuffer(stream)) {
          resolve({ stdout: stream.toString('utf8'), stderr: '' });
          return;
        }

        const stdoutStream = new PassThrough();
        const stderrStream = new PassThrough();

        stdoutStream.on('data', chunk => { stdout += chunk.toString(); });
        stderrStream.on('data', chunk => { stderr += chunk.toString(); });

        docker.modem.demuxStream(stream, stdoutStream, stderrStream);
        stream.on('end', () => resolve({ stdout, stderr }));
      }
    );
  });
}
```

### Notification Payload Builder (Matching Actions Format)

```javascript
// Must match the shape produced by notify-pr-complete.yml
async function buildNotificationPayload(jobId, statusCode, logs) {
  const { GH_OWNER, GH_REPO } = process.env;
  const branch = `job/${jobId}`;

  // Check if PR was created
  let prUrl = '';
  let mergeResult = '';
  let changedFiles = [];
  let commitMessage = '';

  try {
    // Query GitHub for PR on this branch
    const prs = await githubApi(
      `/repos/${GH_OWNER}/${GH_REPO}/pulls?head=${GH_OWNER}:${branch}&state=all`
    );
    if (prs.length > 0) {
      const pr = prs[0];
      prUrl = pr.html_url;
      mergeResult = pr.merged_at ? 'merged' : 'not_merged';
    }
  } catch {}

  // Read job.md from branch
  let jobContent = '';
  try {
    jobContent = await fetchRepoFile(GH_OWNER, GH_REPO, `logs/${jobId}/job.md`, { ref: branch });
  } catch {}

  return {
    job_id: jobId,
    branch,
    status: statusCode === 0 ? 'completed' : 'failure',
    job: jobContent || '',
    run_url: '',  // No Actions run URL for Docker-dispatched jobs
    pr_url: prUrl,
    changed_files: changedFiles,
    commit_message: commitMessage,
    log: logs?.stdout?.slice(-4000) || '',
    merge_result: mergeResult,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GitHub Actions as sole dispatcher | Docker Engine API as primary, Actions as fallback | Phase 19 (now) | ~4x faster job start (15s vs 60s) |
| Webhook-only notification | Inline notification after container.wait() | Phase 19 (now) | Faster notification, no webhook latency |
| No container tracking | DB-tracked container IDs with labels | Phase 19 (now) | Enables orphan detection and stuck job inspection |

## Open Questions

1. **Secret sourcing for Docker-dispatched jobs**
   - What we know: Actions sources secrets from `${{ secrets.AGENT_* }}`. The Event Handler has its own env vars but may not have all AGENT_* secrets.
   - What's unclear: Where should AGENT_* secrets for job containers come from? Event Handler env? A secrets file? Docker secrets?
   - Recommendation: Pass AGENT_* secrets as Event Handler environment variables in docker-compose.yml. The Event Handler constructs the SECRETS and LLM_SECRETS JSON objects to pass to containers. This mirrors how Actions does it but sources from compose env instead of GitHub secrets.

2. **Docker Compose network name prefix**
   - What we know: Docker Compose prefixes network names with the project name (e.g., `clawforge_noah-net`).
   - What's unclear: Is the project name always `clawforge`? It depends on the directory name or `COMPOSE_PROJECT_NAME`.
   - Recommendation: Discover networks via `docker.listNetworks()` at startup, filtering by label or name pattern. Cache the mapping.

3. **Image pull strategy**
   - What we know: The job image must be available locally. Actions always pulls latest.
   - What's unclear: Should we pull on every dispatch (slow but fresh) or periodically?
   - Recommendation: Pull at Event Handler startup and on a 1-hour interval in the background. Log warnings if image is older than 24 hours.

4. **Deduplication strategy for notifications**
   - What we know: Both Docker inline notification and Actions webhook notification could fire.
   - What's unclear: Best dedup approach.
   - Recommendation: Add `dispatchMethod` column to `job_origins`. In `handleGithubWebhook()`, check if the job was Docker-dispatched and already notified. Skip if so.

## Validation Architecture

> nyquist_validation is not explicitly set in config.json -- treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None currently (`"test": "echo \"No tests yet\" && exit 0"` in package.json) |
| Config file | None |
| Quick run command | `npm test` (placeholder) |
| Full suite command | `npm test` (placeholder) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCK-01 | Docker socket ping | integration | Manual -- requires Docker daemon | No |
| DOCK-02 | Container creation with config | integration | Manual -- requires Docker daemon | No |
| DOCK-03 | Container wait and exit code | integration | Manual -- requires Docker daemon | No |
| DOCK-04 | Log retrieval | integration | Manual -- requires Docker daemon | No |
| DOCK-05 | Container cleanup | integration | Manual -- requires Docker daemon | No |
| DOCK-06 | Network isolation | integration | Manual -- requires Docker daemon | No |
| DOCK-07 | DB tracking of container IDs | unit | Testable with mock DB | No |
| DOCK-08 | Orphan reconciliation | integration | Manual -- requires Docker daemon | No |
| DOCK-09 | Startup time measurement | integration | Manual -- requires Docker daemon | No |
| DOCK-10 | Container inspection | integration | Manual -- requires Docker daemon | No |
| DISP-01 | REPOS.json dispatch field | unit | Testable with mock REPOS.json | No |
| DISP-02 | Routing logic | unit | Testable with mocked docker/actions | No |
| DISP-03 | Actions path unchanged | smoke | Deploy and test via existing Actions flow | No |
| DISP-04 | Output parity | e2e | Manual -- compare Docker vs Actions job outputs | No |
| DISP-05 | Parallel dispatch | integration | Manual -- dispatch 2 jobs simultaneously | No |

### Sampling Rate

- **Per task commit:** Manual verification against Docker daemon (no automated test suite)
- **Per wave merge:** Full smoke test: dispatch via Docker, verify PR created, notification received
- **Phase gate:** End-to-end test: Slack message -> Docker dispatch -> PR -> auto-merge -> Slack notification

### Wave 0 Gaps

- [ ] No test framework established -- most DOCK requirements need Docker daemon (integration tests, manual-only)
- [ ] Unit-testable requirements (DOCK-07, DISP-01, DISP-02) could use a test file but no framework is configured
- [ ] E2E validation requires deployed infrastructure

## Sources

### Primary (HIGH confidence)

- [dockerode GitHub README](https://github.com/apocas/dockerode) -- API methods: createContainer, start, wait, logs, remove, listContainers, inspect
- Direct codebase inspection: `docker-compose.yml` -- Traefik already mounts docker.sock (line 38)
- Direct codebase inspection: `lib/tools/create-job.js` -- Current GitHub API branch creation flow
- Direct codebase inspection: `lib/ai/tools.js` -- Current createJobTool dispatch logic
- Direct codebase inspection: `api/index.js` -- handleGithubWebhook notification payload shape and routing
- Direct codebase inspection: `templates/.github/workflows/notify-pr-complete.yml` -- Actions notification payload shape
- Direct codebase inspection: `templates/.github/workflows/run-job.yml` -- Actions container run config
- Direct codebase inspection: `templates/docker/job/entrypoint.sh` -- Container execution flow
- Direct codebase inspection: `instances/noah/config/REPOS.json` -- Current REPOS.json schema (no dispatch field)

### Secondary (MEDIUM confidence)

- `.planning/research/ARCHITECTURE.md` -- Pre-existing architecture research with validated patterns
- `.planning/research/STACK.md` -- Dockerode selection rationale and version
- `.planning/research/PITFALLS.md` -- Docker socket security concerns and mitigations

### Tertiary (LOW confidence)

- Docker Compose network naming (prefix behavior) -- needs verification on target host
- Image pull timing impact -- estimated ~3-5s for cached pulls, needs measurement

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- dockerode@^4.0.9 explicitly decided in REQUIREMENTS.md
- Architecture: HIGH -- pre-existing research in `.planning/research/` validated against current codebase
- Pitfalls: HIGH -- dual notification, network naming, and secret sourcing identified from direct code analysis
- Notification flow: HIGH -- complete understanding of both Actions webhook and direct notification paths

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain -- Docker Engine API is mature)
