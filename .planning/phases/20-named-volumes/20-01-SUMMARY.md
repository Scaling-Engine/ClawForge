---
phase: 20-named-volumes
plan: 01
subsystem: infra
tags: [docker, volumes, caching, dockerode]

requires:
  - phase: 19-docker-engine
    provides: dispatchDockerJob, Docker Engine dispatch layer
provides:
  - volumeNameFor() for deterministic volume naming
  - ensureVolume() internal helper for volume lifecycle
  - /repo-cache mount in job containers
affects: [20-02, entrypoint, job-container]

tech-stack:
  added: []
  patterns: [named-volume-per-repo, volume-label-tracking]

key-files:
  created: []
  modified: [lib/tools/docker.js]

key-decisions:
  - "Volume naming convention: clawforge-{instance}-{slug} for deterministic, instance-scoped volumes"
  - "ensureVolume kept unexported as internal helper; volumeNameFor exported for tests and cleanup tooling"

patterns-established:
  - "Volume label pattern: clawforge.volume label on containers for debugging/inspection"

requirements-completed: [VOL-01]

duration: 3min
completed: 2026-03-08
---

# Phase 20 Plan 01: Named Volume Support Summary

**Deterministic named volumes (clawforge-{instance}-{slug}) mounted at /repo-cache in Docker job containers for git object caching**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-08T04:20:26Z
- **Completed:** 2026-03-08T04:23:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added volumeNameFor() export for deterministic volume name derivation from instance + repo URL
- Added ensureVolume() internal helper that creates Docker volumes on first use
- Modified dispatchDockerJob to create/ensure volume and mount /repo-cache before container start
- Added clawforge.volume label for container debugging

## Task Commits

Each task was committed atomically:

1. **Task 1: Add volume management and mount to dispatchDockerJob** - `63e9c07` (feat)

## Files Created/Modified
- `lib/tools/docker.js` - Added volumeNameFor(), ensureVolume(), Mounts config, and volume label

## Decisions Made
- Volume naming convention: `clawforge-{instance}-{slug}` -- deterministic, instance-scoped, strips .git suffix
- ensureVolume kept as unexported internal helper (implementation detail)
- volumeNameFor exported for use by tests and future cleanup tooling

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Volume mount ready for entrypoint.sh integration (Plan 20-02)
- /repo-cache available as writable mount point in job containers

---
*Phase: 20-named-volumes*
*Completed: 2026-03-08*

## Self-Check: PASSED
