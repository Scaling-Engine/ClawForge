---
status: verifying
trigger: "Replicate upstream thepopebot's workspace terminal system end-to-end. The ClawForge terminal NEVER works — 'Connecting to terminal...' forever."
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED — ClawForge uses a completely different and broken WebSocket architecture vs upstream. Root cause is a mismatch in: (1) WebSocket URL path, (2) proxy location, (3) how the proxy attaches to the server, (4) authentication system, (5) how the terminal component connects.
test: N/A — root cause confirmed through code comparison
expecting: N/A
next_action: Apply fixes to replicate upstream architecture exactly

## Symptoms

expected: Terminal connects and shows interactive shell in workspace
actual: "Connecting to terminal..." forever — never establishes connection
errors: No specific error messages reported yet
reproduction: Open any workspace code page, terminal view shows connecting spinner indefinitely
started: Always broken

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-23T00:30:00Z
  checked: upstream/main:web/server.js
  found: |
    Upstream uses `attachCodeProxy(server)` from `thepopebot/code/ws-proxy`
    and sets `app.didWebSocketSetup = true` to prevent Next.js from registering its own WS handler
  implication: Upstream's WS proxy is attached DIRECTLY to the HTTP server, not as a separate layer

- timestamp: 2026-03-23T00:30:00Z
  checked: upstream/main:lib/code/ws-proxy.js
  found: |
    Upgrade handler matches `/code/{id}/ws` and `/code/{id}/term/{sessionId}/ws`
    Auth via cookie (decodes next-auth JWT directly from cookie header — no ticket system)
    Proxies to `ws://{containerName}:7681/ws` with protocol 'tty'
    No ticket system — uses session cookie authentication
  implication: No separate ticket/handshake step — auth happens inline during WS upgrade

- timestamp: 2026-03-23T00:30:00Z
  checked: upstream/main:lib/code/terminal-view.jsx
  found: |
    Connects directly to `/code/${codeWorkspaceId}/ws` (no ticket, no query params)
    No requestTerminalTicket step — just opens WS immediately
    wsPath prop controls the URL
    ensureContainer called BEFORE connect() to ensure container is running
  implication: Browser connects to ws://.../code/{id}/ws directly — no intermediate ticket

- timestamp: 2026-03-23T00:30:00Z
  checked: lib/ws/server.js (ClawForge)
  found: |
    Upgrade handler only matches `/ws/terminal/*` paths with `?ticket=` param
    Uses a separate ticket system (issueTicket/validateTicket)
    This is a completely different WS URL schema than upstream
  implication: Browser sends WS to /ws/terminal/{id}?ticket=... but proxy expects /code/{id}/ws — MISMATCH

- timestamp: 2026-03-23T00:30:00Z
  checked: templates/app/code/[id]/terminal-view.jsx (ClawForge)
  found: |
    Connects to `/ws/terminal/${workspaceId}?ticket=${currentTicket}&port=${port}`
    Requires a ticket obtained via requestTerminalTicket server action
    If ticket fails, shows "Connecting to terminal..." forever
  implication: The entire auth/ticket pipeline must work AND match the server path for terminal to work

- timestamp: 2026-03-23T00:30:00Z
  checked: lib/ws/proxy.js (ClawForge)
  found: |
    Uses getWorkspace() from 'lib/db/workspaces.js' (different DB from upstream's code workspaces)
    Checks ws.status === 'running' — but code workspaces may use different status field
    Proxies correctly to ws://{containerName}:{port}/ws
  implication: Our proxy may be rejecting connections due to workspace not found in the right table

- timestamp: 2026-03-23T00:30:00Z
  checked: templates/app/code/[id]/code-page.jsx (ClawForge)
  found: |
    Calls requestTerminalTicket(workspaceId, 7681) on mount
    If ticket request fails (e.g. workspace not in 'running' status), shows error
    getWorkspace() in ws/actions.js checks status === 'running'
    But code-workspaces created via startInteractiveMode use different DB table with containerName field
  implication: requestTerminalTicket uses getWorkspace() which looks in WORKSPACE table (old table), not code-workspaces table

## Resolution

root_cause: |
  ARCHITECTURE MISMATCH. ClawForge's terminal uses a completely different and broken system:

  1. WS URL: ClawForge uses `/ws/terminal/{id}?ticket=XXX`, upstream uses `/code/{id}/ws`
  2. Auth: ClawForge uses a ticket system, upstream decodes the session cookie directly in the upgrade handler
  3. Proxy: ClawForge has a separate `lib/ws/proxy.js` using old 'workspaces' DB table; upstream uses `lib/code/ws-proxy.js` reading 'code-workspaces' DB table
  4. Server: Both use custom server; our lib/ws/server.js handles `/ws/terminal/*`; upstream's `web/server.js` calls `attachCodeProxy(server)` for `/code/*/ws`
  5. Terminal component: ClawForge's terminal-view requires a ticket first; upstream's connects directly to `/code/{id}/ws`

  The code-page.jsx in ClawForge uses the OLD workspace system (ticket + /ws/terminal path) while the actual workspace containers are created as CODE workspaces. These two systems never connect.

fix: |
  Replaced broken ticket+/ws/terminal system with upstream's cookie-auth+/code/*/ws architecture:
  1. Created lib/code/ws-proxy.js — upgrade handler for /code/{id}/ws and /code/{id}/term/{sessionId}/ws
     Authenticates via session cookie (next-auth jwt decode), looks up workspace via getWorkspace(),
     proxies to ws://{containerName}:7681/ws using 'tty' subprotocol
  2. Created lib/code/terminal-sessions.js — in-memory session registry (exact copy from upstream)
  3. Created lib/code/actions.js — server actions (ensureCodeWorkspaceContainer, createTerminalSession,
     closeTerminalSession, listTerminalSessions, getContainerGitStatus, closeInteractiveMode) adapted
     for ClawForge's schema (no userId field, uses getWorkspace() + getDocker())
  4. Replaced lib/ws/server.js — removed old ticket-based WS upgrade handler, now uses attachCodeProxy(server)
     and sets app.didWebSocketSetup=true to prevent Next.js from clobbering the upgrade handler
  5. Replaced templates/app/code/[id]/terminal-view.jsx — upstream's version that connects to /code/{id}/ws
     directly (no ticket step), handles auto-reconnect, ensureContainer, theme cycling
  6. Replaced templates/app/code/[id]/code-page.jsx — uses upstream's tab-based architecture with
     ensureCodeWorkspaceContainer and createTerminalSession
  7. Added 'clawforge/code/actions' to package.json exports map

verification: Pending human verification
files_changed:
  - lib/code/ws-proxy.js (created)
  - lib/code/terminal-sessions.js (created)
  - lib/code/actions.js (created)
  - lib/ws/server.js (rewritten)
  - templates/app/code/[id]/terminal-view.jsx (replaced)
  - templates/app/code/[id]/code-page.jsx (replaced)
  - package.json (added ./code/actions export)
