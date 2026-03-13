# Roadmap: ClawForge

## Milestones

- ✅ v1.0 GSD Verification & Hardening -- Phases 1-4 (shipped 2026-02-24)
- ✅ v1.1 Agent Intelligence & Pipeline Hardening -- Phases 5-8 (shipped 2026-02-25)
- ✅ v1.2 Cross-Repo Job Targeting -- Phases 9-12 (shipped 2026-02-27)
- ✅ v1.3 Instance Generator -- Phases 13-17 + 16.1, 17.1 (shipped 2026-03-06)
- ✅ v1.4 Docker Engine Foundation -- Phases 18-21 (shipped 2026-03-08)
- ✅ v1.5 Persistent Workspaces -- Phases 22-24 (shipped 2026-03-11)
- ✅ v2.0 Full Platform -- Phases 25-28 (shipped 2026-03-12)
- v2.1 Upstream Feature Sync -- Phases 29-38 (planned)

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


<details>
<summary>✅ v2.0 Full Platform (Phases 25-28) -- SHIPPED 2026-03-12</summary>

- [x] Phase 25: Headless Log Streaming (3/3 plans) -- completed 2026-03-12
- [x] Phase 26: Web UI Auth + Repo Selector (3/3 plans) -- completed 2026-03-12
- [x] Phase 27: MCP Tool Layer (3/3 plans) -- completed 2026-03-12
- [x] Phase 28: Multi-Agent Clusters (5/5 plans) -- completed 2026-03-12

</details>

---

### v2.1 Upstream Feature Sync

**Milestone Goal:** Cherry-pick all missing front-end features from PopeBot upstream (stephengpope/thepopebot) into ClawForge via 3 waves — closing the UI gap while preserving ClawForge-specific systems (dockerode, MCP, cluster coordinator, SSE streaming, multi-repo dispatch).

#### Wave 1: Low Risk, High Visibility (Phases 29-31)

- [x] **Phase 29: Foundation & Config System** — DB-backed config helper, combobox component, tool display names, LLM provider listing (completed 2026-03-13)
- [x] **Phase 30: New Pages** — PR approvals page, Runners page, Profile page, sidebar navigation updates (completed 2026-03-13)
- [ ] **Phase 31: Chat Enhancements** — File upload (drag-and-drop with paperclip), enhanced code mode toggle (headless/interactive), improved message rendering

#### Wave 2: Medium Risk (Phases 32-34)

- [ ] **Phase 32: Auth Roles** — Role column on users table, admin/user middleware, /forbidden page, route guards
- [ ] **Phase 33: Admin Panel** — /settings/ → /admin/* restructure with shared layout, sub-pages migration
- [ ] **Phase 34: GitHub Secrets Management** — github-api.js wrapper, secrets CRUD UI, Node crypto encryption, AGENT_* prefix enforcement

#### Wave 3: Higher Effort (Phases 35-38)

- [ ] **Phase 35: Voice Input** — AssemblyAI real-time streaming, AudioWorklet microphone capture, volume bars, chat input integration
- [ ] **Phase 36: Code Workspaces V2** — DnD tabs (@dnd-kit), xterm addon-search/web-links/serialize, file tree sidebar (chokidar)
- [ ] **Phase 37: Cluster Detail Views** — /cluster/[id] single view, /cluster/[id]/console live console, /cluster/[id]/logs viewer, /cluster/[id]/role/[roleId] per-role view
- [ ] **Phase 38: Developer Experience** — Setup wizard (bin/setup), CLI tools (bin/cli.js, bin/sync.js), web search tool (Brave API)

## Phase Details

### Phase 29: Foundation & Config System
**Goal**: Establish shared infrastructure components that Phases 30-38 depend on — DB config helper, UI primitives, and utility modules
**Depends on**: Phase 28 (v2.0 complete)
**Requirements**: CONFIG-01, CONFIG-02, CONFIG-03, CONFIG-04
**Plans:** 2/2 plans complete

Plans:
- [x] 29-01-PLAN.md — DB config system (crypto, config CRUD, LLM providers, config facade)
- [x] 29-02-PLAN.md — UI combobox component and tool display names

**Success Criteria** (what must be TRUE):
  1. `lib/config.js` provides `getConfig(key)` / `setConfig(key, value)` backed by SQLite config table
  2. `lib/chat/components/ui/combobox.jsx` renders a searchable dropdown used by at least one other component
  3. `lib/chat/components/tool-names.js` maps internal tool IDs to human-readable display names in chat
  4. `lib/llm-providers.js` lists available LLM providers with model IDs for settings UI

### Phase 30: New Pages
**Goal**: Add upstream UI pages that are pure additions — no existing ClawForge code modified
**Depends on**: Phase 29
**Requirements**: PAGES-01, PAGES-02, PAGES-03, PAGES-04
**Success Criteria** (what must be TRUE):
  1. `/pull-requests` page shows pending PRs from allowed repos with approve/reject actions
  2. `/runners` page shows GitHub Actions runner status (online/offline/busy)
  3. `/profile` page shows current user info with login settings
  4. Sidebar navigation includes new page links with active state highlighting and PR badge count
**Plans:** 2/2 plans complete

Plans:
- [ ] 30-01-PLAN.md — Server Actions, icons, and Pull Requests page
- [ ] 30-02-PLAN.md — Runners page, Profile page, and sidebar navigation updates


### Phase 31: Chat Enhancements
**Goal**: Bring chat UI to feature parity with upstream — file upload, enhanced code mode, improved rendering
**Depends on**: Phase 30
**Requirements**: CHAT-01, CHAT-02, CHAT-03
**Success Criteria** (what must be TRUE):
  1. Operator can drag-and-drop files (images, PDFs, code) onto chat or click paperclip button to attach files to messages
  2. Code mode toggle switches between headless job dispatch and interactive workspace coding within the same chat
  3. Chat messages render with enhanced formatting (syntax highlighting, collapsible code blocks, image previews)
**Plans:** 1 plan

Plans:
- [ ] 31-01-PLAN.md — Streamdown code plugin, interactive mode routing, end-to-end verification


### Phase 32: Auth Roles
**Goal**: Add role-based access control so admin features are restricted to admin users
**Depends on**: Phase 31
**Requirements**: ROLE-01, ROLE-02, ROLE-03, ROLE-04
**Success Criteria** (what must be TRUE):
  1. Users table has `role` column with `admin` and `user` values; first user is auto-admin
  2. Middleware checks role on `/admin/*` routes and returns 403 for non-admin users
  3. `/forbidden` page renders when a non-admin user attempts to access admin routes
  4. Client-side navigation conditionally shows/hides admin links based on user role

### Phase 33: Admin Panel
**Goal**: Restructure settings from `/settings/` to `/admin/*` with proper layout and sub-page navigation
**Depends on**: Phase 32 (roles must be in place before admin routes)
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):
  1. `/admin/` layout renders with sidebar navigation listing all admin sub-pages
  2. Existing settings pages (general, github, chat) are accessible under `/admin/*`
  3. New admin pages (users, webhooks) are functional with CRUD operations
  4. `/settings/*` routes redirect to corresponding `/admin/*` routes for backwards compatibility

### Phase 34: GitHub Secrets Management
**Goal**: Operators can manage GitHub secrets and variables from the admin panel without leaving ClawForge
**Depends on**: Phase 33 (admin panel must exist)
**Requirements**: GHSEC-01, GHSEC-02, GHSEC-03, GHSEC-04
**Success Criteria** (what must be TRUE):
  1. `lib/github-api.js` provides CRUD operations for GitHub repo secrets and variables
  2. `/admin/secrets` page lists secrets with masked values (last 4 chars) and supports create/update/delete
  3. Secret values encrypted with Node `crypto` (AES-256-GCM) before any local storage
  4. AGENT_* prefix convention enforced in the create/edit form with clear documentation

### Phase 35: Voice Input
**Goal**: Operators can speak into their microphone in the web chat and have speech transcribed to text input
**Depends on**: Phase 31 (chat enhancements provide the input area integration point)
**Requirements**: VOICE-01, VOICE-02, VOICE-03, VOICE-04
**Success Criteria** (what must be TRUE):
  1. Microphone button in chat input toggles recording; volume bars animate during capture
  2. Audio streamed to AssemblyAI in real-time; interim and final transcriptions appear in chat input
  3. Graceful handling of microphone permission denial (toast notification, no crash)
  4. No audio data stored server-side — purely client-to-AssemblyAI streaming

### Phase 36: Code Workspaces V2
**Goal**: Upgrade workspace terminal with DnD tabs, enhanced xterm addons, and file tree navigation
**Depends on**: Phase 29 (config foundation) + existing v1.5 workspace infrastructure
**Requirements**: CWSV2-01, CWSV2-02, CWSV2-03, CWSV2-04
**Success Criteria** (what must be TRUE):
  1. Workspace tabs are drag-reorderable via @dnd-kit; new tabs spawn additional tmux sessions
  2. Terminal supports in-terminal search (addon-search) and clickable URLs (addon-web-links)
  3. File tree sidebar shows workspace directory contents, auto-refreshes on file changes (chokidar)
  4. Existing v1.5 workspaces continue working without migration — V2 features are additive

### Phase 37: Cluster Detail Views
**Goal**: Operators can drill into individual cluster runs to see per-agent status, live console output, and logs
**Depends on**: Phase 28 (cluster backend must exist)
**Requirements**: CLSTUI-01, CLSTUI-02, CLSTUI-03, CLSTUI-04
**Success Criteria** (what must be TRUE):
  1. `/cluster/[id]` shows cluster run overview with agent timeline, status badges, and PR links
  2. `/cluster/[id]/console` streams live output from the currently-executing cluster agent
  3. `/cluster/[id]/logs` shows historical log output for completed agents in the run
  4. `/cluster/[id]/role/[roleId]` shows role-specific view with agent config, label history, and outputs

### Phase 38: Developer Experience
**Goal**: Make ClawForge easier to set up and develop against with CLI tools, setup wizard, and web search integration
**Depends on**: Phase 29 (config system)
**Requirements**: DX-01, DX-02, DX-03
**Success Criteria** (what must be TRUE):
  1. `bin/setup` interactive wizard walks through first-time setup (env vars, Docker, GitHub token)
  2. `bin/cli.js` provides CLI commands for common operations (create instance, run job, check status)
  3. `web_search` LangGraph tool queries Brave Search API and returns structured results to the agent

## Progress

**Execution Order:**
Phases execute in numeric order: 29 → 30 → 31 → 32 → 33 → 34 → 35 → 36 → 37 → 38

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
| 25. Headless Log Streaming | v2.0 | 3/3 | Complete | 2026-03-12 |
| 26. Web UI Auth + Repo Selector | v2.0 | 3/3 | Complete | 2026-03-12 |
| 27. MCP Tool Layer | v2.0 | 3/3 | Complete | 2026-03-12 |
| 28. Multi-Agent Clusters | v2.0 | 5/5 | Complete | 2026-03-12 |
| 29. Foundation & Config System | 2/2 | Complete   | 2026-03-13 | — |
| 30. New Pages | 2/2 | Complete    | 2026-03-13 | — |
| 31. Chat Enhancements | v2.1 | 0/1 | Planned | — |
| 32. Auth Roles | v2.1 | 0/? | Planned | — |
| 33. Admin Panel | v2.1 | 0/? | Planned | — |
| 34. GitHub Secrets Management | v2.1 | 0/? | Planned | — |
| 35. Voice Input | v2.1 | 0/? | Planned | — |
| 36. Code Workspaces V2 | v2.1 | 0/? | Planned | — |
| 37. Cluster Detail Views | v2.1 | 0/? | Planned | — |
| 38. Developer Experience | v2.1 | 0/? | Planned | — |

---

*Last updated: 2026-03-12 -- v2.1 milestone planned (10 phases, 3 waves)*
