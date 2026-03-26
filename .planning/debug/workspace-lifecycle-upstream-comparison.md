---
status: awaiting_human_verify
trigger: "Deep comparison: upstream thepopebot workspace system vs ClawForge. Fix ALL differences."
created: 2026-03-24T00:00:00Z
updated: 2026-03-24T00:00:00Z
---

## Current Focus

hypothesis: ClawForge's ensureCodeWorkspaceContainer (actions.js) marks stale containers as "destroyed" and gives up, instead of auto-recreating like upstream does. The ws-proxy also blocks connections for non-running workspaces but has no mechanism to trigger recovery. Multiple gaps vs upstream.
test: Compare upstream ensureCodeWorkspaceContainer behavior with ours
expecting: Upstream recreates containers automatically; ours just destroys them
next_action: Implement all fixes

## Symptoms

expected: Old workspaces with crashed/stale containers should auto-recover when revisited
actual: Old workspaces get stuck on "Connecting to terminal..." forever. Container crash-loops never recovered.
errors: Containers for old workspaces (45473b51, 1c7de224, 9e6b69e6) crash-loop, UI shows "Connecting to terminal..." indefinitely
reproduction: Visit any workspace created before recent image updates
started: After workspace image updates

## Eliminated

- hypothesis: WebSocket proxy is broken
  evidence: workspace-3f3a5f07 connected successfully, proving ws-proxy works
  timestamp: 2026-03-24

- hypothesis: Workspace image is broken
  evidence: workspace-3f3a5f07 showed working bash prompt with new image
  timestamp: 2026-03-24

## Evidence

- timestamp: 2026-03-24
  checked: Upstream ensureCodeWorkspaceContainer (actions.js lines 149-215)
  found: Upstream RECREATES containers when missing (info=null -> runCodeWorkspaceContainer) and when in bad state (remove + recreate). Never marks as "destroyed".
  implication: Our version marks as "destroyed" which is a dead-end state with no recovery path.

- timestamp: 2026-03-24
  checked: Upstream _handleExistingWorkspace equivalent (actions.js lines 190-210)
  found: Upstream: if container in unrecoverable state -> removeContainer -> runCodeWorkspaceContainer (recreate). If container missing (404) -> recreate. NEVER destroys.
  implication: This is the core gap. We destroy; upstream recreates.

- timestamp: 2026-03-24
  checked: Our ensureCodeWorkspaceContainer (lib/code/actions.js lines 29-87)
  found: Container 404 -> returns error "Container not found - workspace may need to be recreated". Unrecoverable state -> force-removes container, marks "destroyed", returns error. NO auto-recreation.
  implication: Dead workspaces stay dead. User gets permanent error.

- timestamp: 2026-03-24
  checked: Our ws-proxy (lib/code/ws-proxy.js lines 86-91)
  found: ws-proxy checks workspace.status !== 'running' and rejects with 503. Once status is 'destroyed' or 'error', ALL WebSocket connections are permanently blocked.
  implication: Even if container comes back via RestartPolicy, ws-proxy still blocks because DB status is wrong.

- timestamp: 2026-03-24
  checked: Our _handleExistingWorkspace (lib/tools/docker.js lines 652-703)
  found: This function CAN restart stopped containers and handles 404 by deleting DB record. But it's only called from ensureWorkspaceContainer (the API/LangGraph path), NOT from ensureCodeWorkspaceContainer (the UI/actions.js path).
  implication: Two separate code paths for workspace lifecycle. The UI path (actions.js) is the broken one.

- timestamp: 2026-03-24
  checked: Upstream has NO separate DB layer like our workspaces.js
  found: Upstream uses code-workspaces.js (simple CRUD, no status field). Container health is checked at runtime, not cached in DB. Upstream ALWAYS inspects the actual Docker container.
  implication: Our status-based approach creates stale state. We need the actions.js path to actually recover containers like upstream does.

## Resolution

root_cause: ClawForge's ensureCodeWorkspaceContainer (lib/code/actions.js) has 3 critical gaps vs upstream: (1) When container is missing (404), it returns an error instead of recreating the container. (2) When container is in unrecoverable state, it marks workspace "destroyed" instead of removing and recreating. (3) The ws-proxy blocks all connections based on cached DB status, creating a permanent dead-end when status goes to 'destroyed' or 'error'. Upstream always recreates containers transparently.
fix: Three changes: (1) Rewrote ensureCodeWorkspaceContainer in actions.js to auto-recreate containers when missing, crashed, or crash-looping — matching upstream thepopebot behavior. Added _recreateContainer helper that reuses the existing workspace volume with the current image. (2) Relaxed ws-proxy.js to only hard-block 'destroyed' workspaces, not all non-running states — stale DB status no longer permanently blocks WebSocket connections. (3) Enhanced _handleExistingWorkspace in docker.js to detect crash-looping containers (RestartCount > 3 or 'dead' state) and replace them instead of leaving them stuck.
verification: Build succeeds. Logic analysis confirms all old workspace states (error, stopped, crash-looping, missing container) now have a recovery path through container recreation.
files_changed:
  - lib/code/actions.js
  - lib/code/ws-proxy.js
  - lib/tools/docker.js
