---
phase: 31-chat-enhancements
plan: 01
subsystem: ui
tags: [streamdown, shiki, syntax-highlighting, chat, interactive-mode, code-plugin]

# Dependency graph
requires:
  - phase: 30-new-pages
    provides: chat UI foundation (chat.jsx, message.jsx) used as base for enhancements
provides:
  - Shiki syntax highlighting with copy/collapse controls in assistant code blocks
  - Interactive mode routing flag from chat transport through to agent prompt injection
  - INTERACTIVE_MODE hint in both instance EVENT_HANDLER.md persona files
affects: [chat-ui, message-rendering, ai-agent, event-handler-personas]

# Tech tracking
tech-stack:
  added: ["@streamdown/code@1.1.0 (bundles shiki@3.x)"]
  patterns:
    - "Streamdown plugins prop: { code: codePlugin } for syntax highlighting"
    - "controls prop: false during streaming, { code: true } after — prevents jitter"
    - "Transport body flag pattern: interactiveMode passed through DefaultChatTransport body"
    - "Server-side prompt injection: [INTERACTIVE_MODE: true] prepended to userText"

key-files:
  created: []
  modified:
    - lib/chat/components/message.jsx
    - lib/chat/components/chat.jsx
    - lib/chat/api.js
    - instances/noah/config/EVENT_HANDLER.md
    - instances/strategyES/config/EVENT_HANDLER.md
    - package.json
    - package-lock.json

key-decisions:
  - "@streamdown/code exports a pre-built `code` instance (not a factory) — used directly as codePlugin"
  - "controls=false during streaming prevents copy/collapse button jitter mid-stream"
  - "interactiveMode injected AFTER repo context so [INTERACTIVE_MODE: true] is the very first line the agent sees"
  - "Both instance EVENT_HANDLER.md files updated identically — StrategyES section placed after 'Not Everything is a Job'"

patterns-established:
  - "Plugin pattern: import { code as codePlugin } from '@streamdown/code'; pass as plugins={{ code: codePlugin }}"
  - "Streaming-aware controls: controls={isLoading ? false : { code: true }} on streaming instances"
  - "Static-only instance: always passes controls={{ code: true }} unconditionally"

requirements-completed: [CHAT-02, CHAT-03]

# Metrics
duration: 12min
completed: 2026-03-13
---

# Phase 31 Plan 01: Chat Enhancements Summary

**Shiki syntax highlighting via @streamdown/code plugin in all Streamdown instances, plus interactiveMode transport flag that prepends [INTERACTIVE_MODE: true] to agent prompts when code mode is active**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-13T05:30:00Z
- **Completed:** 2026-03-13T05:42:00Z
- **Tasks:** 2/3 (Task 3 is human-verify checkpoint — awaiting verification)
- **Files modified:** 7

## Accomplishments
- Installed @streamdown/code (v1.1.0) with bundled shiki v3, no separate shiki install needed
- All three Streamdown instances in renderTextWithStreamViewer updated with code plugin, Shiki theme pair, and streaming-aware controls
- DefaultChatTransport body now carries interactiveMode: codeMode with correct dependency tracking
- lib/chat/api.js destructures interactiveMode and prepends [INTERACTIVE_MODE: true] hint after repo context injection
- Both instance EVENT_HANDLER.md files contain the Interactive Mode routing section

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @streamdown/code and wire Shiki syntax highlighting** - `1e32b56` (feat)
2. **Task 2: Add interactive mode routing for code mode toggle** - `7d3d0fd` (feat)
3. **Task 3: Human verify checkpoint** - pending

## Files Created/Modified
- `lib/chat/components/message.jsx` - Added @streamdown/code import; updated all three Streamdown instances with plugins/shikiTheme/controls
- `lib/chat/components/chat.jsx` - Added interactiveMode: codeMode to transport body and dependency array
- `lib/chat/api.js` - Added interactiveMode destructuring and [INTERACTIVE_MODE: true] injection
- `instances/noah/config/EVENT_HANDLER.md` - Added Interactive Mode routing section after "Not Everything is a Job"
- `instances/strategyES/config/EVENT_HANDLER.md` - Added identical Interactive Mode routing section
- `package.json` + `package-lock.json` - Added @streamdown/code dependency

## Decisions Made
- @streamdown/code exports a pre-built `code` singleton (not a factory), imported directly
- controls=false during streaming prevents copy/collapse button jitter mid-stream; enabled after stream completes
- interactiveMode hint injected after repo context so it appears as the first token in the final prompt
- Both EVENT_HANDLER.md files updated with identical section, positioned consistently after "Not Everything is a Job"

## Deviations from Plan
None - plan executed exactly as written. The only check was verifying that `code` from @streamdown/code is a pre-built instance (not a factory requiring `code()` call) — confirmed from dist source, used directly.

## Issues Encountered
None — build passed cleanly after both tasks.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tasks 1 and 2 are committed and build-verified
- Task 3 (human-verify checkpoint) requires developer to visually confirm syntax highlighting, file upload regression, and interactive mode routing in live dev server at http://localhost:3000/chat
- Once verified, plan 31-01 is fully complete

---
*Phase: 31-chat-enhancements*
*Completed: 2026-03-13*
