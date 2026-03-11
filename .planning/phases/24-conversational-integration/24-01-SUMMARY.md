---
phase: 24-conversational-integration
plan: 01
subsystem: ai
tags: [langgraph, docker, workspaces, tools, langchain]

# Dependency graph
requires:
  - phase: 23-websocket-browser-terminal
    provides: ensureWorkspaceContainer, workspace DB schema, browser terminal UI
  - phase: 22-workspace-lifecycle
    provides: Docker workspace lifecycle API, workspaces table
provides:
  - start_coding LangGraph tool registered in agent
  - list_workspaces LangGraph tool registered in agent
  - chatContext env var injection (CHAT_CONTEXT) in workspace containers
  - detectPlatform exported from tools.js for Plan 02
  - formatChatContextForInjection helper (last 20 messages, human/AI only)
affects:
  - 24-02 (notification routing uses detectPlatform export)
  - any plan using ensureWorkspaceContainer (CHAT_CONTEXT now available)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dynamic import inside async tool body to avoid circular dependency (agent.js <-> tools.js)
    - JSON-encode chat context to handle newlines/special chars in Docker env vars (cap at 20KB)
    - formatChatContextForInjection: filter to human/ai messages, slice(-20), handle array content blocks

key-files:
  created: []
  modified:
    - lib/tools/docker.js
    - lib/ai/tools.js
    - lib/ai/agent.js

key-decisions:
  - "Dynamic import of agent.js inside startCodingTool async body avoids circular module dependency"
  - "Chat context JSON-encoded and capped at 20KB to prevent oversized Docker env vars"
  - "detectPlatform exported (was module-local) for Plan 02 notification routing"
  - "listWorkspaces called synchronously from db/workspaces.js (already imported in docker.js via reconcileWorkspaces dynamic import, but direct top-level import added in tools.js)"

patterns-established:
  - "Pattern 1: Tool circular dep avoidance - use dynamic await import() inside async tool body, never at module level"
  - "Pattern 2: Chat context hydration - formatChatContextForInjection normalizes LangGraph messages to plain text for container injection"

requirements-completed: [INTG-01, INTG-02, INTG-04]

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 24 Plan 01: Conversational Integration Tools Summary

**Two LangGraph agent tools (start_coding, list_workspaces) wired to workspace lifecycle, with chat context injected into containers via CHAT_CONTEXT env var**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-11T06:02:26Z
- **Completed:** 2026-03-11T06:04:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `start_coding` tool resolves repo aliases, extracts chat history from LangGraph checkpointer via dynamic import, creates/reconnects workspace container, returns workspace URL
- `list_workspaces` tool queries DB and returns formatted list of active workspaces with status and reconnect URLs
- `CHAT_CONTEXT` env var injection added to `ensureWorkspaceContainer` (JSON-encoded, 20KB cap)
- `detectPlatform` exported from tools.js enabling Plan 02 notification routing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add chatContext env var to ensureWorkspaceContainer** - `b233f36` (feat)
2. **Task 2: Create start_coding and list_workspaces LangGraph tools** - `d6f25ab` (feat)

**Plan metadata:** *(this commit)*

## Files Created/Modified
- `lib/tools/docker.js` - Added chatContext param to ensureWorkspaceContainer opts, injects CHAT_CONTEXT env var
- `lib/ai/tools.js` - Added ensureWorkspaceContainer + listWorkspaces imports, formatChatContextForInjection helper, startCodingTool, listWorkspacesTool, exported detectPlatform
- `lib/ai/agent.js` - Added startCodingTool and listWorkspacesTool to import and tools array

## Decisions Made
- Dynamic import of agent.js inside startCodingTool async body avoids circular module dependency (tools.js is imported by agent.js at module level)
- Chat context is JSON-encoded before passing as env var to handle newlines and special characters safely; capped at 20KB
- `detectPlatform` promoted from module-local to exported function since Plan 02 needs it for notification routing
- `formatChatContextForInjection` handles both string and array content blocks (LangGraph messages can have either format)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all changes straightforward with clean interfaces provided in plan context.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 can import `detectPlatform` from tools.js for workspace notification routing
- `CHAT_CONTEXT` env var now available in workspace containers; workspace entrypoint can `JSON.parse(process.env.CHAT_CONTEXT)` to recover chat history
- Both tools are live in the agent and accessible to operators via Slack/Telegram/Web conversation

---
*Phase: 24-conversational-integration*
*Completed: 2026-03-11*
