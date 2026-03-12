---
phase: 27-mcp-tool-layer
plan: 02
subsystem: infra
tags: [mcp, docker, claude-code, entrypoint, container-dispatch]

# Dependency graph
requires:
  - phase: 27-01
    provides: "loadMcpServers and buildMcpConfig functions in lib/tools/mcp-servers.js"
provides:
  - "MCP config flows from event handler through Docker dispatch to job/workspace containers"
  - "Entrypoint.sh writes MCP config, runs health check, hydration, and passes --mcp-config to claude"
  - "MCP_CONFIG_JSON, MCP_ALLOWED_TOOLS, MCP_HYDRATION_STEPS env var injection in docker.js"
affects: [27-03, job-containers, workspace-containers]

# Tech tracking
tech-stack:
  added: []
  patterns: ["MCP config injection via env vars to Docker containers", "MCP health check with graceful degradation", "MCP hydration prepended to prompt as ## MCP Context section"]

key-files:
  created: []
  modified:
    - "lib/ai/tools.js"
    - "lib/tools/docker.js"
    - "templates/docker/job/entrypoint.sh"

key-decisions:
  - "Health check failure clears MCP flags and continues job without MCP (graceful degradation per MCP-06)"
  - "Hydration output capped at 10KB via head to prevent prompt bloat"
  - "MCP_FLAGS unquoted in claude invocation so it expands to nothing when empty"
  - "Both job and workspace containers get identical MCP config (MCP-04 parity)"

patterns-established:
  - "MCP env var injection: MCP_CONFIG_JSON, MCP_ALLOWED_TOOLS, MCP_HYDRATION_STEPS"
  - "MCP health check pattern: minimal claude invocation with --max-turns 1 to verify servers start"
  - "Hydration pattern: execute tool prompts, prepend output to main prompt as ## MCP Context section"

requirements-completed: [MCP-03, MCP-04, MCP-06, MCP-08]

# Metrics
duration: 5min
completed: 2026-03-12
---

# Phase 27 Plan 02: MCP Container Integration Summary

**MCP config injection from event handler through Docker dispatch into job/workspace containers with health check, hydration, and --mcp-config flag in entrypoint.sh**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-12T17:33:59Z
- **Completed:** 2026-03-12T17:39:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- MCP config flows end-to-end from event handler (tools.js) through Docker dispatch (docker.js) into container entrypoint
- Job and workspace containers receive identical MCP config via env vars (MCP-04 parity)
- Health check verifies MCP server startup with graceful degradation on failure (MCP-06)
- Pre-run hydration executes hydrateTools and prepends output to prompt (MCP-08)
- Non-MCP jobs are completely unaffected (empty flags/vars)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add MCP env injection to docker.js and MCP config loading to tools.js** - `30cfe69` (feat)
2. **Task 2: Add MCP config write, health check, hydration, and --mcp-config flag to entrypoint.sh** - `48bc15a` (feat)

## Files Created/Modified
- `lib/ai/tools.js` - Added buildMcpConfig import and calls before dispatchDockerJob and ensureWorkspaceContainer
- `lib/tools/docker.js` - Added MCP_CONFIG_JSON, MCP_ALLOWED_TOOLS, MCP_HYDRATION_STEPS env var injection in both dispatch functions
- `templates/docker/job/entrypoint.sh` - Added MCP config write, health check, hydration blocks, and --mcp-config flag to claude invocation

## Decisions Made
- Health check uses `timeout 60 claude --mcp-config ... -p "list your available MCP tools" --max-turns 1` as a minimal probe
- On health check failure, MCP flags are cleared so the job continues without MCP rather than aborting
- Hydration output is capped at 10KB to prevent prompt bloat (Pitfall 5 from research)
- Uses /tmp files for hydration output to avoid shell escaping issues

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP config flows end-to-end from config file to Claude Code execution
- Plan 03 (admin UI/testing) can proceed
- MCP servers will be available in job containers once MCP_SERVERS.json is configured with real servers

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 27-mcp-tool-layer*
*Completed: 2026-03-12*
