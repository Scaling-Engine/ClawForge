# Domain Pitfalls

**Domain:** Docker Engine API dispatch, Layer 2 context hydration, and named volumes for an existing agent platform (ClawForge v1.4)
**Researched:** 2026-03-06
**Confidence:** HIGH (codebase inspection + Docker official docs) / MEDIUM (community patterns, dockerode docs) / LOW (flagged where applicable)

---

## Critical Pitfalls

### Pitfall 1: Docker Socket Exposure Grants Root-Equivalent Access to Event Handler Container

**What goes wrong:**
The Event Handler container (noah-event-handler, ses-event-handler) needs to call the Docker Engine API to create/start/stop job containers. The standard approach is mounting `/var/run/docker.sock` into the Event Handler container. This grants the container full control over the Docker daemon -- it can start any container, mount the host filesystem, read other containers' environment variables, and effectively gain root access to the host. A vulnerability in the Event Handler (e.g., a compromised LLM response that triggers arbitrary code execution via LangGraph tools) could escalate to full host compromise.

Currently, the Event Handler containers have no Docker socket access. Adding it is a security surface area expansion that affects both instances (noah and strategyES). The strategyES instance is scoped to a single repo and restricted users -- but with Docker socket access, a compromised strategyES container could inspect noah's containers, read noah's environment variables (including API keys), or spawn containers on noah's network.

**Why it happens:**
The Docker Engine API is an all-or-nothing interface when accessed via the Unix socket. There is no built-in capability model -- any process with socket access can perform any operation. The `:ro` (read-only) mount flag does NOT restrict API operations; it only prevents deleting the socket file itself.

**Consequences:**
- Instance isolation (separate Docker networks) is bypassed -- socket access can inspect/control containers on any network
- API keys and secrets in environment variables of any container are readable via `docker inspect`
- An attacker could mount the host filesystem into a new container and read/write anything

**Prevention:**
1. Use a Docker socket proxy (Tecnativa/docker-socket-proxy or wollomatic/socket-proxy) between the Event Handler and the Docker daemon. The proxy allows only specific API endpoints (POST /containers/create, POST /containers/{id}/start, GET /containers/{id}/json, DELETE /containers/{id}) and blocks dangerous ones (GET /containers/{id}/exec, POST /images/create with host binds).
2. Each instance gets its own socket proxy container with its own allowlist -- strategyES's proxy cannot call endpoints that noah's proxy allows if the policies differ.
3. The socket proxy runs on the same Docker network as its Event Handler but the actual `/var/run/docker.sock` is only mounted into the proxy container, never into the Event Handler directly.

**Detection:**
- Audit: `docker inspect <event-handler-container>` and check Binds for `/var/run/docker.sock`
- If the socket is mounted directly (no proxy), flag as a security gap immediately

**Phase to address:**
Phase 1 (Docker Engine API integration) -- the socket proxy must be the FIRST thing added to docker-compose.yml, before any API client code is written. Writing the dockerode client against a direct socket mount and then retrofitting a proxy later changes the connection path and error semantics.

---

### Pitfall 2: Named Volumes With Stale Git State Cause Silent Job Failures

**What goes wrong:**
Named volumes persist repo clones across ephemeral job containers so subsequent jobs start "warm" (no re-clone). But the volume contains a git working tree from the previous job -- which may have uncommitted changes, a detached HEAD, checked-out job branch, or a `.git/index.lock` left behind by a killed container. The next job container mounts this volume and expects a clean repo state, but gets whatever the previous container left behind.

Specific failure modes:
- **Stale branch:** Volume has `job/abc-123` checked out. New job tries `git checkout -b job/def-456` but the working tree has uncommitted changes from the prior job. `git checkout` fails or silently carries forward prior changes.
- **Lock file:** Prior container was killed (30-min timeout). `.git/index.lock` exists. All git operations fail with "fatal: Unable to create lock file".
- **Diverged history:** Volume's `main` branch is 50 commits behind remote `main`. A `git pull` brings in 50 commits of changes, potentially conflicting with the job's assumptions about the codebase.
- **Modified CLAUDE.md:** Prior job modified CLAUDE.md in the working tree. The entrypoint reads CLAUDE.md from the working tree for prompt enrichment (line 111-120 of entrypoint.sh). The new job gets the wrong CLAUDE.md content.

**Why it happens:**
The current entrypoint does a fresh `git clone --single-branch --branch "$BRANCH" --depth 1` every time (line 35). This is clean but slow. Named volumes aim to skip the clone. But git repos are stateful -- the working tree, index, HEAD, and refs all carry state from the previous operation. There is no "reset to clean" primitive that handles all edge cases atomically.

**Consequences:**
- Jobs silently operate on stale code (wrong branch, old commits)
- Git lock files cause immediate failure -- but the failure stage detection (which looks for `preflight.md` and `claude-output.jsonl`) may categorize this as a "clone" failure when it is actually a "stale volume" failure
- Cross-repo jobs (target.json flow) compound the problem -- the volume may contain repo A's clone but the job targets repo B

**Prevention:**
1. The entrypoint must perform a "volume hygiene" step before any git operation: remove `.git/index.lock`, `git checkout main`, `git reset --hard origin/main`, `git clean -fdx` (excluding specific paths like `.claude/` if settings need preserving). This adds 2-3 seconds but prevents all stale-state failures.
2. Use per-repo volumes, not a single volume. Volume naming: `clawforge-repo-{owner}-{slug}` (e.g., `clawforge-repo-scalingengine-clawforge`). Cross-repo jobs mount the correct volume for their target repo.
3. The entrypoint should detect if the volume is "first use" (empty directory) vs "warm" (has `.git/`). If first use, do a full clone. If warm, do `git fetch origin main && git reset --hard origin/main`.
4. For cross-repo jobs with target.json, the volume mount decision must happen BEFORE container creation (at the Docker API call site in the Event Handler), not inside the entrypoint. The Event Handler reads target.json and mounts the correct repo volume.

**Detection:**
- Job fails with "fatal: Unable to create lock file" -- stale lock from killed container
- Job PR contains files that weren't part of the job description -- carried forward from prior job's working tree
- Job operates on code that doesn't match current `main` -- volume's HEAD is behind

**Phase to address:**
Phase 2 (named volumes) -- the volume hygiene step must be designed and tested before volumes are used in production. Shipping volumes without hygiene guarantees silent failures within the first week.

---

### Pitfall 3: Event Handler Creates Containers But Loses Track of Them -- Zombie Containers Accumulate

**What goes wrong:**
Currently, GitHub Actions manages the entire container lifecycle: Actions starts the container, waits for completion, and the runner cleans up. With Docker Engine API dispatch, the Event Handler creates containers via dockerode and must manage their full lifecycle: create, start, wait for completion, collect logs, remove container. If the Event Handler crashes, restarts, or loses the container ID between creation and cleanup, the container runs to completion (or hangs at the 30-min timeout) with no process waiting for it. The container becomes a zombie -- consuming resources, holding volume locks, and never getting cleaned up.

Failure scenarios:
- Event Handler calls `docker.createContainer()` + `container.start()`, stores the container ID in memory (not DB), then crashes. On restart, the container ID is lost. The container runs its 30-min timeout, finishes, and sits as a stopped container consuming disk.
- Event Handler calls `container.wait()` (blocking promise) but the HTTP connection to the Docker socket drops. The promise rejects, the Event Handler moves on, but the container is still running.
- Multiple concurrent jobs create multiple containers. The Event Handler tracks them in a Map or array. PM2 restarts the process -- all tracking is lost.

**Why it happens:**
The current system has no container tracking because GitHub Actions owns the lifecycle. Moving to Docker Engine API means the Event Handler must become a container orchestrator -- a role it is not currently designed for. In-memory state (Maps, variables) is lost on process restart. The SQLite `job_outcomes` table records outcomes after completion but does not track running containers.

**Consequences:**
- Stopped containers accumulate (each ~500MB with node_modules + repo clone)
- Running containers consume CPU/memory with no process collecting their results
- Volume locks from zombie containers prevent new containers from mounting the same volume
- Host runs out of disk space after dozens of uncleaned containers

**Prevention:**
1. Record container ID in the SQLite database immediately after `docker.createContainer()` succeeds, BEFORE calling `container.start()`. Add a `container_id` and `container_status` column to `job_outcomes` (or a new `running_jobs` table).
2. On Event Handler startup, query Docker for all containers with a ClawForge label (e.g., `com.clawforge.job-id={uuid}`). For any container that exists but is not tracked in the DB, adopt it (update DB) or remove it (cleanup).
3. Implement a periodic cleanup sweep (every 5 minutes): query Docker for stopped containers with the ClawForge label older than 10 minutes. Remove them after extracting logs.
4. Use container labels to tag every container with: `com.clawforge.job-id`, `com.clawforge.instance`, `com.clawforge.created-at`. Labels survive process restarts and are queryable via the Docker API.
5. Set `HostConfig.AutoRemove: false` (need the container for log extraction) but implement explicit removal after log collection.

**Detection:**
- `docker ps -a --filter label=com.clawforge.job-id` shows containers older than 1 hour
- Host disk usage grows steadily between deployments
- `docker system df` shows high container/image storage usage

**Phase to address:**
Phase 1 (Docker Engine API integration) -- container lifecycle management is not a "nice to have"; it is the core of replacing GitHub Actions. Ship it with the first Docker API implementation, not as a follow-up.

---

### Pitfall 4: Context Hydration Bloats Job Prompts Beyond Claude Code's Effective Window

**What goes wrong:**
Layer 2 context hydration adds STATE.md + ROADMAP.md + recent git history to the job prompt. The current FULL_PROMPT is already structured (Target + Docs + Stack + Task + GSD Hint). Adding three more sections increases prompt size significantly:
- STATE.md: typically 2-4KB
- ROADMAP.md: typically 4-8KB
- Git history (last 20 commits with diffs summary): 2-6KB
- Existing CLAUDE.md injection: up to 8KB (capped)
- Existing job description: 1-4KB

Total prompt could reach 25-30KB (roughly 6,000-8,000 tokens). Add the system prompt (SOUL.md + AGENT.md, ~3KB) and the model has consumed 8,000-10,000 tokens before it starts working. This is not a hard limit problem (Claude Code handles 200K tokens) but a signal-to-noise problem: the more context injected, the more likely the agent ignores specific task instructions in favor of broad project context. Jobs that should be targeted ("fix this typo in README") receive 8KB of roadmap context they don't need, diluting the task signal.

**Why it happens:**
Context hydration is designed for the general case ("agent needs project awareness") but applied uniformly to all jobs. The entrypoint has no mechanism to select which context sections are relevant. The GSD hint already differentiates `quick` vs `plan-phase` jobs, but the context injection does not vary with the hint.

**Consequences:**
- Simple jobs take longer because the agent reads and considers irrelevant context
- Claude Code's first actions become "reading STATE.md" and "understanding the roadmap" instead of executing the task
- Token costs increase for every job (hydration context is input tokens billed regardless of whether the agent uses them)
- For cross-repo jobs, the hydrated STATE.md/ROADMAP.md may come from the clawforge repo rather than the target repo, providing misleading context

**Prevention:**
1. Gate context hydration on GSD hint: `quick` jobs get only CLAUDE.md + task. `plan-phase` jobs get the full hydration (STATE.md + ROADMAP.md + git history). This leverages the existing routing decision.
2. Cap each hydration section independently: STATE.md at 2KB, ROADMAP.md at 4KB, git history at 2KB. Truncation with `[TRUNCATED]` markers (matching the existing CLAUDE.md pattern).
3. For cross-repo jobs, hydrate from the TARGET repo's STATE.md/ROADMAP.md (fetched via GitHub API at dispatch time or read from the target volume), not from clawforge's. The `get_project_state` tool already exists in Layer 1 -- reuse its logic at the entrypoint level.
4. Include the hydrated content in a clearly-marked "Reference Only" section with an explicit instruction: "This context is for awareness. Focus on the Task section for your specific work."

**Detection:**
- Simple jobs (typo fixes, single-file edits) take >10 minutes when they should take 2-3
- Claude Code's first tool calls are `Read` on STATE.md/ROADMAP.md instead of the task-relevant files
- Job logs show the agent "planning" for 5 minutes on a task that needs no planning

**Phase to address:**
Phase 2 (context hydration) -- implement conditional hydration from the start. Adding it uniformly and then pruning later means every job in the interim gets bloated context.

---

## Moderate Pitfalls

### Pitfall 5: Dockerode API Version Mismatch With Host Docker Engine

**What goes wrong:**
Docker Engine v29 (released 2025) raised the minimum supported API version from 1.25 to 1.44. If the Event Handler uses dockerode with a hardcoded or default API version that's below the host's minimum, all API calls fail with `400 Bad Request: client version X is too old`. Conversely, if dockerode requests a version newer than the host supports, calls fail with `400 Bad Request: client version X is too new`.

The VPS running ClawForge may have Docker Engine v28 (API 1.45) or v29 (API 1.48). The dockerode client defaults to negotiating the API version, but if the socket proxy (Pitfall 1) or an intermediate layer does not forward version negotiation headers correctly, the mismatch surfaces as opaque HTTP errors.

**Prevention:**
1. Do not hardcode the API version in dockerode constructor. Let it negotiate, or read the version from `docker version` at startup and pass it explicitly.
2. Pin the Docker Engine version in deployment docs. Document minimum: Docker Engine v28.0+ (API v1.45+).
3. Test the Docker API connection at Event Handler startup (health check) -- call `docker.ping()` and `docker.version()` and log the negotiated API version. Fail fast if the version is unsupported.

**Phase to address:**
Phase 1 -- include version check in the initial dockerode setup, not after the first production failure.

---

### Pitfall 6: Container Network Isolation Breaks When Job Containers Join Wrong Network

**What goes wrong:**
Currently, noah-event-handler is on `noah-net` and ses-event-handler is on `strategyES-net`. Job containers spawned by the Event Handler must join the correct network (or no network, if they only need outbound internet). If the Docker API call creates a job container on the default bridge network (Docker's default when no network is specified), the container can see other containers on that network. If it accidentally joins `noah-net`, a strategyES job container could reach noah's Event Handler.

The current GitHub Actions containers run in GitHub's infrastructure with no access to ClawForge's Docker networks. Moving to local Docker Engine dispatch means job containers share the same Docker daemon and can potentially reach anything.

**Prevention:**
1. Create a dedicated `jobs-net` network (or per-instance: `noah-jobs-net`, `ses-jobs-net`) for job containers. This network has no other services attached.
2. In the dockerode `createContainer` call, explicitly set `NetworkingMode` to the jobs network. Never rely on the default.
3. Job containers need outbound internet (for `git clone`, `gh api`, `npm install`) but should not be able to reach the Event Handler's HTTP port. Use Docker network policies or separate networks to enforce this.
4. Validate at container creation time that the network exists -- if it doesn't (docker-compose down removed it), fail the job with a clear error rather than falling back to the default network.

**Phase to address:**
Phase 1 -- network assignment is part of the container creation call. Get it right in the first implementation.

---

### Pitfall 7: Volume Permissions Mismatch Between Job Container User and Volume Owner

**What goes wrong:**
The job container Dockerfile uses `node:22-bookworm-slim` which runs as root by default. Named volumes created by Docker are owned by root. This works today. But if a future security hardening changes the container to run as a non-root user (e.g., `node` user, UID 1000), the named volume's root-owned files become unreadable. Git operations fail with permission denied. The `.git/` directory created by root in a previous run cannot be modified by UID 1000 in the next run.

**Prevention:**
1. If running as root: document this as a conscious decision, not an oversight. Add a comment in the Dockerfile.
2. If switching to non-root: the entrypoint must `chown -R` the volume directory before git operations. This adds startup time proportional to volume size.
3. Use a consistent UID across all job containers. Pin it in the Dockerfile: `RUN useradd -u 1000 agent` and `USER agent`. Ensure the entrypoint runs as this user.
4. For now, keep running as root (matches current behavior) and defer non-root hardening to a security milestone.

**Phase to address:**
Phase 2 (named volumes) -- document the root-user decision. Don't ship volumes without deciding on the container user model.

---

### Pitfall 8: Entrypoint Rewrite Introduces Regression in Cross-Repo Job Flow

**What goes wrong:**
The current entrypoint.sh handles two flows: same-repo jobs (clone clawforge, work in `/job`) and cross-repo jobs (clone clawforge to `/job`, read `target.json`, clone target repo to `/workspace`, work in `/workspace`). Adding named volumes and context hydration requires modifying the entrypoint significantly -- the clone step becomes conditional (volume warm vs cold), context files need fetching, and the working directory logic changes.

The cross-repo flow is the most fragile path: it depends on `target.json` being on the job branch, the two-phase clone working correctly, SOUL.md/AGENT.md being read from `/defaults/` not `/job/config/`, and PR creation happening against the target repo. Any entrypoint modification that changes the `/job` vs `/workspace` directory logic, the clone order, or the config file resolution path can break cross-repo jobs while same-repo jobs continue working -- making the regression invisible in basic testing.

**Prevention:**
1. Before modifying the entrypoint, run the VERIFICATION-RUNBOOK.md scenarios S1-S5 (already documented) to establish a baseline.
2. Structure the entrypoint modification as additive: keep the existing flow as the "cold start" path, add the volume-based "warm start" path as a conditional branch early in the script. Do not refactor the existing flow while adding new capabilities.
3. Test cross-repo jobs explicitly after every entrypoint change. The test matrix is: same-repo cold, same-repo warm, cross-repo cold, cross-repo warm (4 combinations).
4. The target.json sidecar approach works for GitHub Actions (job branch carries metadata). For Docker Engine API dispatch, the Event Handler knows the target repo at dispatch time -- pass it as an environment variable (`TARGET_REPO`, `TARGET_OWNER`) directly, eliminating the need to read target.json from the git branch inside the container.

**Phase to address:**
Phase 2-3 (entrypoint modification) -- run verification runbook before AND after entrypoint changes. Test all 4 combinations.

---

### Pitfall 9: GitHub Actions Fallback Creates Two Dispatch Paths With Divergent Behavior

**What goes wrong:**
The v1.4 design retains GitHub Actions as a fallback for CI-integrated repos. This means the system has TWO dispatch paths: Docker Engine API (fast, volume-mounted) and GitHub Actions (slow, fresh clone). If these paths produce different behavior -- different prompt structure, different context injection, different volume state, different notification flow -- bugs will be path-dependent and hard to reproduce.

Specifically:
- Docker Engine API path has named volumes (warm start). GitHub Actions path does a fresh clone (cold start). Same job, different working tree state.
- Docker Engine API path injects context hydration (STATE.md, ROADMAP.md). If the GitHub Actions path doesn't inject the same context, agents behave differently on the same task.
- Notification flow differs: Docker Engine API containers must notify the Event Handler directly (no GitHub webhook). GitHub Actions containers notify via the existing workflow-based webhook.

**Prevention:**
1. Keep the entrypoint identical for both paths. The entrypoint should not know or care whether it was started by Docker Engine API or GitHub Actions. All behavioral differences should be in the container's environment variables, not in entrypoint logic.
2. Context hydration must happen in the entrypoint (where it can be consistent across both paths), not in the Docker Engine API dispatch code (where it would only apply to one path).
3. Document which path each job will take in the `create_job` tool response. The operator should know if their job went through Docker API or Actions.
4. If a feature only works on one path (e.g., warm volumes only work with Docker API), make this explicit in the job prompt: "This job is running with a cold start -- full clone will be performed."

**Phase to address:**
Phase 3 (fallback integration) -- design the entrypoint to be path-agnostic from the start. Don't build Docker-API-specific entrypoint logic that then needs to be backported to the Actions path.

---

### Pitfall 10: Concurrent Job Containers Compete for Same Named Volume

**What goes wrong:**
Two jobs targeting the same repo are dispatched simultaneously. Both try to mount the same named volume (`clawforge-repo-scalingengine-clawforge`). Docker allows multiple containers to mount the same volume simultaneously with read-write access. Both containers do `git fetch && git reset --hard origin/main`, then both create their own job branches. They modify the same files. When they push, one succeeds and the other gets "remote rejected" because the branch already exists, or both create PRs with conflicting changes from a shared working tree.

Even without concurrent modification, the second container's `git clean -fdx` removes files the first container is actively reading. The first container gets `ENOENT` errors mid-operation.

**Prevention:**
1. Use per-job working directories within the volume: volume mounts at `/repos/{owner}/{slug}`, each job clones/copies to `/job/{uuid}` within the container. The volume is a cache, not the working directory.
2. Alternatively, implement a simple lock: before mounting a repo volume, check if another container is using it (query Docker for running containers with the same volume mount). If locked, fall back to a fresh clone (cold start with no volume).
3. The Event Handler should serialize jobs targeting the same repo on the same instance. Use a queue (or a simple in-memory lock per repo slug) to prevent concurrent dispatch to the same target.
4. The simplest approach: `git clone` from the volume into a separate directory (fast local clone, ~2 seconds for a large repo) rather than working directly in the volume. The volume is read-only reference, the working directory is ephemeral per-container.

**Detection:**
- Two PRs for the same repo opened within seconds of each other, one with unexpected file changes
- Git errors in job logs: "fatal: remote rejected" or "error: cannot lock ref"
- Job container exits with git errors but failure stage detection categorizes it as "clone" failure

**Phase to address:**
Phase 2 (named volumes) -- decide on the concurrency model before implementing volumes. The architecture of "volume as cache vs volume as working directory" determines everything downstream.

---

## Minor Pitfalls

### Pitfall 11: Container Log Collection Races With Container Removal

**What goes wrong:**
After a job container finishes, the Event Handler needs to: (1) read the container logs, (2) extract the PR URL from the output, (3) update the job_outcomes DB, (4) send a notification, (5) remove the container. If step 5 happens before steps 1-4 complete (e.g., due to async race), the logs are lost. Dockerode's `container.logs()` returns a stream -- if the container is removed while the stream is being read, the stream truncates.

**Prevention:**
1. Make the lifecycle strictly sequential: `await container.wait()` -> `await collectLogs(container)` -> `await updateDB(...)` -> `await sendNotification(...)` -> `await container.remove()`. No parallelism in the cleanup path.
2. Write logs to a volume (not just container stdout) so they survive container removal. The current pattern of writing to `${LOG_DIR}` inside the container filesystem is lost when the container is removed unless the log directory is on a volume.

**Phase to address:**
Phase 1 -- log collection is part of the container lifecycle management.

---

### Pitfall 12: Docker Image Pull Adds Cold-Start Latency That Negates the Speed Improvement

**What goes wrong:**
The whole point of Docker Engine API dispatch is "containers start in seconds instead of minutes." But if the job container image (`clawforge-job:latest`) is not pre-pulled on the host, the first job triggers a Docker pull (~30-60 seconds for the 1.5GB image with node_modules, Chrome deps, Claude Code CLI, GSD). Even after the first pull, image updates (new Claude Code version, GSD update) require a re-pull.

**Prevention:**
1. Pre-pull the job image at Event Handler startup: `docker.pull('clawforge-job:latest')`. Log the pull duration.
2. Build the job image locally on the host as part of deployment (`docker compose build`). Reference the local image, not a registry image.
3. If using a registry, set up a cron job or deployment hook to pull the latest image before traffic arrives.
4. Monitor container start time in the job_outcomes record. If start time exceeds 10 seconds, the image likely needed pulling.

**Phase to address:**
Phase 1 -- include image management in the Docker Engine API setup.

---

### Pitfall 13: Context Hydration Fetches STATE.md/ROADMAP.md From Wrong Repo for Cross-Repo Jobs

**What goes wrong:**
The entrypoint builds the FULL_PROMPT using files from the working directory (`/job` or `/workspace`). For same-repo jobs, STATE.md and ROADMAP.md are in the clawforge repo's `.planning/` directory. For cross-repo jobs, the working directory is the target repo -- which may or may not have `.planning/STATE.md`. The hydration logic must know which repo's state to inject.

If the entrypoint always reads from the working directory, cross-repo jobs targeting repos without GSD planning files get no hydration (acceptable). But if it falls back to reading from the clawforge repo's clone (at `/job`), the agent gets clawforge's project state when working on a completely different repo -- misleading context.

**Prevention:**
1. Context hydration reads exclusively from the working directory (WORK_DIR). If the target repo has `.planning/STATE.md`, inject it. If not, skip it. Never fall back to a different repo's state.
2. Alternatively, the Event Handler fetches the target repo's STATE.md via GitHub API (reusing `get_project_state` logic) at dispatch time and passes it as an environment variable or file to the container. This avoids the entrypoint needing to know which repo's state to read.

**Phase to address:**
Phase 2 (context hydration) -- define the data flow before implementation.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Docker Engine API client setup | Socket security (Pitfall 1), API version mismatch (Pitfall 5) | Use socket proxy from day 1; version check at startup |
| Container lifecycle management | Zombie containers (Pitfall 3), log collection race (Pitfall 11) | DB-tracked container IDs; sequential cleanup; startup reconciliation |
| Named volumes implementation | Stale git state (Pitfall 2), concurrent access (Pitfall 10), permissions (Pitfall 7) | Volume hygiene step; per-job working dirs; document root-user decision |
| Context hydration in entrypoint | Prompt bloat (Pitfall 4), wrong repo context (Pitfall 13) | Conditional hydration gated on GSD hint; read from WORK_DIR only |
| Entrypoint modification | Cross-repo regression (Pitfall 8) | Run VERIFICATION-RUNBOOK before and after; test 4 combinations |
| Actions fallback | Divergent behavior (Pitfall 9) | Path-agnostic entrypoint; consistent context injection |
| Image management | Cold-start latency (Pitfall 12) | Pre-pull at startup; local build in deployment |
| Network assignment | Isolation bypass (Pitfall 6) | Dedicated jobs network; explicit NetworkingMode in create call |

---

## "Looks Done But Isn't" Checklist

- [ ] **Socket proxy in place:** Run `docker inspect <event-handler>` -- confirm `/var/run/docker.sock` is NOT in Binds. Confirm a socket proxy container exists and the Event Handler connects to it.

- [ ] **Container cleanup on restart:** Kill the Event Handler process (`docker restart clawforge-noah`). Check `docker ps -a --filter label=com.clawforge.job-id` before and after. Confirm orphaned containers are adopted or cleaned up on startup.

- [ ] **Volume hygiene works:** Run a job, kill it mid-execution (`docker kill <job-container>`). Run another job targeting the same repo. Confirm it succeeds (no lock file errors, correct branch).

- [ ] **Cross-repo jobs still work:** After entrypoint changes, dispatch a cross-repo job. Confirm: target.json read correctly, PR created on target repo, notification fired.

- [ ] **Context hydration conditional:** Dispatch a `quick` hint job (simple task). Check the FULL_PROMPT length in job logs. Confirm STATE.md/ROADMAP.md are NOT included. Dispatch a `plan-phase` job. Confirm they ARE included.

- [ ] **Concurrent jobs don't corrupt:** Dispatch two jobs targeting the same repo within 5 seconds. Confirm both complete successfully with independent PRs and no cross-contamination.

- [ ] **Fallback to Actions works:** Disable Docker Engine API (stop socket proxy). Dispatch a job. Confirm it falls back to GitHub Actions and completes normally.

- [ ] **API version logged:** Check Event Handler startup logs. Confirm Docker API version is logged (e.g., "Docker Engine API v1.45 connected").

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Docker socket exposed without proxy | HIGH | Add socket proxy to docker-compose; redeploy; audit container inspect logs for leaked secrets |
| Stale volume causes wrong code in PR | LOW | Close PR; run `docker volume rm <volume>` to force fresh clone on next job; re-dispatch |
| Zombie containers accumulating | LOW | `docker rm $(docker ps -aq --filter label=com.clawforge.job-id)` to clean all; fix lifecycle code |
| Prompt bloat causing slow/wrong jobs | LOW | Add conditional hydration gate; redeploy Event Handler |
| API version mismatch | LOW | Update dockerode constructor with correct version; or upgrade Docker Engine on host |
| Cross-repo regression from entrypoint change | MEDIUM | Revert entrypoint to last known-good; re-run VERIFICATION-RUNBOOK |
| Concurrent volume corruption | MEDIUM | `docker volume rm <volume>` for affected repo; implement per-job working directory |
| Wrong repo context hydrated | LOW | Fix entrypoint to read from WORK_DIR only; redeploy |

---

## Sources

### PRIMARY (HIGH confidence -- direct codebase inspection)

- `templates/docker/job/entrypoint.sh` -- Current clone flow (line 34-39), CLAUDE.md injection (line 111-120), prompt assembly (line 183-200), cross-repo WORK_DIR logic
- `templates/docker/job/Dockerfile` -- Root user, node:22-bookworm-slim base, GSD install, SOUL.md/AGENT.md baked at /defaults/
- `docker-compose.yml` -- Network isolation (noah-net, strategyES-net, proxy-net), volume definitions, Traefik socket mount pattern
- `lib/tools/create-job.js` -- Job branch creation via GitHub API, target.json sidecar for cross-repo
- `lib/ai/tools.js` -- create_job tool, get_project_state tool (GitHub API fetch of STATE.md/ROADMAP.md)
- `.planning/PROJECT.md` -- v1.4 requirements, current state after v1.3, constraints
- `.planning/VISION.md` -- Milestone map, thepopebot docker.js pattern to pull, architecture evolution

### SECONDARY (MEDIUM confidence -- official docs + community patterns)

- [Docker Engine API docs](https://docs.docker.com/reference/api/engine/) -- API versioning, container create/start/wait/remove lifecycle
- [Docker Socket Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html) -- OWASP guidance on socket exposure risks
- [Tecnativa docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) -- HAProxy-based socket proxy with endpoint allowlisting
- [wollomatic/socket-proxy](https://github.com/wollomatic/socket-proxy) -- Go-based socket proxy with regex configuration
- [dockerode](https://github.com/apocas/dockerode) -- Node.js Docker API client; stream handling, promise interface
- [Docker v29 API version breaking change](https://www.portainer.io/blog/docker-v29-and-the-fall-out) -- Minimum API version raised to 1.44, broke Portainer and other clients
- [Docker volume permissions](https://denibertovic.com/posts/handling-permissions-with-docker-volumes/) -- UID mismatch between container user and volume owner
- [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/) -- mem_limit, cpus for container resource control
- [Docker concurrent container creation](https://github.com/moby/moby/issues/11228) -- Docker chokes with many concurrent requests; serialization at daemon level
- [Docker PID 1 zombie reaping](https://blog.phusion.nl/2015/01/20/docker-and-the-pid-1-zombie-reaping-problem/) -- Containers without init system leave zombie processes

---

*Pitfalls research for: ClawForge v1.4 -- Docker Engine Foundation (Docker Engine API dispatch, Layer 2 context hydration, named volumes)*
*Researched: 2026-03-06*
