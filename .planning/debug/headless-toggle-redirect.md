---
status: awaiting_human_verify
trigger: "headless toggle doesn't launch terminal shell. Loads and then redirects to chats page."
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:01Z
---

## Current Focus

hypothesis: CONFIRMED — ensureWorkspaceContainer returns { workspace, created } but launchWorkspace destructures result.workspaceId and result.reused (wrong shape), yielding workspaceId=undefined, causing router.push('/code/undefined'), which page.js can't resolve and redirects to /chats
test: Traced full call stack from headless toggle button → handleLaunchInteractive → launchWorkspace → ensureWorkspaceContainer → return shape mismatch
expecting: Fix result.workspaceId → result.workspace.id and result.reused → !result.created
next_action: Apply fix to lib/chat/components/code/actions.js lines 58-60

## Symptoms

expected: When user toggles headless mode, a terminal/shell UI should appear allowing direct CLI interaction
actual: The page loads briefly then redirects back to the chats page
errors: Unknown
reproduction: Toggle the headless mode switch in the UI
started: Unknown — may be broken from recent changes or never fully wired up

## Eliminated

## Evidence

- timestamp: 2026-03-23T00:00:00Z
  checked: lib/chat/components/chat.jsx — headless toggle button
  found: Headless toggle calls handleLaunchInteractive → launchWorkspace(chatId, repoSlug) → router.push('/code/${workspaceId}')
  implication: If workspaceId is undefined, navigates to /code/undefined

- timestamp: 2026-03-23T00:00:00Z
  checked: templates/app/code/[id]/page.js
  found: getWorkspace(id) — if undefined/not-found OR status !== 'running' → redirect('/chats')
  implication: /code/undefined triggers redirect to /chats immediately

- timestamp: 2026-03-23T00:00:00Z
  checked: lib/chat/components/code/actions.js — launchWorkspace
  found: Calls ensureWorkspaceContainer and then uses result.workspaceId and result.reused
  implication: These fields don't exist on the return value

- timestamp: 2026-03-23T00:00:00Z
  checked: lib/tools/docker.js — ensureWorkspaceContainer return shape
  found: Returns { workspace, created } — workspace is the full DB row, created is a boolean (true=new, false=reused)
  implication: result.workspaceId is undefined; correct access is result.workspace.id; result.reused should be !result.created

## Resolution

root_cause: In lib/chat/components/code/actions.js, launchWorkspace uses result.workspaceId and result.reused after calling ensureWorkspaceContainer, but ensureWorkspaceContainer returns { workspace, created } — not { workspaceId, reused }. This causes workspaceId=undefined to be passed to linkChatToWorkspace and returned to the caller, which then routes to /code/undefined, which page.js cannot resolve and redirects to /chats.
fix: Change result.workspaceId → result.workspace.id and result.reused → !result.created in actions.js lines 58-60
verification: Fix applied. linkChatToWorkspace now receives result.workspace.id (a valid UUID) instead of undefined. Return value correctly passes workspaceId=result.workspace.id and reused=!result.created.
files_changed:
  - lib/chat/components/code/actions.js
