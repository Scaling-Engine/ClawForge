# Milestones

## v2.1 Upstream Feature Sync (Shipped: 2026-03-16)

**Phases:** 29-38 (10 phases, 12 plans)
**Timeline:** 1 day (2026-03-13)
**Files changed:** 192 (+26,282 / -520)
**Requirements:** 35/35 satisfied (CONFIG, PAGES, CHAT, ROLE, ADMIN, GHSEC, VOICE, CWSV2, CLSTUI, DX)
**Archive:** milestones/v2.1-ROADMAP.md, milestones/v2.1-REQUIREMENTS.md

**Key accomplishments:**
- DB-backed config system (AES-256-GCM encryption, SQLite config table, LLM provider listing) as foundation for all subsequent phases
- Three new pages (Pull Requests with approve/reject, Runners status, Profile) plus sidebar navigation with PR badge count
- Chat enhancements: Shiki syntax highlighting via @streamdown/code, interactive mode toggle routing headless vs workspace coding
- Role-based access control: admin/user roles, middleware guards on /admin/*, forbidden page, conditional sidebar navigation
- Admin panel restructure: /settings/ → /admin/* migration with sidebar layout, users CRUD, webhooks display, backwards-compatible redirects
- GitHub secrets management: sealed-box encryption for GitHub API, CRUD UI with masked values, AGENT_* prefix enforcement
- Voice input: AssemblyAI v3 real-time streaming via AudioWorklet, volume bars, zero server-side audio storage
- Code Workspaces V2: DnD tabs (@dnd-kit), xterm addon-search/web-links/serialize, file tree sidebar with polling
- Cluster detail views: /cluster/[id] overview + console (SSE streaming) + logs (persisted) + role detail pages
- Developer experience: web_search LangGraph tool (Brave API), CLI commands (create-instance, run-job, check-status)

---

## v2.0 Full Platform (Shipped: 2026-03-12)

**Phases:** 25-28 (4 phases, 14 plans)
**Timeline:** 1 day (2026-03-12)
**Requirements:** 35/35 satisfied (STRM, WEBUI, MCP, CLST)
**Archive:** milestones/v2.1-ROADMAP.md (v2.0 phases included in v2.1 archive)

**Key accomplishments:**
- Headless log streaming: SSE endpoint, Docker log streaming, Slack edit-in-place status updates, semantic event filtering
- Web UI: NextAuth session auth on Server Actions, repo/branch selector, feature flags system, live job streaming inline in chat
- MCP tool layer: per-instance MCP_SERVERS.json, template variable resolution, --mcp-config flag, tool subset curation, pre-run context hydration
- Multi-agent clusters: CLUSTER.json definition, sequential Docker dispatch, shared volume communication, label-based state machine, hard iteration limits, cluster Slack thread notifications

---

## v1.5 Persistent Workspaces (Shipped: 2026-03-11)

**Phases:** 22-24 (3 phases, 7 plans)
**Timeline:** 3 days (2026-03-08 → 2026-03-11)
**Files changed:** 43 (+5,109 / -84)
**Requirements:** 19/19 satisfied
**Archive:** milestones/v1.5-ROADMAP.md, milestones/v1.5-REQUIREMENTS.md

**Key accomplishments:**
- Workspace Docker image with ttyd 1.7.7 + tmux + Claude Code CLI, full container lifecycle (create/stop/start/destroy/auto-recover), idle timeout, and max concurrent limits
- Custom HTTP server wrapping Next.js with ticket-based WebSocket auth (single-use, 30s TTL) and bidirectional binary proxy to ttyd inside containers
- xterm.js browser terminal with multi-tab tmux sessions (ports 7681-7685), resize/reconnect, and git safety warnings on workspace close
- `start_coding` and `list_workspaces` LangGraph tools for conversational workspace launch from Slack/Telegram
- Bidirectional context bridging: chat history injected as CHAT_CONTEXT env var (20KB cap) on start, commits surfaced back into thread on close
- Workspace event notifications (crash, recovery, idle-stop) routed to operator's channel via Slack/Telegram with LangGraph memory injection

---

## v1.4 Docker Engine Foundation (Shipped: 2026-03-08)

**Phases:** 18-21 (4 phases, 8 plans)
**Timeline:** 3 days (2026-03-06 → 2026-03-08)
**Files changed:** 59 (+5,836 / -135)
**Requirements:** 24/24 satisfied
**Archive:** milestones/v1.4-ROADMAP.md, milestones/v1.4-REQUIREMENTS.md

**Key accomplishments:**
- Layer 2 context hydration: entrypoint injects STATE.md (4K cap), ROADMAP.md (6K cap), and last 10 git commits into job prompts, gated on GSD_HINT for quick vs full hydration
- AGENT_QUICK.md variant for simple jobs with fallback chain: instance → defaults → full AGENT.md
- Docker Engine API dispatch via dockerode: containers start in ~9 seconds vs ~60s via GitHub Actions, with full lifecycle management (create, wait, logs, cleanup)
- Dual-path dispatch routing: REPOS.json `dispatch` field controls Docker vs Actions per repo, with seamless fallback
- Orphan container reconciliation on Event Handler restart — labels-based detection, log collection, force removal
- Named volumes (`clawforge-{instance}-{slug}`) with warm/cold start detection, hygiene step, and flock mutex for concurrent safety
- Integration wiring: `addToThread` for Docker job thread memory, `inspectJob` in status tool, AGENT_QUICK.md baked into Docker image

---

## v1.3 Instance Generator (Shipped: 2026-03-06)

**Phases:** 13-17 + 16.1, 17.1 (7 phases, 9 plans)
**Timeline:** 8 days (2026-02-27 → 2026-03-06)
**Archive:** milestones/v1.3-ROADMAP.md, milestones/v1.3-REQUIREMENTS.md

**Key accomplishments:**
- `createInstanceJobTool` registered in LangGraph agent with Zod-validated schema and yaml@2.8.2 for comment-preserving docker-compose updates
- Multi-turn conversational intake in EVENT_HANDLER.md — grouped config gathering (max 4 turns), optional field suppression, approval gate, clean cancellation
- `buildInstanceJobDescription()` generates comprehensive job prompt with all 7 artifacts (Dockerfile, SOUL.md, AGENT.md, EVENT_HANDLER.md, REPOS.json, .env.example, docker-compose.yml update)
- Blocked-paths auto-merge exclusion — instance PRs (instances/*, docker-compose.yml) require manual review regardless of ALLOWED_PATHS
- `--body-file` PR creation for robust long PR bodies with operator setup checklists
- `get_project_state` LangGraph tool — Layer 1 fetches STATE.md + ROADMAP.md via GitHub Contents API for project-aware job dispatching
- End-to-end pipeline validated: conversation → approval → job dispatch → PR with all artifacts verified

### Known Gaps
- INTAKE-02 through INTAKE-05, SCAF-01 through SCAF-04: Code implemented and E2E validated, but phases 14/15 lack formal VERIFICATION.md
- Phase 17.2 (Layer 2 Context Hydration) deferred to v1.4

---

## v1.0 Foundation & Observability (Shipped: 2026-02-24)

**Phases:** 1-4, 6 plans
**Archive:** milestones/v1.0-ROADMAP.md (if exists)

**Key accomplishments:**
- Job containers run Claude Code CLI via `claude -p` with GSD installed globally
- Preflight diagnostics, PostToolUse observability hook, template sync
- Test harness for local Docker GSD verification
- Imperative AGENT.md instructions for consistent GSD invocation

---

## v1.1 Agent Intelligence & Pipeline Hardening (Shipped: 2026-02-25)

**Phases:** 5-8, 7 plans, ~10 tasks
**Timeline:** 24 days (2026-02-01 -> 2026-02-25)
**Files changed:** 45 (+5,023 / -257)
**Archive:** milestones/v1.1-ROADMAP.md, milestones/v1.1-REQUIREMENTS.md

**Key accomplishments:**
- Pipeline hardening: zero-commit PR guard, 30-min runner timeout, failure stage detection (docker_pull/auth/claude)
- Smart job prompts: structured FULL_PROMPT with CLAUDE.md injection (8k cap), package.json stack, GSD routing hints
- Previous job context: follow-up jobs receive prior merged job summary scoped by thread ID
- Notification accuracy: failure stage surfaced in Slack/Telegram, explicit gsd-invocations.jsonl lookup
- Test harness sync: test-entrypoint.sh aligned with production 5-section prompt and file-redirect delivery
- Full template sync: all workflows byte-for-byte identical between live and templates/

---

## v1.2 Cross-Repo Job Targeting (Shipped: 2026-02-27)

**Phases:** 9-12, 10 plans (v1.2 only), 23 total
**Timeline:** 2 days (2026-02-25 -> 2026-02-26)
**Files changed:** 46 files (+5,605 / -93)
**Archive:** milestones/v1.2-ROADMAP.md, milestones/v1.2-REQUIREMENTS.md

**Key accomplishments:**
- Per-instance REPOS.json config with `loadAllowedRepos()` + `resolveTargetRepo()` supporting case-insensitive slug/name/alias matching
- SOUL.md and AGENT.md baked into job Docker image at `/defaults/` so cross-repo jobs have system prompt without clawforge config in working tree
- `target_repo` threaded from LangGraph tool schema -> `create_job()` -> `target.json` sidecar on clawforge job branch
- Two-phase clone in entrypoint: clawforge checkout for metadata, target repo shallow clone as Claude's `WORK_DIR`; backward compatible (no target.json = v1.1 behavior)
- Cross-repo PR creation with `clawforge/{uuid}` branch naming, default branch detection via `gh repo view`, and ClawForge attribution in PR body
- Notification pipeline: nullable `target_repo` column in `job_outcomes`, webhook passthrough, `getJobStatus()` DB overlay returning completed job PR URLs

---

---
*Last updated: 2026-03-08 — v1.4 shipped*
