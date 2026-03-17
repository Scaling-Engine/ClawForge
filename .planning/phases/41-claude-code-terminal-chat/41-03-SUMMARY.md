---
phase: 41-claude-code-terminal-chat
plan: "03"
subsystem: chat-frontend
tags: [terminal-mode, chat-component, message-rendering, tool-routing]
dependency_graph:
  requires: [41-01, 41-02]
  provides: [terminal-mode-ui, end-to-end-terminal-chat]
  affects: [lib/chat/components/chat.jsx, lib/chat/components/chat-input.jsx, lib/chat/components/message.jsx]
tech_stack:
  added: []
  patterns: [dual-transport, custom-fetch-wrapper, terminalSessionIdRef, terminal-tool-routing]
key_files:
  created: []
  modified:
    - lib/chat/components/chat.jsx
    - lib/chat/components/chat-input.jsx
    - lib/chat/components/message.jsx
decisions:
  - "terminalSessionIdRef (useRef) tracks session ID alongside state so transport useMemo reads latest value without adding terminalSessionId as a dependency — prevents unnecessary transport re-creation on every message"
  - "Custom fetch wrapper (terminalFetch) intercepts X-Terminal-Session-Id response header — useChat from @ai-sdk/react does not expose an onResponse callback"
  - "Shell mode toggle only rendered when terminalMode is true — reduces visual clutter and prevents invalid state"
  - "Terminal and code mode are mutually exclusive — enabling terminal resets code mode; disabling terminal resets shell mode"
  - "TERMINAL_TOOL_NAMES Set with PascalCase names is safe against LangGraph snake_case tool names — zero collision risk"
metrics:
  duration_minutes: 25
  completed_date: "2026-03-17"
  tasks_completed: 3
  files_modified: 3
---

# Phase 41 Plan 03: Terminal Mode Integration Summary

End-to-end terminal mode wiring connecting the backend streaming route (Plan 01) and UI components (Plan 02) into a working interactive Claude Code chat experience.

## What Was Built

### Task 1: Chat and ChatInput wiring (commit c1188c8)

**`lib/chat/components/chat.jsx`** — Full terminal mode state machine:

- Added `terminalMode`, `shellMode`, `terminalSessionId` state and `terminalSessionIdRef` ref
- Added `terminalFetch` custom fetch wrapper that reads `X-Terminal-Session-Id` from response headers, storing it in both ref and state
- Modified `transport` useMemo to switch `api` to `/stream/terminal` when active; injects `sessionId`, `shellMode`, `thinkingEnabled` in body
- `handleSend` skips code-wrapping (```` ``` ````) when in terminal mode
- Both ChatInput usages (empty state + chat active state) now receive full terminal/shell mode props
- `onToggleTerminalMode` enforces mutual exclusivity: enabling terminal disables code mode; disabling terminal resets shell mode

**`lib/chat/components/chat-input.jsx`** — Three-mode input toolbar:

- Updated function signature to accept `terminalMode`, `onToggleTerminalMode`, `shellMode`, `onToggleShellMode`
- Terminal toggle (`>_`) — always shown when prop provided; active state uses `bg-accent text-accent-foreground`
- Shell toggle (`$`) — only shown when `terminalMode` is true; active state uses `bg-orange-500/20 text-orange-400` (visually distinct from terminal toggle)
- Code toggle (`</>`) — hidden when `terminalMode` is true (mutually exclusive)
- Textarea placeholder adapts: "Ask Claude Code anything..." in terminal mode, "Run a shell command..." in shell mode, "Send a message..." otherwise

### Task 2: Message rendering routing (commit 5b76dda)

**`lib/chat/components/message.jsx`**:

- Imported `TerminalToolCall` from `./terminal-tool-call.jsx`
- Added `TERMINAL_TOOL_NAMES` Set: `Read`, `Write`, `Edit`, `MultiEdit`, `Bash`, `Glob`, `Grep`, `WebFetch`, `TodoWrite`, `TodoRead`, `_thinking`
- Tool part routing: if `part.toolName` is in `TERMINAL_TOOL_NAMES` → `TerminalToolCall`; otherwise → existing `ToolCall`
- `_thinking` pseudo-tool included in set — `TerminalToolCall` routes it to `ThinkingPanel` automatically

### Task 3: Build verification (auto-approved)

`npm run build` passed cleanly in 25ms — zero errors, all 54 output files generated.

## Key Architecture Decisions

**`terminalSessionIdRef` pattern:**
The transport `useMemo` needs the latest sessionId on every send without re-creating the transport on every message. A `useRef` solves this — the ref is read synchronously inside the custom fetch wrapper before returning the response, while `setTerminalSessionId(sessionId)` keeps state in sync for future UI use.

**Custom fetch wrapper instead of `onResponse`:**
`@ai-sdk/react`'s `useChat` hook does not expose an `onResponse` callback. The `DefaultChatTransport` `fetch` option allows injecting a wrapper that intercepts the raw `Response` object before the SDK processes it — this is where the session header is captured.

**PascalCase vs snake_case tool name safety:**
Claude Code tool names are all PascalCase (Read, Write, Bash). LangGraph tool names are all snake_case (create_job, get_job_status). No entry in `TERMINAL_TOOL_NAMES` can accidentally match a LangGraph tool — the routing is safe without any additional guards.

## Deviations from Plan

**[Rule 1 - Bug] `onResponse` not available in `@ai-sdk/react`**
- **Found during:** Task 1
- **Issue:** Plan assumed `useChat` exposes `onResponse(response)` callback. This version of the SDK does not.
- **Fix:** Used `terminalFetch` custom fetch wrapper passed to `DefaultChatTransport`'s `fetch` option instead. Added `terminalSessionIdRef` to allow the useMemo transport to read latest session ID without re-running on every message.
- **Files modified:** `lib/chat/components/chat.jsx`
- **Commit:** c1188c8

## Self-Check: PASSED

Files exist:
- FOUND: lib/chat/components/chat.jsx
- FOUND: lib/chat/components/chat-input.jsx
- FOUND: lib/chat/components/message.jsx
- FOUND: .planning/phases/41-claude-code-terminal-chat/41-03-SUMMARY.md

Commits exist:
- FOUND: c1188c8 (Task 1 — chat.jsx + chat-input.jsx)
- FOUND: 5b76dda (Task 2 — message.jsx)
