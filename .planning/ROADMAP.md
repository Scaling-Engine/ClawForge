# Roadmap: ClawForge

## Milestones

- ✅ v1.0 GSD Verification & Hardening -- Phases 1-4 (shipped 2026-02-24)
- ✅ v1.1 Agent Intelligence & Pipeline Hardening -- Phases 5-8 (shipped 2026-02-25)
- ✅ v1.2 Cross-Repo Job Targeting -- Phases 9-12 (shipped 2026-02-27)
- ✅ v1.3 Instance Generator -- Phases 13-17 + 16.1, 17.1 (shipped 2026-03-06)
- ✅ v1.4 Docker Engine Foundation -- Phases 18-21 (shipped 2026-03-08)
- ✅ v1.5 Persistent Workspaces -- Phases 22-24 (shipped 2026-03-11)
- 🚧 v2.0 Full Platform -- Phases 25-28 (in progress)

## Phases

<details>
<summary>✅ v1.0 GSD Verification & Hardening (Phases 1-4) -- SHIPPED 2026-02-24</summary>

- [x] Phase 1: Foundation Fix (2/2 plans) -- completed 2026-02-24
- [x] Phase 2: Output Observability (2/2 plans) -- completed 2026-02-24
- [x] Phase 3: Test Harness (1/1 plan) -- completed 2026-02-24
- [x] Phase 4: Instruction Hardening (1/1 plan) -- completed 2026-02-24

</details>

<details>
<summary>✅ v1.1 Agent Intelligence & Pipeline Hardening (Phases 5-8) -- SHIPPED 2026-02-25</summary>

- [x] Phase 5: Pipeline Hardening (2/2 plans) -- completed 2026-02-25
- [x] Phase 6: Smart Job Prompts (1/1 plan) -- completed 2026-02-25
- [x] Phase 7: Previous Job Context (2/2 plans) -- completed 2026-02-25
- [x] Phase 8: Polish & Test Sync (2/2 plans) -- completed 2026-02-25

</details>

<details>
<summary>✅ v1.2 Cross-Repo Job Targeting (Phases 9-12) -- SHIPPED 2026-02-27</summary>

- [x] Phase 9: Config + Tool Schema + Entrypoint Foundation (3/3 plans) -- completed 2026-02-26
- [x] Phase 10: Actions Workflow + Container Execution + Cross-Repo PR (3/3 plans) -- completed 2026-02-27
- [x] Phase 11: Notification Pipeline + DB Schema (3/3 plans) -- completed 2026-02-27
- [x] Phase 12: Regression Verification (1/1 plan) -- completed 2026-02-27

</details>

<details>
<summary>✅ v1.3 Instance Generator (Phases 13-17 + 16.1, 17.1) -- SHIPPED 2026-03-06</summary>

- [x] Phase 13: Tool Infrastructure (1/1 plan) -- completed 2026-02-27
- [x] Phase 14: Intake Flow (2/2 plans) -- completed 2026-03-04
- [x] Phase 15: Job Prompt Completeness (1/1 plan) -- completed 2026-03-04
- [x] Phase 16: PR Pipeline and Auto-Merge Exclusion (1/1 plan) -- completed 2026-03-05
- [x] Phase 16.1: Entrypoint Sync (1/1 plan) -- completed 2026-03-05
- [x] Phase 17: End-to-End Validation (1/1 plan) -- completed 2026-03-06
- [x] Phase 17.1: Context Hydration for Layer 1 (1/1 plan) -- completed 2026-03-06

</details>

<details>
<summary>✅ v1.4 Docker Engine Foundation (Phases 18-21) -- SHIPPED 2026-03-08</summary>

- [x] Phase 18: Layer 2 Context Hydration (2/2 plans) -- completed 2026-03-06
- [x] Phase 19: Docker Engine Dispatch (3/3 plans) -- completed 2026-03-07
- [x] Phase 20: Named Volumes (2/2 plans) -- completed 2026-03-08
- [x] Phase 21: Integration Wiring (1/1 plan) -- completed 2026-03-08

</details>

<details>
<summary>✅ v1.5 Persistent Workspaces (Phases 22-24) -- SHIPPED 2026-03-11</summary>

- [x] Phase 22: Workspace Infrastructure (3/3 plans) -- completed 2026-03-09
- [x] Phase 23: WebSocket & Browser Terminal (2/2 plans) -- completed 2026-03-09
- [x] Phase 24: Conversational Integration (2/2 plans) -- completed 2026-03-11

</details>

---

### 🚧 v2.0 Full Platform (In Progress)

**Milestone Goal:** Transform ClawForge from a CLI-driven agent gateway into a full-featured agent platform with web UI enhancements, multi-agent clusters, headless job streaming, and per-instance MCP tool configs.

- [x] **Phase 25: Headless Log Streaming** - Live job log output piped to chat UI with filtering, job cancel, and memory-safe consumer lifecycle (completed 2026-03-12)
- [x] **Phase 26: Web UI Auth + Repo Selector** - Server-side auth boundary on all Server Actions, repo/branch selector in chat header, code mode toggle (completed 2026-03-12)
- [ ] **Phase 27: MCP Tool Layer** - Per-instance MCP server configs with template resolution, container injection, and encrypted credential storage
- [ ] **Phase 28: Multi-Agent Clusters** - Role-based cluster runtime with coordinator dispatch, label routing, volume isolation, and safety limits

## Phase Details

### Phase 25: Headless Log Streaming
**Goal**: Operators can watch live job progress in chat instead of waiting for a completion notification
**Depends on**: Phase 24 (v1.5 workspaces complete; Docker Engine API and `waitAndNotify()` in place)
**Requirements**: STRM-01, STRM-02, STRM-03, STRM-04, STRM-05, STRM-06, STRM-07, STRM-08
**Success Criteria** (what must be TRUE):
  1. Operator sees log lines appearing in the chat thread in real time as a job container executes — no reload required
  2. Log output shows only semantic events (file saves, bash outputs, key decisions); raw JSONL lines are never surfaced to chat
  3. A progress indicator with elapsed time is visible in chat for the duration of a running job
  4. Operator can say "cancel the job" and the running container stops cleanly; the branch is preserved for inspection
  5. Closing the browser tab during a job releases the Docker log stream with no orphaned listener; no memory leak observed after multiple job runs
**Plans**: 3 plans

Plans:
- [ ] 25-01-PLAN.md — Stream manager singleton + log parser with secret scrubbing
- [ ] 25-02-PLAN.md — Docker log wiring + SSE endpoint + cancel_job tool
- [ ] 25-03-PLAN.md — Chat UI stream viewer + Slack edit-in-place updates

### Phase 26: Web UI Auth + Repo Selector
**Goal**: All browser-facing Server Actions enforce server-side auth, and operators can anchor a chat session to a specific repo and branch without typing it in every message
**Depends on**: Phase 25
**Requirements**: WEBUI-01, WEBUI-02, WEBUI-03, WEBUI-04, WEBUI-05, WEBUI-06
**Success Criteria** (what must be TRUE):
  1. Operator selects a repo and branch from a dropdown in the chat header; subsequent job dispatches in that session target that repo without the operator specifying it in each message
  2. Operator can toggle code mode in the chat input to get syntax-highlighted monospace rendering for code-heavy responses
  3. Live job streaming output from Phase 25 renders inline in chat messages via the stream-viewer component
  4. Every Server Action returns a 401 if called without a valid NextAuth session — no client-only session checks remain
  5. Existing API-key-protected routes (`/api/slack/events`, `/api/telegram/webhook`, etc.) continue to respond correctly after the auth boundary change
**Plans**: 3 plans

Plans:
- [ ] 26-01-PLAN.md — Server Action auth hardening (requireAuth() -> unauthorized(), unauthorized.js boundary)
- [ ] 26-02-PLAN.md — Context foundation (FeaturesContext, RepoChatContext, getFeatureFlags/getRepos/getBranches actions)
- [ ] 26-03-PLAN.md — Chat UI enhancements (repo/branch dropdowns, code mode toggle, transport wiring, human verify)

### Phase 27: MCP Tool Layer
**Goal**: Each instance has curated MCP server configs that get injected into job and workspace containers at runtime, with credentials never stored in git
**Depends on**: Phase 26
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, MCP-07, MCP-08, MCP-09
**Success Criteria** (what must be TRUE):
  1. An operator adds a new MCP server to `instances/{name}/config/MCP_SERVERS.json` and the next job container run has that server available to Claude Code via `--mcp-config`
  2. MCP credentials specified as `{{AGENT_LLM_*}}` template variables in the config are resolved from environment at container start and never appear in git history
  3. A workspace container started via `start_coding` has access to the same MCP servers as job containers for the same instance
  4. If an MCP server fails to connect at container start, the failure is logged with stage `mcp_startup` and the job continues with the remaining healthy servers
  5. Operator can view configured MCP servers and their allowed tool subsets from a read-only section in the settings page
**Plans**: TBD

Plans:
- [ ] 27-01: TBD

### Phase 28: Multi-Agent Clusters
**Goal**: Operators can define and launch multi-agent pipelines where sequential agents with distinct roles collaborate via shared volume inbox/outbox, with hard safety limits preventing runaway cost
**Depends on**: Phase 27 (MCP must be in place — cluster role definitions reference mcpServers)
**Requirements**: CLST-01, CLST-02, CLST-03, CLST-04, CLST-05, CLST-06, CLST-07, CLST-08, CLST-09, CLST-10, CLST-11, CLST-12
**Success Criteria** (what must be TRUE):
  1. Operator defines a cluster in `CLUSTER.json` with named roles, role-specific system prompts, allowed tools, and MCP server assignments; the cluster runs end-to-end without additional config
  2. Operator launches a cluster run by saying "run the review cluster on repo X" and receives a single Slack thread with per-agent status updates as replies — not a flood of separate messages
  3. Each agent in a cluster run operates in its own Docker container with its own isolated volume; no two concurrent agents share a named volume
  4. A cluster that would loop infinitely (agents cycling between each other) terminates automatically after hitting the hard cap (5 iterations per agent, 15 per run) with a notification identifying the cycle
  5. Cluster run history, per-agent status, labels emitted, and PR URLs are visible on the `/clusters` management page
**Plans**: TBD

Plans:
- [ ] 28-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 25 → 26 → 27 → 28

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
| 9. Config + Tool Schema | v1.2 | 3/3 | Complete | 2026-02-26 |
| 10. Actions + Execution + PR | v1.2 | 3/3 | Complete | 2026-02-27 |
| 11. Notification Pipeline | v1.2 | 3/3 | Complete | 2026-02-27 |
| 12. Regression Verification | v1.2 | 1/1 | Complete | 2026-02-27 |
| 13. Tool Infrastructure | v1.3 | 1/1 | Complete | 2026-02-27 |
| 14. Intake Flow | v1.3 | 2/2 | Complete | 2026-03-04 |
| 15. Job Prompt Completeness | v1.3 | 1/1 | Complete | 2026-03-04 |
| 16. PR Pipeline | v1.3 | 1/1 | Complete | 2026-03-05 |
| 16.1. Entrypoint Sync | v1.3 | 1/1 | Complete | 2026-03-05 |
| 17. End-to-End Validation | v1.3 | 1/1 | Complete | 2026-03-06 |
| 17.1. Layer 1 Context Hydration | v1.3 | 1/1 | Complete | 2026-03-06 |
| 18. Layer 2 Context Hydration | v1.4 | 2/2 | Complete | 2026-03-06 |
| 19. Docker Engine Dispatch | v1.4 | 3/3 | Complete | 2026-03-07 |
| 20. Named Volumes | v1.4 | 2/2 | Complete | 2026-03-08 |
| 21. Integration Wiring | v1.4 | 1/1 | Complete | 2026-03-08 |
| 22. Workspace Infrastructure | v1.5 | 3/3 | Complete | 2026-03-09 |
| 23. WebSocket & Browser Terminal | v1.5 | 2/2 | Complete | 2026-03-09 |
| 24. Conversational Integration | v1.5 | 2/2 | Complete | 2026-03-11 |
| 25. Headless Log Streaming | 3/3 | Complete    | 2026-03-12 | - |
| 26. Web UI Auth + Repo Selector | 3/3 | Complete   | 2026-03-12 | - |
| 27. MCP Tool Layer | v2.0 | 0/? | Not started | - |
| 28. Multi-Agent Clusters | v2.0 | 0/? | Not started | - |

---

*Last updated: 2026-03-12 -- Phase 26 planned (3 plans, 2 waves)*
