---
phase: 24-conversational-integration
plan: 02
subsystem: docker-workspace
tags: [docker, workspaces, notifications, slack, telegram, langchain]

# Dependency graph
requires:
  - phase: 24-01
    provides: detectPlatform export, addToThread, start_coding/list_workspaces tools
  - phase: 23-websocket-browser-terminal
    provides: workspace DB schema, stopWorkspace, checkWorkspaceGitStatus, Server Actions pattern
provides:
  - closeWorkspace exported from docker.js (stop + commit surfacing + notification)
  - getRecentWorkspaceCommits exported from docker.js
  - notifyWorkspaceEvent (module-local) routes to Slack/Telegram/LangGraph memory
  - reconcileWorkspaces now notifies on crash/recovery
  - checkIdleWorkspaces now collects commits and notifies on idle stop
  - closeWorkspaceAction Server Action in lib/ws/actions.js
  - workspace-terminal-page.jsx Close button fires closeWorkspaceAction before navigation
affects:
  - any workspace session closed via browser UI (now notifies originating thread)
  - reconciliation cron (crash/recovery events now visible in chat)
  - idle timeout cron (commit summary now sent on idle stop)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Module-level execCollect helper extracted from checkWorkspaceGitStatus (shared by getRecentWorkspaceCommits)
    - Fire-and-forget notification pattern: .catch(() => {}) for all workspace event notifications
    - detectPlatform routes notification to correct channel (Slack thread_ts split, Telegram chatId, LangGraph memory for web)
    - closeWorkspaceAction Server Action: auth + workspace validation, delegates to docker.js

key-files:
  created: []
  modified:
    - lib/tools/docker.js
    - lib/ws/actions.js
    - templates/app/workspace/[id]/workspace-terminal-page.jsx

key-decisions:
  - "execCollect extracted to module-level (was local inside checkWorkspaceGitStatus) to enable getRecentWorkspaceCommits reuse"
  - "closeWorkspace does not check ws.status -- delegates to stopWorkspace which handles not-running gracefully"
  - "Close Anyway modal button also fires closeWorkspaceAction (not just safe-close path) to ensure notification in all close paths"
  - "notifyWorkspaceEvent is module-local (not exported) -- only closeWorkspace and reconcile/idle paths call it"

# Metrics
duration: ~2.5min
completed: 2026-03-11
---

# Phase 24 Plan 02: Workspace Event Notifications Summary

**Workspace close, crash, recovery, and idle-stop events now surface commit history and status notifications back to originating chat threads via Slack/Telegram/LangGraph memory**

## Performance

- **Duration:** ~2.5 min
- **Started:** 2026-03-11T06:06:09Z
- **Completed:** 2026-03-11T06:08:36Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `getRecentWorkspaceCommits`: runs `git log main..HEAD --oneline` via docker exec, returns empty array on any failure
- `notifyWorkspaceEvent`: builds per-event messages ('closed', 'crashed', 'recovered', 'idle_stopped'), injects into LangGraph memory via `addToThread`, routes to Slack (thread reply) or Telegram via `detectPlatform`
- `closeWorkspace`: collects recent commits, stops container, fires notification -- all in order, notifications fire-and-forget
- `reconcileWorkspaces` Pass 1: detects `error->running` transition (container back up), sends 'recovered' notification
- `reconcileWorkspaces` Pass 2: detects 404 container (crash), sends 'crashed' notification -- natural dedup via status filter
- `checkIdleWorkspaces`: collects commits before stop, notifies 'idle_stopped' with commit list
- `closeWorkspaceAction` Server Action: auth guard, workspace existence check, delegates to `closeWorkspace`
- Browser Close button fires `closeWorkspaceAction` fire-and-forget in both safe-close and Close Anyway paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Add closeWorkspace, commit surfacing, workspace event notifications** - `22df685` (feat)
2. **Task 2: Add closeWorkspaceAction Server Action and wire browser Close button** - `b2323f8` (feat)

**Plan metadata:** *(this commit)*

## Files Created/Modified
- `lib/tools/docker.js` - Added imports (detectPlatform, addToThread), extracted execCollect to module-level, added getRecentWorkspaceCommits + notifyWorkspaceEvent + closeWorkspace, modified reconcileWorkspaces (crash/recovery), modified checkIdleWorkspaces (commit surfacing)
- `lib/ws/actions.js` - Added closeWorkspace import, added closeWorkspaceAction Server Action
- `templates/app/workspace/[id]/workspace-terminal-page.jsx` - Imported closeWorkspaceAction, wired both close paths (safe + Close Anyway) to fire before navigation

## Decisions Made
- `execCollect` extracted to module-level so `getRecentWorkspaceCommits` can reuse it without duplication
- `closeWorkspace` does not enforce status check itself -- delegates to `stopWorkspace` which handles non-running workspaces gracefully (returns ok: false)
- "Close Anyway" modal button also fires `closeWorkspaceAction`, not just the safe-close path, ensuring commits are always surfaced regardless of close path taken
- `notifyWorkspaceEvent` is module-local (not exported) -- callers are `closeWorkspace`, `reconcileWorkspaces`, and `checkIdleWorkspaces` within docker.js

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - clean interfaces from Plan 01 made integration straightforward.

## User Setup Required
None - no new environment variables or external service configuration required beyond what Plan 01 already established.

## Next Phase Readiness
- Phase 24 complete -- all INTG requirements satisfied
- Operators will receive workspace activity summaries in their originating chat thread on close, crash, recovery, and idle stop
- Commit history is surfaced so operators know what changed in a workspace session without checking the browser UI

## Self-Check: PASSED

All created/modified files verified on disk. All task commits (22df685, b2323f8) confirmed in git log.

---
*Phase: 24-conversational-integration*
*Completed: 2026-03-11*
