---
phase: 16-pr-pipeline-auto-merge-exclusion
plan: 01
subsystem: infra
tags: [github-actions, auto-merge, docker, pr-pipeline]

# Dependency graph
requires:
  - phase: 15-job-prompt-completeness
    provides: PR body generation via /tmp/pr-body.md
provides:
  - Blocked-paths step in auto-merge preventing instance scaffolding PRs from auto-merging
  - --body-file PR creation in entrypoint.sh for robust long PR bodies
affects: [17-end-to-end-validation]

# Tech tracking
tech-stack:
  added: []
  patterns: [blocked-paths defense layer before ALLOWED_PATHS check, --body-file for large PR bodies]

key-files:
  created: []
  modified:
    - .github/workflows/auto-merge.yml
    - templates/.github/workflows/auto-merge.yml
    - templates/docker/job/entrypoint.sh

key-decisions:
  - "Blocked-paths check runs before ALLOWED_PATHS so even ALLOWED_PATHS=/ cannot bypass instance protection"
  - "Pattern match on instances/* and docker-compose.yml covers all instance scaffolding files"

patterns-established:
  - "Blocked-paths defense: infrastructure-critical paths are checked independently of ALLOWED_PATHS"
  - "--body-file convention: entrypoint.sh uses file-based PR body delivery to avoid shell limits"

requirements-completed: [DELIV-01, DELIV-02]

# Metrics
duration: 1min
completed: 2026-03-05
---

# Phase 16 Plan 01: PR Pipeline Auto-Merge Exclusion Summary

**Blocked-paths defense in auto-merge.yml preventing instance scaffolding PRs from auto-merging, plus --body-file PR creation in entrypoint.sh**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-05T05:23:30Z
- **Completed:** 2026-03-05T05:24:34Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added check-blocked step to auto-merge workflow that blocks PRs touching instances/ or docker-compose.yml
- Extended Merge PR condition to require blocked check passes alongside existing ALLOWED_PATHS check
- Switched entrypoint.sh from --body inline to --body-file for robust PR body delivery

## Task Commits

Each task was committed atomically:

1. **Task 1: Add blocked-paths step to auto-merge workflow** - `27ba646` (feat)
2. **Task 2: Switch entrypoint.sh to --body-file for PR creation** - `9738b45` (feat)

## Files Created/Modified
- `.github/workflows/auto-merge.yml` - Added check-blocked step, updated conditions on Check ALLOWED_PATHS and Merge PR steps
- `templates/.github/workflows/auto-merge.yml` - Identical copy of .github version
- `templates/docker/job/entrypoint.sh` - Replaced --body "$PR_BODY" with --body-file /tmp/pr-body.md when file exists

## Decisions Made
- Blocked-paths check runs before ALLOWED_PATHS so even ALLOWED_PATHS=/ cannot bypass instance protection
- Pattern match on instances/* and docker-compose.yml covers all instance scaffolding files

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auto-merge exclusion in place, ready for end-to-end validation in Phase 17
- Phase 15 blocker about PR body delivery mechanism is now resolved (--body-file confirmed)

---
*Phase: 16-pr-pipeline-auto-merge-exclusion*
*Completed: 2026-03-05*
