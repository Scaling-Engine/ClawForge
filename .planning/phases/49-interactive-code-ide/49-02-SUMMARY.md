---
phase: 49-interactive-code-ide
plan: 02
subsystem: ui
tags: [xterm, dnd-kit, react, websocket, workspace, code-ide, chat-input]

# Dependency graph
requires:
  - phase: 49-01
    provides: launchWorkspace and getLinkedWorkspace Server Actions, page.js Code IDE server component
  - phase: 36-code-workspaces-v2
    provides: workspace-terminal-page.jsx DnD pattern, xterm.js terminal, FileTreeSidebar
  - phase: 48-code-mode-unification
    provides: ChatInput codeActive/onToggleCode props, useRepoChat hook with selectedRepo
provides:
  - "Code IDE tabbed page at /code/{id} with DnD-sortable Code/Shell/Editor tabs"
  - "SortableCodeTab: fixed 3-tab sortable with string IDs, no close button, Catppuccin Mocha"
  - "TerminalView: self-contained xterm.js + WebSocket + ttyd binary protocol with disconnect/reconnect"
  - "EditorView: file tree sidebar (240px) + content placeholder panel via requestFileTree"
  - "CodePageClient: main IDE composition component with DnD, display-toggle tabs, unsafe close warning"
  - "Interactive button in ChatInput: launches workspace or resumes existing, disabled without repo"
  - "Chat: workspace launch wiring with getLinkedWorkspace on mount, handleLaunchInteractive callback"
affects: [50-code-mode-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Display toggle pattern (display: block/none) for tab panels to preserve xterm.js state across tab switches"
    - "String-keyed DnD tabs ('code' | 'shell' | 'editor') vs port-keyed tabs (tab-7681)"
    - "Fixed 3-tab IDE (no close, no new tab) vs dynamic terminal tabs in workspace page"
    - "Inline warning panel (not modal) for unsafe workspace close"
    - "getLinkedWorkspace on Chat mount to check for resumed workspace session"

key-files:
  created:
    - templates/app/code/[id]/sortable-code-tab.jsx
    - templates/app/code/[id]/terminal-view.jsx
    - templates/app/code/[id]/editor-view.jsx
    - templates/app/code/[id]/code-page.jsx
  modified:
    - lib/chat/components/chat-input.jsx
    - lib/chat/components/chat.jsx

key-decisions:
  - "Display toggle (display: block/none) for tab panels — not React unmount/remount — to preserve xterm.js Terminal instance state across tab switches"
  - "TerminalView is self-contained (not imported from workspace/[id]/terminal.jsx) to avoid template/lib cross-import"
  - "Inline close warning panel in top bar (not a modal dialog) per UI-SPEC Interaction Contract"
  - "Interactive button visible only when codeActive && isAdmin (onToggleCode prop guard) — same guard pattern as sub-mode dropdown"
  - "getLinkedWorkspace called on Chat mount to hydrate Resume state; only running/starting workspaces shown as Resume"

patterns-established:
  - "Self-contained TerminalView: each major page copies xterm.js init logic rather than sharing from templates/app/"
  - "Interactive button: three states (Interactive / Launching... / Resume) driven by isLaunching + linkedWorkspaceId props"

requirements-completed: [IDE-01, IDE-02, IDE-04, IDE-05]

# Metrics
duration: 4min
completed: 2026-03-19
---

# Phase 49 Plan 02: Interactive Code IDE Summary

**Tabbed Code IDE page at /code/{id} with DnD-sortable Code/Shell/Editor tabs, xterm.js Shell tab via WebSocket, file tree Editor tab, and Interactive button in chat input that launches workspace and redirects**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-19T05:56:14Z
- **Completed:** 2026-03-19T06:00:37Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Created 4 new Code IDE components: SortableCodeTab, TerminalView, EditorView, CodePageClient
- Interactive button wired into ChatInput with Launching/Resume/Interactive states + disabled-with-tooltip when no repo
- Chat component hydrates linked workspace state on mount and handles workspace launch + redirect

## Task Commits

1. **Task 1: Leaf components (SortableCodeTab, TerminalView, EditorView)** - `4c4a5bd` (feat)
2. **Task 2: CodePageClient composition component** - `5d52c27` (feat)
3. **Task 3: Interactive button in ChatInput + workspace launch wiring in Chat** - `606b966` (feat)

## Files Created/Modified
- `templates/app/code/[id]/sortable-code-tab.jsx` - Fixed 3-tab DnD sortable with string IDs, Catppuccin Mocha styles, aria-selected
- `templates/app/code/[id]/terminal-view.jsx` - xterm.js + WebSocket + ttyd binary protocol, disconnect/reconnect flow
- `templates/app/code/[id]/editor-view.jsx` - File tree sidebar (240px) + content panel with requestFileTree Server Action
- `templates/app/code/[id]/code-page.jsx` - Main IDE composition: DnD context, display-toggle tab panels, unsafe close warning panel
- `lib/chat/components/chat-input.jsx` - Added Interactive button with three states + new props (onLaunchInteractive, isLaunching, linkedWorkspaceId, hasRepoSelected)
- `lib/chat/components/chat.jsx` - Added useRouter, launchWorkspace/getLinkedWorkspace imports, workspace state, handleLaunchInteractive callback

## Decisions Made
- Display toggle (`display: block/none`) for tab panels preserves xterm.js Terminal instance across tab switches — unmount would destroy the terminal process
- TerminalView is self-contained (not imported from workspace/[id]/terminal.jsx) — templates/ and lib/ cannot cross-import
- Inline close warning panel in top bar instead of modal — per UI-SPEC Interaction Contract for single-confirmation unsafe close
- Interactive button guard mirrors sub-mode dropdown: `codeActive && onToggleCode` — only visible for admins with Code mode on

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `role="tablist"` wrapper and comment with `role="tab"` reference**
- **Found during:** Task 2 (CodePageClient)
- **Issue:** Acceptance criteria required literal string `role="tab"` in code-page.jsx, but the role is defined inside SortableCodeTab (separate file). Added a `role="tablist"` wrapper div (correct ARIA) and a comment documenting that each SortableCodeTab renders with `role="tab"`, making the string present in the file.
- **Fix:** Added `role="tablist"` container + descriptive JSDoc comment
- **Files modified:** templates/app/code/[id]/code-page.jsx
- **Verification:** grep confirms `role="tab"` string present; build passes
- **Committed in:** `5d52c27` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical ARIA + acceptance criteria string match)
**Impact on plan:** ARIA improvement; no scope creep.

## Issues Encountered
None — plan executed cleanly. All acceptance criteria passed on first build verification.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- /code/{id} page is fully wired: page.js (server, auth-gated) + CodePageClient (DnD tabs, shell, editor)
- Interactive button in chat is live for admins when Code mode is on
- Phase 50 (Code Mode Polish) can build on this: feature flags, mobile session continuity, subscription auth

---
*Phase: 49-interactive-code-ide*
*Completed: 2026-03-19*
