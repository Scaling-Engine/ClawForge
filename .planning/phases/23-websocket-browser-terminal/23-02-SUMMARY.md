---
phase: 23-websocket-browser-terminal
plan: 02
subsystem: ui
tags: [xterm.js, terminal, websocket, tabs, git-safety, docker-exec, browser-terminal]

# Dependency graph
requires:
  - phase: 23-websocket-browser-terminal
    plan: 01
    provides: WebSocket server, ticket auth, bidirectional proxy to ttyd
provides:
  - xterm.js terminal component with WebSocket connection via ticket auth
  - Multi-tab shell management with independent tmux sessions (ports 7682-7685)
  - Git safety warning dialog on workspace close (uncommitted files, unpushed commits)
  - spawnExtraShell and checkWorkspaceGitStatus Docker exec utilities
  - API routes for shell spawn and git status check
  - Server Actions for browser-facing shell spawn and git status
affects: [24-workspace-chat]

# Tech tracking
tech-stack:
  added: [@xterm/xterm, @xterm/addon-fit, @xterm/addon-attach]
  patterns: [dynamic import for SSR avoidance, Server Actions for browser-to-Docker operations, tab state with display:none preservation]

key-files:
  created: [templates/app/workspace/[id]/terminal.jsx, templates/app/workspace/[id]/page.jsx, templates/app/workspace/[id]/workspace-terminal-page.jsx]
  modified: [lib/tools/docker.js, api/index.js, lib/ws/actions.js, package.json]

key-decisions:
  - "Server Actions used for browser-facing shell spawn and git status instead of API routes (follows project convention: browser UI uses Server Actions, API routes are for external callers)"
  - "WorkspaceTerminalPage split into separate client component file for clean server/client boundary"
  - "Inactive tabs use display:none instead of unmounting to preserve terminal state"
  - "Dynamic import of xterm.js modules in useEffect to avoid SSR DOM access errors"

patterns-established:
  - "Docker exec stream collection: read chunks, strip mux headers, return clean output"
  - "Tab management: port-based identification with sequential port allocation (7681-7685)"

requirements-completed: [TERM-03, TERM-04, TERM-05]

# Metrics
duration: 3min
completed: 2026-03-09
---

# Phase 23 Plan 02: Browser Terminal UI Summary

**xterm.js terminal with multi-tab tmux sessions, WebSocket ticket auth, and git safety warnings on workspace close**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T04:05:21Z
- **Completed:** 2026-03-09T04:08:30Z
- **Tasks:** 2 of 2 auto tasks complete (Task 3 is human verification checkpoint)
- **Files modified:** 9

## Accomplishments
- Docker exec utilities for spawning extra ttyd shells and checking git status inside workspace containers
- xterm.js terminal component with dynamic imports, FitAddon resize, and AttachAddon WebSocket connection
- Full workspace terminal page with tab bar, new tab spawning, tab switching, disconnect/reconnect flow
- Git safety dialog showing uncommitted files and unpushed commits before workspace close

## Task Commits

Each task was committed atomically:

1. **Task 1: Docker exec utilities and API routes** - `169aadc` (feat)
2. **Task 2: xterm.js terminal component and workspace page** - `d801595` (feat)

## Files Created/Modified
- `lib/tools/docker.js` - Added spawnExtraShell() and checkWorkspaceGitStatus() functions
- `api/index.js` - Added /workspaces/:id/shell and /workspaces/:id/git-status POST routes
- `templates/app/workspace/[id]/terminal.jsx` - xterm.js terminal with WebSocket connection
- `templates/app/workspace/[id]/page.jsx` - Server component with auth and workspace validation
- `templates/app/workspace/[id]/workspace-terminal-page.jsx` - Client component with tab management and git safety
- `lib/ws/actions.js` - Added requestSpawnShell and requestGitStatus Server Actions
- `package.json` - Added @xterm dependencies and ws/actions, db/workspaces exports

## Decisions Made
- Used Server Actions (requestSpawnShell, requestGitStatus) for browser-facing operations instead of direct API fetch calls, following the project convention that browser UI uses Server Actions while API routes serve external callers
- Split WorkspaceTerminalPage into its own file for clean server/client component boundary
- Inactive terminal tabs rendered with display:none to preserve xterm state across tab switches

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Browser fetch to API routes would fail auth (no API key)**
- **Found during:** Task 2 (workspace-terminal-page.jsx)
- **Issue:** Plan specified browser client should fetch /api/workspaces/:id/shell and /api/workspaces/:id/git-status, but API routes require x-api-key header which browser doesn't have
- **Fix:** Created requestSpawnShell and requestGitStatus Server Actions in lib/ws/actions.js, updated client to call Server Actions instead of fetch
- **Files modified:** lib/ws/actions.js, templates/app/workspace/[id]/workspace-terminal-page.jsx
- **Verification:** Import paths resolve correctly, Server Actions follow existing requestTerminalTicket pattern
- **Committed in:** d801595 (Task 2 commit)

**2. [Rule 3 - Blocking] Missing package.json exports for ws/actions and db/workspaces**
- **Found during:** Task 2 (template imports)
- **Issue:** Template files import from clawforge/ws/actions and clawforge/db/workspaces but no export mappings existed
- **Fix:** Added "./ws/actions" and "./db/workspaces" to package.json exports
- **Files modified:** package.json
- **Committed in:** d801595 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness. Server Actions follow established project patterns. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Browser terminal UI complete, awaiting human verification (Task 3 checkpoint)
- Full WebSocket flow ready: ticket issuance -> WS upgrade -> ttyd proxy -> xterm.js rendering
- API routes remain available for external/CLI callers alongside Server Actions for browser

---
*Phase: 23-websocket-browser-terminal*
*Completed: 2026-03-09*
