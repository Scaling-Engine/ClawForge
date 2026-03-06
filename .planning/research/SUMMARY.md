# Project Research Summary

**Project:** ClawForge v1.4 -- Docker Engine Foundation
**Domain:** Docker Engine API dispatch, Layer 2 context hydration, named volumes
**Researched:** 2026-03-06
**Confidence:** HIGH

## Executive Summary

ClawForge v1.4 replaces GitHub Actions as the primary job dispatch mechanism with direct Docker Engine API calls via the Unix socket. This is a well-understood pattern -- the upstream thepopebot already runs this in production with `dockerApi()`, `createHeadlessCodeContainer()`, named volumes, and container lifecycle management. The v1.4 milestone adds three capabilities: Docker Engine API dispatch (cold start drops from ~60s to ~10-15s), Layer 2 context hydration (STATE.md + ROADMAP.md + git history injected into job prompts), and named volumes for warm-start containers (subsequent jobs fetch in ~2-3s instead of cloning in ~10-15s). Only one new npm dependency is needed: `dockerode@^4.0.9`.

The recommended approach is to build context hydration first (zero dependency on Docker API, immediate value for all jobs via both dispatch paths), then the Docker API client, then headless container dispatch, then named volumes, then migration/fallback integration. This ordering respects dependency chains and delivers incremental value at each step. Context hydration is a pure entrypoint.sh change that works with both GitHub Actions and Docker dispatch, making it risk-free to ship first.

The primary risks are Docker socket security (socket access grants root-equivalent control over the host), stale volume state causing silent job failures, and zombie container accumulation if the Event Handler crashes between container creation and cleanup. All three have concrete mitigations: a Docker socket proxy for security, a volume hygiene step in the entrypoint for stale state, and DB-tracked container IDs with startup reconciliation for zombies. A notable research tension exists around the Docker API client approach -- STACK.md recommends dockerode while FEATURES.md recommends raw `http` module matching thepopebot's pattern. This must be resolved before Phase 2 begins.

## Key Findings

### Recommended Stack

One new runtime dependency: `dockerode@^4.0.9` (2.7M weekly downloads, Promise-based API, covers container lifecycle + volume management + log streaming). All other v1.4 capabilities use existing tools -- context hydration is pure bash in entrypoint.sh using `gh api` (already installed/authenticated in the job container), and named volumes are Docker Compose + dockerode config.

**Core additions:**
- `dockerode@^4.0.9`: Docker Engine API client -- de facto standard for Node.js, handles stream demuxing, volume management, container wait
- `entrypoint.sh` modifications: Context hydration (STATE.md, ROADMAP.md, git history) -- no new libraries, bash-only changes
- `docker-compose.yml` modifications: Socket mount for event handler, dynamic named volume creation

**Research conflict:** FEATURES.md anti-features section recommends raw `http` module over dockerode, arguing thepopebot uses raw HTTP and that dockerode adds transitive dependencies for ~100 lines of HTTP client code. STACK.md makes the opposite case, arguing dockerode handles stream demuxing, auth, and API versioning that raw HTTP requires manually. Resolution recommendation: use dockerode -- the stream demuxing and `container.wait()` promise alone justify the dependency, and 2.7M weekly downloads means battle-tested edge case handling.

### Expected Features

**Must have (table stakes):**
- Docker Engine API client with Unix socket connection
- `createHeadlessCodeContainer()` -- direct replacement for GH Actions dispatch
- Container wait + exit code capture for notification triggering
- Feature-flagged dispatch per repo via REPOS.json `dispatch` field
- GH Actions fallback preserved (zero changes to existing workflows)
- Layer 2 context hydration: STATE.md + ROADMAP.md + recent git history in FULL_PROMPT
- Named volumes per repo for warm-start containers
- Container cleanup after job completion
- Network isolation for job containers (per-instance networks)

**Should have (differentiators):**
- Dynamic system prompt scoping (AGENT_QUICK.md vs full AGENT.md based on GSD hint)
- Container startup time instrumentation (prove speed improvement)
- Volume pre-warming at instance startup
- `inspectContainer()` for stuck job detection
- Parallel job dispatch (Docker Engine handles natively)

**Defer:**
- Interactive workspace containers (v1.5 scope)
- MCP server integration in job containers (v1.6 scope)
- Container resource limits CPU/memory (not blocking at 2-instance scale)
- Real-time log streaming to Slack (batch notification sufficient)
- Auto-scaling / k8s (deliberate single-VPS architecture)

### Architecture Approach

Two-layer architecture remains unchanged. The Event Handler gains a new `lib/tools/docker.js` module that communicates with the Docker daemon via Unix socket. Job containers are created programmatically instead of via GitHub Actions workflow triggers, but the job branch (`job/{UUID}`) is still created for audit trail, PR flow, and notification pipeline. The entrypoint.sh expands from a 5-section to 7-section prompt structure (adding Project State and Roadmap Context). Named volumes mount at `/repo-cache` for persistent repo clones, with the entrypoint detecting warm vs cold start.

**Major components:**
1. `lib/tools/docker.js` (NEW) -- Docker Engine API wrapper: create, start, wait, logs, cleanup
2. `templates/docker/job/entrypoint.sh` (MODIFIED) -- Volume-aware clone, 7-section context-hydrated prompt
3. `lib/ai/tools.js` (MODIFIED) -- Dispatch routing: Docker API vs GitHub Actions based on REPOS.json config
4. `docker-compose.yml` (MODIFIED) -- Socket mount for event handlers, dynamic named volumes

### Critical Pitfalls

1. **Docker socket grants root-equivalent access** -- Use a Docker socket proxy (Tecnativa/docker-socket-proxy) between Event Handler and daemon. Each instance gets its own proxy with endpoint allowlisting. Must be first thing added to docker-compose.yml.
2. **Stale volume state causes silent job failures** -- Implement volume hygiene step: remove `.git/index.lock`, `git reset --hard origin/main`, `git clean -fdx` before any git operation. Per-repo volumes with `clawforge-repo-{owner}-{slug}` naming.
3. **Zombie containers accumulate on Event Handler crash** -- Track container IDs in SQLite immediately after `createContainer()`. On startup, reconcile running containers with DB. Periodic cleanup sweep every 5 minutes. Label containers with `com.clawforge.job-id`.
4. **Context hydration bloats simple job prompts** -- Gate hydration on GSD hint: `quick` jobs get CLAUDE.md + task only; `plan-phase` jobs get full hydration. Cap STATE.md at 4K chars, ROADMAP.md at 6K chars.
5. **Concurrent jobs corrupt shared named volume** -- Use volume as read-only cache, clone locally into per-container working directory. Or serialize jobs per repo with an in-memory lock.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Layer 2 Context Hydration
**Rationale:** Zero dependency on Docker API. Works with both dispatch paths. Immediate agent quality improvement for every job. Implementation plan with code already exists in `docs/CONTEXT_ENGINEERING.md`.
**Delivers:** 7-section FULL_PROMPT with STATE.md, ROADMAP.md, and recent git history. Conditional hydration gated on GSD hint.
**Addresses:** STATE.md + ROADMAP.md injection, recent git history, dynamic prompt scoping
**Avoids:** Prompt bloat (Pitfall 4) by gating on GSD hint; wrong repo context (Pitfall 13) by reading from WORK_DIR only
**Changes:** `templates/docker/job/entrypoint.sh` only. Clone depth from 1 to 20.

### Phase 2: Docker Engine API Client
**Rationale:** Foundation library that all subsequent phases depend on. Pure library with no behavioral change to the system. Testable by inspecting existing containers.
**Delivers:** `lib/tools/docker.js` with dockerode wrapper: create, start, wait, logs, cleanup, ping, version check. Socket availability check at startup. Container labels for tracking.
**Uses:** `dockerode@^4.0.9`, Docker socket mount in docker-compose.yml
**Avoids:** Socket security (Pitfall 1) by adding socket proxy first; API version mismatch (Pitfall 5) by version check at startup; zombie containers (Pitfall 3) by DB-tracked container IDs from day 1
**Changes:** New `lib/tools/docker.js`, modified `docker-compose.yml` (socket mount + socket proxy container)

### Phase 3: Headless Job Container Dispatch
**Rationale:** The actual speed improvement. Depends on Phase 2 Docker API client. Must handle env var passing, network selection, and notification after exit.
**Delivers:** `createHeadlessCodeContainer()` wired into `createJob()` behind feature flag. Docker-dispatched jobs produce identical outputs (commits, PR, notifications) to Actions-dispatched jobs.
**Implements:** Dispatch routing in `lib/ai/tools.js`, direct notification flow (no webhook needed), merged job status from Docker + Actions sources
**Avoids:** Network isolation bypass (Pitfall 6) by explicit NetworkMode; dual notification (Architecture anti-pattern 5) by detecting dispatch mode; log collection race (Pitfall 11) by sequential cleanup

### Phase 4: Named Volumes for Warm Start
**Rationale:** Depends on Phase 2 for volume management API. Depends on Phase 3 for container creation with volume mounts. The warm-start optimization that makes repeat jobs fast.
**Delivers:** Named volumes per repo per instance. Entrypoint detects warm vs cold start. `git fetch` (2-3s) replaces `git clone` (10-15s) on subsequent jobs.
**Avoids:** Stale volume state (Pitfall 2) by volume hygiene step; concurrent corruption (Pitfall 10) by using volume as cache with per-container working directory; permission mismatch (Pitfall 7) by documenting root-user decision
**Changes:** Modified entrypoint.sh (warm-start detection), modified `lib/tools/docker.js` (volume creation/naming)

### Phase 5: Migration, Fallback, and Hardening
**Rationale:** Depends on Phases 3 + 4 being stable. Dual-dispatch mode with per-repo config. Regression verification across both paths.
**Delivers:** `dispatch` field in REPOS.json. Both dispatch paths verified identical. Startup reconciliation for orphaned containers. Volume pruning. Operator documentation.
**Avoids:** Divergent behavior (Pitfall 9) by path-agnostic entrypoint; cross-repo regression (Pitfall 8) by running VERIFICATION-RUNBOOK across all 4 combinations (same-repo cold/warm, cross-repo cold/warm)

### Phase Ordering Rationale

- **Context hydration first** because it has zero dependencies on Docker API, is purely additive to entrypoint.sh, and delivers immediate value to all jobs via both dispatch paths. It also validates entrypoint modification patterns before the more complex volume-aware changes.
- **Docker API client before dispatch** because the client is a pure library with no behavioral change. It can be tested by inspecting existing containers without dispatching any jobs.
- **Dispatch before volumes** because dispatch can work without volumes (cold clone into /repo-cache). Volumes are an optimization on top of working dispatch.
- **Migration last** because it requires both dispatch paths to be stable before verifying they produce identical outputs.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Docker API Client):** Socket proxy configuration needs research -- which endpoints to allow, how to configure per-instance policies, error semantics when proxy blocks a call
- **Phase 3 (Headless Dispatch):** Notification flow change needs careful design -- direct notification vs webhook deduplication, payload shape consistency
- **Phase 4 (Named Volumes):** Concurrency model (volume as cache vs working directory) needs design spike -- the choice affects entrypoint architecture

Phases with standard patterns (skip research-phase):
- **Phase 1 (Context Hydration):** Well-documented, implementation code already exists in `docs/CONTEXT_ENGINEERING.md`. Pure bash changes to entrypoint.sh.
- **Phase 5 (Migration):** Standard feature-flag rollout pattern. REPOS.json config + verification runbook.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Single new dependency (dockerode). All sources verified via npm registry + codebase inspection. Minor conflict with FEATURES.md on raw HTTP vs dockerode -- resolvable. |
| Features | HIGH | Feature set derived from upstream thepopebot production code + codebase gap analysis. Clear table stakes vs differentiators vs anti-features. |
| Architecture | HIGH | Pattern validated by thepopebot in production. Sibling container pattern established by Traefik in existing docker-compose.yml. Component boundaries well-defined. |
| Pitfalls | HIGH | 13 pitfalls identified from codebase inspection + Docker official docs + community patterns. Critical pitfalls have concrete prevention strategies. Recovery costs assessed. |

**Overall confidence:** HIGH

### Gaps to Address

- **Dockerode vs raw HTTP:** STACK.md and FEATURES.md disagree. Decide before Phase 2. Recommendation: dockerode (stream demuxing + container.wait() justify the dependency).
- **Socket proxy selection:** Tecnativa vs wollomatic. Neither was tested against ClawForge's specific endpoint needs. Needs evaluation during Phase 2 planning.
- **Cross-repo volume mounting:** The Event Handler must determine the correct volume at dispatch time (before container creation). The target.json sidecar flow may need rethinking for Docker dispatch -- pass target repo as env var instead.
- **Concurrent volume access model:** "Volume as cache with local clone" vs "volume as working directory with locking" -- needs a design spike before Phase 4 implementation.

## Sources

### Primary (HIGH confidence)
- ClawForge codebase: `templates/docker/job/entrypoint.sh`, `templates/docker/job/Dockerfile`, `docker-compose.yml`, `lib/tools/create-job.js`, `lib/ai/tools.js`, `lib/tools/github.js`
- ClawForge planning: `.planning/VISION.md`, `.planning/PROJECT.md`, `docs/CONTEXT_ENGINEERING.md`
- [dockerode GitHub](https://github.com/apocas/dockerode) -- v4.0.9, 4.8K stars, 2.7M weekly downloads
- [Docker Engine API docs](https://docs.docker.com/reference/api/engine/sdk/) -- Container lifecycle, volume management
- [Docker Volumes documentation](https://docs.docker.com/engine/storage/volumes/) -- Named volume lifecycle

### Secondary (MEDIUM confidence)
- [Tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) -- Socket proxy for endpoint allowlisting
- [Docker v29 API version breaking change](https://www.portainer.io/blog/docker-v29-and-the-fall-out) -- Minimum API version raised to 1.44
- [Docker Socket Security (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html) -- Socket exposure risks
- [Docker sibling container pattern](https://medium.com/@andreacolangelo/sibling-docker-container-2e664858f87a) -- Validated by Traefik in codebase

---
*Research completed: 2026-03-06*
*Ready for roadmap: yes*
