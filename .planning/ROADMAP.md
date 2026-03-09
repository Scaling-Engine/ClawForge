# Roadmap: ClawForge

## Milestones

- v1.0 GSD Verification & Hardening -- Phases 1-4 (shipped 2026-02-24)
- v1.1 Agent Intelligence & Pipeline Hardening -- Phases 5-8 (shipped 2026-02-25)
- v1.2 Cross-Repo Job Targeting -- Phases 9-12 (shipped 2026-02-27)
- v1.3 Instance Generator -- Phases 13-17 + 16.1, 17.1 (shipped 2026-03-06)
- v1.4 Docker Engine Foundation -- Phases 18-21 (shipped 2026-03-08)
- **v1.5 Persistent Workspaces** -- Phases 22-24 (in progress)
- v1.6 MCP Tool Layer -- planned
- v1.7 Smart Execution -- planned
- v1.8 Multi-Agent Clusters -- future

## Phases

<details>
<summary>v1.0 GSD Verification & Hardening (Phases 1-4) -- SHIPPED 2026-02-24</summary>

- [x] Phase 1: Foundation Fix (2/2 plans) -- completed 2026-02-24
- [x] Phase 2: Output Observability (2/2 plans) -- completed 2026-02-24
- [x] Phase 3: Test Harness (1/1 plan) -- completed 2026-02-24
- [x] Phase 4: Instruction Hardening (1/1 plan) -- completed 2026-02-24

</details>

<details>
<summary>v1.1 Agent Intelligence & Pipeline Hardening (Phases 5-8) -- SHIPPED 2026-02-25</summary>

- [x] Phase 5: Pipeline Hardening (2/2 plans) -- completed 2026-02-25
- [x] Phase 6: Smart Job Prompts (1/1 plan) -- completed 2026-02-25
- [x] Phase 7: Previous Job Context (2/2 plans) -- completed 2026-02-25
- [x] Phase 8: Polish & Test Sync (2/2 plans) -- completed 2026-02-25

</details>

<details>
<summary>v1.2 Cross-Repo Job Targeting (Phases 9-12) -- SHIPPED 2026-02-27</summary>

- [x] Phase 9: Config + Tool Schema + Entrypoint Foundation (3/3 plans) -- completed 2026-02-26
- [x] Phase 10: Actions Workflow + Container Execution + Cross-Repo PR (3/3 plans) -- completed 2026-02-27
- [x] Phase 11: Notification Pipeline + DB Schema (3/3 plans) -- completed 2026-02-27
- [x] Phase 12: Regression Verification (1/1 plan) -- completed 2026-02-27

</details>

<details>
<summary>v1.3 Instance Generator (Phases 13-17 + 16.1, 17.1) -- SHIPPED 2026-03-06</summary>

- [x] Phase 13: Tool Infrastructure (1/1 plan) -- completed 2026-02-27
- [x] Phase 14: Intake Flow (2/2 plans) -- completed 2026-03-04
- [x] Phase 15: Job Prompt Completeness (1/1 plan) -- completed 2026-03-04
- [x] Phase 16: PR Pipeline and Auto-Merge Exclusion (1/1 plan) -- completed 2026-03-05
- [x] Phase 16.1: Entrypoint Sync (1/1 plan) -- completed 2026-03-05
- [x] Phase 17: End-to-End Validation (1/1 plan) -- completed 2026-03-06
- [x] Phase 17.1: Context Hydration for Layer 1 (1/1 plan) -- completed 2026-03-06

</details>

<details>
<summary>v1.4 Docker Engine Foundation (Phases 18-21) -- SHIPPED 2026-03-08</summary>

- [x] Phase 18: Layer 2 Context Hydration (2/2 plans) -- completed 2026-03-06
- [x] Phase 19: Docker Engine Dispatch (3/3 plans) -- completed 2026-03-07
- [x] Phase 20: Named Volumes (2/2 plans) -- completed 2026-03-08
- [x] Phase 21: Integration Wiring (1/1 plan) -- completed 2026-03-08

</details>

---

### v1.5 Persistent Workspaces (In Progress)

**Milestone Goal:** Interactive code workspaces where operators open a browser terminal connected to a persistent Docker container with their repo, with bidirectional chat-workspace context bridging.

- [x] **Phase 22: Workspace Infrastructure** - Docker image, container lifecycle, database persistence, and resource controls (completed 2026-03-09)
- [x] **Phase 23: WebSocket & Browser Terminal** - WebSocket proxy, ticket-based auth, xterm.js terminal UI, shell tabs, and git safety (completed 2026-03-09)
- [ ] **Phase 24: Conversational Integration** - start_coding tool, bidirectional context bridges, workspace list API, and event notifications

## Phase Details

### Phase 22: Workspace Infrastructure
**Goal**: Operators can create, manage, and destroy persistent workspace containers with automatic lifecycle controls and database-backed state
**Depends on**: Phase 21 (v1.4 Docker Engine Foundation -- dockerode, named volumes, instance networking)
**Requirements**: CNTR-01, CNTR-02, CNTR-03, CNTR-04, CNTR-05, CNTR-06, DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. Workspace Docker image builds successfully with ttyd + tmux + Claude Code CLI, distinct from the job container image
  2. Operator can create a workspace for a repo, stop it, restart it, and destroy it -- and the workspace auto-recovers from crash/exit
  3. Workspace containers auto-stop after 30 minutes idle and max concurrent limit is enforced per instance
  4. Workspace state persists in SQLite across event handler restarts, volumes use `clawforge-ws-{instance}-{id}` naming separate from job volumes, and feature branch is auto-created on workspace start
  5. Workspace containers join their instance's Docker network (noah-net, strategyES-net) for isolation
**Plans**: 3 plans

Plans:
- [ ] 22-01-PLAN.md -- Workspace Docker image, Drizzle schema, and CRUD data layer
- [ ] 22-02-PLAN.md -- Container lifecycle functions (create, stop, destroy, reconcile, idle timeout)
- [ ] 22-03-PLAN.md -- API routes and startup wiring (reconciliation + idle interval)

### Phase 23: WebSocket & Browser Terminal
**Goal**: Operators can open a secure browser terminal connected to their workspace container with full terminal capabilities
**Depends on**: Phase 22
**Requirements**: TERM-01, TERM-02, TERM-03, TERM-04, TERM-05
**Success Criteria** (what must be TRUE):
  1. WebSocket connections proxy through the event handler's custom server wrapper to ttyd inside the workspace container, surviving Traefik routing
  2. WebSocket auth uses short-lived, single-use tickets -- unauthenticated or replayed tickets are rejected
  3. Browser terminal renders with xterm.js, supports resize/reconnect/theme, and operator can spawn additional shell tabs
  4. Closing the terminal warns the operator if there are uncommitted or unpushed changes in the workspace
**Plans**: 2 plans

Plans:
- [ ] 23-01-PLAN.md -- WebSocket server wrapper, ticket auth, and bidirectional proxy to ttyd
- [ ] 23-02-PLAN.md -- xterm.js terminal UI, multi-tab shell support, and git safety warnings

### Phase 24: Conversational Integration
**Goal**: Operators can launch and interact with workspaces through natural conversation, with context flowing bidirectionally between chat and workspace
**Depends on**: Phase 23
**Requirements**: INTG-01, INTG-02, INTG-03, INTG-04, INTG-05
**Success Criteria** (what must be TRUE):
  1. Operator can say "start coding on [repo]" in Slack/Telegram and receive a workspace URL with the container running
  2. Conversation context from the chat thread is injected into the workspace container on start
  3. Commits made during a workspace session are surfaced back into the originating chat thread on close
  4. Operator can list active workspaces with running/stopped status and reconnect to any running workspace
  5. Workspace events (crash, recovery, close) trigger notifications to the operator's channel
**Plans**: TBD

Plans:
- [ ] 24-01: TBD
- [ ] 24-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 22 → 23 → 24

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 22. Workspace Infrastructure | 3/3 | Complete    | 2026-03-09 | - |
| 23. WebSocket & Browser Terminal | 2/2 | Complete   | 2026-03-09 | - |
| 24. Conversational Integration | v1.5 | 0/2 | Not started | - |

---

### v1.6 MCP Tool Layer (Planned)

**Goal:** Per-instance MCP server configuration so agents get curated tool access beyond Claude Code built-ins.

---

### v1.7 Smart Execution (Planned)

**Goal:** Quality gates before and after agent work. Local heuristic checks, CI-aware test feedback, and configurable merge policies.

---

### v1.8 Multi-Agent Clusters (Future)

**Goal:** Coordinated groups of agents that can split complex tasks, work in parallel, and merge results.

---

*Last updated: 2026-03-09 -- Phase 23 plans created*
