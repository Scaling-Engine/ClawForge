---
phase: 37-cluster-detail-views
plan: 01
subsystem: ui
tags: [react, sse, eventsource, docker-logs, drizzle, sqlite, cluster]

# Dependency graph
requires:
  - phase: 29-foundation-config
    provides: config system, cluster config loading
provides:
  - Cluster run overview page with agent timeline
  - Live console streaming page via SSE
  - Historical log viewer page with persisted logs
  - Role detail page with config display and agent history
  - Shared tab navigation across cluster detail views
  - Log persistence in clusterAgentRuns table
affects: [cluster-coordinator, admin-panel]

# Tech tracking
tech-stack:
  added: []
  patterns: [SSE EventSource polling with auto-reconnect, fire-and-forget log streaming, collapsible details for system prompts]

key-files:
  created:
    - lib/chat/components/cluster-detail-page.jsx
    - lib/chat/components/cluster-console-page.jsx
    - lib/chat/components/cluster-logs-page.jsx
    - lib/chat/components/cluster-role-page.jsx
    - lib/chat/components/cluster-detail-tabs.jsx
    - templates/app/clusters/[id]/page.js
    - templates/app/clusters/[id]/console/page.js
    - templates/app/clusters/[id]/logs/page.js
    - templates/app/clusters/[id]/role/[roleId]/page.js
  modified:
    - lib/db/schema.js
    - lib/db/cluster-runs.js
    - lib/cluster/coordinator.js
    - lib/chat/actions.js
    - lib/chat/components/index.js

key-decisions:
  - "Duplicate StatusBadge/timeAgo/formatTs into each page component since clusters-page does not export them"
  - "Use agentRunId as SSE stream key so console page connects to correct container stream"
  - "Truncate persisted logs to 200KB to prevent SQLite bloat"
  - "Role page fetches cluster config dynamically and shows warning if role definition changed since run"

patterns-established:
  - "Cluster detail tab pattern: ClusterDetailTabs component shared across all sub-pages"
  - "Agent polling pattern: poll every 5s for active agent, stop polling when found, re-poll on stream end"
  - "Log persistence pattern: collectLogs after waitForContainer, before volume cleanup"

requirements-completed: [CLSTUI-01, CLSTUI-02, CLSTUI-03, CLSTUI-04]

# Metrics
duration: 25min
completed: 2026-03-13
---

# Phase 37 Plan 01: Cluster Detail Views Summary

**Four cluster detail pages (overview, console, logs, role) with SSE streaming, log persistence, and shared tab navigation**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files created:** 9
- **Files modified:** 5

## Accomplishments
- Cluster run overview page shows agent timeline with status dots, badges, labels, exit codes, PR links, and expandable initial prompt
- Live console page streams output from active cluster agent via EventSource SSE, auto-detects active agent via polling, auto-switches on stream end
- Historical logs page fetches persisted logs from DB and renders in terminal-style pre block with agent selector buttons
- Role detail page shows role config (system prompt in collapsible details, allowed tools as badges, MCP servers, transitions table) plus filtered agent history and label sequence visualization
- Log data persisted to DB via new `logs` TEXT column on clusterAgentRuns, collected before container cleanup, truncated to 200KB
- Shared ClusterDetailTabs component for consistent navigation across all detail sub-pages

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema update, coordinator streaming + log persistence, server actions** - `a4c8866` (feat)
2. **Task 2: Cluster detail overview page + logs page + shared tabs component** - `a1bb1b0` (feat)
3. **Task 3: Console streaming page + role detail page + remaining routes** - `eb34af1` (feat)

## Files Created/Modified
- `lib/db/schema.js` - Added `logs` TEXT column to clusterAgentRuns table
- `lib/db/cluster-runs.js` - Added `getAgentRunById` query function
- `lib/cluster/coordinator.js` - Wired `streamContainerLogs` fire-and-forget, `collectLogs` for DB persistence
- `lib/chat/actions.js` - Added `getAgentRunLogs`, `getActiveClusterAgent`, `getClusterDefinition` server actions
- `lib/chat/components/cluster-detail-tabs.jsx` - Shared tab navigation (overview/console/logs)
- `lib/chat/components/cluster-detail-page.jsx` - Run overview with agent timeline (CLSTUI-01)
- `lib/chat/components/cluster-console-page.jsx` - Live SSE streaming console (CLSTUI-02)
- `lib/chat/components/cluster-logs-page.jsx` - Historical log viewer (CLSTUI-03)
- `lib/chat/components/cluster-role-page.jsx` - Role config + agent history (CLSTUI-04)
- `lib/chat/components/index.js` - Added 4 new component exports
- `templates/app/clusters/[id]/page.js` - Overview route
- `templates/app/clusters/[id]/console/page.js` - Console route
- `templates/app/clusters/[id]/logs/page.js` - Logs route
- `templates/app/clusters/[id]/role/[roleId]/page.js` - Role detail route

## Decisions Made
- Duplicated StatusBadge/timeAgo/formatTs into each page component since clusters-page does not export them (keeps pages self-contained)
- Used agentRunId as SSE stream key to match coordinator's streamContainerLogs wiring
- Truncated persisted logs to 200KB max to prevent SQLite bloat from large agent outputs
- Role page handles missing config gracefully with warning message (cluster config may change between runs)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Shell escaping of `!` in `node -e` double-quoted strings caused SyntaxError during Task 1 verification. Resolved by writing verification script to temp file and running with `node /tmp/verify-task1.js`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All cluster detail views complete and build-verified
- Ready for Phase 38 (Developer Experience) if planned

## Self-Check: PASSED

All 9 created files verified on disk. All 3 task commits (a4c8866, a1bb1b0, eb34af1) verified in git log.

---
*Phase: 37-cluster-detail-views*
*Completed: 2026-03-13*
