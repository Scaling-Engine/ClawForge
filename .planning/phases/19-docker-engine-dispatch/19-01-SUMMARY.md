---
phase: 19-docker-engine-dispatch
plan: 01
subsystem: infra
tags: [docker, dockerode, container-lifecycle, sqlite, drizzle]

requires:
  - phase: 18-layer2-context-hydration
    provides: Job container context assembly (entrypoint.sh)
provides:
  - Docker Engine API client with socket-based container lifecycle
  - Container tracking in SQLite (containerId, dispatchMethod, notified)
  - Orphan container reconciliation on startup
  - Job inspection for stuck container detection
  - Startup time measurement logging
affects: [19-02-dispatch-integration, 19-03-polling-notifications]

tech-stack:
  added: [dockerode@4.0.9]
  patterns: [docker-socket-dispatch, container-label-tracking, orphan-reconciliation]

key-files:
  created:
    - lib/tools/docker.js
    - lib/db/docker-jobs.js
  modified:
    - lib/db/schema.js
    - lib/db/job-origins.js
    - package.json

key-decisions:
  - "Container labels (clawforge=job, clawforge.job_id, clawforge.instance) used for orphan detection instead of DB-only tracking"
  - "AutoRemove: false to allow log collection before cleanup"
  - "New schema columns use .default() values for zero-migration backwards compatibility"

patterns-established:
  - "Docker container naming: clawforge-job-{jobId.slice(0,8)}"
  - "Label convention: clawforge=job plus clawforge.* metadata labels"
  - "Dispatch tracking via dispatchMethod column on jobOrigins (docker vs actions)"

requirements-completed: [DOCK-01, DOCK-02, DOCK-03, DOCK-04, DOCK-05, DOCK-06, DOCK-07, DOCK-08, DOCK-09, DOCK-10]

duration: 2min
completed: 2026-03-06
---

# Phase 19 Plan 01: Docker Engine Client Summary

**Docker Engine API client via dockerode with full container lifecycle (create/start/wait/logs/remove/inspect) and SQLite-backed container tracking for orphan reconciliation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T14:12:44Z
- **Completed:** 2026-03-06T14:15:08Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Docker Engine socket client with 8 exported functions covering full container lifecycle
- Container dispatch measures and logs startup time in ms (DOCK-09)
- Orphan reconciliation on init kills/collects-logs/removes stale containers (DOCK-08)
- Job inspection enables stuck container detection (DOCK-10)
- DB schema extended with dispatchMethod, containerId, notified columns (backwards compatible)
- docker-jobs.js data layer with 5 exports for container tracking and notification dedup

## Task Commits

Each task was committed atomically:

1. **Task 1: Docker client and container lifecycle** - `f0ae9ed` (feat)
2. **Task 2: DB schema columns and docker-jobs data layer** - `8cc6200` (feat)
3. **Task 3: Smoke validation of all modules** - no file changes (validation only)

## Files Created/Modified
- `lib/tools/docker.js` - Docker Engine API wrapper: initDocker, isDockerAvailable, dispatchDockerJob, collectLogs, waitForContainer, removeContainer, inspectJob, reconcileOrphans
- `lib/db/docker-jobs.js` - DB operations: saveDockerJob, getDockerJob, markDockerJobNotified, isJobNotified, getPendingDockerJobs
- `lib/db/schema.js` - Added dispatchMethod, containerId, notified columns to jobOrigins
- `lib/db/job-origins.js` - saveJobOrigin now accepts optional dispatchMethod param
- `package.json` - Added dockerode@^4.0.9 dependency

## Decisions Made
- Container labels used for orphan detection (clawforge=job + metadata labels) -- enables filtering without DB access
- AutoRemove set to false so logs can be collected before container removal
- New schema columns use .default() values for zero-migration backwards compatibility with existing data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Docker client primitives ready for 19-02 dispatch integration
- DB tracking layer ready for 19-03 polling/notification system
- dispatchDockerJob can be called from create-job.js once integrated

---
*Phase: 19-docker-engine-dispatch*
*Completed: 2026-03-06*

## Self-Check: PASSED
All created files verified. Commits f0ae9ed and 8cc6200 confirmed.
