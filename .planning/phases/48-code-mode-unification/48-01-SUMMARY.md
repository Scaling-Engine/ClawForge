---
phase: 48-code-mode-unification
plan: 01
subsystem: chat-ui
tags: [refactor, ui, chat, state-management]
dependency_graph:
  requires: []
  provides: [unified-code-toggle, admin-gated-code-mode, codeSubMode-routing]
  affects: [lib/chat/components/chat.jsx, lib/chat/components/chat-input.jsx, lib/chat/components/chat-page.jsx]
tech_stack:
  added: []
  patterns: [prop-threading, state-consolidation, admin-role-guard]
key_files:
  created: []
  modified:
    - lib/chat/components/chat-page.jsx
    - lib/chat/components/chat.jsx
    - lib/chat/components/chat-input.jsx
decisions:
  - "codeActive drives routing: true routes to /stream/terminal, false routes to /stream/chat"
  - "shellMode removed as user-visible toggle; hardcoded false in transport body (backend default already false)"
  - "onToggleCode is undefined for non-admins — ChatInput conditionally renders toggle based on prop existence"
  - "codeSubMode passed in transport body only when codeActive (plan or code intent signal for Phase 49)"
metrics:
  duration: 8
  completed: "2026-03-20T00:36:16Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 48 Plan 01: Code Mode Unification Summary

**One-liner:** Collapsed three chat input toggles (Terminal >_, Shell $, Code </>) into one unified </> Code toggle routing to /stream/terminal with Plan/Code sub-mode select, admin-gated via isAdmin prop from session.user.role.

## What Was Built

Three separate, confusing chat input toggles were replaced by a single unified Code toggle:

- **Before:** `codeMode` (backtick-wrapping), `terminalMode` (routes to SDK bridge), `shellMode` (terminal sub-state) — 3 state variables, 6 props to ChatInput, impossible combined states
- **After:** `codeActive` (routes to /stream/terminal when true) + `codeSubMode` ('plan'|'code') — 2 state variables, 4 props to ChatInput, no impossible states

The Code toggle is admin-only: `onToggleCode` is `undefined` for non-admin users, so ChatInput doesn't render it. The `isAdmin` boolean flows from `session.user.role` in `chat-page.jsx` down to `Chat` then `ChatInput`.

## Tasks Completed

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Refactor chat.jsx state + thread isAdmin from chat-page.jsx | 91f22ad | chat-page.jsx, chat.jsx |
| 2 | Unified Code toggle + sub-mode select in chat-input.jsx | c66a692 | chat-input.jsx |

## Decisions Made

1. **codeActive drives routing:** When `codeActive` is true, transport API is `/stream/terminal`; when false, `/stream/chat`. Both Plan and Code sub-modes route to terminal in Phase 48 — behavioral divergence deferred to Phase 49.

2. **shellMode removed from UI:** Shell mode as a user toggle is removed. The backend `/stream/terminal` already defaults `shellMode` to `false` when absent — no backend change needed.

3. **Admin guard via prop existence:** `onToggleCode` is `undefined` for non-admins. ChatInput checks `{onToggleCode && (... toggle ...)}` — the toggle simply doesn't render. Non-admins see no disabled toggle, no confusion.

4. **codeSubMode in transport body:** Sent only when `codeActive` is true. Currently a UX label (Plan vs Code intent). Behavioral branching (job dispatch vs workspace execution) is Phase 49's concern.

5. **Backtick wrapping removed entirely:** `const text = rawText` — no conditional wrapping. The old `codeMode` backtick wrap was a dead workaround; terminal mode already handled plain text correctly.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run build` passes (exit 0)
- No references to `codeMode`, `terminalMode`, `shellMode` as state variables in chat.jsx
- No references to `onToggleCodeMode`, `onToggleTerminalMode`, `onToggleShellMode` in chat-input.jsx
- No `interactiveMode` in chat.jsx
- No backtick wrapping in handleSend
- `codeActive` drives transport routing to `/stream/terminal`
- `isAdmin` prop flows from chat-page.jsx through Chat to ChatInput

## Self-Check: PASSED

- [x] lib/chat/components/chat-page.jsx exists and contains `isAdmin={`
- [x] lib/chat/components/chat.jsx exists and contains `codeActive`
- [x] lib/chat/components/chat-input.jsx exists and contains `aria-label="Toggle Code mode"`
- [x] Commit 91f22ad exists (Task 1)
- [x] Commit c66a692 exists (Task 2)
- [x] Build passes
