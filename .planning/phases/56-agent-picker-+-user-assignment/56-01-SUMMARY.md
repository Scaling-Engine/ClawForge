---
phase: 56-agent-picker-+-user-assignment
plan: 01
subsystem: database
tags: [drizzle-orm, sqlite, server-actions, hub, user-assignment]

# Dependency graph
requires:
  - phase: 53-shared-auth-foundation
    provides: hub-users.js base CRUD, hub-schema.js with hubUsers and agentAssignments tables
provides:
  - Hub DB CRUD layer: getHubUsers, getUserById, getAssignmentsForUser, upsertUserAssignment, removeUserAssignment
  - Server Actions: getHubUsers, getHubUserById, getUserAgentAssignments, setUserAgentAssignments, getAgentPickerData
affects: [56-02-agent-picker-page, 56-03-admin-user-detail-page]

# Tech tracking
tech-stack:
  added: []
  patterns: [hub-guard-pattern, superadmin-hub-env-gate, select-then-upsert-pattern]

key-files:
  created: []
  modified:
    - lib/db/hub-users.js
    - lib/chat/actions.js

key-decisions:
  - "Hub DB functions use select-then-update/insert (not INSERT OR REPLACE) to preserve createdAt on upsert"
  - "Server Actions gated on process.env.SUPERADMIN_HUB === 'true' to prevent hub-only features activating on spoke instances"
  - "getAgentPickerData filters to assignedAgents from session JWT; hub admins see all instances when SUPERADMIN_HUB=true"
  - "setUserAgentAssignments replaces all assignments atomically: removes deleted slugs first, then upserts new/updated ones"

patterns-established:
  - "Hub guard pattern: await requireAdmin() + if (process.env.SUPERADMIN_HUB !== 'true') return early"
  - "Dynamic import for hub-users.js inside Server Actions avoids loading hub SQLite on spoke instances"

requirements-completed: [USER-01, USER-02, USER-03, PICK-01, PICK-02, PICK-04]

# Metrics
duration: 0min
completed: 2026-03-25
---

# Phase 56 Plan 01: Hub DB + Server Actions Data Contract Summary

**Five hub DB CRUD functions and five Server Actions establishing the data contract for agent picker and user assignment pages, with SUPERADMIN_HUB env guard preventing activation on spoke instances**

## Performance

- **Duration:** 0 min (pre-completed in plan 02 execution)
- **Started:** 2026-03-25T20:37:43Z
- **Completed:** 2026-03-25T20:37:43Z
- **Tasks:** 2 (verified already complete)
- **Files modified:** 2

## Accomplishments

- Extended `lib/db/hub-users.js` with 5 new CRUD functions: `getHubUsers`, `getUserById`, `getAssignmentsForUser`, `upsertUserAssignment`, `removeUserAssignment`
- Added 5 Server Actions to `lib/chat/actions.js`: hub user management (`getHubUsers`, `getHubUserById`, `getUserAgentAssignments`, `setUserAgentAssignments`) and `getAgentPickerData`
- `getAgentPickerData` queries `queryAllInstances('health')` and filters results to the session user's `assignedAgents` claim; hub admins see all agents
- `setUserAgentAssignments` replaces full assignment set atomically without losing `createdAt` on existing rows

## Task Commits

Both tasks were executed as part of plan 02's commit:

1. **Task 1: Extend lib/db/hub-users.js with assignment CRUD functions** - `31a30b4` (feat)
2. **Task 2: Add Server Actions** - `31a30b4` (feat)

**Note:** Plan 01 work was pre-completed in commit `31a30b4 feat(56-02): add AgentPickerPage component with hub DB and Server Actions`

## Files Created/Modified

- `lib/db/hub-users.js` - Added 5 hub DB CRUD functions (getHubUsers, getUserById, getAssignmentsForUser, upsertUserAssignment, removeUserAssignment); `and` from drizzle-orm already imported
- `lib/chat/actions.js` - Added 5 Server Actions for hub user management and agent picker data; all gated on SUPERADMIN_HUB env var or requireAdmin()

## Decisions Made

- Hub-only Server Actions use dynamic `await import('../db/hub-users.js')` inside the function body — this prevents the hub SQLite file from being opened on spoke instances even if the function is imported
- `setUserAgentAssignments` validates all `agentRole` values before writing (must be viewer/operator/admin)
- `getAgentPickerData` maps health response fields to a stable card shape: `{ name, status, lastJobAt, activeJobs, openPrs, activeWorkspaces, error }`

## Deviations from Plan

None - work was already completed in a prior session as part of plan 02 execution. All acceptance criteria verified.

## Issues Encountered

None - both tasks found already complete when execution started. All functions verified present, `and` import confirmed, SUPERADMIN_HUB guards confirmed, build passes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (AgentPickerPage component) already complete
- Plan 03 (AdminUserDetailPage) already complete
- Phase 56 is fully complete

---
*Phase: 56-agent-picker-+-user-assignment*
*Completed: 2026-03-25*
