---
phase: 39-smart-execution
plan: 02
subsystem: infra
tags: [github-actions, merge-policy, notifications, quality-gates, docker]

# Dependency graph
requires:
  - phase: 39-01
    provides: "gate-failures.md artifact on job branches, mergePolicy field in REPOS.json, QUALITY_GATES/MERGE_POLICY env vars"
provides:
  - "auto-merge.yml enforces per-repo mergePolicy (manual/gate-required/auto)"
  - "Merge PR step wired to check-merge-policy.outputs.allowed"
  - "notify-job-failed.yml includes gate failure excerpts in log payload with quality_gates failure stage"
  - "notify-pr-complete.yml includes gate failure excerpts in both same-repo and cross-repo notification paths"
  - "waitAndNotify() in tools.js enriches log field and failure_stage with gate failure content from container stdout"
affects: [40-job-control-ui, notifications, auto-merge, job-outcomes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate failure propagation: gate-failures.md written by entrypoint.sh, read by three notification paths, surfaces in operator chat"
    - "Merge policy gate: check-merge-policy step runs after check-paths, outputs allowed=true/false, wired into Merge PR if condition"

key-files:
  created: []
  modified:
    - templates/.github/workflows/auto-merge.yml
    - templates/.github/workflows/notify-job-failed.yml
    - templates/.github/workflows/notify-pr-complete.yml
    - lib/ai/tools.js

key-decisions:
  - "JOB_ID passed to node script via env var (JOB_ID=$JOB_ID node -e '...') to avoid shell quoting issues in inline script"
  - "Merge policy reads first non-auto policy from REPOS.json — acceptable since jobs target one repo per instance"
  - "Gate failure content capped at 4000 chars (head -c 4000) to prevent payload bloat in Actions notification workflows"
  - "Docker path uses stdout scanning ([GATE] FAILED marker) rather than file read since container filesystem not accessible post-exit"

patterns-established:
  - "Three-path notification enrichment: Actions failure, Actions PR-complete, Docker waitAndNotify — all three must be updated together when enriching job notifications"

requirements-completed: [EXEC-03, EXEC-04]

# Metrics
duration: 2min
completed: 2026-03-16
---

# Phase 39 Plan 02: Smart Execution — Merge Policy Enforcement and Gate Failure Notifications Summary

**Per-repo mergePolicy enforcement in auto-merge workflow and gate failure excerpt propagation across all three notification paths (Actions failure, Actions PR-complete, Docker waitAndNotify)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-16T22:37:16Z
- **Completed:** 2026-03-16T22:38:25Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- auto-merge.yml now enforces mergePolicy from REPOS.json: `manual` repos never auto-merge, `gate-required` repos block when `gate-failures.md` exists on branch, `auto` merges as before
- Merge PR step `if:` condition wired to `check-merge-policy.outputs.allowed == 'true'` — the critical enforcement link
- All three notification paths enriched: notify-job-failed reads gate-failures.md and sets `quality_gates` failure stage, notify-pr-complete reads it in same-repo and cross-repo paths, waitAndNotify scans container stdout for `[GATE] FAILED` marker
- Operator now sees gate failure details in chat notification instead of generic "job failed" message

## Task Commits

Each task was committed atomically:

1. **Task 1: Add merge policy enforcement to auto-merge workflow** - `ec15f2e` (feat)
2. **Task 2: Enrich notifications with gate failure excerpts** - `2286889` (feat)

## Files Created/Modified
- `templates/.github/workflows/auto-merge.yml` - Added checkout step, check-merge-policy step, updated Merge PR if condition
- `templates/.github/workflows/notify-job-failed.yml` - Added gate-failures.md read, quality_gates stage, QUALITY GATE FAILURES append
- `templates/.github/workflows/notify-pr-complete.yml` - Added gate failure reading in both same-repo and cross-repo notification steps
- `lib/ai/tools.js` - Added gateFailures extraction from stdout, enriched results.log and failure_stage in waitAndNotify

## Decisions Made
- JOB_ID passed to inline node script via env var (`JOB_ID="$JOB_ID" node -e "..."`) to avoid bash variable expansion issues inside single-quoted node script strings
- Merge policy reads first non-auto policy across all repos in REPOS.json — acceptable because jobs target one repo at a time per instance, so there's only one relevant policy
- Gate failure content capped at 4000 chars using `head -c 4000` to prevent notification payload bloat
- Docker path scans container stdout for `[GATE] FAILED` marker (written by entrypoint.sh gate execution block from Plan 01) rather than trying to read files, since the container filesystem is not directly accessible after container exit

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 39 (Smart Execution) complete: quality gates (39-01) + merge policy enforcement and notification enrichment (39-02) fully implemented
- Phase 40 (Job Control UI) can proceed: cancel/retry jobs from web UI
- Gate failure data now flows to operator chat — operators will see meaningful failure details instead of generic messages

---
*Phase: 39-smart-execution*
*Completed: 2026-03-16*
