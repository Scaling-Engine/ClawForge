# Roadmap: ClawForge

## Milestones

- v1.0 GSD Verification & Hardening -- Phases 1-4 (shipped 2026-02-24)
- v1.1 Agent Intelligence & Pipeline Hardening -- Phases 5-8 (shipped 2026-02-25)
- v1.2 Cross-Repo Job Targeting -- Phases 9-12 (shipped 2026-02-27)
- v1.3 Instance Generator -- Phases 13-17 + 16.1, 17.1 (shipped 2026-03-06)
- **v1.4 Docker Engine Foundation** -- Phases 18-20 (in progress)
- v1.5 Persistent Workspaces -- planned
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

---

### v1.4 Docker Engine Foundation (In Progress)

**Goal:** Replace GitHub Actions as the primary job dispatch mechanism with direct Docker Engine API calls. Containers start in seconds instead of minutes. GH Actions retained as fallback for CI-integrated repos.

- [x] **Phase 18: Layer 2 Context Hydration** - Inject STATE.md, ROADMAP.md, and git history into job prompts with GSD-gated scoping (completed 2026-03-06)
- [ ] **Phase 19: Docker Engine Dispatch** - Docker API client, container lifecycle, and dual-path dispatch routing
- [ ] **Phase 20: Named Volumes** - Persistent repo state across jobs for warm-start containers

## Phase Details

### Phase 18: Layer 2 Context Hydration
**Goal**: Job containers start with full project awareness -- state, roadmap, and recent history -- so agents produce context-informed results without operator briefing
**Depends on**: Nothing (pure entrypoint.sh changes, works with both dispatch paths)
**Requirements**: HYDR-01, HYDR-02, HYDR-03, HYDR-04, HYDR-05
**Success Criteria** (what must be TRUE):
  1. A job on a GSD-managed repo includes STATE.md and ROADMAP.md content in the prompt visible to Claude
  2. A simple job (GSD hint "quick") receives a minimal prompt without state/roadmap sections
  3. Recent git history (last 10 commits) appears in the job prompt so the agent knows what changed recently
  4. Simple jobs use AGENT_QUICK.md (shorter instructions), complex jobs use full AGENT.md
**Plans**: 2 plans

Plans:
- [ ] 18-01-PLAN.md -- AGENT_QUICK.md creation and entrypoint reordering for hint-aware agent selection
- [ ] 18-02-PLAN.md -- Context hydration: STATE.md, ROADMAP.md, git history with GSD-gated injection

### Phase 19: Docker Engine Dispatch
**Goal**: Jobs dispatched via Docker Engine API start in seconds instead of minutes, with full container lifecycle management and seamless fallback to GitHub Actions
**Depends on**: Phase 18
**Requirements**: DOCK-01, DOCK-02, DOCK-03, DOCK-04, DOCK-05, DOCK-06, DOCK-07, DOCK-08, DOCK-09, DOCK-10, DISP-01, DISP-02, DISP-03, DISP-04, DISP-05
**Success Criteria** (what must be TRUE):
  1. Operator sends a job via Slack/Telegram and the container starts executing within 15 seconds (vs ~60s via Actions)
  2. Docker-dispatched jobs produce identical outputs to Actions-dispatched jobs -- same commits, PRs, and notifications
  3. REPOS.json `dispatch` field controls whether a repo uses Docker or Actions, and both paths work simultaneously
  4. Orphaned containers from crashed Event Handler are detected and cleaned up on restart
  5. Operator can check if a running container is stuck via job status inspection
**Plans**: TBD

Plans:
- [ ] 19-01: TBD
- [ ] 19-02: TBD
- [ ] 19-03: TBD

### Phase 20: Named Volumes
**Goal**: Repeat jobs on the same repo start warm -- fetching in 2-3 seconds instead of cloning in 10-15 seconds
**Depends on**: Phase 19
**Requirements**: VOL-01, VOL-02, VOL-03, VOL-04
**Success Criteria** (what must be TRUE):
  1. Second job on the same repo uses `git fetch` instead of `git clone`, completing repo setup in under 5 seconds
  2. A job that runs after a previously failed/interrupted job starts clean (no stale locks, dirty state, or leftover files)
  3. Two concurrent jobs on the same repo both complete successfully without corrupting each other
**Plans**: TBD

Plans:
- [ ] 20-01: TBD

---

### v1.5 Persistent Workspaces (Planned)

**Goal:** Interactive code workspaces where operators can open a browser terminal connected to a persistent Docker container with their repo.

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

## Progress

**Execution Order:**
Phases execute in numeric order: 18 -> 19 -> 20

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
| 16.1. Entrypoint Sync | v1.3 | 1/1 | Complete | 2026-03-05 |
| 17. End-to-End Validation | v1.3 | 1/1 | Complete | 2026-03-06 |
| 17.1. Context Hydration (Layer 1) | v1.3 | 1/1 | Complete | 2026-03-06 |
| 18. Layer 2 Context Hydration | 2/2 | Complete    | 2026-03-06 | - |
| 19. Docker Engine Dispatch | v1.4 | 0/TBD | Not started | - |
| 20. Named Volumes | v1.4 | 0/TBD | Not started | - |

---
*Last updated: 2026-03-06 -- Phase 18 planned (2 plans)*
