# Feature Landscape: v1.4 Docker Engine Foundation

**Domain:** Docker Engine API dispatch, Layer 2 context hydration, named volumes for ClawForge agent platform
**Researched:** 2026-03-06
**Scope:** NEW features only -- existing pipeline (GH Actions dispatch, structured prompts, cross-repo targeting) is out of scope.

---

## Context: What Is Being Built

v1.4 replaces GitHub Actions as the primary job dispatch mechanism with direct Docker Engine API calls. Three capabilities:

1. **Docker Engine API dispatch** -- Event handler creates and starts job containers directly via Unix socket (`/var/run/docker.sock`), bypassing the GH Actions queue. Cold start drops from ~60s to ~10-15s. GH Actions retained as fallback for repos needing CI integration.
2. **Layer 2 context hydration** -- The entrypoint.sh injects `.planning/STATE.md`, `ROADMAP.md`, and recent git history into the job prompt. Job containers start with "trunk" context (where the project is, what phase it's in, what just changed) instead of discovering it by reading files.
3. **Named volumes** -- Persistent Docker volumes per repo per instance. First job clones into the volume; subsequent jobs do `git fetch` (2-3s) instead of `git clone` (10-15s). The "warm start" pattern from Stripe's devboxes.

The upstream reference is thepopebot's `lib/tools/docker.js` which is in production with Unix socket dispatch, named volumes, and container lifecycle management. ClawForge adapts these patterns for its multi-instance isolation model.

---

## Table Stakes

Features that are required for v1.4 to be a functioning improvement over v1.3. Missing any of these means the milestone is incomplete.

| Feature | Why Expected | Complexity | Dependencies on Existing |
|---------|--------------|------------|--------------------------|
| Docker Engine API client (`lib/tools/docker.js`) | Foundation for all v1.4+ features. Without direct Docker API access via Unix socket, no speed improvement is possible. thepopebot has this in production: `dockerApi(method, path, body)` makes HTTP requests to `/var/run/docker.sock`. | Medium | Event handler already mounts docker.sock (docker-compose.yml:38, line `- /var/run/docker.sock:/var/run/docker.sock:ro`). Pattern exists upstream in thepopebot `docker.js`. No new npm dependencies needed -- Node.js `http` module handles Unix socket natively. |
| `createHeadlessCodeContainer()` | The direct replacement for GH Actions dispatch. Creates ephemeral container with env vars (BRANCH, REPO_URL, SECRETS, GH_TOKEN, ANTHROPIC_API_KEY), runs entrypoint.sh, exits. Must produce identical outputs: commits, PR, logs, notifications. | Medium | Depends on Docker API client. Must replicate what `run-job.yml` does: pull image, set env vars, run container. Current `createJob()` in `lib/tools/create-job.js` needs a new dispatch path alongside the existing branch-push mechanism. |
| Container wait + exit code capture | Event handler must know when a job finishes and whether it succeeded. thepopebot's `waitForContainer(containerName)` calls `POST /containers/{id}/wait` and returns the `StatusCode`. Without this, notifications can't fire. | Low | Depends on Docker API client. Replaces the GH Actions webhook notification flow (`notify-pr-complete.yml`, `notify-job-failed.yml`). The `summarizeJob()` function in `lib/ai/index.js` needs to be triggered after container exit instead of after webhook receipt. |
| Log retrieval from completed containers | Operators need to see what happened. thepopebot uses `tailContainerLogs(containerName)` which calls `GET /containers/{id}/logs`. Currently ClawForge gets logs via GH Actions artifacts (committed to branch). | Low | Depends on Docker API client. Current `claude-output.jsonl` and `gsd-invocations.jsonl` are committed to the job branch by entrypoint.sh -- that pattern continues unchanged. Docker logs provide an additional channel for debugging container-level issues (entrypoint failures, auth problems). |
| Feature-flagged dispatch per repo | Both dispatch paths (Docker Engine and GH Actions) must coexist. Some repos need CI integration (test runners, linting workflows) that only Actions provides. Per-repo config determines which dispatch path. | Medium | REPOS.json already has per-repo config structure. Add `dispatch: "docker" | "actions"` field. Default: `"docker"` for new repos. `createJobTool` in `lib/ai/tools.js` routes based on this field. Existing `createJob()` becomes the "actions" path; new `dispatchDockerJob()` becomes the "docker" path. |
| GH Actions fallback preserved | Cannot break existing pipeline. Repos configured for Actions dispatch must continue working identically. This is a hard requirement from VISION.md: "GH Actions as fallback, not replacement." | Low | Zero changes to existing GH Actions workflows (`run-job.yml`, `auto-merge.yml`, `notify-pr-complete.yml`, `notify-job-failed.yml`). Purely additive -- new dispatch path alongside existing. The branch-push mechanism in `createJob()` remains untouched. |
| Layer 2 context hydration: STATE.md + ROADMAP.md | Job containers currently lack project state awareness. The agent wastes early tokens running `Read .planning/STATE.md` and `Read .planning/ROADMAP.md` manually. Injecting these into FULL_PROMPT gives "trunk" context upfront. Estimated cost: ~2-4K additional tokens, well within the sniper agent budget (~3-4K current overhead). | Low | entrypoint.sh already reads CLAUDE.md (lines 108-120) and package.json (lines 123-129). Same pattern: read file from cloned repo, cap at char limit, inject into FULL_PROMPT as a new section. Implementation plan with code already exists in `docs/CONTEXT_ENGINEERING.md` (lines 228-268). |
| Layer 2 context hydration: recent git history | Last 10 commits on main tell the agent what just changed. Without this, follow-up jobs don't know what the previous job actually modified at the git level. The prior job context (tools.js:29-51) gives PR URL and changed files list, but not commit messages or the sequence of changes. | Low | Current shallow clone (`--depth 1` in entrypoint.sh:35) prevents `git log main`. Must either: (a) deepen clone to `--depth 20`, (b) fetch main history separately after initial clone via `git fetch origin main --depth 10`, or (c) fetch via GitHub API before clone. Option (b) is cleanest -- doesn't slow the initial clone, adds ~1s. |
| Named volumes per repo | Eliminates cold-start clone on every job. First run clones into volume; subsequent runs do `git fetch` + `git checkout`. thepopebot uses `volumeName(workspaceId)` pattern generating `code-workspace-{shortId}` names. For ClawForge, convention should be `{instance}-repo-{slug}` (e.g., `noah-repo-clawforge`). | Medium | Depends on Docker API client for volume mounting at container creation via `HostConfig.Binds: ['volumeName:/job']`. docker-compose.yml already defines named volumes for event handler data (`noah-data`, `ses-data`). Job containers currently clone fresh into `/job` -- entrypoint.sh must detect existing repo in volume and switch from `git clone` to `git fetch origin && git checkout`. |
| Container cleanup after job completion | Ephemeral containers must be removed after exit to prevent accumulation on the host. A container per job at scale means hundreds of stopped containers if not cleaned up. | Low | Two options: (a) `HostConfig.AutoRemove: true` at container creation -- Docker removes automatically on exit, or (b) explicit `removeContainer()` call after `waitForContainer()` returns. Option (b) is better because it allows log retrieval before removal. thepopebot uses explicit removal with `force=true`. |
| Network isolation for job containers | Job containers must run on the correct instance network (`noah-net`, `strategyES-net`) so they can't communicate across instances. Without this, a compromised job container could attack containers on other instance networks. | Low | docker-compose.yml already defines per-instance networks. Event handler containers are already on their respective networks. At `createContainer()` time, set `HostConfig.NetworkMode: '{instance}-net'`. thepopebot uses `detectNetwork()` to auto-detect -- ClawForge can use instance config to determine network directly. |

## Differentiators

Features that go beyond basic functionality and provide meaningful improvement. Not strictly required for v1.4 but high value-to-cost ratio.

| Feature | Value Proposition | Complexity | Dependencies on Existing |
|---------|-------------------|------------|--------------------------|
| Dynamic system prompt scoping (AGENT_QUICK.md vs full AGENT.md) | Quick jobs (typo fix, single file change) get a leaner system prompt (~20 lines vs ~90 lines). Saves ~500 tokens of context budget for tasks that don't need planning workflow instructions. Aligns with sniper agent model from `docs/CONTEXT_ENGINEERING.md`. | Low | GSD hint detection already exists (entrypoint.sh:132-139) but runs AFTER system prompt assembly (step 7). Must reorder: detect hint first at step 6.5, then select AGENT variant at step 7. Requires creating `AGENT_QUICK.md` files per instance and in `/defaults/`. |
| Volume-aware `git fetch` instead of full clone | After first clone into named volume, subsequent jobs do `git fetch origin && git checkout $BRANCH` instead of `git clone`. Reduces startup from ~10-15s (full clone) to ~2-3s (fetch delta). This is the "warm start" that Stripe's devboxes provide. | Medium | Depends on named volumes. entrypoint.sh step 5 currently does `git clone --single-branch --branch "$BRANCH" --depth 1`. Must detect: if `/job/.git` exists in volume, skip clone and do fetch. Handle edge cases: stale volume state, force-pushed branches, deleted repos. |
| Container startup time instrumentation | Measure and log wall-clock time from dispatch to Claude Code execution start. Proves the speed improvement (target: <15s warm, <30s cold vs ~60s+ via GH Actions). Data goes into preflight.md for every job. | Low | Add `date +%s%N` timestamps at entrypoint stages: clone/fetch start, clone/fetch end, Claude Code start. Diff against container creation timestamp from env var. Write to preflight.md (already exists and is committed with job output). |
| `inspectContainer()` for stuck job detection | Enables querying container state to detect stuck jobs (running longer than timeout). Currently stuck jobs are only detected when GH Actions times out. Direct Docker API allows proactive monitoring. | Low | Pure Docker API wrapper: `GET /containers/{name}/json`. thepopebot already has this. Can power a future "job health" check in `getJobStatusTool`. |
| Parallel job dispatch | Docker Engine can start multiple containers simultaneously. GH Actions pipeline is effectively serial per workflow trigger (queueing delay). Multiple Docker dispatches return immediately. | Low | No code changes needed beyond having the Docker dispatch path. `createJobTool` already returns immediately; callers can dispatch multiple jobs. Docker Engine handles parallelism natively. |
| Volume pre-warming at instance startup | Pre-clone repos into named volumes when the event handler container starts. First job against any repo starts warm immediately, not just follow-up jobs. | Medium | Depends on named volumes + Docker API. Triggered in event handler startup (instrumentation.js or similar). Reads REPOS.json, creates volumes, clones each repo. Non-blocking -- runs in background. |
| `dockerApiStream()` for real-time log streaming | Stream container logs in real-time back to the operator's channel. thepopebot has `dockerApiStream(method, path)` returning raw http.IncomingMessage. Could pipe to Slack thread updates. | Medium | Depends on Docker API client. Nice for operator visibility but not needed for job correctness. Current batch notification (summarize after completion) is sufficient for 2 instances. |

## Anti-Features

Features to explicitly NOT build in v1.4. These are tempting scope expansions that should be deferred.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Interactive workspace containers (xterm.js, WebSocket proxy, ttyd) | This is v1.5 scope. Building Docker API client is the prerequisite but workspace UI/lifecycle is a separate concern with its own DB table, auth model, and frontend components. Bundling it dilutes focus and doubles the surface area. | Build the Docker API client clean enough that v1.5 can extend it. `createHeadlessCodeContainer()` and `createCodeWorkspaceContainer()` share the same Docker API but have different lifecycles (ephemeral vs persistent). |
| MCP server integration in job containers | v1.6 scope. MCP servers require their own lifecycle management (start before Claude Code, health check, graceful shutdown). Adding this to entrypoint before Docker dispatch is stable introduces a new failure mode category. | Ensure entrypoint.sh remains extensible (clear step numbering, comment blocks marking hook points) so v1.6 can add MCP startup steps between context assembly and Claude Code execution. |
| Bind mounts instead of named volumes | Bind mounts expose host filesystem paths, create portability issues across hosts, and are a security concern. `SECURITY_TODOS.md:69` already flags docker.sock as equivalent to root access -- adding bind mounts widens the attack surface. Named volumes are Docker-managed and isolated. | Use named volumes exclusively. Docker manages the storage location. Volume contents are not directly addressable from the host without explicit Docker commands. |
| Auto-scaling or container orchestration (k8s, Swarm) | Docker Compose on a single VPS is the deliberate architecture choice (VISION.md). k8s adds operational complexity not justified at 2-instance scale with <10 jobs/day. The entire appeal of ClawForge is "Stripe-level agent platform without AWS/k8s." | Keep Docker Compose. If scale demands it later (v1.8 multi-agent clusters, or 10+ instances), evaluate then. |
| Host filesystem mounts for GSD or skills | PROJECT.md constraint: "Changes must work within the existing Docker container model -- no host filesystem mounts for GSD." Skills are baked into Docker image at build time (Dockerfile:38). Mounting from host breaks the deterministic image layer model. | Continue using Docker image layers for skill persistence. Named volumes are for repo state only, not tool state. Tool versions are pinned in Dockerfile. |
| Pre-CI quality gates in entrypoint | v1.7 scope. Adding lint/typecheck steps to entrypoint before Docker dispatch is stable introduces failure modes unrelated to the dispatch change. The entrypoint should stabilize first. | Keep entrypoint focused on: context assembly, Claude Code execution, commit, PR. Quality gates are a separate entrypoint phase for v1.7 with its own config model (`lint_command`, `typecheck_command` per repo). |
| Automatic Layer 1 project state injection into every job description | Layer 1 already has `get_project_state` tool (shipped v1.3). Making it automatic (every job gets state injected by the event handler) risks context bloat for simple "fix this typo" jobs. The agent should decide when project state context is relevant. | Layer 2 hydration (entrypoint reads STATE.md from cloned repo) handles the "always available" case. Layer 1's `get_project_state` remains opt-in for the conversational agent to use when writing better job descriptions. Two complementary mechanisms, not redundant. |
| Volume sharing between instances | Cross-instance volume access breaks the network isolation model. Noah's volumes must not be accessible from StrategyES containers. Shared volumes would mean a compromised StrategyES job could read/modify Noah's repo state. | One volume per repo per instance. Naming convention: `{instance}-repo-{slug}`. Same repo in two instances = two separate volumes with independent state. |
| Container resource limits (CPU, memory) | Useful at scale but not blocking at current volume. Claude Code's 30-min hardcoded timeout (entrypoint.sh behavior) is the primary resource guard. CPU/memory limits add configuration complexity for marginal benefit at 2 instances. | Add `HostConfig.Memory` and `HostConfig.CpuShares` in v1.5 or when empirically needed (e.g., a job consuming all host memory). |
| Dockerode npm package | thepopebot uses raw `http` module for Unix socket calls, not Dockerode. Adding a dependency for what amounts to ~100 lines of HTTP client code adds a transitive dependency tree with no proportional benefit. The raw approach is simpler and matches the upstream pattern. | Use Node.js built-in `http` module with Unix socket path, matching thepopebot's `dockerApi()` pattern. |

---

## Feature Dependencies

```
Layer 2 Context Hydration (Phase 17.2) -- NO dependency on Docker API
  |
  +---> STATE.md + ROADMAP.md injection into FULL_PROMPT
  |       (entrypoint.sh: read from /job/.planning/, cap at char limit, add section)
  |
  +---> Recent git history injection
  |       (entrypoint.sh: git fetch origin main --depth 10, git log)
  |
  +---> Dynamic system prompt scoping (optional, lower priority)
          (reorder GSD hint detection before system prompt assembly,
           create AGENT_QUICK.md variants, select based on hint)

Docker Engine API Client (Phase 18)
  |
  +---> dockerApi(method, path, body) -- Unix socket HTTP
  +---> inspectContainer(name) -- GET /containers/{name}/json
  +---> removeContainer(name) -- DELETE /containers/{name}?force=true
  +---> waitForContainer(name) -- POST /containers/{name}/wait
  +---> detectNetwork() -- inspect event handler container, extract network
  +---> tailContainerLogs(name) -- GET /containers/{name}/logs

Headless Job Containers (Phase 19) -- depends on Phase 18
  |
  +---> createHeadlessCodeContainer(opts) -- create + start container
  |       (Image, Env, HostConfig.Binds, HostConfig.NetworkMode)
  |
  +---> Wire into createJob() as alternative dispatch path
  |       (if dispatch === "docker": Docker API, else: branch push for GH Actions)
  |
  +---> Container wait + notification trigger
  |       (waitForContainer -> summarizeJob -> send notification)
  |
  +---> Container cleanup after exit
          (removeContainer after logs retrieved)

Volume Management (Phase 20) -- depends on Phase 18
  |
  +---> volumeName(instance, repoSlug) -- naming convention
  +---> Volume mount at container creation -- HostConfig.Binds
  +---> entrypoint.sh warm-start detection -- if /job/.git exists, fetch instead of clone
  +---> Volume pre-warming (optional) -- clone at instance startup

Migration & Fallback (Phase 21) -- depends on Phases 19 + 20
  |
  +---> REPOS.json dispatch field -- "docker" | "actions"
  +---> Dual-dispatch routing in createJobTool
  +---> Regression test both paths
  +---> Deprecation path documentation
```

**Key insight:** Layer 2 context hydration (Phase 17.2) has zero dependency on the Docker Engine API work. It is purely an entrypoint.sh enhancement that works with both GH Actions and Docker dispatch. It should be built first.

---

## MVP Recommendation

**Phase 17.2 first, then Phases 18-21 in order.**

### Prioritize

1. **Layer 2 context hydration** (Phase 17.2) -- Immediate value, zero risk to existing pipeline. Agent quality improves for every job regardless of dispatch mechanism. Implementation plan with code already exists in `docs/CONTEXT_ENGINEERING.md` (lines 228-268). Three changes: (a) read STATE.md + ROADMAP.md from cloned repo, (b) fetch recent git history, (c) inject into FULL_PROMPT between Stack and Task sections.

2. **Docker Engine API client** (Phase 18) -- Foundation library. Port `dockerApi()`, `inspectContainer()`, `removeContainer()`, `detectNetwork()`, `waitForContainer()` from thepopebot. Pure library with no behavioral change to the system. Test by inspecting existing event handler containers.

3. **Headless job containers** (Phase 19) -- The actual dispatch replacement. `createHeadlessCodeContainer()` wired into `createJob()` behind feature flag. This is where the speed gain materializes. Must handle env var passing (BRANCH, REPO_URL, SECRETS, LLM_SECRETS, GH_TOKEN), volume mounting, network selection, and notification after exit.

4. **Named volumes** (Phase 20) -- Warm start optimization. `volumeName()` pattern, volume mount at container creation, entrypoint detects existing repo (`/job/.git` exists) and does `git fetch` instead of `git clone`. First job per repo is cold; all subsequent jobs are warm.

5. **Migration & fallback** (Phase 21) -- Dual-dispatch mode stable. `dispatch: "docker" | "actions"` in REPOS.json. Regression verification: same job produces same output via both paths. Documentation for operators on when to use which dispatch mode.

### Defer

- **Dynamic system prompt scoping** -- Can be done in Phase 17.2 but lower priority than STATE.md/ROADMAP.md injection. The ~500 token savings is nice but doesn't change agent behavior meaningfully.
- **Volume pre-warming** -- Optimization. Let operators experience the first-job clone time and add pre-warming if it's a friction point. The second job is already warm.
- **Container resource limits** -- Not a problem at current scale. Add when empirically needed.
- **`execInContainer()`** -- Debugging tool for stuck jobs. Add when stuck jobs become a pattern worth automating diagnostics for.
- **Real-time log streaming to Slack** -- Batch notification after completion is sufficient. Streaming adds WebSocket complexity and Slack rate limit concerns.

---

## Sources

- [Dockerode (npm)](https://www.npmjs.com/package/dockerode) -- Node.js Docker API client reference (not recommended for use -- raw http module preferred to match upstream)
- [Docker Engine SDK docs](https://docs.docker.com/reference/api/engine/sdk/) -- Official Docker Engine API reference
- [Docker Volumes docs](https://docs.docker.com/engine/storage/volumes/) -- Named volume lifecycle, best practices
- [Persisting container data (Docker docs)](https://docs.docker.com/get-started/docker-concepts/running-containers/persisting-container-data/) -- Volume persistence across container runs
- [Docker Engine API examples](https://docs.docker.com/engine/api/sdk/examples/) -- Container create/start/wait lifecycle
- [thepopebot docker.js](https://github.com/stephengpope/thepopebot/blob/main/lib/tools/docker.js) -- Upstream reference implementation: dockerApi(), createHeadlessCodeContainer(), volumeName(), detectNetwork(), waitForContainer(), removeContainer() (HIGH confidence -- production code)
- ClawForge `docs/CONTEXT_ENGINEERING.md` -- Full context hydration analysis with implementation code (HIGH confidence -- internal design doc with line-level code changes)
- ClawForge `.planning/VISION.md` -- Architecture evolution roadmap, thepopebot pull list, decision rationale (HIGH confidence -- internal planning doc)
- ClawForge `.planning/ROADMAP.md` -- Phase structure and dependencies (HIGH confidence -- internal planning doc)

---

*Feature research for: ClawForge v1.4 -- Docker Engine Foundation*
*Researched: 2026-03-06*
