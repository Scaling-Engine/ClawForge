---
phase: 39-smart-execution
plan: 01
subsystem: infra
tags: [docker, bash, quality-gates, self-correction, repos, entrypoint]

# Dependency graph
requires: []
provides:
  - "getQualityGates() and getMergePolicy() exported from lib/tools/repos.js"
  - "QUALITY_GATES and MERGE_POLICY env vars injected into Docker job containers"
  - "run_quality_gates() function in entrypoint.sh for sequential gate execution"
  - "Self-correction loop: one automatic claude -p re-invocation on gate failure"
  - "gate-failures.md artifact committed to job branch on any gate failure"
  - "PR labeled needs-fixes when gates fail after correction attempt"
affects: [40-job-control-ui, 42-admin-ops-superadmin]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Quality gates defined per-repo in REPOS.json as array of shell commands"
    - "Merge policy per-repo: auto | gate-required | manual"
    - "Gate state communicated via /tmp/gate_pass temp file (avoids bash subshell scope)"
    - "set +e / set -e guards around gate eval to prevent script abort on gate failure"
    - "GATE_ATTEMPT counter hard-limits self-correction to exactly 1 iteration"

key-files:
  created: []
  modified:
    - lib/tools/repos.js
    - lib/tools/docker.js
    - lib/ai/tools.js
    - instances/noah/config/REPOS.json
    - instances/strategyES/config/REPOS.json
    - templates/docker/job/entrypoint.sh

key-decisions:
  - "Gate state stored in /tmp/gate_pass file not bash variable — avoids subshell scope loss"
  - "Gates run after main git commit (after HAS_NEW_COMMIT is set) not immediately after claude -p — ensures only committed work is tested"
  - "GATE_ATTEMPT=0 hard limit prevents infinite correction loops; exactly one retry"
  - "gate-failures.md committed to job branch on first failure so downstream workflows can read it"
  - "ClawForge repo uses npm run build as quality gate with gate-required policy; NeuroStory and StrategyES Lab start with empty gates and auto policy"

patterns-established:
  - "Quality gate pattern: define in REPOS.json, pass through Docker dispatch, execute in entrypoint"
  - "Self-correction pattern: read failure artifact, build correction prompt, re-invoke, re-run gates"
  - "Needs-fixes PR label pattern: append warning to existing pr-body.md if present"

requirements-completed: [EXEC-01, EXEC-02, EXEC-04]

# Metrics
duration: 15min
completed: 2026-03-16
---

# Phase 39 Plan 01: Smart Execution Summary

**Configurable quality gates with one-shot self-correction in Docker job containers — gates run after claude -p, write gate-failures.md on failure, re-invoke claude once, label PR needs-fixes if still failing**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-16T22:18:00Z
- **Completed:** 2026-03-16T22:34:17Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added `getQualityGates()` and `getMergePolicy()` helper functions to `lib/tools/repos.js` with proper defaults (empty array, 'auto')
- Quality gate config flows from REPOS.json through Docker dispatch as QUALITY_GATES/MERGE_POLICY env vars
- `run_quality_gates()` bash function executes gates sequentially, stops on first failure, writes `gate-failures.md` artifact
- Self-correction loop fires exactly once on gate failure: re-invokes claude -p with failure context, commits, re-runs gates
- PR creation uses gate state: normal PR when gates pass, `needs-fixes` label when gates still fail after correction

## Task Commits

Each task was committed atomically:

1. **Task 1: Add quality gate config schema and JS helpers** - `641699b` (feat)
2. **Task 2: Implement quality gate execution and self-correction in entrypoint.sh** - `764f7fa` (feat)

## Files Created/Modified
- `lib/tools/repos.js` - Added getQualityGates() and getMergePolicy() functions; updated export
- `lib/tools/docker.js` - Injects QUALITY_GATES and MERGE_POLICY env vars in dispatchDockerJob()
- `lib/ai/tools.js` - Imports and calls new helpers; passes qualityGates/mergePolicy to dispatchDockerJob()
- `instances/noah/config/REPOS.json` - Added qualityGates and mergePolicy to clawforge (npm run build / gate-required) and neurostory (empty / auto)
- `instances/strategyES/config/REPOS.json` - Added qualityGates: [] and mergePolicy: auto to strategyes-lab
- `templates/docker/job/entrypoint.sh` - run_quality_gates() function + gate execution block + self-correction + updated PR creation

## Decisions Made
- Gate state stored in `/tmp/gate_pass` file rather than bash variable — avoids subshell variable scope loss when the `while` loop runs in a subshell
- Gate execution block placed AFTER the main `git commit` (after HAS_NEW_COMMIT is detected) not immediately after `claude -p` — this ensures gates test only code that was actually committed
- GATE_ATTEMPT counter hard-limits self-correction to exactly one retry (requirement EXEC-02: hard max 1 iteration)
- ClawForge repo gets `npm run build` as its gate with `gate-required` policy; other repos start with empty gates and `auto` policy so operators can configure later

## Deviations from Plan

**1. [Rule 1 - Bug] Moved gate execution block to after main git commit**
- **Found during:** Task 2 (reviewing entrypoint.sh structure)
- **Issue:** Plan instruction said "insert between claude -p output and PR creation guard" — but the initial placement was before step 12's `git commit` where `HAS_NEW_COMMIT` is set. The gate block checked `HAS_NEW_COMMIT` which would always be empty/false at that point, causing gates to never execute.
- **Fix:** Moved gate execution block to after the `HAS_NEW_COMMIT` detection (end of step 12), before PR creation — matching the plan's intent even though the described insertion point was ambiguous.
- **Files modified:** templates/docker/job/entrypoint.sh
- **Verification:** `bash -n` passes; grep confirms GATE_ATTEMPT, gate-failures.md, needs-fixes, run_quality_gates all present
- **Committed in:** 764f7fa (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — ordering bug from ambiguous plan instruction)
**Impact on plan:** Fix was necessary for gates to ever execute. No scope creep.

## Issues Encountered
- Insertion point in the plan description ("between claude -p capture and PR creation guard") was ambiguous because the PR creation guard was after step 12's git commit, which sets `HAS_NEW_COMMIT`. Resolved by placing gates after HAS_NEW_COMMIT detection, matching the logical intent.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Quality gates and self-correction are live in entrypoint.sh for all Docker-dispatched jobs
- Operators can add quality gate commands to any repo entry in REPOS.json
- Phase 40 (Job Control UI) can proceed — no blocking concerns from this plan

---
*Phase: 39-smart-execution*
*Completed: 2026-03-16*
