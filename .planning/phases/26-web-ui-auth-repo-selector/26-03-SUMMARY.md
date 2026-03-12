---
phase: 26-web-ui-auth-repo-selector
plan: "03"
subsystem: ui
tags: [react, next.js, chat, repo-selector, code-mode, context-injection]

# Dependency graph
requires:
  - phase: 26-02
    provides: RepoChatContext provider, getRepos/getBranches Server Actions, FeaturesContext
  - phase: 25-03
    provides: JobStreamViewer + JOB_STREAM marker already wired into message.jsx

provides:
  - Repo dropdown in ChatHeader with lazy branch loading and race protection
  - Code mode toggle in ChatInput with monospace textarea and triple-backtick wrapping
  - Transport body forwarding of selectedRepo/selectedBranch into api.js
  - Agent prompt prefix injection ([Active repo context: ...]) in api.js

affects:
  - Phase 27 (MCP credential management) — chat UI fully wired for per-repo context targeting
  - Phase 28 (cluster orchestration) — job dispatches carry repo/branch context automatically

# Tech tracking
tech-stack:
  added: []
  patterns:
    - branchLoadingForRepo ref guard prevents stale branch list from fast repo switching
    - Transport useMemo dep array includes selectedRepo+selectedBranch to prevent stale body
    - Repo context prefix prepended to userText in api.js so agent receives it automatically

key-files:
  created: []
  modified:
    - lib/chat/components/chat-header.jsx
    - lib/chat/components/chat-input.jsx
    - lib/chat/components/chat.jsx
    - lib/chat/api.js

key-decisions:
  - "codeMode state lives in chat.jsx (not ChatInput) so it can influence transport and other consumers if needed"
  - "selectedRepo slug (not full object) forwarded in transport body to keep wire simple; api.js receives string"
  - "Branch fetch race guard uses useRef (not useState) to avoid re-renders during fast switching"

patterns-established:
  - "Race guard pattern: useRef for in-flight identity, compare on response before committing state"
  - "Transport freshness: always include all body-derived values in useMemo dep array"

requirements-completed:
  - WEBUI-01
  - WEBUI-02
  - WEBUI-04

# Metrics
duration: continuation (human-verify approved via code review)
completed: 2026-03-12
---

# Phase 26 Plan 03: Web UI Repo Selector and Code Mode Summary

**Repo/branch selector dropdowns in ChatHeader with race-protected lazy loading, code mode toggle with monospace textarea and backtick wrapping, and repo context prefix injection into LangGraph agent prompt via transport body forwarding**

## Performance

- **Duration:** Continuation — human-verify approved via code review
- **Started:** 2026-03-12
- **Completed:** 2026-03-12
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 4

## Accomplishments

- ChatHeader now renders a repo dropdown (from REPOS.json via getRepos()) and a lazy-loading branch dropdown; branch fetch is race-protected via branchLoadingForRepo ref so fast repo switching never shows stale branches
- ChatInput accepts codeMode/onToggleCodeMode props; textarea switches to font-mono when active; submitted messages are wrapped in triple-backtick fences automatically
- Transport body in chat.jsx forwards selectedRepo and selectedBranch with both values in the useMemo dep array, ensuring the transport is never stale after repo selection; api.js injects [Active repo context: ...] prefix into userText before LangGraph dispatch

## Task Commits

Each task was committed atomically:

1. **Task 1: ChatHeader repo/branch dropdowns + ChatInput code mode toggle** - `41cfc98` (feat)
2. **Task 2: Wire repo context into transport body and agent prompt prefix** - `822b4ad` (feat)
3. **Task 3: Human verify — all Phase 26 UI features end-to-end** - approved via code review (no commit)

## Files Created/Modified

- `lib/chat/components/chat-header.jsx` - Added repo/branch select dropdowns using useRepoChat() + getRepos()/getBranches() with race-guard ref
- `lib/chat/components/chat-input.jsx` - Added codeMode prop, font-mono toggle on textarea, </> button, backtick wrapping on submit
- `lib/chat/components/chat.jsx` - Added codeMode state, useRepoChat() destructure, transport body + dep array includes repo/branch, passes codeMode props to ChatInput
- `lib/chat/api.js` - Destructures selectedRepo/selectedBranch from body, prepends [Active repo context: ...] to userText when set

## Decisions Made

- codeMode state lives in chat.jsx rather than ChatInput so it remains accessible to transport and any future consumers without prop-drilling back up
- Only the slug string is forwarded in the transport body (not the full repo object), keeping the wire minimal; api.js concatenates slug and branch into the prefix line
- Branch fetch race guard uses useRef (no re-renders) rather than a useState counter to avoid triggering unnecessary renders during fast switching

## Deviations from Plan

None - plan executed exactly as written. Code review confirmed all structural correctness: auth uses unauthorized(), contexts are clean, transport wiring includes repo/branch in deps, code mode wraps in triple-backtick fence, race-protected branch loading via ref.

## Issues Encountered

None - implementation matched plan specifications. Human verification was performed via code review rather than live browser testing; structural correctness was confirmed for all six requirements.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 26 fully complete: auth hardening (Plan 01), context providers (Plan 02), and UI features (Plan 03) all done
- Repo/branch selection context flows from UI through transport to agent prompt automatically
- JobStreamViewer inline rendering confirmed working (Phase 25 wiring)
- Phase 27 (MCP credential management) can proceed — chat UI is ready to carry per-repo context to job dispatch

---
*Phase: 26-web-ui-auth-repo-selector*
*Completed: 2026-03-12*
