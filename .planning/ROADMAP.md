# Roadmap: ClawForge

## Milestones

- v1.0 GSD Verification & Hardening -- Phases 1-4 (shipped 2026-02-24)
- v1.1 Agent Intelligence & Pipeline Hardening -- Phases 5-8 (shipped 2026-02-25)
- v1.2 Cross-Repo Job Targeting -- Phases 9-12 (shipped 2026-02-27)
- v1.3 Instance Generator -- Phases 13-17 + 16.1, 17.1 (shipped 2026-03-06)
- v1.4 Docker Engine Foundation -- Phases 18-21 (shipped 2026-03-08)
- **v1.5 Persistent Workspaces** -- planned
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

*Last updated: 2026-03-08 -- v1.4 archived, v1.5 next*
