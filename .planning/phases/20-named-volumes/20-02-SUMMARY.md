---
phase: 20-named-volumes
plan: 02
subsystem: infra
tags: [docker, git, flock, volume-cache, entrypoint]

requires:
  - phase: 20-01
    provides: "Volume naming convention and ensureVolume/volumeNameFor helpers in docker.js"
provides:
  - "Warm/cold start detection in job entrypoint"
  - "flock-based concurrency mutex for repo-cache access"
  - "Hygiene step cleaning stale locks and dirty state from prior jobs"
  - "Dispatch mode visibility in preflight output"
affects: [20-named-volumes, job-containers]

tech-stack:
  added: [flock]
  patterns: [warm-cold-start, volume-mutex, repo-cache-isolation]

key-files:
  created: []
  modified:
    - templates/docker/job/entrypoint.sh

key-decisions:
  - "flock wraps ALL git operations AND cp -a to prevent concurrent corruption (Pitfall 5 from research)"
  - "git checkout -f FETCH_HEAD instead of branch name avoids refspec issues with shallow clones (Pitfall 1)"
  - "git clean -fdx -e .clawforge-lock excludes the lock file itself from cleanup"
  - "Lock file at /repo-cache/.clawforge-lock inside the volume, shared across containers"

patterns-established:
  - "Warm/cold start: check for .git dir in volume cache to decide fetch vs clone"
  - "Hygiene-before-reuse: always clean stale locks, reset state, fix remote URL before git operations"
  - "Mutex-then-copy: hold flock through git ops AND file copy to prevent race conditions"

requirements-completed: [VOL-02, VOL-03, VOL-04]

duration: 1min
completed: 2026-03-08
---

# Phase 20 Plan 02: Entrypoint Warm/Cold Start Summary

**Warm/cold start detection with flock mutex and hygiene step in job container entrypoint.sh**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-08T04:22:49Z
- **Completed:** 2026-03-08T04:23:37Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced simple git clone with warm start (git fetch) / cold start (git clone) detection using /repo-cache volume
- Added hygiene step that cleans stale .lock files, resets dirty working tree, and fixes stale remote URLs before reuse
- Wrapped all git operations AND cp -a in flock mutex with 30s timeout for concurrent job safety
- Added dispatch mode to preflight output and preflight.md for debugging Docker vs Actions dispatch

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace step 5 with warm/cold start, hygiene, and flock** - `5d2a359` (feat)

## Files Created/Modified
- `templates/docker/job/entrypoint.sh` - Added warm/cold start detection, hygiene step, flock mutex, dispatch mode in preflight

## Decisions Made
- flock wraps ALL git operations AND the cp -a copy to prevent concurrent corruption (research Pitfall 5)
- git checkout -f FETCH_HEAD instead of branch name to avoid refspec issues with shallow clones (research Pitfall 1)
- git clean -fdx -e .clawforge-lock to exclude the lock file itself from cleanup
- Lock file lives at /repo-cache/.clawforge-lock (inside the volume, shared across containers)
- Nanosecond timestamps for accurate millisecond timing of repo setup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Entrypoint fully updated with volume cache support
- Ready for end-to-end testing with Docker dispatch
- /repo-cache volume mount is provided by Plan 01's docker.js changes

---
*Phase: 20-named-volumes*
*Completed: 2026-03-08*
