---
phase: 28-multi-agent-clusters
plan: 04
subsystem: ai-agent
tags: [langraph, cluster, fire-and-forget, tools, actions]

# Dependency graph
requires:
  - lib/cluster/index.js (28-03) — runtime dependency, not build-time (dynamic import)
provides:
  - lib/ai/tools.js — createClusterJobTool LangGraph tool (create_cluster_job)
  - lib/actions.js — cluster type in executeAction switch
  - lib/actions.test.js — tests for executeAction cluster and existing types
affects: [28-05, all cluster consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-blocking dynamic import: import().then().catch() for fire-and-forget dispatch"
    - "Cluster dispatch returns cluster {runId} immediately — coordinator runs in background"

key-files:
  created:
    - lib/actions.test.js
  modified:
    - lib/ai/tools.js
    - lib/ai/agent.js
    - lib/actions.js

key-decisions:
  - "Non-awaiting dynamic import pattern (import().then()) used in both tools.js and actions.js — ensures function returns immediately even if cluster/index.js is missing at test time"
  - "tools.js uses import('crypto').randomUUID() since crypto is available as top-level import in actions.js but already imported via top-level in tools.js"

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 28 Plan 04: Cluster Dispatch Wiring Summary

**createClusterJobTool added to LangGraph agent and cluster type added to executeAction — both paths dispatch runCluster fire-and-forget via non-awaiting import().then() pattern**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-12T18:26:47Z
- **Completed:** 2026-03-12T18:29:31Z
- **Tasks:** 2 (1 auto + 1 TDD)
- **Files modified:** 4 (1 created test file, 3 modified)

## Accomplishments

- createClusterJobTool defined with name `create_cluster_job`, description, and zod schema (clusterName, prompt, repoUrl, branch)
- Tool added to LangGraph agent's tools array in agent.js
- executeAction handles `type === 'cluster'` before the default agent path
- Both dispatch paths use non-awaiting `import().then().catch()` so they return immediately regardless of whether cluster/index.js exists
- 4 unit tests covering command, cluster (return value + format), and default agent paths — all pass

## Task Commits

Each task was committed atomically (TDD = RED + GREEN commits):

1. **Task 1: createClusterJobTool** - `cb195f6` (feat)
2. **Task 2 RED: Failing tests for cluster type** - `a254259` (test)
3. **Task 2 GREEN: Cluster type in executeAction** - `d81dc36` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD task has RED (failing tests) + GREEN (implementation) commits_

## Files Created/Modified

- `lib/ai/tools.js` — Added createClusterJobTool (fire-and-forget via import().then()), exported it
- `lib/ai/agent.js` — Imported createClusterJobTool, added to agent tools array
- `lib/actions.js` — Added `import crypto from 'crypto'`, cluster type branch with fire-and-forget dispatch
- `lib/actions.test.js` — 4 tests: command type, cluster return format, cluster runId format, default agent path

## Decisions Made

- **Non-awaiting dynamic import:** The plan specified `await import('../cluster/index.js')` but this would block the function until the module is resolved (and throw if missing). Changed to `import().then().catch()` pattern so the function returns the runId immediately. The coordinator runs in the background regardless. This was caught during TDD RED → GREEN phase.
- **tools.js uses same pattern:** Applied the same import().then() fix to createClusterJobTool so it is consistent with actions.js and works correctly in test environments before cluster/index.js is created (by plan 28-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Changed await import() to import().then() for true fire-and-forget**
- **Found during:** Task 2 GREEN phase (test failure)
- **Issue:** Plan specified `const { runCluster } = await import(...)` followed by `runCluster().catch()`. In Node ESM, `await import()` blocks the function until module resolution completes. If the module doesn't exist, it throws and propagates up. Even when it exists, the function waits for the import before returning the runId — violating the fire-and-forget contract.
- **Fix:** Changed both tools.js and actions.js to `import().then(({ runCluster }) => runCluster(...)).catch()` so the function returns the runId immediately on the next microtask, regardless of module availability.
- **Files modified:** lib/actions.js, lib/ai/tools.js
- **Verification:** Tests pass — cluster type returns immediately with `cluster {runId}` format

---

**Total deviations:** 1 auto-fixed (Rule 1 — blocking behavior bug)
**Impact on plan:** Essential correctness fix — fire-and-forget was not actually fire-and-forget with await pattern. No scope creep.

## Issues Encountered

- `lib/cluster/index.js` doesn't exist (plan 28-03 not yet executed). This is expected — the dynamic import approach means this file can be built independently. When plan 28-03 creates cluster/index.js, both dispatch paths will work immediately without any changes.

## User Setup Required

None — no external configuration required.

## Next Phase Readiness

- Both trigger paths (conversational + cron/webhook) are wired to call runCluster
- Plan 28-03 must create lib/cluster/index.js before clusters can actually run
- Plan 28-05 (cluster history UI) can proceed in parallel since it reads from DB, not from runCluster

## Self-Check: PASSED
