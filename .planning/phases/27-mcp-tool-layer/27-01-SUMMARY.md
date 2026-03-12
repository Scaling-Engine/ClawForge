---
phase: 27-mcp-tool-layer
plan: 01
subsystem: infra
tags: [mcp, claude-code, config, template-vars]

requires:
  - phase: none
    provides: standalone foundation
provides:
  - loadMcpServers() function for reading MCP server configs
  - buildMcpConfig() function for resolving template vars and building Claude Code format
  - mcpServersFile path export
  - MCP_SERVERS.json schema (array format for ClawForge, object map output for Claude Code)
affects: [27-02 container injection, 27-03 settings UI]

tech-stack:
  added: []
  patterns: [template-var-resolution with AGENT_LLM_ prefix, ClawForge-array to Claude-Code-object-map transform]

key-files:
  created: [lib/tools/mcp-servers.js, templates/config/MCP_SERVERS.json, instances/noah/config/MCP_SERVERS.json]
  modified: [lib/paths.js]

key-decisions:
  - "loadMcpServers reads fresh every call (no cache) since env vars may change between dispatches"
  - "Template vars use {{AGENT_LLM_*}} pattern matching GitHub secrets convention for LLM-accessible credentials"
  - "buildMcpConfig outputs Claude Code object map format, not ClawForge array format"

patterns-established:
  - "MCP config schema: mcpServers array with name/command/args/env/allowedTools/hydrateTools per entry"
  - "Template variable resolution: regex replace {{AGENT_LLM_KEY}} with process.env[KEY] defaulting to empty string"
  - "allowedTools fragment format: mcp__servername__toolname with double underscores"

requirements-completed: [MCP-01, MCP-02, MCP-05, MCP-09]

duration: 2min
completed: 2026-03-12
---

# Phase 27 Plan 01: MCP Config Foundation Summary

**MCP config loader with template variable resolution, ClawForge-to-Claude-Code format transform, and allowedTools fragment generation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-12T17:30:15Z
- **Completed:** 2026-03-12T17:31:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- loadMcpServers() reads MCP_SERVERS.json and returns server config array, gracefully handling missing/invalid files
- buildMcpConfig() resolves {{AGENT_LLM_*}} template vars from process.env and transforms array format to Claude Code object map
- allowedTools fragment uses mcp__servername__toolname double-underscore convention
- No literal credentials in any config file -- all use template variable placeholders

## Task Commits

Each task was committed atomically:

1. **Task 1: Add mcpServersFile to paths.js and create MCP_SERVERS.json configs** - `a5c8363` (feat)
2. **Task 2: Create lib/tools/mcp-servers.js with loadMcpServers() and buildMcpConfig()** - `dfc8e15` (feat)

## Files Created/Modified
- `lib/paths.js` - Added mcpServersFile export pointing to config/MCP_SERVERS.json
- `lib/tools/mcp-servers.js` - MCP config loader and builder with template var resolution
- `templates/config/MCP_SERVERS.json` - Empty scaffold for new instances
- `instances/noah/config/MCP_SERVERS.json` - Example config with brave-search and github servers

## Decisions Made
- loadMcpServers reads fresh every call (no cache) since env vars may change between dispatches
- Template vars use {{AGENT_LLM_*}} pattern matching GitHub secrets convention for LLM-accessible credentials
- buildMcpConfig outputs Claude Code object map format, not ClawForge array format
- hydrateTools collected but passed through as-is for Plan 02 consumption

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- loadMcpServers() and buildMcpConfig() ready for Plan 02 (container injection into entrypoint.sh)
- Config schema established for Plan 03 (settings UI)
- hydrateSteps output ready for MCP-08 hydration implementation

---
*Phase: 27-mcp-tool-layer*
*Completed: 2026-03-12*
