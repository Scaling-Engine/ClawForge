---
phase: 18-layer-2-context-hydration
plan: 01
subsystem: infra
tags: [docker, entrypoint, agent-instructions, gsd, context-engineering]

requires:
  - phase: none
    provides: standalone (first plan in phase)
provides:
  - AGENT_QUICK.md files for quick-mode job containers (defaults, noah, strategyES)
  - entrypoint.sh selects agent instructions based on GSD_HINT (quick vs plan-phase)
affects: [18-layer-2-context-hydration, job-containers, docker-image]

tech-stack:
  added: []
  patterns: [agent-instruction-selection-by-complexity, fallback-chain-for-config-files]

key-files:
  created:
    - templates/docker/job/defaults/AGENT_QUICK.md
    - instances/noah/config/AGENT_QUICK.md
    - instances/strategyES/config/AGENT_QUICK.md
  modified:
    - templates/docker/job/entrypoint.sh

key-decisions:
  - "Quick-mode AGENT_QUICK.md omits full GSD lifecycle commands, keeps only /gsd:quick"
  - "Fallback chain for quick jobs: instance AGENT_QUICK.md -> defaults AGENT_QUICK.md -> instance AGENT.md"
  - "Reordered entrypoint steps 8/8c before step 7 to resolve GSD_HINT dependency"

patterns-established:
  - "Agent instruction selection: entrypoint.sh selects AGENT.md vs AGENT_QUICK.md based on GSD_HINT"
  - "Config fallback chain: instance-specific -> defaults -> full version"

requirements-completed: [HYDR-05]

duration: 2min
completed: 2026-03-06
---

# Phase 18 Plan 01: AGENT_QUICK.md Selection Summary

**Quick-mode agent instructions (AGENT_QUICK.md) for all instances with entrypoint.sh complexity-based selection via GSD_HINT**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T06:07:44Z
- **Completed:** 2026-03-06T06:09:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created AGENT_QUICK.md for defaults, Noah, and StrategyES instances with lean instructions
- Reordered entrypoint.sh so GSD_HINT is computed before system prompt assembly
- Added fallback chain: instance AGENT_QUICK.md -> defaults AGENT_QUICK.md -> instance AGENT.md

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AGENT_QUICK.md files** - `c26e2c4` (feat)
2. **Task 2: Reorder entrypoint.sh and add AGENT_QUICK.md selection** - `396ed9e` (feat)

## Files Created/Modified
- `templates/docker/job/defaults/AGENT_QUICK.md` - Generic quick-mode agent instructions (fallback)
- `instances/noah/config/AGENT_QUICK.md` - Noah instance quick-mode with identity and workdir context
- `instances/strategyES/config/AGENT_QUICK.md` - StrategyES instance quick-mode with scope and tech stack
- `templates/docker/job/entrypoint.sh` - Reordered steps, added AGENT_QUICK.md selection logic

## Decisions Made
- Quick-mode files keep identity/workdir/scope sections but strip all GSD lifecycle commands (plan-phase, execute-phase, etc.)
- StrategyES quick-mode preserves its scope restriction and tech stack info
- Steps 8 and 8c moved before Step 7 with a comment explaining the non-sequential numbering

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AGENT_QUICK.md files ready for use in job containers
- entrypoint.sh correctly routes quick vs complex jobs
- Docker image rebuild needed to pick up defaults/AGENT_QUICK.md at /defaults/ path

## Self-Check: PASSED

All 5 files verified present. Both task commits (c26e2c4, 396ed9e) verified in git log.

---
*Phase: 18-layer-2-context-hydration*
*Completed: 2026-03-06*
