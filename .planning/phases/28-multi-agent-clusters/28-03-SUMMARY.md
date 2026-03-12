---
phase: 28-multi-agent-clusters
plan: 03
subsystem: infra
tags: [docker, coordinator, cluster, slack, cycle-detection, label-routing]

# Dependency graph
requires:
  - phase: 28-multi-agent-clusters
    plan: 01
    provides: clusterVolumeNameFor, ensureClusterVolume, copyOutboxToInbox, createClusterRun, createAgentRun, updateClusterRun, updateAgentRun
  - phase: 28-multi-agent-clusters
    plan: 02
    provides: cluster agent entrypoint contract (env vars ROLE_NAME, INBOX_DIR, OUTBOX_DIR, ROLE_SYSTEM_PROMPT_B64, ALLOWED_TOOLS, INITIAL_PROMPT)
provides:
  - lib/cluster/coordinator.js — resolveNextRole, checkCycleLimit, readLabelFromOutbox, dispatchClusterAgent, runClusterLoop, AGENT_LIMIT, RUN_LIMIT
  - lib/cluster/index.js — runCluster() public API with Slack parent thread and fire-and-forget execution
affects: [28-04, 28-05, lib/ai/tools.js integration, lib/actions.js integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cycle key format: {agentIndex}:{roleName}:{lastLabel} — captures all three dimensions of recurrence"
    - "checkCycleLimit increments before checking (>= limit) — first 4 calls are free, 5th triggers exceeded"
    - "readLabelFromOutbox: temporary alpine container with AutoRemove, defaults to 'complete' on any error"
    - "dispatchClusterAgent: builds env obj then calls dispatchDockerJob with cluster-specific overrides"
    - "runCluster fire-and-forget: returns {runId, status:'started'} immediately; loop runs in background via .then/.catch"

key-files:
  created:
    - lib/cluster/coordinator.js
    - lib/cluster/index.js
    - lib/cluster/coordinator.test.js
  modified: []

key-decisions:
  - "checkCycleLimit returns true when count >= AGENT_LIMIT (not strictly greater) — the 5th iteration at any cycle key triggers exceeded, meaning a role can run at most 4 times per cycle key before the 5th is blocked"
  - "readLabelFromOutbox defaults to 'complete' on any error — prevents coordinator from hanging if the volume or container has issues"
  - "runCluster returns immediately with dbRunId (not callerRunId) — the DB-generated UUID is the canonical run identifier, used for all subsequent lookups and Slack notifications"
  - "Slack client created lazily inside runCluster — if SLACK_BOT_TOKEN is absent or channelId omitted, Slack is fully skipped without error"

patterns-established:
  - "Coordinator loop pattern: cycleKey = agentIndex:role:lastLabel — all three dimensions matter for cycle detection"
  - "Fire-and-forget with error capture: loopPromise.then(postCompletion).catch(updateDbAndNotify) — callers never see unhandled rejections"
  - "Volume-per-agent lifecycle: create before dispatch, copy to next, delete all on successful completion"

requirements-completed: [CLST-02, CLST-04, CLST-09, CLST-12]

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 28 Plan 03: Coordinator Dispatch Loop Summary

**Sequential cluster agent coordinator with label-based role routing, cycle detection (5/key, 15/run), Slack thread notifications, and fire-and-forget runCluster() entry point**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-12T18:26:53Z
- **Completed:** 2026-03-12T18:29:58Z
- **Tasks:** 2
- **Files modified:** 3 (2 implementation + 1 test)

## Accomplishments

- `coordinator.js`: Pure helpers (`resolveNextRole`, `checkCycleLimit`) and Docker-integrated functions (`readLabelFromOutbox`, `dispatchClusterAgent`, `runClusterLoop`) with full export surface
- `index.js`: `runCluster()` creates Slack parent thread, records DB run, delegates to coordinator loop asynchronously
- 15 unit tests for pure functions — all passing; Docker-dependent functions are integration-tested manually
- Safety constants AGENT_LIMIT=5, RUN_LIMIT=15 exported for external inspection/testing

## Task Commits

Each task was committed atomically (TDD = RED + GREEN commits):

1. **Task 1 RED: coordinator pure function tests** - `5c07606` (test)
2. **Task 1 GREEN: coordinator dispatch loop** - `0e1739c` (feat)
3. **Task 2: runCluster entry point** - `e5c5521` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD tasks have RED (failing tests) + GREEN (implementation) commits_

## Files Created/Modified

- `lib/cluster/coordinator.test.js` — 15 unit tests for resolveNextRole, checkCycleLimit, and constants
- `lib/cluster/coordinator.js` — Full coordinator: constants, routing helpers, Docker volume label reader, cluster agent dispatcher, coordinator loop
- `lib/cluster/index.js` — Public `runCluster()` API: Slack parent thread, DB run creation, fire-and-forget loop delegation

## Decisions Made

- **checkCycleLimit returns `>= limit` not `> limit`**: The plan spec says "returns true when cycle count equals AGENT_LIMIT (5)". Initial implementation used `> limit` but the test exposed that the 5th call should trigger exceeded. Changed to `>= limit` — effectively means a role can run 4 times per cycle key before the 5th is blocked.
- **readLabelFromOutbox defaults to 'complete' on error**: The entrypoint guarantees label.txt exists (28-02 decision), but if the volume or Docker operation fails, silently defaulting to 'complete' terminates the run gracefully rather than leaving it in an unknown state.
- **runCluster returns dbRunId (not callerRunId)**: The DB-generated UUID from `createClusterRun()` is the canonical run identifier passed to `runClusterLoop()` and used for all Slack thread replies. The callerRunId (short crypto.randomUUID) is currently unused but available if needed for human-readable display.
- **Slack errors are non-fatal**: Both the parent message creation and per-agent reply failures are caught and warned but do not abort the cluster run. Cluster execution correctness should not depend on Slack availability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed checkCycleLimit boundary condition**
- **Found during:** Task 1 (GREEN phase — tests were passing but one test failed)
- **Issue:** Initial implementation used `next > limit` (strictly greater), but the plan spec and test both specify that at count=5 (equal to AGENT_LIMIT) the function should return true. The test "returns false when cycle count equals limit minus 1" was verifying behavior at count=5 and expected true, which exposed the off-by-one.
- **Fix:** Changed `return next > limit` to `return next >= limit` in coordinator.js
- **Files modified:** lib/cluster/coordinator.js
- **Verification:** All 15 unit tests pass after fix
- **Committed in:** `0e1739c` (Task 1 feat commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — boundary condition bug)
**Impact on plan:** Minor boundary fix. No scope creep. All success criteria met.

## Issues Encountered

None. The off-by-one in checkCycleLimit was caught immediately by the test suite before commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `runCluster()` is ready to be wired into `lib/ai/tools.js` and `lib/actions.js` for Slack/Telegram/web trigger
- `coordinator.js` exports are stable: `runClusterLoop`, `dispatchClusterAgent`, `readLabelFromOutbox`, `resolveNextRole`, `checkCycleLimit`, `AGENT_LIMIT`, `RUN_LIMIT`
- Docker dispatch in `dispatchClusterAgent` uses the existing `dispatchDockerJob` pattern with `_clusterEnv` and `_clusterVolume` overrides — Plan 04 (Dockerfile) needs to ensure the cluster-agent image honors those env vars
- Volume cleanup on success is implemented; failure cleanup (leaving volumes for debugging) is intentional

## Self-Check: PASSED

All created files confirmed present:
- `lib/cluster/coordinator.js` — FOUND
- `lib/cluster/index.js` — FOUND
- `lib/cluster/coordinator.test.js` — FOUND

All task commits verified in git log:
- `5c07606` — test(28-03): RED tests for coordinator pure functions
- `0e1739c` — feat(28-03): coordinator dispatch loop implementation
- `e5c5521` — feat(28-03): runCluster entry point

---
*Phase: 28-multi-agent-clusters*
*Completed: 2026-03-12*
