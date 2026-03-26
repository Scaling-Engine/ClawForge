---
status: investigating
trigger: "ClawForge Code mode needs to match upstream thepopebot v1.2.73 capabilities — rename toggles, integrate headless/interactive switch, tab system, subscription auth"
created: 2026-03-19T00:00:00Z
updated: 2026-03-19T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — The gap is a UX restructuring + feature integration problem. We have all the underlying tech but the chat UI layer doesn't match upstream's unified "Code mode" experience.
test: Full codebase comparison complete
expecting: n/a — root cause confirmed
next_action: Document file-by-file change plan

## Symptoms

expected: |
  1. "Code" toggle switches to headless Claude Agent SDK mode (tool calls visible inline)
  2. Sub-toggle for "Headless" vs interactive xterm.js shell
  3. Tab system for multiple Code/Shell sessions
  4. Claude subscription support
  5. Mobile session continuity

actual: |
  1. "Code" toggle just wraps text in backticks and sets font-mono
  2. ">_" terminal toggle is the actual headless SDK mode (separate from Code)
  3. Tool calls render via terminal-tool-call.jsx but only in terminal mode
  4. Workspace system (lib/ws/) exists but disconnected from chat UI
  5. No headless/interactive switch

errors: Feature gap, not a bug.

reproduction: Visit clawforge.scalingengine.com, observe Code toggle vs >_ toggle behavior

started: Since fork from thepopebot — upstream evolved significantly in v1.2.73

## Eliminated

- hypothesis: Maybe upstream uses a different streaming protocol for code mode tool calls
  evidence: Both use identical UIMessageStream writer protocol (tool-input-start, tool-input-available, tool-output-available). Our sdk-bridge.js already emits the same events.
  timestamp: 2026-03-19

- hypothesis: Maybe we need a totally new backend for code mode
  evidence: Our /stream/terminal endpoint (terminal-api.js) already does what upstream's /stream/chat with codeMode=true does — runs Claude Agent SDK, streams tool calls. The gap is purely in the chat UI layer.
  timestamp: 2026-03-19

## Evidence

- timestamp: 2026-03-19
  checked: Upstream chat.jsx (upstream/main)
  found: |
    Upstream has a UNIFIED code mode flow:
    - `codeMode` state (boolean) — when true, activates repo/branch pickers and sends `codeMode: true` to /stream/chat
    - `codeModeType` state ('plan' | 'code') — Plan mode = read-only analysis, Code mode = makes changes
    - `workspaceState` — tracks workspace ID, repo, branch, containerName, featureBranch
    - When `containerName` is set, chat redirects to `/code/{workspaceId}` for interactive mode
    - `codeModeSettings` object passed to ChatInput with: mode, onModeChange, isInteractiveActive, onInteractiveToggle, togglingMode
  implication: Upstream has NO separate "terminal" concept in the chat — it's all "Code mode" with sub-modes

- timestamp: 2026-03-19
  checked: Upstream code-mode-toggle.jsx
  found: |
    - Slide toggle with repo/branch pickers (Combobox components)
    - When locked (after first message): shows branch bar with feature branch info
    - NO headless toggle visible in this component (removed or never existed here)
    - `handleModeToggle` launches interactive mode via startInteractiveMode() from lib/code/actions.js
  implication: The "Code" toggle is the entry point; repo+branch selection happens inline

- timestamp: 2026-03-19
  checked: Upstream chat-input.jsx
  found: |
    - Has `codeMode` and `codeModeSettings` props
    - When codeMode is active, shows Plan/Code dropdown (green=Code, red=Plan)
    - Has "Interactive" toggle button that launches Docker container
    - No ">_" terminal toggle, no "$" shell toggle, no "</>" code toggle
  implication: Upstream collapsed all modes into one unified Code mode with Plan/Code sub-mode

- timestamp: 2026-03-19
  checked: Upstream lib/code/ directory
  found: |
    - code-page.jsx — Full tabbed IDE experience with DnD tabs (Code, Shell, Editor types)
    - terminal-view.jsx — xterm.js terminal with WebSocket proxy to Docker container
    - editor-view.jsx — File editor tab
    - actions.js — Server actions: startInteractiveMode, closeInteractiveMode, createTerminalSession, etc.
    - terminal-sessions.js — In-memory session registry (port allocation, session tracking)
    - ws-proxy.js — WebSocket auth + proxy to container's ttyd port 7681
  implication: Interactive mode is a SEPARATE PAGE (/code/{id}), not embedded in chat

- timestamp: 2026-03-19
  checked: Upstream tool-call.jsx vs our message.jsx + terminal-tool-call.jsx
  found: |
    - Upstream has a simpler ToolCall component (collapsible, shows Input/Output)
    - Our TerminalToolCall is MORE advanced (thinking panels, diff views, syntax highlighting)
    - Our message.jsx already routes Claude Code tool names to TerminalToolCall
    - Both use same UIMessageStream protocol
  implication: Our tool call rendering is actually BETTER than upstream's — just needs to be used in the right context

- timestamp: 2026-03-19
  checked: Upstream /stream/chat API (lib/chat/api.js)
  found: |
    - When codeMode is true, passes repo/branch/codeModeType/workspaceId to chatStream()
    - The AI agent layer (LangGraph) handles code operations differently based on codeModeType
    - Tool calls are streamed using same writer protocol
    - Creates workspace link via finalizeChat endpoint
  implication: Upstream's "headless" code mode runs through the SAME /stream/chat endpoint, not a separate terminal endpoint

- timestamp: 2026-03-19
  checked: Our ClawForge toggles in chat.jsx + chat-input.jsx
  found: |
    THREE separate toggles, mutually exclusive logic:
    1. `codeMode` — wraps text in backticks, sets font-mono, sends `interactiveMode: true` to /stream/chat
    2. `terminalMode` — switches transport to /stream/terminal (SDK bridge), mutually exclusive with codeMode
    3. `shellMode` — sub-toggle of terminalMode, wraps input as bash command
    Our `terminalMode` IS upstream's "Code mode" (headless SDK), but named differently and separate
  implication: Need to merge terminalMode INTO codeMode, rename, and add repo/branch flow

- timestamp: 2026-03-19
  checked: DB schema differences
  found: |
    Upstream codeWorkspaces: userId, containerName, repo, branch, featureBranch, title, codingAgent, lastInteractiveCommit, starred
    Our codeWorkspaces: instanceName, repoSlug, repoUrl, containerId, containerName, volumeName, featureBranch, status, threadId
    Upstream chats has codeWorkspaceId FK — ours does NOT
    Upstream has NO separate terminalSessions table — ours does (for SDK sessions)
  implication: Schema divergence is significant but our schema is richer for multi-instance. May need to add codeWorkspaceId to chats.

## Resolution

root_cause: |
  ClawForge's chat UI has THREE disconnected toggles (Code, Terminal, Shell) that should be ONE unified "Code mode" with sub-modes matching upstream:

  1. NAMING MISMATCH: Our "terminalMode" (>_ toggle) IS upstream's "Code mode" — it runs Claude Agent SDK headlessly with tool calls visible. But we call it "terminal" and hide it behind a separate toggle.

  2. MISSING INTEGRATION: Our "codeMode" (</> toggle) does almost nothing — just wraps text in backticks. Upstream's "Code mode" does repo selection, creates workspaces, streams tool calls, and offers Plan/Code sub-modes.

  3. DISCONNECTED INTERACTIVE MODE: Our workspace system (lib/ws/) runs Docker containers with xterm.js but has no path FROM the chat UI to launch it. Upstream's chat has an "Interactive" toggle that launches a container and redirects to /code/{id}.

  4. MISSING CODE PAGE: Upstream has a full `/code/{id}` page with tabbed IDE (Code + Shell + Editor tabs, DnD reorder). We have the ws-proxy infrastructure but no equivalent page.

  5. MISSING FEATURES-CONTEXT GATE: Upstream gates code workspace behind `features?.codeWorkspace` flag. We have a features-context but don't use it for this.

fix: |
  Phase 1 — Unify toggles in chat UI:
  - Remove the current `codeMode` toggle (</> backtick wrapping) entirely
  - Rename `terminalMode` to `codeMode` — this becomes the "Code" toggle
  - When Code is on: show repo/branch pickers (cherry-pick CodeModeToggle from upstream)
  - Add Plan/Code sub-mode dropdown in ChatInput
  - Route Code mode to /stream/terminal (our SDK bridge) which already works
  - Shell mode becomes a sub-toggle of Code mode (keep existing behavior)

  Phase 2 — Interactive mode bridge:
  - Add "Interactive" toggle in ChatInput (launches Docker container)
  - Create /code/{id} page (cherry-pick from upstream lib/code/code-page.jsx)
  - Wire workspace creation into chat finalization flow
  - Add codeWorkspaceId FK to chats table

  Phase 3 — Polish:
  - Gate behind features.codeWorkspace flag
  - Mobile session continuity (already mostly works via session IDs)
  - Claude subscription auth (investigate SDK support for --login)

  FILES TO CHANGE (Phase 1 — minimum viable):
  - lib/chat/components/chat.jsx — Remove old codeMode/terminalMode split, unify into single codeMode with repo/branch state
  - lib/chat/components/chat-input.jsx — Remove ">_", "$", "</>" toggles; add Plan/Code dropdown + Interactive toggle
  - lib/chat/components/code-mode-toggle.jsx — NEW FILE, cherry-pick from upstream with adaptations
  - lib/chat/components/ui/combobox.jsx — NEW FILE, needed by code-mode-toggle (repo/branch pickers)
  - lib/chat/actions.js — Add getRepositories() and getBranches() server actions (or adapt from upstream)

  FILES TO CHANGE (Phase 2 — interactive mode):
  - lib/code/code-page.jsx — NEW FILE, cherry-pick from upstream
  - lib/code/terminal-view.jsx — NEW FILE, cherry-pick from upstream (we have ws-proxy already)
  - lib/code/editor-view.jsx — NEW FILE, cherry-pick from upstream
  - lib/code/actions.js — NEW FILE, server actions for workspace lifecycle
  - lib/code/terminal-sessions.js — NEW FILE, in-memory session registry
  - lib/db/schema.js — Add codeWorkspaceId to chats table, possibly adjust codeWorkspaces columns

verification:
files_changed: []
