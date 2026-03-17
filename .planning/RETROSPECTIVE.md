# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.3 — Instance Generator

**Shipped:** 2026-03-06
**Phases:** 7 | **Plans:** 9

### What Was Built
- Conversational instance creation: multi-turn intake with grouped questions, approval gate, cancellation protocol
- `buildInstanceJobDescription()` generating all 7 instance artifacts with literal JS template substitution
- Auto-merge exclusion for instance PRs (blocked-paths defense layer)
- `--body-file` PR creation for robust long PR bodies
- `get_project_state` LangGraph tool for Layer 1 project awareness via GitHub Contents API
- E2E validation script verifying the full pipeline from conversation to PR artifacts

### What Worked
- **EVENT_HANDLER.md as behavior control**: Multi-turn intake flow implemented entirely via LLM instructions, zero code changes for conversational behavior
- **Gap closure phases (16.1, 17.1)**: Milestone audit caught real integration gaps (entrypoint sync, Layer 1 context), decimal phases fixed them cleanly
- **Template substitution in JS, not in prompt**: Container agents receive exact file content — no LLM interpretation of template syntax means reliable artifact generation

### What Was Inefficient
- **8 requirements lack formal VERIFICATION.md** for phases 14/15 — code works (E2E passed) but verification gap accumulated because phases were executed before the verification workflow was consistently applied
- **Audit came late** — running the milestone audit earlier would have caught the entrypoint sync gap sooner
- **Phase 17.2 scoped but not needed for v1.3** — Layer 2 context hydration was aspirational; should have been scoped to v1.4 from the start

### Patterns Established
- `--body-file` over inline `--body` for all PR creation (preserves markdown formatting)
- Blocked-paths check runs before ALLOWED_PATHS in auto-merge (defense in depth)
- `fetchRepoFile()` pattern for raw GitHub Contents API access (bypasses githubApi wrapper for text files)
- Literal template embedding for safety-critical sections (tool casing, REPOS.json schema)

### Key Lessons
1. **Run milestone audit mid-milestone, not at the end** — integration gaps are cheaper to fix when caught between phases
2. **VERIFICATION.md should be non-negotiable** — the E2E test covered it, but formal phase verification creates a paper trail that matters for confidence
3. **Scope aggressively** — Phase 17.2 should never have been in v1.3; context hydration for Layer 2 is a separate concern from instance generation

### Cost Observations
- Model mix: ~90% sonnet (executors/verifiers), ~10% opus (orchestration)
- Notable: Single-plan phases (13, 15, 16, 16.1, 17, 17.1) executed fastest — minimal wave coordination overhead

---

## Milestone: v1.4 — Docker Engine Foundation

**Shipped:** 2026-03-08
**Phases:** 4 | **Plans:** 8

### What Was Built
- Docker Engine API dispatch via dockerode: containers start in ~9s vs ~60s via GitHub Actions
- Layer 2 context hydration: STATE.md (4K cap), ROADMAP.md (6K cap), and last 10 git commits injected into job prompts
- AGENT_QUICK.md variant for simple jobs with fallback chain (instance → defaults → full AGENT.md)
- Dual-path dispatch routing: REPOS.json `dispatch` field controls Docker vs Actions per repo
- Named volumes (`clawforge-{instance}-{slug}`) with warm/cold start detection and flock mutex
- Orphan container reconciliation on Event Handler restart via container labels
- Integration wiring: `addToThread` for Docker memory, `inspectJob` in status tool, AGENT_QUICK.md in Docker image

### What Worked
- **Milestone audit mid-milestone**: Ran audit after Phase 20, caught 3 integration gaps (addToThread, AGENT_QUICK.md defaults, inspectJob wiring). Phase 21 closed them all cleanly — v1.3 lesson applied successfully
- **Docker-first default**: `getDispatchMethod` defaults to 'docker' when no explicit field — simple decision that made the upgrade path seamless
- **Schema .default() for zero-migration**: New DB columns with defaults meant no migration step, instant backward compat
- **GSD_HINT gating**: Single flag controls prompt size — quick jobs stay lean, complex jobs get full context

### What Was Inefficient
- **Phase 21 was reactive**: Integration gaps should have been caught during Phase 19/20 planning, not after a separate audit pass
- **Named volume concurrency testing was theoretical**: flock mutex logic was verified by code review, not by actual concurrent job execution

### Patterns Established
- Container labels (`clawforge=job` + metadata) for lifecycle management instead of DB-only tracking
- `waitAndNotify` as detached async with `.catch(() => {})` for fire-and-forget notification
- Notification dedup via `isJobNotified` early-return (Docker inline + Actions webhook can both fire)
- Docker socket read-only mount (`:ro`) for security — event handler gets minimal privilege
- Volume naming convention: `clawforge-{instance}-{slug}` for deterministic, instance-scoped volumes
- Char caps on context injection (STATE.md 4K, ROADMAP.md 6K) to prevent prompt bloat

### Key Lessons
1. **Docker API > GitHub Actions for speed**: 9s vs 60s is a 6.7x improvement. Direct API calls eliminate CI queue overhead entirely
2. **Audit early pays off**: v1.3 lesson proved correct — mid-milestone audit caught real gaps that would have been tech debt otherwise
3. **Fire-and-forget patterns need dedup**: When multiple paths can trigger the same notification, build in idempotency from the start
4. **Warm starts compound**: Named volumes + shallow fetch + flock mutex = 2-3s repo setup on repeat jobs vs 10-15s clone

### Cost Observations
- Model mix: ~90% sonnet (executors/verifiers), ~10% opus (orchestration)
- Fastest milestone yet: 3 days for 4 phases, 8 plans — benefited from established patterns and tooling

---

## Milestone: v1.5 — Persistent Workspaces

**Shipped:** 2026-03-11
**Phases:** 3 | **Plans:** 7

### What Was Built
- Workspace Docker image with ttyd 1.7.7 + tmux + Claude Code CLI, full container lifecycle (create/stop/start/destroy/auto-recover), idle timeout, and max concurrent limits
- Custom HTTP server wrapping Next.js with ticket-based WebSocket auth (single-use, 30s TTL) and bidirectional binary proxy to ttyd inside containers
- xterm.js browser terminal with multi-tab tmux sessions (ports 7681-7685), resize/reconnect, and git safety warnings on workspace close
- `start_coding` and `list_workspaces` LangGraph tools for conversational workspace launch from Slack/Telegram
- Bidirectional context bridging: chat history injected as CHAT_CONTEXT env var (20KB cap) on start, commits surfaced back into thread on close
- Workspace event notifications (crash, recovery, idle-stop) routed to operator's channel via Slack/Telegram with LangGraph memory injection

### What Worked
- **Server Actions for browser-to-Docker**: Followed project convention cleanly — browser UI uses Server Actions, API routes reserved for external callers. Made the terminal page clean to implement
- **Binary frame relay**: Preserving ttyd's wire protocol without re-encoding kept terminal performance snappy and avoided charset bugs
- **In-memory ticket auth**: Map with 30s TTL is the right abstraction for ephemeral WebSocket tokens — no DB overhead, no stale ticket cleanup needed
- **Separate workspace image**: No Chrome deps, no PostToolUse hooks, no /defaults/ folder — clean separation from job containers kept image lean and purpose-built

### What Was Inefficient
- **WebSocket debugging took multiple commits**: ttyd binary protocol (auth token handshake, data framing) required iterative fixes — 5 debug commits before the proxy worked correctly
- **No integration test for WebSocket path**: The ticket-auth unit test passed, but the full upgrade→proxy→ttyd chain was only tested manually on the VPS
- **Phase 23 had the most post-plan bug fixes**: WebSocket close code sanitization, auth token handshake — all discovered in production testing

### Patterns Established
- Custom server.js wrapping Next.js for protocol-level interception (WebSocket upgrades routed before Next.js handler)
- Ticket auth flow: Server Action issues ticket → client adds to WS URL → server validates on upgrade → single-use enforcement
- `display:none` for inactive terminal tabs (preserves xterm state without unmount/remount cycle)
- Dynamic import inside async tool body to break circular module dependencies (agent.js ↔ tools.js)
- Module-level `execCollect` helper for Docker exec stream collection (strip mux headers, return clean output)
- Fire-and-forget notification with `.catch(() => {})` extended to workspace events (consistent with job notification pattern from v1.4)

### Key Lessons
1. **Wire protocol compatibility is non-negotiable**: ttyd speaks a specific binary protocol (auth token byte, data prefix byte). Treating WebSocket frames as plain text caused silent failures — always study upstream protocol before proxying
2. **Manual VPS testing catches what unit tests miss**: The ticket auth unit test passed, but the full WebSocket upgrade chain only worked after 3 iterations on the real server. Consider lightweight integration tests for protocol-level features
3. **Workspace containers are fundamentally different from job containers**: Long-running (PID 1 is ttyd), interactive (no automated prompt), persistent state (volumes survive restarts). The separate Docker image decision was correct — sharing a base with job containers would have created unnecessary coupling
4. **Context bridging is the killer feature**: Chat context injection + commit surfacing makes workspaces feel like a natural extension of conversation, not a separate tool

### Cost Observations
- Model mix: ~90% sonnet (executors/verifiers), ~10% opus (orchestration)
- Fastest per-phase execution: 2-4 min per plan — mature GSD patterns + established codebase conventions eliminated planning overhead
- 3 days for 3 phases, 7 plans — consistent with v1.4 pace

---

## Milestone: v2.0 — Full Platform

**Shipped:** 2026-03-12
**Phases:** 4 | **Plans:** 14

### What Was Built
- Headless log streaming: SSE endpoint with Docker log streaming, Slack edit-in-place status updates every 10s, semantic event filtering (file mods, bash outputs, key decisions)
- Web UI auth + repo selector: NextAuth session auth on Server Actions, repo/branch persistent dropdown, feature flags system (FeaturesContext), live job streaming inline in chat
- MCP tool layer: per-instance MCP_SERVERS.json, template variable resolution (`{{AGENT_LLM_*}}`), `--mcp-config` flag injection, tool subset curation, pre-run context hydration
- Multi-agent clusters: CLUSTER.json definition, sequential Docker dispatch, shared volume communication (inbox/outbox/reports), label-based state machine, hard iteration limits (5/agent, 15/run), cluster Slack thread notifications

### What Worked
- **14 plans in 1 day**: Largest plan count per day in project history — mature GSD patterns + established codebase conventions made execution mechanical
- **SSE over WebSocket for log streaming**: Simpler than WebSocket, auto-reconnect for free, works through proxies. The v1.5 WebSocket debugging pain informed this decision
- **FeaturesContext pattern**: React context + Server Action toggle enables per-instance feature gating without code deploys — cleanly separated from env vars
- **Shared volume communication for clusters**: Filesystem-based inbox/outbox avoids tight coupling between agents — each agent is still a sniper (reads inbox, writes outbox, exits)

### What Was Inefficient
- **35 requirements defined after phases were planned**: Requirements were formalized retroactively for traceability — ideally they'd exist before phase planning
- **MCP credential handling required 2 iterations**: First approach embedded secrets in MCP_SERVERS.json, second properly used template variables resolved from env at container start

### Patterns Established
- SSE endpoint pattern for real-time streaming (reusable for any future live-update feature)
- `executeAction()` with action type routing (job/cluster/workspace) — single dispatch point for all container operations
- Label-based state machine for multi-agent coordination (emit label → route to next agent)
- `--allowedTools` whitelist per cluster role — zero instances of `--dangerously-skip-permissions`
- Cluster Slack thread: one message per run, agent updates as replies (not per-agent channels)

### Key Lessons
1. **SSE > WebSocket for one-directional streams**: Log streaming is read-only from client perspective. SSE is simpler, more reliable through infrastructure, and auto-reconnects
2. **Multi-agent coordination needs hard limits**: Without iteration caps and cycle detection, label-based routing can loop infinitely. 5/agent + 15/run caps are cheap insurance
3. **Shared volumes beat direct messaging**: Agents writing files to a shared volume is more debuggable and less coupled than agent-to-agent messaging
4. **Requirements-first would have caught MCP credential issue earlier**: Writing requirements before phase planning forces you to think about security boundaries upfront

### Cost Observations
- Model mix: ~90% sonnet (executors/verifiers), ~10% opus (orchestration)
- 14 plans in 1 day — highest throughput milestone, enabled by mature process and zero novel infrastructure patterns

---

## Milestone: v2.1 — Upstream Feature Sync

**Shipped:** 2026-03-13
**Phases:** 10 | **Plans:** 12
**Files changed:** 192 (+26,282 / -520)

### What Was Built
- DB-backed config system: AES-256-GCM encryption, SQLite config table, `getConfig`/`setConfig` API, LLM provider listing
- Three new pages: Pull Requests (approve/reject), Runners status, Profile — plus sidebar navigation with PR badge count
- Chat enhancements: Shiki syntax highlighting via @streamdown/code, interactive mode toggle routing headless vs workspace
- Role-based access control: admin/user roles, middleware guards on /admin/*, forbidden page, conditional sidebar navigation
- Admin panel restructure: /settings/ → /admin/* migration with sidebar layout, users CRUD, webhooks display, backwards-compatible redirects
- GitHub secrets management: sealed-box encryption for GitHub API, CRUD UI with masked values, AGENT_* prefix enforcement
- Voice input: AssemblyAI v3 real-time streaming via AudioWorklet, volume bars, zero server-side audio storage
- Code Workspaces V2: DnD tabs (@dnd-kit), xterm addon-search/web-links/serialize, file tree sidebar with polling
- Cluster detail views: /cluster/[id] overview + console (SSE streaming) + logs (persisted) + role detail pages
- Developer experience: web_search LangGraph tool (Brave API), CLI commands (create-instance, run-job, check-status)

### What Worked
- **Cherry-pick strategy in 3 waves**: Wave 1 (UI additions) → Wave 2 (auth/admin) → Wave 3 (advanced features) kept dependency order clean. No phase had to reach back into a previous wave
- **10 phases in 1 day**: Each phase was self-contained with clear boundaries — no cross-phase dependencies within the milestone
- **Divergence decisions upfront**: Documenting where ClawForge diverges from upstream (dockerode vs raw http, Node crypto vs libsodium, xterm v6 vs v5, AssemblyAI vs Whisper) before starting prevented mid-phase confusion
- **Relative import conversion**: Blanket rule to convert all `thepopebot/*` package imports to relative imports eliminated an entire class of build errors
- **crypto.js reading AUTH_SECRET from process.env**: Avoided circular dependency with getConfig — simple decision that prevented a debugging session

### What Was Inefficient
- **192 files changed in 1 day**: While throughput was high, the blast radius means any subtle bug is hard to bisect. Smaller milestones with deployment gates between phases would improve debuggability
- **Some phases had minimal adaptation**: Phases like 30 (new pages) and 31 (chat enhancements) were near-direct cherry-picks — could have been batched into fewer, larger phases
- **Cluster UI duplicated utility functions**: StatusBadge, timeAgo, formatTs duplicated across cluster pages because the existing clusters-page doesn't export them. Should have extracted to shared utils first

### Patterns Established
- `crypto.js` reads encryption key directly from `process.env.AUTH_SECRET` (not via config layer) to break circular deps
- `githubApiRaw` helper for PUT/DELETE 204 responses (separate from shared `githubApi` that expects JSON)
- AdminLayout with sidebar navigation (not tabs) for scalability with 6+ sub-pages
- AudioWorklet processor as static file in `public/` (cannot be bundled by Next.js)
- `activeTabId` (string) over `activeTabIndex` (number) so tab identity survives DnD reorders
- Conditional tool registration via env check (`if (process.env.BRAVE_API_KEY)`)
- `ghsec:` prefix in config_secret table for namespaced secret storage

### Key Lessons
1. **Cherry-picking requires a divergence map**: Documenting ClawForge-specific systems before starting the cherry-pick prevented overwriting critical infrastructure (dockerode, MCP, cluster coordinator, SSE streaming)
2. **Wave-based ordering prevents dependency tangles**: UI additions before auth before advanced features meant each wave could assume the previous wave's infrastructure
3. **Static files for Web Workers/AudioWorklets**: Next.js bundling doesn't support Worker module imports — static files in `public/` is the correct pattern, not a workaround
4. **Utility duplication signals missing shared module**: Three cluster pages duplicating the same 3 functions is a clear sign to extract to `lib/cluster/utils.js` in a future cleanup
5. **Single-day milestones trade debuggability for speed**: 192 files in one day means git bisect is essentially useless within the milestone. Consider deployment checkpoints between waves

### Cost Observations
- Model mix: ~90% sonnet (executors/verifiers), ~10% opus (orchestration)
- Highest file count (192) and LOC delta (+26,282) of any milestone — cherry-pick workflow amplifies throughput when source code already exists
- 10 phases, 12 plans in 1 day — 2x the phase count of v2.0 but similar wall-clock time due to simpler per-phase scope

---

## Milestone: v2.2 — Smart Operations

**Shipped:** 2026-03-17
**Phases:** 4 | **Plans:** 8
**Files changed:** 89 (+12,008 / -1,679)

### What Was Built
- Smart execution: configurable quality gates (lint/typecheck/test) in entrypoint.sh with self-correction loop (max 1 retry via GATE_ATTEMPT counter) and per-repo merge policies (auto/gate-required/manual) in REPOS.json
- Job control UI: cancelJob/retryJob Server Actions with DockerJobsList component, admin role-gated Cancel/Retry buttons on Swarm page
- Embedded Claude Code terminal chat: Agent SDK streaming via UIMessageStream, live tool call visualization (TerminalToolCall), unified diff rendering (diff2html DiffView), collapsible ThinkingPanel, per-turn CostDisplay, shell mode toggle
- Admin operations: DB-backed repo CRUD (settings table JSON storage with lazy file-to-DB migration), platform config editing with CONFIG_ALLOWLIST, instance management page
- Cross-instance superadmin portal: single-login instance switching, health dashboard with 30s auto-refresh, cross-instance job search via API proxy with Promise.allSettled, AGENT_SUPERADMIN_TOKEN for M2M auth
- Three-tier role system: user → admin → superadmin with separate auth paths for web sessions vs API proxy

### What Worked
- **terminalSessionIdRef pattern**: useRef tracks session ID alongside state so transport useMemo reads latest value without adding terminalSessionId as dependency — prevents unnecessary transport re-creation cycles
- **Custom terminalFetch wrapper**: useChat from @ai-sdk/react doesn't expose onResponse callback, so intercepting X-Terminal-Session-Id header required a custom fetch wrapper. Clean solution to SDK limitation
- **Promise.allSettled for cross-instance queries**: Graceful partial results when instances are offline — superadmin dashboard stays usable even with degraded instances
- **CONFIG_ALLOWLIST pattern**: Only allowlisted keys updatable via updateConfigAction, secrets masked to last 4 chars — simple security boundary that prevents config key injection
- **Gate state in /tmp/gate_pass file**: Avoided bash subshell scope loss for variable propagation; file-based check is portable across all execution contexts

### What Was Inefficient
- **Phase 41 was the largest (3 plans, 8 requirements)**: Terminal chat touched every layer (DB schema, session manager, SDK bridge, transport, components, chat integration). Could have been split more granularly to reduce per-plan complexity
- **Docker stdout scanning for gate failures**: Container filesystem not accessible post-exit, requiring [GATE] FAILED marker scanning in stdout. A more structured exit code convention would be cleaner
- **Dual transport pattern adds complexity**: Chat mode and terminal mode use different streaming transports but share the same chat UI — mode switching logic spread across multiple components

### Patterns Established
- Three-tier role system (user/admin/superadmin) with separate auth validation per tier
- API proxy pattern for cross-instance communication (Bearer token, not shared DB)
- Settings table as JSON document store (type + key → JSON value) for structured config like repos
- CONFIG_ALLOWLIST for safe web-editable config keys with secret masking
- useRef for tracking IDs that inform useMemo without triggering re-creation
- Custom fetch wrapper pattern for SDK header interception
- Gate state via filesystem (/tmp/gate_pass) to avoid bash scope issues

### Key Lessons
1. **SDK limitations require creative workarounds**: @ai-sdk/react's useChat lacks onResponse callback, forcing the custom terminalFetch wrapper. When choosing SDKs, evaluate the escape hatches, not just the happy path
2. **File-based state beats shell variables in containers**: /tmp/gate_pass is more reliable than environment variables or shell subshell scope for cross-function state in entrypoint scripts
3. **Promise.allSettled is essential for multi-instance dashboards**: One offline instance shouldn't break the entire superadmin view — allSettled with error-per-instance is the right default
4. **Three-tier auth scales cleanly**: user → admin → superadmin maps naturally to read → write → cross-instance, with each tier adding one capability layer

### Cost Observations
- Model mix: ~90% sonnet (executors/verifiers), ~10% opus (orchestration)
- 2-day milestone (4 phases, 8 plans) — consistent with recent velocity
- Phase 41 (terminal chat) was the most complex single phase in v2.2 with 3 plans and 8 requirements

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 4 | 6 | Foundation — established GSD-in-Docker pattern |
| v1.1 | 4 | 7 | Pipeline hardening — smart prompts, prior context |
| v1.2 | 4 | 10 | Cross-repo — largest plan count, most complex wiring |
| v1.3 | 7 | 9 | Instance generator — first milestone with gap closure phases |
| v1.4 | 4 | 8 | Docker Engine Foundation — fastest milestone (3 days), mid-milestone audit |
| v1.5 | 3 | 7 | Persistent Workspaces — first interactive feature, WebSocket protocol layer |
| v2.0 | 4 | 14 | Full Platform — SSE streaming, MCP tools, multi-agent clusters, highest plans/day |
| v2.1 | 10 | 12 | Upstream Feature Sync — cherry-pick from upstream, 192 files in 1 day, highest LOC delta |
| v2.2 | 4 | 8 | Smart Operations — quality gates, terminal chat, superadmin portal, three-tier auth |

### Top Lessons (Verified Across Milestones)

1. **Template sync matters** — v1.1 established it, v1.3 proved it when entrypoint drift caused a real bug (DELIV-01)
2. **Imperative instructions > advisory** — v1.0 lesson, reinforced in v1.3 intake flow (MUST/NEVER language in EVENT_HANDLER.md)
3. **Audit early, fix early** — v1.3 lesson, v1.4 proved it: mid-milestone audit caught 3 integration gaps, Phase 21 closed them cleanly
4. **Direct API > CI wrappers for speed** — v1.4 lesson; Docker Engine API eliminated 50s of CI queue overhead per job
5. **Study upstream protocols before proxying** — v1.5 lesson; ttyd binary protocol required 5 debug commits to get right. Unit tests pass but protocol-level integration needs real testing
6. **SSE > WebSocket for one-directional streams** — v2.0 lesson; simpler, auto-reconnects, works through proxies. Informed by v1.5 WebSocket debugging pain
7. **Cherry-picking requires a divergence map** — v2.1 lesson; documenting ClawForge-specific systems before cherry-pick prevented overwriting critical infrastructure
8. **Wave-based ordering prevents dependency tangles** — v2.1 lesson; UI → auth → advanced features meant each wave could assume previous infrastructure
9. **File-based state beats shell variables in containers** — v2.2 lesson; /tmp/gate_pass more reliable than environment variables for cross-function state in entrypoint scripts
10. **Promise.allSettled for multi-instance queries** — v2.2 lesson; one offline instance shouldn't break the dashboard. Error-per-instance is the right default for distributed UIs
