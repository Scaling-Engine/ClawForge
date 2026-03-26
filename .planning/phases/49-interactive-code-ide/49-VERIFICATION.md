---
phase: 49-interactive-code-ide
verified: 2026-03-19T07:30:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 49: Interactive Code IDE Verification Report

**Phase Goal:** Cherry-pick upstream /code/{id} tabbed IDE page (Code + Shell + Editor tabs). Wire "Interactive" toggle to launch Docker containers and redirect. Link chats to workspaces via codeWorkspaceId FK. Tab system with DnD support.
**Verified:** 2026-03-19T07:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | codeWorkspaceId column exists on chats table as a nullable FK to codeWorkspaces | VERIFIED | `lib/db/schema.js:17` — `codeWorkspaceId: text('code_workspace_id')` present in chats table definition |
| 2 | /code/{id} page loads with auth gate and workspace lookup | VERIFIED | `templates/app/code/[id]/page.js` — `auth()` call on line 10, `redirect('/login')` on unauth, `redirect('/chats')` if workspace missing or not running |
| 3 | launchWorkspace Server Action starts or reuses a workspace container and links it to a chat | VERIFIED | `lib/chat/components/code/actions.js:25-61` — calls `ensureWorkspaceContainer`, then `linkChatToWorkspace`, returns `{ workspaceId, reused }` |
| 4 | launchWorkspace Server Action validates repoSlug is a valid owner/repo format before constructing GitHub URL | VERIFIED | `lib/chat/components/code/actions.js:13-15` — `isValidRepoSlug` regex `/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/` applied before URL construction |
| 5 | getWorkspaceByChatId query returns a workspace linked to a specific chat | VERIFIED | `lib/db/workspaces.js:150-157` — looks up chat by ID, reads `codeWorkspaceId`, fetches workspace, excludes destroyed status |
| 6 | /code/{id} page renders three tabs (Code, Shell, Editor) with DnD reordering | VERIFIED | `templates/app/code/[id]/code-page.jsx:11-15` — `INITIAL_TABS` array with 'code', 'shell', 'editor'; DndContext + SortableContext wired at lines 144-157 |
| 7 | Shell tab connects to workspace container via WebSocket and shows xterm.js terminal | VERIFIED | `templates/app/code/[id]/terminal-view.jsx` — dynamic imports of `@xterm/xterm`, FitAddon, WebSocket with ttyd binary protocol, disconnect/reconnect flow |
| 8 | Editor tab shows file tree from workspace container | VERIFIED | `templates/app/code/[id]/editor-view.jsx:4,21` — imports `requestFileTree`, calls it on mount with 10-second polling interval |
| 9 | Interactive button in chat input launches workspace and redirects to /code/{id} | VERIFIED | `lib/chat/components/chat-input.jsx:306-322` — Interactive button with `onClick={onLaunchInteractive}`; `lib/chat/components/chat.jsx:88-107` — `handleLaunchInteractive` calls `launchWorkspace` then `router.push('/code/{workspaceId}')` |
| 10 | If chat already has a linked running workspace, Interactive button shows Resume and redirects directly | VERIFIED | `chat-input.jsx:322` — `linkedWorkspaceId ? 'Resume' : 'Interactive'`; `chat.jsx:90-92` — navigates directly to `/code/${linkedWorkspaceId}` without re-launching |
| 11 | Switching tabs preserves terminal state (no xterm.js remount) | VERIFIED | `code-page.jsx:302` — `display: tab.id === activeTabId ? 'block' : 'none'` — all panels rendered simultaneously, visibility-toggled only |
| 12 | Interactive button is disabled with tooltip when no repo is selected | VERIFIED | `chat-input.jsx:311-312` — `disabled={isStreaming \|\| isLaunching \|\| (!linkedWorkspaceId && !hasRepoSelected)}`; `title={!linkedWorkspaceId && !hasRepoSelected ? 'Select a repo first' : undefined}` |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `lib/db/schema.js` | codeWorkspaceId FK on chats table | VERIFIED | Line 17: `codeWorkspaceId: text('code_workspace_id')` |
| `lib/db/workspaces.js` | getWorkspaceByChatId and linkChatToWorkspace | VERIFIED | Both exported functions present at lines 150-168; imports `chats` from schema |
| `lib/chat/components/code/actions.js` | launchWorkspace and getLinkedWorkspace Server Actions | VERIFIED | `'use server'` on line 1; both functions exported with auth gate and role check |
| `templates/app/code/[id]/page.js` | /code/{id} page server component with auth gate | VERIFIED | `auth()` called, redirects to /login and /chats, dynamic import of code-page.jsx |
| `templates/app/code/[id]/code-page.jsx` | Main Code IDE client component with tabbed layout and DnD | VERIFIED | DndContext, SortableContext, 3-tab system, display-toggle panels, Close Workspace flow |
| `templates/app/code/[id]/sortable-code-tab.jsx` | Sortable tab component using @dnd-kit/sortable | VERIFIED | `useSortable` imported; `role="tab"`, `aria-selected`, `aria-controls` on button element |
| `templates/app/code/[id]/terminal-view.jsx` | Shell tab with xterm.js terminal and WebSocket attach | VERIFIED | `@xterm/xterm` dynamic import; WebSocket URL pattern `/ws/terminal/${workspaceId}`; ttyd binary protocol; disconnect/reconnect |
| `templates/app/code/[id]/editor-view.jsx` | Editor tab with file tree sidebar | VERIFIED | `requestFileTree` called on mount, expandable directories (`aria-expanded`), 240px sidebar |
| `lib/chat/components/chat-input.jsx` | Interactive button for launching workspace | VERIFIED | Interactive/Launching.../Resume states; all new props in signature; `aria-label="Launch interactive workspace"` |
| `lib/chat/components/chat.jsx` | Workspace launch wiring | VERIFIED | `useRouter`, `launchWorkspace`/`getLinkedWorkspace` imports; `handleLaunchInteractive`; both ChatInput instances receive new props |
| `drizzle/0011_dapper_thor_girl.sql` | Schema migration for codeWorkspaceId | VERIFIED | Contains `ALTER TABLE 'chats' ADD 'code_workspace_id' text;` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/chat/components/code/actions.js` | `lib/tools/docker.js` | ensureWorkspaceContainer call | WIRED | Line 50: `const result = await ensureWorkspaceContainer({...})` |
| `lib/chat/components/code/actions.js` | `lib/db/workspaces.js` | getWorkspaceByChatId for reuse check | WIRED | Line 38: `const existing = getWorkspaceByChatId(chatId)` |
| `templates/app/code/[id]/page.js` | `lib/db/workspaces.js` | getWorkspace lookup | WIRED | Line 3: `import { getWorkspace } from 'clawforge/db/workspaces'`; line 14: `const workspace = getWorkspace(id)` |
| `lib/chat/components/chat-input.jsx` | `lib/chat/components/code/actions.js` | launchWorkspace Server Action call | WIRED | Via `onLaunchInteractive` prop; wired in `chat.jsx:12,101` — direct import and call |
| `templates/app/code/[id]/page.js` | `templates/app/code/[id]/code-page.jsx` | dynamic import of client component | WIRED | Line 21: `const { default: CodePageClient } = await import('./code-page.jsx')` |
| `templates/app/code/[id]/code-page.jsx` | `lib/ws/actions.js` | requestTerminalTicket for shell tab | WIRED | Line 9: import from `clawforge/ws/actions`; line 63: `requestTerminalTicket(workspaceId, 7681)` |
| `templates/app/code/[id]/editor-view.jsx` | `lib/ws/actions.js` | requestFileTree for file listing | WIRED | Line 4: import from `clawforge/ws/actions`; line 21: `requestFileTree(workspaceId)` |

All 7 key links verified as WIRED.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| IDE-01 | 49-01 + 49-02 | /code/{id} page renders with Code, Shell, and Editor tabs with DnD reordering via @dnd-kit | SATISFIED | code-page.jsx: DndContext + 3-tab INITIAL_TABS + SortableCodeTab; page.js: auth-gated server component |
| IDE-02 | 49-02 | Interactive button in chat input launches a Docker workspace container via ensureWorkspaceContainer and redirects to /code/{id} | SATISFIED | chat-input.jsx: Interactive button; chat.jsx: handleLaunchInteractive → launchWorkspace → ensureWorkspaceContainer → router.push |
| IDE-03 | 49-01 | codeWorkspaceId nullable FK column on chats table links chat sessions to their associated workspace | SATISFIED | schema.js: `codeWorkspaceId: text('code_workspace_id')`; migration 0011 applied; getWorkspaceByChatId + linkChatToWorkspace in workspaces.js |
| IDE-04 | 49-02 | Shell tab connects to workspace container via WebSocket (xterm.js + addon-attach) with disconnect/reconnect support | SATISFIED | terminal-view.jsx: dynamic xterm.js import, WebSocket to `/ws/terminal/${workspaceId}`, ttyd binary protocol, Reconnect button via requestTerminalTicket |
| IDE-05 | 49-02 | Editor tab displays file tree from workspace container via requestFileTree Server Action | SATISFIED | editor-view.jsx: requestFileTree on mount + 10s polling, expandable directory tree with aria-expanded, 240px sidebar |

All 5 requirements (IDE-01 through IDE-05) SATISFIED.

No orphaned requirements — all IDE-* IDs map to Phase 49 and are accounted for across the two plans.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `templates/app/code/[id]/code-page.jsx` | 19 | JSDoc comment "Code (AI streaming placeholder)" | Info | Documents intentional future work — Code tab content is a placeholder by design per the plan; AI streaming is Phase 50 scope |

No blockers. The "placeholder" label appears only in a JSDoc comment describing intended future behavior. The Code tab renders a visible, intentional placeholder message ("Select a repo and send a message to start coding.") which is the specified behavior for Phase 49.

---

### Human Verification Required

#### 1. Terminal WebSocket connection end-to-end

**Test:** Launch a workspace, navigate to /code/{id}, switch to Shell tab, verify xterm.js terminal appears and accepts keyboard input.
**Expected:** Terminal connects to ttyd in workspace container, command output renders with correct Catppuccin Mocha theme.
**Why human:** WebSocket + ttyd binary protocol + live container required; cannot verify without running Docker infrastructure.

#### 2. DnD tab reordering

**Test:** In the Code IDE page, drag a tab to a new position using 5px activation distance.
**Expected:** Tabs reorder visually and the correct panel remains active after reorder.
**Why human:** Drag-and-drop interaction requires browser + pointer events.

#### 3. Interactive button flow from chat

**Test:** Open a chat with Code mode active, select a repo, click Interactive. Verify Launching... state appears, workspace container starts, redirect to /code/{workspaceId} occurs.
**Expected:** Button shows Launching..., then navigates to IDE page with Shell tab showing connected terminal.
**Why human:** Requires live Docker, GitHub repo access, and full Next.js runtime.

#### 4. Resume button state persistence

**Test:** Launch a workspace from chat, navigate back to chat, verify Interactive button now shows Resume.
**Expected:** getLinkedWorkspace on Chat mount returns the linked workspace and button label changes.
**Why human:** Requires round-trip to running workspace container and page re-render.

#### 5. Close Workspace unsafe flow

**Test:** Make uncommitted changes in the workspace shell, click Close Workspace.
**Expected:** Inline warning panel appears showing uncommitted file count; Close Anyway navigates to /chats; Keep Working dismisses panel.
**Why human:** Requires live git state inside a running container.

---

### Gaps Summary

No gaps found. All observable truths verified, all artifacts are substantive and wired, all 5 requirements satisfied, build passes, commits confirmed in git history.

---

_Verified: 2026-03-19T07:30:00Z_
_Verifier: Claude (gsd-verifier)_
