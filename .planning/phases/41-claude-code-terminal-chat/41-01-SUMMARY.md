---
phase: 41-claude-code-terminal-chat
plan: 01
subsystem: api
tags: [claude-agent-sdk, drizzle, sqlite, streaming, terminal, uimessagestream]

# Dependency graph
requires:
  - phase: 40-job-control-ui
    provides: auth patterns, requireAdmin pattern, DB getDb() pattern, UIMessageStream pattern from lib/chat/api.js
provides:
  - terminalSessions and terminalCosts Drizzle table definitions in lib/db/schema.js
  - In-memory session registry with 30-min TTL (lib/terminal/session-manager.js)
  - Agent SDK to UIMessageStream writer bridge (lib/terminal/sdk-bridge.js)
  - Cost persistence for SDKResultMessage usage (lib/terminal/cost-tracker.js)
  - POST /stream/terminal route handler (lib/chat/terminal-api.js)
affects: [41-02, 41-03, any plan using terminal sessions or cost data]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/claude-agent-sdk"]
  patterns:
    - "Agent SDK query() AsyncGenerator consumed via for-await-of loop"
    - "SDKMessage events translated to UIMessageStream writer protocol"
    - "In-memory session registry with TTL for follow-up injection (TERM-04)"
    - "getDb() called at call-site (not module-level) for SQLite thread safety"

key-files:
  created:
    - lib/terminal/session-manager.js
    - lib/terminal/sdk-bridge.js
    - lib/terminal/cost-tracker.js
    - lib/chat/terminal-api.js
    - drizzle/0007_terminal_sessions.sql
  modified:
    - lib/db/schema.js
    - package.json
    - drizzle/meta/_journal.json

key-decisions:
  - "requireAdmin inlined in terminal-api.js via session.user.role check (not imported from chat/actions.js where it is private)"
  - "getDb() called at call-site within execute/onError callbacks, not captured at module scope — matches existing codebase pattern"
  - "Migration numbered 0007 (not 0010 as in plan) — plan misnumbered; actual next index was 7"
  - "sdk-bridge handles tool_result blocks by emitting tool-output-available (covers multi-turn tool results in message content)"

patterns-established:
  - "Pattern: bridgeSDKToWriter(queryIterator, writer, sessionId) — reusable SDK-to-writer bridge"
  - "Pattern: registerSession + removeSession wrapping Agent SDK query in execute callback"
  - "Pattern: getDb() called per-operation within streaming callbacks to avoid stale reference"

requirements-completed: [TERM-01, TERM-05, TERM-06]

# Metrics
duration: 20min
completed: 2026-03-17
---

# Phase 41 Plan 01: Backend Streaming Pipeline Summary

**Agent SDK streaming pipeline with SQLite cost tracking, session registry TTL, and /stream/terminal POST route mirroring the existing UIMessageStream chat transport**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-17T02:15:00Z
- **Completed:** 2026-03-17T02:35:09Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `terminalSessions` and `terminalCosts` Drizzle tables to `lib/db/schema.js` with migration `drizzle/0007_terminal_sessions.sql`
- Created `lib/terminal/session-manager.js` with 30-minute TTL and periodic 5-minute cleanup for follow-up injection support (TERM-04)
- Created `lib/terminal/sdk-bridge.js` translating all SDKMessage types (assistant text, tool_use, tool_result, thinking, result) to UIMessageStream writer events
- Created `lib/terminal/cost-tracker.js` persisting per-turn token usage and USD cost from `SDKResultMessage` to DB (TERM-06)
- Created `lib/chat/terminal-api.js` POST handler with auth, shell mode (TERM-07), workspace volume cwd (TERM-05), session lifecycle, and `X-Terminal-Session-Id` response header
- Installed `@anthropic-ai/claude-agent-sdk` dependency

## Task Commits

Each task was committed atomically:

1. **Task 1: DB schema + session manager + cost tracker** - `59f2ffa` (feat)
2. **Task 2: SDK bridge + terminal streaming route** - `7d51520` (feat)

## Files Created/Modified
- `lib/db/schema.js` — Added `real` import, `terminalSessions`, `terminalCosts` table exports
- `lib/terminal/session-manager.js` — In-memory Map registry with 30-min TTL and periodic cleanup
- `lib/terminal/cost-tracker.js` — Extracts SDKResultMessage usage fields, persists to DB via getDb()
- `lib/terminal/sdk-bridge.js` — Translates SDKMessage AsyncGenerator events to UIMessageStream writer protocol
- `lib/chat/terminal-api.js` — POST handler for /stream/terminal: auth + admin check, session creation, Agent SDK query(), TERM-04/05/07/08 support
- `drizzle/0007_terminal_sessions.sql` — CREATE TABLE statements with indexes for terminal_sessions and terminal_costs
- `package.json` — Added @anthropic-ai/claude-agent-sdk dependency and ./chat/terminal-api export

## Decisions Made
- **requireAdmin inlined**: `requireAdmin` is a private function in `lib/chat/actions.js` and not exported. Inlined equivalent check (`session.user.role !== 'admin'`) in `terminal-api.js` rather than exporting from a new location.
- **getDb() at call-site**: SQLite `getDb()` is called per-operation inside the `execute` callback and `onError` handler rather than at module scope, consistent with how other files in the codebase handle it to avoid stale DB references.
- **Migration numbered 0007**: The plan specified `0010_` but the actual next migration index was `7` (last existing was `0006_cluster_tables`). Corrected to `0007_terminal_sessions.sql` and updated `_journal.json`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migration file number corrected from 0010 to 0007**
- **Found during:** Task 1 (DB schema + migration)
- **Issue:** Plan specified `0010_terminal_sessions.sql` but the drizzle/migrations directory only had migrations 0000–0006; next index was 7
- **Fix:** Created `drizzle/0007_terminal_sessions.sql` and updated `_journal.json` with idx 7
- **Files modified:** `drizzle/0007_terminal_sessions.sql`, `drizzle/meta/_journal.json`
- **Verification:** Migration file exists with correct SQL; journal entry added
- **Committed in:** `59f2ffa` (Task 1 commit)

**2. [Rule 1 - Bug] `import { db }` changed to `getDb()` pattern**
- **Found during:** Task 1 and Task 2
- **Issue:** Plan used `import { db } from '../db/index.js'` but `lib/db/index.js` only exports `getDb()` and `initDatabase()` — no `db` named export
- **Fix:** All DB operations use `const db = getDb()` at call-site inside callbacks
- **Files modified:** `lib/terminal/cost-tracker.js`, `lib/chat/terminal-api.js`
- **Verification:** Build passes; module imports resolve correctly
- **Committed in:** `59f2ffa`, `7d51520` (respective task commits)

**3. [Rule 1 - Bug] `requireAdmin` inlined instead of imported**
- **Found during:** Task 2 (terminal-api.js)
- **Issue:** Plan imported `requireAdmin` from `lib/auth/actions.js` but that file has no such export; `requireAdmin` is a private function in `lib/chat/actions.js`
- **Fix:** Inlined equivalent role check: `if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })`
- **Files modified:** `lib/chat/terminal-api.js`
- **Verification:** Auth logic equivalent to private `requireAdmin`; build passes
- **Committed in:** `7d51520` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs in plan code)
**Impact on plan:** All fixes were necessary for correctness; no scope creep. The plan's interface references contained minor errors that were corrected automatically.

## Issues Encountered
- `node -e "import('./lib/chat/terminal-api.js')..."` fails with `ERR_MODULE_NOT_FOUND` for `next/server` — this is expected because `terminal-api.js` imports `next-auth` which requires `next` as a peer dependency. `next` is not installed in the standalone package; it's provided by the consuming Next.js app. The same behavior exists for `lib/chat/api.js`. Build (`npm run build`) passes cleanly.

## Next Phase Readiness
- Backend streaming pipeline complete and ready for Plan 41-02 (UI components: TerminalToolCall, DiffView, ThinkingPanel) and Plan 41-03 (chat integration wiring)
- Route handler exports `POST` via `./chat/terminal-api` package export — consuming app needs `app/stream/terminal/route.js` re-export (Plan 41-03)
- No blockers

---
*Phase: 41-claude-code-terminal-chat*
*Completed: 2026-03-17*
