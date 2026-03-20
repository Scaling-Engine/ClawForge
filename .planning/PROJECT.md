# ClawForge — Secure Claude Code Agent Gateway

## What This Is

A multi-channel AI agent platform that connects Claude Code CLI to messaging channels (Slack, Telegram, Web Chat) with strict Docker isolation between instances. Two-layer architecture: Event Handler (LangGraph ReAct agent) dispatches headless jobs to ephemeral Docker containers and persistent interactive workspaces with browser terminals. Agents receive structured prompts with full repo context and prior job history, then operate on any allowed target repo — creating PRs, committing changes, and surfacing results back to the operator. Operators can also launch persistent workspace containers with ttyd/tmux browser terminals for interactive coding sessions, with bidirectional context bridging between chat and workspace.

## Core Value

Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results without operator intervention.

## Current State (v1.0 shipped 2026-03-20)

**Shipped:** v1.0 — 43 phases, 81 plans, 730+ commits
**Codebase:** ~42,000 LOC JavaScript (Next.js + LangGraph + Drizzle ORM + dockerode + ws + xterm.js + @dnd-kit + AssemblyAI + @streamdown/code + @anthropic-ai/claude-agent-sdk + diff2html)
**Instances:** 2 (Noah/Archie — full access, StrategyES/Epic — scoped to strategyes-lab)
**Timeline:** 2026-02-01 → 2026-03-20 (48 days)

**What works:**

<details>
<summary>v1.0-v1.5 capabilities (click to expand)</summary>

- Full job pipeline via **Docker Engine API dispatch** (~9s) or GitHub Actions fallback (~60s)
- **Layer 2 context hydration**: job containers receive STATE.md, ROADMAP.md, and recent git history in prompt
- **Named volumes**: warm start via `git fetch` (2-3s) instead of full clone (10-15s), with flock mutex for concurrency
- Cross-repo targeting: agent resolves repo from natural language, container performs two-phase clone, PR created on target repo with correct attribution
- Per-instance REPOS.json with `loadAllowedRepos()` + `resolveTargetRepo()` + `getDispatchMethod()` (slug/name/alias matching, docker/actions routing)
- SOUL.md and AGENT.md baked into Docker image at `/defaults/` — cross-repo jobs have system prompt without clawforge config in working tree
- `target.json` sidecar on job branch carries target metadata; entrypoint reads it at runtime
- Structured 5-section FULL_PROMPT (Target, Docs, Stack, Task, GSD Hint) with CLAUDE.md injection from target repo
- Previous job context: follow-up jobs start warm with prior merged job summary (thread-scoped)
- Failure stage detection: docker_pull/auth/clone/claude surfaced in Slack/Telegram notifications
- Zero-commit PR guard, 30-min timeout, explicit JSONL lookup
- `job_outcomes` table: tracks completions with `target_repo` column; `getJobStatus()` DB overlay returns completed job PR URLs
- All templates byte-for-byte synced with live files
- **Instance creation via conversation**: multi-turn intake → approval → job dispatch → PR with 7 artifacts + operator setup checklist
- **Auto-merge exclusion**: instance PRs blocked from auto-merge regardless of ALLOWED_PATHS
- **Layer 1 context hydration**: `get_project_state` tool fetches STATE.md + ROADMAP.md from target repos via GitHub API
- **Persistent workspaces**: workspace Docker image (ttyd 1.7.7 + tmux + Claude Code CLI), full container lifecycle
- **Browser terminal**: custom HTTP server wraps Next.js for WebSocket upgrade interception, ticket-based auth, xterm.js with multi-tab tmux sessions
- **Conversational workspace launch**: `start_coding` and `list_workspaces` LangGraph tools, chat context injected as CHAT_CONTEXT env var (20KB cap)
- **Bidirectional context bridging**: conversation history flows into workspace on start, commits surfaced back into chat thread on close
- **Workspace event notifications**: crash, recovery, idle-stop events routed to operator's channel via Slack/Telegram

</details>

**v2.0 Full Platform:**
- **Headless log streaming**: SSE endpoint, Docker log streaming, Slack edit-in-place status, semantic event filtering, progress indicator
- **Web UI**: NextAuth session auth on Server Actions, repo/branch selector, feature flags system, live job streaming inline in chat
- **MCP tool layer**: per-instance MCP_SERVERS.json, template variables, --mcp-config flag, tool subset curation, pre-run context hydration
- **Multi-agent clusters**: CLUSTER.json definitions, sequential Docker dispatch, shared volume communication, label-based state machine, iteration limits

**v2.1 Upstream Feature Sync:**
- **DB-backed config**: `getConfig()`/`setConfig()` with AES-256-GCM encryption, SQLite config table, LLM provider listing
- **New pages**: Pull Requests (approve/reject), Runners status, Profile page, sidebar with PR badge count
- **Chat enhancements**: Shiki syntax highlighting (@streamdown/code), interactive mode toggle (headless vs workspace)
- **Auth roles**: admin/user RBAC, middleware guards on /admin/*, /forbidden page
- **Admin panel**: /settings/ → /admin/* restructure, sidebar layout, users CRUD, webhooks display, backwards-compatible redirects
- **GitHub secrets**: sealed-box encryption for GitHub API, CRUD UI with masked values, AGENT_* prefix enforcement
- **Voice input**: AssemblyAI v3 real-time streaming via AudioWorklet, volume bars, zero server-side audio storage
- **Code Workspaces V2**: DnD tabs (@dnd-kit), xterm addon-search/web-links/serialize, file tree sidebar
- **Cluster detail views**: /cluster/[id] overview + console (SSE) + logs (persisted) + role detail pages
- **Developer experience**: web_search tool (Brave API), CLI commands (create-instance, run-job, check-status)

**v2.2 Smart Operations:**
- **Smart execution**: configurable quality gates (lint/typecheck/test) in entrypoint.sh, self-correction loop (max 1 retry), per-repo merge policies (auto/gate-required/manual)
- **Job control UI**: cancel running Docker containers and retry failed jobs from Swarm page, admin role-gated
- **Terminal chat**: embedded Claude Code sessions via Agent SDK, UIMessageStream streaming, live tool call cards, unified diff rendering (diff2html), thinking panel, cost tracking, shell mode toggle
- **Admin operations**: DB-backed repo CRUD, platform config editing with CONFIG_ALLOWLIST, instance management page
- **Superadmin portal**: single-login instance switching, health dashboard (30s auto-refresh), cross-instance job search via API proxy
- **Three-tier roles**: user → admin → superadmin, AGENT_SUPERADMIN_TOKEN for M2M auth between hub and instances

## Current Milestone: v3.0 Customer Launch

**Goal:** Stabilize the platform for production reliability and launch ClawForge to external customers and the internal Scaling Engine team with self-service onboarding, operator docs, usage-based access control, and team monitoring.

**Target features:**
- Bug fixes, polish, and UX papercuts across all existing features
- Observability: error logging, health checks, alerting
- Performance: faster job starts, reduced resource waste
- Reliability hardening: retry logic, graceful degradation, edge case coverage
- Self-service onboarding flow for new instance operators
- Operator documentation (deployment runbook, config reference, troubleshooting)
- Demo experience for showcasing to prospective customers
- Billing / access control: per-customer instance limits, usage tracking, tiered access
- Team self-service setup without operator intervention
- Training materials (SOPs, in-app tooltips)
- Enhanced role-based access beyond current user/admin/superadmin
- Team monitoring dashboard: all instances health, active jobs, errors

## Requirements

### Validated

- ✓ Job containers run Claude Code CLI via `claude -p` with system prompt injection — v1.0
- ✓ SOUL.md + AGENT.md concatenated into system prompt at runtime — v1.0
- ✓ `--allowedTools` whitelist controls available tools (includes Task, Skill) — v1.0
- ✓ GSD installed globally in job Docker image — v1.0
- ✓ Git-as-audit-trail: every job creates a branch, commits, and opens a PR — v1.0
- ✓ Instance isolation via separate Docker networks and scoped repos — v1.0
- ✓ Preflight diagnostics (HOME, claude path, GSD directory) — v1.0
- ✓ PostToolUse hook for GSD invocation observability — v1.0
- ✓ Test harness for local Docker GSD verification — v1.0
- ✓ Imperative AGENT.md instructions ("MUST use Skill tool") — v1.0
- ✓ Template sync (docker/job/ ↔ templates/docker/job/) — v1.0
- ✓ Pipeline hardening: conditional PRs, failure stage detection, timeouts — v1.1
- ✓ Smart job prompts: CLAUDE.md + package.json injection, GSD routing hints — v1.1
- ✓ Previous job context: thread-scoped merged job summaries — v1.1
- ✓ Notification accuracy: failure stage in messages, explicit JSONL lookup — v1.1
- ✓ Test-production alignment: 5-section prompt, file-redirect delivery — v1.1
- ✓ Allowed repos configuration per instance with REPOS.json and resolver — v1.2
- ✓ Agent selects target repo from natural language (slug/name/alias matching) — v1.2
- ✓ Job containers clone and operate on target repo via two-phase clone — v1.2
- ✓ PRs created on target repo with clawforge/{uuid} branch naming and attribution — v1.2
- ✓ Notifications include correct target repo PR URLs — v1.2
- ✓ gh auth setup-git for all clones; no PAT in clone URLs — v1.2
- ✓ target_repo column in job_outcomes; getJobStatus() DB overlay — v1.2
- ✓ Same-repo (clawforge) jobs continue working without regression — v1.2

- ✓ Archie can create a new ClawForge instance through a multi-turn guided conversation — v1.3
- ✓ Instance scaffolding generates all required files (Dockerfile, SOUL.md, AGENT.md, REPOS.json, .env.example) — v1.3
- ✓ Generated PR includes docker-compose.yml update and operator setup checklist — v1.3
- ✓ Instance PRs excluded from auto-merge, require manual review — v1.3
- ✓ Layer 1 agent can fetch project state (STATE.md, ROADMAP.md) from target repos — v1.3

- ✓ Job containers start via Docker Engine API in ~9 seconds (vs ~60s via GH Actions) — v1.4
- ✓ Layer 2 context hydration: entrypoint injects STATE.md + ROADMAP.md + recent git history into job prompt — v1.4
- ✓ Named volumes for persistent repo state across jobs (warm start with flock mutex) — v1.4
- ✓ Dual-path dispatch routing via REPOS.json `dispatch` field (Docker or Actions) — v1.4
- ✓ Orphan container reconciliation on Event Handler restart — v1.4
- ✓ AGENT_QUICK.md variant for simple jobs with fallback chain — v1.4

- ✓ Workspace Docker image builds with ttyd + tmux + Claude Code CLI, separate from job container image — v1.5
- ✓ Workspace container lifecycle supports create, start, stop, destroy, and auto-recover — v1.5
- ✓ Workspace containers auto-stop after configurable idle timeout (default 30 min) — v1.5
- ✓ Max concurrent workspace limit enforced per instance — v1.5
- ✓ Workspace volumes use separate naming convention (`clawforge-ws-{instance}-{id}`) — v1.5
- ✓ Workspace containers join instance Docker network for isolation — v1.5
- ✓ Custom server wrapper intercepts HTTP upgrade and proxies WebSocket to ttyd — v1.5
- ✓ WebSocket auth uses ticket-based tokens (short-lived, single-use) — v1.5
- ✓ Browser terminal renders via xterm.js with resize, reconnect, and theme support — v1.5
- ✓ Operator can spawn additional shell tabs (separate ttyd instances on ports 7682+) — v1.5
- ✓ Git safety check warns operator of uncommitted/unpushed changes before workspace close — v1.5
- ✓ `start_coding` LangGraph tool creates workspace from conversation — v1.5
- ✓ Chat context injected into workspace container on start via CHAT_CONTEXT env var — v1.5
- ✓ Commits made during workspace session injected back into chat thread on close — v1.5
- ✓ Workspace list API returns active workspaces with status for reconnection — v1.5
- ✓ Workspace events (crash, recovery, close) trigger notifications to operator's channel — v1.5
- ✓ `code_workspaces` SQLite table tracks workspace state — v1.5
- ✓ Workspace records survive event handler restarts — v1.5
- ✓ Feature branch auto-created on workspace start — v1.5

- ✓ Headless log streaming (SSE, Docker log streaming, Slack edit-in-place, semantic filtering) — v2.0
- ✓ Web UI (NextAuth session auth, repo/branch selector, feature flags, live job streaming) — v2.0
- ✓ MCP tool layer (per-instance config, template variables, --mcp-config, tool subsets, pre-run hydration) — v2.0
- ✓ Multi-agent clusters (CLUSTER.json, sequential dispatch, shared volumes, label routing, iteration limits) — v2.0
- ✓ DB-backed config system (getConfig/setConfig, AES-256-GCM, LLM providers) — v2.1
- ✓ New pages: Pull Requests, Runners, Profile + sidebar with PR badge — v2.1
- ✓ Chat enhancements: Shiki highlighting, interactive mode toggle — v2.1
- ✓ Auth roles: admin/user RBAC, middleware guards, /forbidden page — v2.1
- ✓ Admin panel: /settings/ → /admin/* restructure with sidebar layout — v2.1
- ✓ GitHub secrets management: sealed-box encryption, CRUD UI, AGENT_* prefix — v2.1
- ✓ Voice input: AssemblyAI real-time streaming, AudioWorklet, zero server-side storage — v2.1
- ✓ Code Workspaces V2: DnD tabs, xterm addons, file tree sidebar — v2.1
- ✓ Cluster detail views: overview, console streaming, logs, role detail — v2.1
- ✓ Developer experience: web_search tool, CLI commands — v2.1
- ✓ Smart execution: quality gates (lint/typecheck/test), self-correction (max 1 retry), per-repo merge policies — v2.2
- ✓ Job control UI: cancel running jobs, retry failed jobs from web UI with admin role gating — v2.2
- ✓ Terminal chat: Agent SDK streaming, live tool call visualization, diff rendering, cost tracking, shell mode — v2.2
- ✓ Admin operations: DB-backed repo CRUD, config editing with CONFIG_ALLOWLIST, instance management — v2.2
- ✓ Superadmin portal: single-login instance switching, health dashboard, cross-instance job search — v2.2
- ✓ Three-tier roles: user → admin → superadmin with AGENT_SUPERADMIN_TOKEN M2M auth — v2.2

### Active — v3.0 Customer Launch

(Requirements being defined — see REQUIREMENTS.md when complete)

## Previous Milestones

### v2.2 Smart Operations (shipped 2026-03-17)

**Goal:** Transform ClawForge into a fully self-service platform with embedded Claude Code terminal mode, superadmin instance switching, complete UI-driven operations, and smart execution policies.

**Delivered:** 4 phases, 8 plans, 22 requirements. Quality gates with self-correction, job cancel/retry UI, embedded Claude Code terminal chat (Agent SDK streaming, diff rendering, cost tracking), admin repo CRUD + config editing, cross-instance superadmin portal with instance switching and job search.

### v2.1 Upstream Feature Sync (shipped 2026-03-13)

**Goal:** Cherry-pick all missing front-end features from PopeBot upstream via 3 waves — UI additions, admin panel, advanced features. Never overwrite ClawForge-specific systems.

**Delivered:** 10 phases, 12 plans, 35 requirements. DB config, new pages, chat enhancements, auth roles, admin panel, GitHub secrets, voice input, workspace V2, cluster detail views, developer tools.

### v2.0 Full Platform (shipped 2026-03-12)

**Goal:** Transform ClawForge from a CLI-driven agent gateway into a full-featured agent platform with web UI, multi-agent clusters, headless streaming, and per-instance MCP tool configs.

**Delivered:** 4 phases, 14 plans, 35 requirements. Headless log streaming, web UI auth + repo selector, MCP tool layer, multi-agent clusters.

### Out of Scope

- Max subscription auth (switching from API keys) — defer until volume justifies
- Self-improving agents (meta-agent reviewing success/failure) — future milestone
- Agent marketplace / composition — future milestone
- New channel integrations — existing Slack/Telegram/Web sufficient
- OpenTelemetry integration — hooks + committed logs sufficient for 2 instances
- Full repo tree fetch in context — rate limits + noise; CLAUDE.md + package.json only
- Auto-merge on target repos — target repos control their own merge policies
- Dynamic repo discovery via GitHub API — security risk; explicit allowed list is safer
- One PAT with org-wide access — blast radius too large; scoped PATs per instance
- Cross-repo jobs touching multiple repos — requires transaction model; use sequential single-repo jobs
- Installing ClawForge workflows in target repos — creates tight coupling

## Long-Term Vision

**Target:** Stripe-level coding agent platform (1,000+ AI-authored PRs/week) using Docker Compose instead of AWS/k8s.

**Full plan:** `.planning/VISION.md` — gap analysis (Stripe vs ClawForge vs thepopebot), architecture evolution, decision rationale

**Milestone map:**
- **v1.4 Docker Engine Foundation** — shipped 2026-03-08
- **v1.5 Persistent Workspaces** — shipped 2026-03-11
- **v2.0 Full Platform** — shipped 2026-03-12 (Web UI, Clusters, Headless Streaming, MCP Tool Layer)
- **v2.1 Upstream Feature Sync** — shipped 2026-03-13 (UI pages, admin panel, voice, workspaces V2, clusters UI, DX tools)
- **v2.2 Smart Operations** — shipped 2026-03-17 (Quality gates, terminal chat, superadmin portal, admin ops)

**Sources:** Stripe minions blog (stripe.dev/blog/minions), thepopebot upstream (stephengpope/thepopebot), analyzed 2026-03-04

## Context

- **Codebase mapped**: `.planning/codebase/` has 7 documents covering architecture, stack, conventions, concerns
- **Templates synced**: All docker/ and workflow files byte-for-byte identical with templates/
- **SQLite DB**: job_outcomes table with `target_repo` column tracks completions for prior-context injection and status lookups
- **Prompt architecture**: 5-section structured FULL_PROMPT delivered via /tmp/prompt.txt file redirect; CLAUDE.md read from WORK_DIR (target repo context for cross-repo jobs)
- **VERIFICATION-RUNBOOK.md**: Operator checklist for 5 regression scenarios — must be executed before next significant change
- **Pending operator tasks**: StrategyES REPOS.json content confirmation; PAT scope update per .env.example; OpenAI key for Epic audio transcription

## Constraints

- **Docker isolation**: Changes must work within the existing Docker container model — no host filesystem mounts for GSD
- **GitHub Actions**: Job containers are triggered by Actions workflows, so testing requires either local Docker or a GH Actions run
- **Two instances**: Any changes must work for both Archie (full access) and Epic (scoped to strategyes-lab)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| GSD installed globally in Docker image | Simpler than repo-level install, survives across job repos | ✓ Working in production |
| Template sync via `cp` not manual edit | Eliminates drift risk, byte-for-byte guarantee | ✓ Good — all templates synced |
| Focus on verification before Max subscription | Need to prove current setup works before changing auth model | ✓ Pipeline proven reliable |
| Imperative AGENT.md instructions | Advisory language ~50% reliability; imperative produces consistent invocations | ✓ TEST-02 satisfied |
| SHA-based zero-commit PR guard | Safer than git status with shallow clones | ✓ Prevents empty PRs |
| 30-min hardcoded timeout | Simpler for 2 instances, not configurable | ✓ Prevents runner lock-up |
| Artifact-based failure stage detection | Checks presence of preflight.md/claude-output.jsonl to infer stage | ✓ Accurate categorization |
| CLAUDE.md injection at entrypoint side | Fresher than Event Handler pre-fetch; 8k char cap prevents context bloat | ✓ Smart prompts working |
| GSD hint defaults to 'quick' | Upgrades to 'plan-phase' on complexity keywords | ✓ Routing appropriate |
| job_outcomes with UUID PK | Allows multiple outcomes per job; TEXT column for changedFiles | ✓ Persistence working |
| Thread-scoped prior context lookup | Filters by thread_id for instance isolation, merge_result='merged' gate | ✓ Warm starts working |
| failure_stage in summarizeJob userMessage | Uses existing .filter(Boolean) pattern; no system prompt change needed | ✓ Stage surfaced |
| Cross-repo notification from entrypoint directly | notify-pr-complete.yml cannot observe events in foreign repos | ✓ Notifications firing |
| SOUL.md/AGENT.md baked into Docker image /defaults/ | Cross-repo working tree has no ClawForge config | ✓ System prompt present for cross-repo jobs |
| gh auth setup-git for all clones | PAT never interpolated into clone URLs (Actions log exposure risk) | ✓ No PAT leakage |
| Job branches always live in clawforge | on:create trigger constraint; target.json sidecar carries target metadata | ✓ Clean separation |
| WORK_DIR defaults to /job, set to /workspace only when target.json detected | 100% backward compat for same-repo jobs | ✓ Zero regression |
| DB overlay fires only when jobId provided AND filteredRuns.length === 0 | Live path fully unchanged for in-progress jobs | ✓ getJobStatus() accurate |
| Cross-repo PRs notify at PR creation, same-repo at merge | Semantic difference surfaces in UX language ("open for review" vs "merged") | ✓ Language differentiated |

| Template substitution in JS, not in prompt | Container agent receives exact file content; LLM doesn't interpret template syntax | ✓ Reliable artifact generation |
| Blocked-paths before ALLOWED_PATHS | Even ALLOWED_PATHS=/ cannot bypass instance protection | ✓ Defense in depth |
| --body-file for PR creation | Shell variable expansion corrupts backticks in operator checklists | ✓ Robust PR bodies |
| LLM behavior via EVENT_HANDLER.md injection | No code change needed for intake flow adjustments | ✓ Flexible intake |
| get_project_state via GitHub Contents API | Layer 1 gets project awareness without filesystem access | ✓ Informed dispatching |

| dockerode@^4.0.9 for Docker Engine API | Battle-tested, stream demuxing, socket-based | ✓ Reliable container lifecycle |
| Docker-first dispatch default | getDispatchMethod defaults to 'docker' when no explicit field | ✓ Faster job starts |
| waitAndNotify as detached async | Avoids blocking tool response; fire-and-forget pattern | ✓ Non-blocking dispatch |
| Notification dedup via isJobNotified | Docker inline + Actions webhook can both fire; early-return prevents double notification | ✓ Single notification |
| Docker socket read-only mount | Event handler gets :ro socket access for security | ✓ Minimal privilege |
| Named volume per repo per instance | `clawforge-{instance}-{slug}` convention; flock mutex for concurrent safety | ✓ Warm starts working |
| STATE.md 4K / ROADMAP.md 6K char caps | Prevents context bloat in job prompts | ✓ Balanced context budget |
| Context hydration gated on GSD_HINT | Quick jobs get lean prompts; complex jobs get full context | ✓ Appropriate scoping |

| Workspace volumes use `clawforge-ws-` prefix | Avoids collision with job volumes (`clawforge-`); separate lifecycle | ✓ Clean separation |
| No Chrome deps or /defaults/ in workspace image | Terminal-only interactive use; keeps image lean | ✓ Fast image builds |
| Git auth duplicated from job entrypoint | Independent layers; workspace and job entrypoints evolve separately | ✓ No coupling |
| Destroy keeps DB record (status=destroyed) | Audit trail preserved; destroyed workspaces visible in history | ✓ Traceable lifecycle |
| Custom HTTP server wraps Next.js for WS upgrade | Intercepts upgrade events before Next.js handler; PM2 runs server.js | ✓ WebSocket routing works |
| Tickets in-memory Map (not DB) | Ephemeral by design with 30s TTL; no persistence needed | ✓ Fast validation |
| Binary frame relay to ttyd | Preserves ttyd wire protocol without re-encoding overhead | ✓ Terminal responsive |
| Server Actions for browser-to-Docker operations | Follows project convention: browser uses Server Actions, API routes for external callers | ✓ Consistent pattern |
| Inactive terminal tabs use display:none | Preserves xterm state instead of unmounting/remounting | ✓ Tab switching instant |
| Dynamic import inside async tool body | Avoids circular dependency (agent.js ↔ tools.js) | ✓ Clean module graph |
| Chat context JSON-encoded, 20KB cap | Handles newlines/special chars in Docker env vars; prevents oversized env | ✓ Reliable injection |
| closeWorkspace delegates to stopWorkspace | Non-running workspaces handled gracefully without duplicate status checks | ✓ Robust close path |
| notifyWorkspaceEvent is module-local | Only closeWorkspace and reconcile/idle paths call it; not exposed to external callers | ✓ Controlled notification |
| Cherry-pick upstream via 3 waves (v2.1) | ~60-70% code divergence makes full sync infeasible; wave approach manages risk | ✓ v2.1 complete — all 3 waves shipped |
| Keep dockerode, never adopt upstream raw http | dockerode is battle-tested with stream demuxing; upstream raw http is 472 lines of manual HTTP | ✓ Architecture decision |
| Keep Node crypto, never adopt libsodium | Already using AES-256-GCM; no reason to add native dependency | ✓ Architecture decision |
| Convert thepopebot/* imports to relative | ClawForge uses relative imports; upstream NPM package imports break in our fork model | ✓ All imports converted in v2.1 |
| AssemblyAI for voice (not OpenAI Whisper) | Direct browser-to-service streaming; no server-side audio storage needed | ✓ Voice input working |
| crypto.js reads AUTH_SECRET from process.env | Avoids circular dependency with getConfig in config system | ✓ Clean module graph |
| AdminLayout uses sidebar (not tabs) | Scales to 6+ sub-pages without horizontal overflow | ✓ Clean admin navigation |
| githubApiRaw for 204 responses | PUT/DELETE endpoints return no body; separate helper avoids modifying shared githubApi | ✓ Secrets CRUD working |
| AudioWorklet processor as static file in public/ | Cannot be bundled by esbuild; must be loaded as separate worker script | ✓ Voice capture working |
| activeTabId replaces activeTabIndex | String-based tab identity survives DnD reorders without index confusion | ✓ Tab tracking stable |
| Conditional tool registration via spread | `...(env.KEY ? [tool] : [])` keeps agent tools array clean when optional services unavailable | ✓ web_search gated on BRAVE_API_KEY |
| Gate state stored in /tmp/gate_pass file | Bash subshell scope loss prevents variable propagation; file check is portable | ✓ Gate detection reliable |
| Self-correction hard-limited to 1 retry | Prevents infinite loops on unfixable issues; 2 total attempts maximum | ✓ GATE_ATTEMPT counter enforced |
| Merge policy reads first non-auto policy from REPOS.json | Jobs target one repo per instance; simple resolution sufficient | ✓ Per-repo policies working |
| Docker stdout scanning for gate failure | Container filesystem not accessible post-exit; [GATE] FAILED marker in stdout | ✓ Docker path detection working |
| JOB_ID passed via env var to node scripts | Avoids shell quoting issues in inline GitHub Actions script | ✓ Clean parameter passing |
| ESM top-level import for diff2html | Project uses type:module; require() would fail | ✓ Diff rendering working |
| terminalSessionIdRef (useRef) for session tracking | Prevents transport re-creation when terminalSessionId changes; useMemo reads latest value | ✓ Stable transport lifecycle |
| Custom terminalFetch wrapper for header interception | useChat from @ai-sdk/react lacks onResponse callback; wrapper intercepts X-Terminal-Session-Id | ✓ Session ID propagation working |
| Repos stored as JSON array in settings table | type=repos, key=all — lazy file-to-DB migration for backward compatibility | ✓ DB-backed repo CRUD working |
| CONFIG_ALLOWLIST for updatable keys | Only allowlisted config keys updatable via updateConfigAction; secrets masked to last 4 chars | ✓ Safe config editing |
| API proxy pattern for superadmin | Hub queries child instances via HTTP with Bearer token, not shared DB | ✓ Cross-instance queries working |
| queryAllInstances uses Promise.allSettled | Graceful partial results when instances are offline | ✓ Resilient dashboard |
| Superadmin routes bypass x-api-key validation | Own Bearer token validation via AGENT_SUPERADMIN_TOKEN; separate auth path | ✓ M2M auth working |

- Instance updates/deletion — define creation first, update flows are additive complexity
- Automated deployment — security-sensitive; human review via PR is the right gate
- GitHub secrets auto-provisioning — requires broader infrastructure permissions than appropriate
- Slack app auto-creation — Slack API limitations; manual setup is acceptable

---
*Last updated: 2026-03-17 — v3.0 Customer Launch milestone started*
