# ClawForge — Secure Claude Code Agent Gateway

## What This Is

A multi-channel AI agent platform that connects Claude Code CLI to messaging channels (Slack, Telegram, Web Chat) with strict Docker isolation between instances. Two-layer architecture: Event Handler (LangGraph ReAct agent) dispatches headless jobs to ephemeral Docker containers and persistent interactive workspaces with browser terminals. Agents receive structured prompts with full repo context and prior job history, then operate on any allowed target repo — creating PRs, committing changes, and surfacing results back to the operator. Operators can also launch persistent workspace containers with ttyd/tmux browser terminals for interactive coding sessions, with bidirectional context bridging between chat and workspace.

## Core Value

Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results without operator intervention.

## Current State (after v1.5)

**Shipped:** v1.0 Foundation + v1.1 Agent Intelligence + v1.2 Cross-Repo + v1.3 Instance Generator + v1.4 Docker Engine Foundation + v1.5 Persistent Workspaces
**Codebase:** ~23,600 LOC JavaScript (Next.js + LangGraph + Drizzle ORM + dockerode + ws + xterm.js)
**Instances:** 2 (Noah/Archie — full access, StrategyES/Epic — scoped to strategyes-lab)

**What works:**
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
- VERIFICATION-RUNBOOK.md: operator-executable checklist for 5 regression scenarios (S1-S5)
- All templates byte-for-byte synced with live files
- **Instance creation via conversation**: multi-turn intake → approval → job dispatch → PR with 7 artifacts + operator setup checklist
- **Auto-merge exclusion**: instance PRs blocked from auto-merge regardless of ALLOWED_PATHS
- **Layer 1 context hydration**: `get_project_state` tool fetches STATE.md + ROADMAP.md from target repos via GitHub API
- **Persistent workspaces**: workspace Docker image (ttyd 1.7.7 + tmux + Claude Code CLI), full container lifecycle (create/stop/start/destroy/auto-recover), idle timeout, max concurrent limits
- **Browser terminal**: custom HTTP server wraps Next.js for WebSocket upgrade interception, ticket-based auth (single-use, 30s TTL), xterm.js with multi-tab tmux sessions (ports 7681-7685)
- **Conversational workspace launch**: `start_coding` and `list_workspaces` LangGraph tools, chat context injected as CHAT_CONTEXT env var (20KB cap)
- **Bidirectional context bridging**: conversation history flows into workspace on start, commits surfaced back into chat thread on close
- **Workspace event notifications**: crash, recovery, idle-stop events routed to operator's channel via Slack/Telegram with LangGraph memory injection

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

### Active

## Current Milestone: v2.0 Full Platform

**Goal:** Transform ClawForge from a CLI-driven agent gateway into a full-featured agent platform with web UI, multi-agent clusters, headless streaming, and per-instance MCP tool configs — cherry-picking from PopeBot upstream (v1.2.73) without compromising multi-tenant architecture.

**Target features:**
- Web UI with chat interface, code mode toggle, repo/branch selector, DnD tabs
- Multi-agent clusters with role-based teams and label-based state machine routing
- Headless job streaming with live log output to chat UI
- Per-instance MCP server configs with curated tool subsets

**Use cases:** Noah's own products, Epic development for CCP projects

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
- **v2.0 Full Platform** — Web UI, Clusters, Headless Streaming, MCP Tool Layer (cherry-picked from PopeBot upstream)
- **v2.1 Smart Execution** — Pre-CI quality gates, test feedback loops, merge policies (Stripe deterministic interleaving)

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

- Instance updates/deletion — define creation first, update flows are additive complexity
- Automated deployment — security-sensitive; human review via PR is the right gate
- GitHub secrets auto-provisioning — requires broader infrastructure permissions than appropriate
- Slack app auto-creation — Slack API limitations; manual setup is acceptable

---
*Last updated: 2026-03-11 after v1.5 milestone*
