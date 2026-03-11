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

### Top Lessons (Verified Across Milestones)

1. **Template sync matters** — v1.1 established it, v1.3 proved it when entrypoint drift caused a real bug (DELIV-01)
2. **Imperative instructions > advisory** — v1.0 lesson, reinforced in v1.3 intake flow (MUST/NEVER language in EVENT_HANDLER.md)
3. **Audit early, fix early** — v1.3 lesson, v1.4 proved it: mid-milestone audit caught 3 integration gaps, Phase 21 closed them cleanly
4. **Direct API > CI wrappers for speed** — v1.4 lesson; Docker Engine API eliminated 50s of CI queue overhead per job
5. **Study upstream protocols before proxying** — v1.5 lesson; ttyd binary protocol required 5 debug commits to get right. Unit tests pass but protocol-level integration needs real testing
