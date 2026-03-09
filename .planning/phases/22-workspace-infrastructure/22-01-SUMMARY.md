---
phase: 22-workspace-infrastructure
plan: 01
subsystem: infra
tags: [docker, ttyd, tmux, drizzle, sqlite, workspace]

requires:
  - phase: 21-context-hydration
    provides: Job container Dockerfile pattern and GSD installation
provides:
  - Workspace Docker image definition (ttyd + tmux + Claude Code CLI)
  - Workspace entrypoint with git auth, repo clone, feature branch, ttyd
  - codeWorkspaces Drizzle schema table
  - Workspace CRUD module (8 functions + volume naming utility)
  - Migration SQL for code_workspaces table
affects: [22-02-container-lifecycle, 22-03-workspace-api, 23-channel-integration, 24-workspace-sessions]

tech-stack:
  added: [ttyd 1.7.7, tmux]
  patterns: [workspace volume naming with clawforge-ws- prefix, long-running container entrypoint]

key-files:
  created:
    - templates/docker/workspace/Dockerfile
    - templates/docker/workspace/entrypoint.sh
    - lib/db/workspaces.js
    - drizzle/0005_workspace_table.sql
  modified:
    - lib/db/schema.js
    - drizzle/meta/_journal.json

key-decisions:
  - "Workspace volumes use clawforge-ws- prefix to avoid collision with job volumes (clawforge-)"
  - "No Chrome deps, PostToolUse hooks, or /defaults/ folder in workspace image -- terminal-only interactive use"
  - "Git auth duplicated from job entrypoint rather than shared module (per research recommendation)"

patterns-established:
  - "Workspace volume naming: clawforge-ws-{instance}-{shortId}"
  - "Long-running container pattern: entrypoint ends with exec ttyd (PID 1)"
  - "Workspace status lifecycle: creating -> running -> stopped -> error -> destroyed"

requirements-completed: [CNTR-01, CNTR-05, DATA-01, DATA-02]

duration: 2min
completed: 2026-03-09
---

# Phase 22 Plan 01: Workspace Foundations Summary

**Workspace Docker image with ttyd 1.7.7 + tmux + Claude Code CLI, Drizzle schema for workspace state, and full CRUD data layer with idle timeout support**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T03:17:12Z
- **Completed:** 2026-03-09T03:18:58Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Workspace Docker image separate from job image: ttyd + tmux for web terminal, no Chrome deps
- Entrypoint handles git auth via gh CLI, repo clone/update, feature branch creation, ttyd+tmux as PID 1
- codeWorkspaces table with 13 columns tracking container state, volume, branch, activity timestamps
- 8 CRUD functions + wsVolumeNameFor utility supporting concurrent limits and idle timeout enforcement

## Task Commits

Each task was committed atomically:

1. **Task 1: Workspace Docker image and entrypoint** - `d8e40e8` (feat)
2. **Task 2: Drizzle schema + migration + workspace CRUD** - `4d212b6` (feat)

## Files Created/Modified
- `templates/docker/workspace/Dockerfile` - Workspace container image (Node 22 + ttyd + tmux + Claude Code CLI + GSD)
- `templates/docker/workspace/entrypoint.sh` - Long-running entrypoint: git auth, clone, branch, ttyd+tmux
- `lib/db/schema.js` - Added codeWorkspaces table definition
- `lib/db/workspaces.js` - CRUD module: create, get, getByRepo, list, update, delete, countRunning, getIdle, wsVolumeNameFor
- `drizzle/0005_workspace_table.sql` - Migration for code_workspaces table
- `drizzle/meta/_journal.json` - Added migration journal entry for 0005

## Decisions Made
- Workspace volumes use `clawforge-ws-` prefix to avoid collision with job volumes (`clawforge-`)
- No Chrome deps, PostToolUse hooks, or /defaults/ folder in workspace image -- workspaces are interactive terminal sessions, not automated agents
- Git auth duplicated from job entrypoint rather than extracting shared module (per research recommendation to keep layers independent)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Workspace Docker image ready for Plan 02 (container lifecycle management)
- Schema and CRUD layer ready for Plan 02 to build create/start/stop/destroy operations
- Volume naming utility ready for container orchestration

---
*Phase: 22-workspace-infrastructure*
*Completed: 2026-03-09*
