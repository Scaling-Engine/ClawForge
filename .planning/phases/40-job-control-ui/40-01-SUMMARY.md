---
phase: 40-job-control-ui
plan: 01
subsystem: ui
tags: [next-js, server-actions, docker, dockerode, admin-panel, swarm-page, job-control]

# Dependency graph
requires:
  - phase: 19-docker-engine-dispatch
    provides: dispatchDockerJob, inspectJob, isDockerAvailable, getDockerJob, streamManager
  - phase: 32-auth-roles
    provides: role column on users, session.user.role, auth() pattern
  - phase: 33-admin-panel
    provides: /admin/* route structure, requireAuth() pattern in actions.js
provides:
  - cancelJob Server Action (stops Docker container + SSE stream, admin-only)
  - retryJob Server Action (fetches job.md from GitHub branch, re-dispatches, admin-only)
  - getDockerJobs Server Action (lists pending Docker jobs with live container status)
  - DockerJobsList component in Swarm page (Cancel/Retry buttons, admin role-gated)
  - requireAdmin() helper in actions.js
affects: [41-terminal-chat, 42-admin-ops-superadmin, swarm-page usage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "requireAdmin() helper — calls requireAuth() then checks user.role !== 'admin' + calls forbidden()"
    - "Job control Server Actions — dynamic imports for Docker/DB modules, structured {error} or {success} returns"
    - "DockerJobsList — optimistic refresh via onRefresh callback after successful cancel/retry"

key-files:
  created: []
  modified:
    - lib/chat/actions.js
    - lib/chat/components/swarm-page.jsx

key-decisions:
  - "requireAdmin() uses forbidden() (not unauthorized()) for role failures — redirects to /forbidden not login"
  - "getDockerJobs() only requires requireAuth() (read-only), while cancelJob/retryJob require requireAdmin() (destructive)"
  - "retryJob calls saveJobOrigin explicitly before dispatchDockerJob — dispatchDockerJob only updates containerId via saveDockerJob, it does not create the job_origins row"
  - "DockerJobsList rendered as separate section above SwarmWorkflowList (separate data source — Docker daemon, not GitHub Actions API)"
  - "Cancel button shows only for containerRunning=true; Retry button shows only for outcome.status=failure and not running"

patterns-established:
  - "Job control Server Actions pattern: requireAdmin() first, dynamic imports for Docker modules, return { error } or { success }"
  - "DockerJobsList refresh pattern: onRefresh callback triggers both fetchDockerJobs() and fetchPage(page)"

requirements-completed: [OPS-01, OPS-02]

# Metrics
duration: 18min
completed: 2026-03-17
---

# Phase 40 Plan 01: Job Control UI Summary

**cancelJob/retryJob Server Actions + Swarm page Active Docker Jobs section with admin-only Cancel and Retry buttons**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-17T00:32:00Z
- **Completed:** 2026-03-17T00:50:42Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `requireAdmin()` helper to `lib/chat/actions.js` — checks role === 'admin' after requireAuth(), calls `forbidden()` (not `unauthorized()`) for correct redirect behavior
- Added three Server Actions: `getDockerJobs()` (lists active Docker jobs with container status), `cancelJob(jobId)` (SIGTERM + SSE stream cancel, admin-only), `retryJob(jobId)` (fetches job.md from GitHub branch and re-dispatches, admin-only)
- Added `DockerJobsList` component to swarm-page.jsx with Cancel button (running jobs, admin only) and Retry button (failed jobs, admin only), shown above GitHub Actions workflow list
- SwarmPage now polls Docker jobs every 10s alongside existing workflow list auto-refresh

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cancelJob, retryJob, getDockerJobs Server Actions** - `d615c57` (feat)
2. **Task 2: Add Active Docker Jobs section with Cancel/Retry buttons to Swarm page** - `506cc5a` (feat)

## Files Created/Modified

- `lib/chat/actions.js` — Added requireAdmin(), getDockerJobs(), cancelJob(), retryJob() in new "Job control actions" section
- `lib/chat/components/swarm-page.jsx` — Added DockerJobsList component, fetchDockerJobs callback, dockerJobs state, updated auto-refresh interval to include Docker jobs

## Decisions Made

- `requireAdmin()` dynamically imports `forbidden` from `next/navigation` (as opposed to static import) to match the file's existing dynamic import pattern and avoid adding to the static import block
- `getDockerJobs()` only requires `requireAuth()` not `requireAdmin()` — listing jobs is a read-only operation; destructive operations (cancel/retry) are the admin gate
- `retryJob()` explicitly calls `saveJobOrigin()` before `dispatchDockerJob()` — `dispatchDockerJob` only persists containerId via `saveDockerJob`, it does not create the `job_origins` row. Plan comment "saveJobOrigin is handled inside dispatchDockerJob" was incorrect; fixed during implementation.
- `DockerJobsList` returns `null` when no Docker jobs exist — clean no-op when Docker is not in use

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] retryJob called saveJobOrigin explicitly instead of relying on dispatchDockerJob**
- **Found during:** Task 1 (cancelJob, retryJob, getDockerJobs Server Actions)
- **Issue:** Plan comment stated "saveJobOrigin is handled inside dispatchDockerJob" but code inspection showed `dispatchDockerJob` only calls `saveDockerJob` (updates containerId in existing row). The `saveJobOrigin` function creates the row. Without it, `job_origins` row is missing and notifications cannot route back to the originating thread.
- **Fix:** Added explicit `saveJobOrigin(result.job_id, 'web', 'web', ...)` call after `createJob` but before `dispatchDockerJob`, wrapped in try/catch (non-fatal, matching existing pattern in tools.js)
- **Files modified:** lib/chat/actions.js
- **Verification:** Build passes; saveJobOrigin is imported and called correctly
- **Committed in:** d615c57 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix necessary for notification routing correctness. No scope creep.

## Issues Encountered

None — both tasks completed cleanly on first attempt. Build passed after each task.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- OPS-01 and OPS-02 complete — operators can cancel running Docker jobs and retry failed Docker jobs from the web UI
- Phase 40 is a single-plan phase — all requirements satisfied
- Ready for Phase 41 (Terminal Chat) or Phase 42 (Admin Ops + Superadmin)

---
*Phase: 40-job-control-ui*
*Completed: 2026-03-17*
