---
phase: 36-code-workspaces-v2
plan: 01
subsystem: ui
tags: [xterm, dnd-kit, sortable, addon-search, addon-web-links, addon-serialize, file-tree, workspace]

# Dependency graph
requires:
  - phase: 27-mcp-tool-layer
    provides: workspace container infrastructure and ttyd WebSocket terminal
provides:
  - DnD tab reordering via @dnd-kit/core + @dnd-kit/sortable
  - xterm addon-search with Ctrl+F search bar overlay
  - xterm addon-web-links with _blank URL opening
  - xterm addon-serialize for terminal state persistence
  - File tree sidebar with 10s polling via dockerode exec
  - listWorkspaceFiles docker helper and requestFileTree Server Action
affects: [workspace-enhancements, code-workspaces]

# Tech tracking
tech-stack:
  added: ["@dnd-kit/core", "@dnd-kit/sortable", "@xterm/addon-search", "@xterm/addon-web-links", "@xterm/addon-serialize"]
  patterns: [sortable-tab-component, search-bar-overlay, file-tree-polling, id-based-tab-tracking]

key-files:
  created:
    - templates/app/workspace/[id]/search-bar.jsx
    - templates/app/workspace/[id]/sortable-tab.jsx
    - templates/app/workspace/[id]/file-tree-sidebar.jsx
  modified:
    - templates/app/workspace/[id]/terminal.jsx
    - templates/app/workspace/[id]/workspace-terminal-page.jsx
    - lib/ws/actions.js
    - lib/tools/docker.js
    - package.json

key-decisions:
  - "SearchBar managed inside Terminal via showSearch prop (approach B) to avoid forwardRef complexity"
  - "activeTabIndex replaced with activeTabId (string) so tab identity survives DnD reorders"
  - "File tree polls every 10s via Server Action rather than WebSocket to keep implementation simple"
  - "WebLinksAddon opens URLs in _blank to prevent navigating away from workspace"

patterns-established:
  - "SortableTab: wrapper component using useSortable hook for drag-and-drop tabs"
  - "Search overlay: SearchBar renders above terminal div in a flex column, terminal refits on toggle"
  - "File tree polling: requestFileTree Server Action calls listWorkspaceFiles docker helper with find -printf"

requirements-completed: [CWSV2-01, CWSV2-02, CWSV2-03, CWSV2-04]

# Metrics
duration: 4min
completed: 2026-03-13
---

# Phase 36 Plan 01: Code Workspaces V2 Summary

**DnD tab reordering with @dnd-kit, xterm search/web-links/serialize addons, and polling file tree sidebar -- all additive to v1.5 workspace infrastructure**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T07:21:42Z
- **Completed:** 2026-03-13T07:25:52Z
- **Tasks:** 2
- **Files modified:** 9 (3 created, 4 modified, package.json + package-lock.json)

## Accomplishments
- Workspace tabs can be dragged and reordered without losing terminal state (stable keys prevent unmount)
- Ctrl+F / Cmd+F opens in-terminal search bar with find next/previous/close functionality
- URLs in terminal output are clickable and open in new browser tab via WebLinksAddon
- File tree sidebar shows workspace directory contents with collapsible folders, auto-refreshes every 10s
- All V2 features are additive -- existing v1.5 workspaces work identically with optional props

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps and integrate xterm addons + search bar** - `6b0a58d` (feat)
2. **Task 2: Add DnD tab reordering and file tree sidebar** - `97785cb` (feat)

## Files Created/Modified
- `templates/app/workspace/[id]/search-bar.jsx` - Search overlay with findNext/findPrevious/clearDecorations
- `templates/app/workspace/[id]/sortable-tab.jsx` - Individual sortable tab using useSortable hook
- `templates/app/workspace/[id]/file-tree-sidebar.jsx` - Collapsible file tree with 10s polling refresh
- `templates/app/workspace/[id]/terminal.jsx` - Added SearchAddon, WebLinksAddon, SerializeAddon, Ctrl+F handler
- `templates/app/workspace/[id]/workspace-terminal-page.jsx` - DndContext, SortableContext, activeTabId migration, file tree toggle
- `lib/ws/actions.js` - Added requestFileTree Server Action
- `lib/tools/docker.js` - Added listWorkspaceFiles function using execCollect with find

## Decisions Made
- Used approach B (showSearch prop) instead of forwardRef to manage search state inside Terminal
- Migrated activeTabIndex (number) to activeTabId (string) so tab identity survives DnD reorders
- File tree uses 10s polling via Server Action (simple, reuses existing execCollect pattern)
- WebLinksAddon custom handler opens in _blank to avoid navigating away from workspace

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Workspace V2 features complete and buildable
- File click handler logs to console (future enhancement: pipe to terminal via ref)
- Ready for runtime testing on workspace containers

## Self-Check: PASSED

All 7 files verified on disk. Both commit hashes (6b0a58d, 97785cb) found in git log.

---
*Phase: 36-code-workspaces-v2*
*Completed: 2026-03-13*
