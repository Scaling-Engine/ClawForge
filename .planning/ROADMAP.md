# Roadmap: ClawForge

## Milestones

- v1.0 GSD Verification & Hardening — Phases 1-4 (shipped 2026-02-24)
- v1.1 Agent Intelligence & Pipeline Hardening — Phases 5-8 (shipped 2026-02-25)
- v1.2 Cross-Repo Job Targeting — Phases 9-12 (shipped 2026-02-27)
- v1.3 Instance Generator — Phases 13-17 + 16.1 (in progress)
- v1.4 Docker Engine Foundation — Phases 18-21 (planned)
- v1.5 Persistent Workspaces — Phases 22-25 (planned)
- v1.6 MCP Tool Layer — Phases 26-28 (planned)
- v1.7 Smart Execution — Phases 29-31 (planned)
- v1.8 Multi-Agent Clusters — Phases 32-34 (future)

## Phases

<details>
<summary>v1.0 GSD Verification & Hardening (Phases 1-4) — SHIPPED 2026-02-24</summary>

- [x] Phase 1: Foundation Fix (2/2 plans) — completed 2026-02-24
- [x] Phase 2: Output Observability (2/2 plans) — completed 2026-02-24
- [x] Phase 3: Test Harness (1/1 plan) — completed 2026-02-24
- [x] Phase 4: Instruction Hardening (1/1 plan) — completed 2026-02-24

</details>

<details>
<summary>v1.1 Agent Intelligence & Pipeline Hardening (Phases 5-8) — SHIPPED 2026-02-25</summary>

- [x] Phase 5: Pipeline Hardening (2/2 plans) — completed 2026-02-25
- [x] Phase 6: Smart Job Prompts (1/1 plan) — completed 2026-02-25
- [x] Phase 7: Previous Job Context (2/2 plans) — completed 2026-02-25
- [x] Phase 8: Polish & Test Sync (2/2 plans) — completed 2026-02-25

</details>

<details>
<summary>v1.2 Cross-Repo Job Targeting (Phases 9-12) — SHIPPED 2026-02-27</summary>

- [x] Phase 9: Config + Tool Schema + Entrypoint Foundation (3/3 plans) — completed 2026-02-26
- [x] Phase 10: Actions Workflow + Container Execution + Cross-Repo PR (3/3 plans) — completed 2026-02-27
- [x] Phase 11: Notification Pipeline + DB Schema (3/3 plans) — completed 2026-02-27
- [x] Phase 12: Regression Verification (1/1 plan) — completed 2026-02-27

</details>

### v1.3 Instance Generator (In Progress)

**Goal:** Archie creates fully-configured ClawForge instances through guided conversation, generating all files as a PR with operator setup instructions.

- [x] **Phase 13: Tool Infrastructure** — Register createInstanceJobTool stub with Zod schema (completed 2026-02-27)
- [ ] **Phase 14: Intake Flow** — Multi-turn instance creation intake via EVENT_HANDLER.md
- [ ] **Phase 15: Job Prompt Completeness** — buildInstanceJobDescription() generates all 7 artifacts
  Plans:
  - [ ] 15-01-PLAN.md — Create buildInstanceJobDescription() with tests and wire into tools.js
- [x] **Phase 16: PR Pipeline and Auto-Merge Exclusion** — Merge policy for instance PRs (completed 2026-03-05)
  **Plans:** 1 plan
  Plans:
  - [x] 16-01-PLAN.md — Add blocked-paths exclusion to auto-merge workflow + entrypoint --body-file fix
- [ ] **Phase 16.1: Entrypoint Sync** — Propagate --body-file from templates/entrypoint.sh to docker/job/entrypoint.sh
  **Gap Closure:** Closes integration gap from v1.3 audit (DELIV-01)
  **Plans:** 1 plan
  Plans:
  - [ ] 16.1-01-PLAN.md — Replace --body "$PR_BODY" with --body-file in deployed entrypoint.sh
- [ ] **Phase 17: End-to-End Validation** — Real multi-turn conversation through PR creation

---

### v1.4 Docker Engine Foundation (Planned)

**Goal:** Replace GitHub Actions as the primary job dispatch mechanism with direct Docker Engine API calls. Containers start in seconds instead of minutes. GH Actions retained as fallback for CI-integrated repos.

**Source:** Pull `dockerApi()` pattern from thepopebot `lib/tools/docker.js`. Adapt for ClawForge's multi-instance isolation model.

- [ ] **Phase 18: Docker Engine API Client** — Port dockerApi() Unix socket client, inspectContainer(), removeContainer(), detectNetwork(). Add to lib/tools/docker.js. No behavioral change yet — just the client library.
- [ ] **Phase 19: Headless Job Containers** — createHeadlessCodeContainer() that runs claude -p, commits, creates PR, exits. Wire into createJob() as alternative dispatch path. Feature-flagged per instance via REPOS.json `dispatch: "docker" | "actions"`.
- [ ] **Phase 20: Volume Management** — Named volumes per repo (volumeName pattern). Containers mount volume instead of cloning fresh. First run clones into volume; subsequent runs do git pull. Warm start target: <15s.
- [ ] **Phase 21: Migration & Fallback** — Dual-dispatch mode: Docker Engine for repos that don't need CI, GH Actions for repos that do. Instance-level config. Regression test both paths. Deprecation path for pure-Actions dispatch.

---

### v1.5 Persistent Workspaces (Planned)

**Goal:** Interactive code workspaces where operators can open a browser terminal connected to a persistent Docker container with their repo. Claude Code runs interactively (not just one-shot). The "devbox" experience.

**Source:** Pull `lib/code/` module from thepopebot — actions.js, terminal-view.jsx, ws-proxy.js. Adapt auth for ClawForge's multi-instance model.

- [ ] **Phase 22: Workspace Container Lifecycle** — createCodeWorkspaceContainer() with ttyd, container recovery (inspect/restart/recreate), workspace DB table (id, instance_id, repo, branch, status). Server actions for CRUD.
- [ ] **Phase 23: WebSocket Terminal Proxy** — ws-proxy.js that authenticates WebSocket upgrade requests, proxies to container's ttyd port. xterm.js frontend component. Route: /code/{workspaceId}.
- [ ] **Phase 24: Workspace-Job Integration** — Headless jobs can run against workspace volumes (shared state). Operator starts interactive workspace, dispatches headless tasks that operate on same codebase. Feature branch support per workspace.
- [ ] **Phase 25: Workspace Polish** — Container auto-stop after idle timeout. Workspace list/star/rename UI. Resource limits per container. Cleanup of orphaned volumes.

---

### v1.6 MCP Tool Layer (Planned)

**Goal:** Per-instance MCP server configuration so agents get curated tool access beyond Claude Code built-ins. This is the "Toolshed" equivalent — each instance gets the tools relevant to its purpose.

**Source:** Original design — thepopebot doesn't have this yet. Inspired by Stripe's 400-tool Toolshed via MCP.

- [ ] **Phase 26: MCP Server Config** — Instance-level MCP_SERVERS.json defining which MCP servers to start in job containers. Schema: server name, command, args, env vars. Validated at container creation time.
- [ ] **Phase 27: Container MCP Runtime** — Entrypoint starts configured MCP servers before Claude Code. Claude Code's `--mcp-config` flag points to generated config. Server health check before job starts. Graceful shutdown on job completion.
- [ ] **Phase 28: Context Hydration** — Pre-run MCP tools on "likely-looking links" in job prompts before execution (Stripe pattern). Extract URLs/references from task description, call relevant MCP tools, inject results into prompt context. Configurable per instance.

---

### v1.7 Smart Execution (Planned)

**Goal:** Quality gates before and after agent work. Local heuristic checks (<5s), CI-aware test feedback, and configurable merge policies. Agents produce higher-quality PRs with fewer review cycles.

**Source:** Inspired by Stripe's deterministic interleaving (agent creativity + forced lint/test phases) and "at most 2 CI runs" policy.

- [ ] **Phase 29: Pre-CI Quality Gates** — Entrypoint runs lint + typecheck after Claude Code completes but before committing. Configurable per repo in REPOS.json (lint_command, typecheck_command). Failures fed back to Claude for self-correction (one retry). Target: <5s for heuristic checks.
- [ ] **Phase 30: CI Feedback Loop** — After PR creation, poll CI status. If tests fail, feed failure output back to Claude Code for a fix attempt. At most 2 CI runs (configurable). PR marked as draft until CI passes or retries exhausted.
- [ ] **Phase 31: Merge Policy Engine** — Per-repo merge policies in REPOS.json: auto-merge (current), require-review, require-ci-pass, require-approval. Replaces current path-based auto-merge.yml with policy-driven decisions.

---

### v1.8 Multi-Agent Clusters (Future)

**Goal:** Coordinated groups of agents that can split complex tasks, work in parallel, and merge results. A "team lead" agent decomposes work and distributes to worker agents.

**Source:** Pull cluster DB schema from thepopebot (tables: clusters, cluster_roles, cluster_workers). Build our own runtime — thepopebot's is UI/DB only with no execution layer yet.

- [ ] **Phase 32: Cluster Schema & Management** — DB tables for clusters, roles, workers. Server actions for CRUD. Instance-level cluster ownership. Trigger config model (cron, webhook, manual).
- [ ] **Phase 33: Cluster Runtime** — Lead agent decomposes task into sub-tasks, dispatches to worker containers (via Docker Engine API from v1.4). Workers operate on shared volume or separate branches. Result collection and conflict detection.
- [ ] **Phase 34: Cluster Coordination** — Inter-worker dependency resolution. Sequential vs parallel task dispatch. Merge conflict resolution when multiple workers modify same repo. Aggregated PR with all worker contributions.

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation Fix | v1.0 | 2/2 | Complete | 2026-02-24 |
| 2. Output Observability | v1.0 | 2/2 | Complete | 2026-02-24 |
| 3. Test Harness | v1.0 | 1/1 | Complete | 2026-02-24 |
| 4. Instruction Hardening | v1.0 | 1/1 | Complete | 2026-02-24 |
| 5. Pipeline Hardening | v1.1 | 2/2 | Complete | 2026-02-25 |
| 6. Smart Job Prompts | v1.1 | 1/1 | Complete | 2026-02-25 |
| 7. Previous Job Context | v1.1 | 2/2 | Complete | 2026-02-25 |
| 8. Polish & Test Sync | v1.1 | 2/2 | Complete | 2026-02-25 |
| 9. Config + Tool Schema + Entrypoint Foundation | v1.2 | 3/3 | Complete | 2026-02-26 |
| 10. Actions Workflow + Container Execution + Cross-Repo PR | v1.2 | 3/3 | Complete | 2026-02-27 |
| 11. Notification Pipeline + DB Schema | v1.2 | 3/3 | Complete | 2026-02-27 |
| 12. Regression Verification | v1.2 | 1/1 | Complete | 2026-02-27 |
| 13. Tool Infrastructure | v1.3 | 1/1 | Complete | 2026-02-27 |
| 14. Intake Flow | v1.3 | 2/2 | Complete | 2026-03-04 |
| 15. Job Prompt Completeness | v1.3 | 1/1 | Complete | 2026-03-04 |
| 16. PR Pipeline and Auto-Merge Exclusion | v1.3 | 1/1 | Complete | 2026-03-05 |
| 16.1. Entrypoint Sync | v1.3 | 0/1 | Not started | - |
| 17. End-to-End Validation | v1.3 | 0/TBD | Not started | - |
| 18. Docker Engine API Client | v1.4 | 0/TBD | Not started | - |
| 19. Headless Job Containers | v1.4 | 0/TBD | Not started | - |
| 20. Volume Management | v1.4 | 0/TBD | Not started | - |
| 21. Migration & Fallback | v1.4 | 0/TBD | Not started | - |
| 22. Workspace Container Lifecycle | v1.5 | 0/TBD | Not started | - |
| 23. WebSocket Terminal Proxy | v1.5 | 0/TBD | Not started | - |
| 24. Workspace-Job Integration | v1.5 | 0/TBD | Not started | - |
| 25. Workspace Polish | v1.5 | 0/TBD | Not started | - |
| 26. MCP Server Config | v1.6 | 0/TBD | Not started | - |
| 27. Container MCP Runtime | v1.6 | 0/TBD | Not started | - |
| 28. Context Hydration | v1.6 | 0/TBD | Not started | - |
| 29. Pre-CI Quality Gates | v1.7 | 0/TBD | Not started | - |
| 30. CI Feedback Loop | v1.7 | 0/TBD | Not started | - |
| 31. Merge Policy Engine | v1.7 | 0/TBD | Not started | - |
| 32. Cluster Schema & Management | v1.8 | 0/TBD | Not started | - |
| 33. Cluster Runtime | v1.8 | 0/TBD | Not started | - |
| 34. Cluster Coordination | v1.8 | 0/TBD | Not started | - |

---
*Last updated: 2026-03-05 — Gap closure Phase 16.1 added from v1.3 audit*
