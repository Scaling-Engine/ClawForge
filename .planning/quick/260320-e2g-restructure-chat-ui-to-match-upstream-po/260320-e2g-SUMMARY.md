---
phase: quick-260320-e2g
plan: 01
subsystem: chat-ui
tags: [ui, restructure, code-mode, upstream-alignment]
dependency_graph:
  requires: []
  provides: [clean-chat-header, below-input-control-bar, code-pill-toggle, headless-toggle, context-aware-greeting]
  affects: [lib/chat/components/chat.jsx, lib/chat/components/chat-header.jsx, lib/chat/components/chat-input.jsx, lib/chat/components/greeting.jsx]
tech_stack:
  added: []
  patterns: [pill-toggle, below-input-control-bar, context-aware-greeting]
key_files:
  created: []
  modified:
    - lib/chat/components/chat-header.jsx
    - lib/chat/components/chat-input.jsx
    - lib/chat/components/chat.jsx
    - lib/chat/components/greeting.jsx
decisions:
  - "Code pill toggle (iOS-style) placed in below-input control bar, not inside input or header"
  - "codeSubMode state removed entirely — single Code toggle routes directly to /stream/terminal"
  - "Repo/branch fetching logic moved from chat-header to chat.jsx for control bar access"
  - "Headless toggle (pill-style) replaces Interactive button inside input bar"
  - "Greeting shows 'What we coding today?' with font-mono when codeActive=true"
metrics:
  completed_date: "2026-03-20"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 4
---

# Quick Task 260320-e2g: Restructure Chat UI to Match Upstream PopeBot Layout — Summary

Restructured the ClawForge web chat UI: clean header (agent name + sidebar trigger only), below-input control bar with iOS-style Code pill toggle, repo/branch selectors, and Headless toggle replacing the Interactive button. Removed Plan/Code sub-mode dropdown entirely.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Strip header and input bar, add below-input control bar in chat.jsx | 0140ec8 | chat-header.jsx, chat-input.jsx, chat.jsx |
| 2 | Update Greeting to accept codeActive prop | 0140ec8 | greeting.jsx, chat.jsx |

## What Changed

### chat-header.jsx
- Removed ALL repo/branch selector logic (useState, useRef, handlers, select elements)
- Removed `useRepoChat` import and `getRepos`/`getBranches` imports
- Now contains only: SidebarTrigger (mobile), agent name span (desktop), getAgentName useEffect

### chat-input.jsx
- Removed Code toggle `</>` button block
- Removed Plan/Code sub-mode `<select>` block
- Removed Interactive button block
- Removed props: `onToggleCode`, `codeSubMode`, `onChangeCodeSubMode`, `onLaunchInteractive`, `isLaunching`, `linkedWorkspaceId`, `hasRepoSelected`
- Kept: `codeActive` prop (still applies `font-mono` to textarea)

### chat.jsx
- Removed `codeSubMode` state entirely
- Removed `codeSubMode` from transport body and useMemo dependencies
- Added repo/branch state + fetching logic (moved from header): `repos`, `branches`, `loadingBranches`, `branchLoadingForRepo` ref, `handleRepoChange`, `handleBranchChange`
- Added `getRepos`/`getBranches` imports from `../actions.js`
- Added `setSelectedRepo`/`setSelectedBranch` to `useRepoChat()` destructure
- Created `BelowInputBar` inline JSX rendered after each `ChatInput`:
  - Code pill toggle (iOS-style, `canUseCode` guard)
  - Repo selector (Code ON only)
  - Branch selector (Code ON + repo selected only)
  - Headless toggle — pill-style, replaces Interactive button (Code ON only, disabled when no repo)
- Passed `codeActive` prop to both `<Greeting>` usages
- Removed old ChatInput props from both call sites

### greeting.jsx
- Added `codeActive = false` prop
- When `codeActive`: renders "What we coding today?" with `font-mono` class
- When not active: existing behavior (agent name from `getAgentName()`)

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `npm run build` — passes (39ms, no errors)
- No `codeSubMode` references in any of the four .jsx files
- No `onChangeCodeSubMode` or `onLaunchInteractive` props passed to ChatInput
- Header component has no `<select>` elements
- Greeting component accepts and uses `codeActive` prop

## Self-Check: PASSED

All 4 modified files exist on disk. Commit 0140ec8 verified in git log.
