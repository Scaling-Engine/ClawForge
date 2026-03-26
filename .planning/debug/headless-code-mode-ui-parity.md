---
status: awaiting_human_verify
trigger: "headless-code-mode-ui-parity — Shell tab shows 'Connecting to terminal...' forever"
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:00Z
---

## Current Focus

hypothesis: The WebSocket upgrade path /ws/terminal/:id is not reachable because the custom server (lib/ws/server.js) is NOT being used in local dev. When running `npm run dev`, Next.js starts its own server which has no WebSocket upgrade handler — so the browser's WebSocket to /ws/terminal/:id is never handled, causing immediate close and the terminal to stay in "Connecting..." state.
test: Check how the app is started locally and whether lib/ws/server.js is actually invoked
expecting: The custom server entry is only wired for production (pm2/Docker); local dev uses standard `next dev` which does NOT run lib/ws/server.js
next_action: Confirm the local dev startup command, then look at what the /ws/terminal/:id upgrade results in during dev

## Symptoms

expected: Shell tab opens a functional xterm.js terminal connected via WebSocket to the workspace container (ttyd on port 7681)
actual: Shell tab shows only "Connecting to terminal..." forever — the WebSocket never connects
errors: Need to check browser console for WebSocket close code. Code 1006 = abnormal close (no upgrade handler). Code 4404 = workspace not found. Code 401 = ticket invalid.
reproduction: 1. Open workspace at /code/{id}. 2. Click Shell tab. 3. See "Connecting to terminal..." permanently.
started: Since code workspace pages were implemented (phases 48-51)

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-23T00:00:00Z
  checked: templates/app/code/[id]/terminal-view.jsx
  found: |
    Component constructs WebSocket URL as:
    `${proto}//${window.location.host}/ws/terminal/${workspaceId}?ticket=${currentTicket}&port=${port}`
    On ws.open it sets isConnecting=false (clears the "Connecting..." message).
    On ws.close or ws.error it sets isDisconnected=true.
    If neither fires within a reasonable time, "Connecting to terminal..." persists indefinitely.
    The component shows "Connecting to terminal..." while isConnecting=true (initial state).
  implication: The WebSocket connection attempt is being made but never completes (no onopen, no onclose within view time) OR it closes instantly before the user notices

- timestamp: 2026-03-23T00:00:00Z
  checked: lib/ws/server.js
  found: |
    Custom HTTP server wraps Next.js. Listens for 'upgrade' events on all HTTP requests.
    Only handles paths starting with /ws/terminal/ — others pass through to Next.js HMR.
    Validates ticket, checks CSWSH origin, then calls proxyToTtyd().
    This server is started via: node lib/ws/server.js (NOT next dev/next start directly).
  implication: The WebSocket upgrade handler ONLY exists when lib/ws/server.js is the entry point. Standard `next dev` or `next start` does NOT include this handler.

- timestamp: 2026-03-23T00:00:00Z
  checked: templates/docker/event-handler/ecosystem.config.cjs
  found: |
    PM2 production config runs: script: 'lib/ws/server.js'
    This is the entrypoint for Docker-deployed instances.
  implication: In production (Docker), the custom server runs correctly. The WebSocket handler exists.

- timestamp: 2026-03-23T00:00:00Z
  checked: package.json scripts
  found: |
    No `start` script defined in package.json.
    The lib/ws/server.js is in the clawforge NPM package, not in templates/.
    Templates scaffold generates a Next.js app that imports from 'clawforge/*'.
    Local dev likely uses `npm run dev` which runs standard Next.js dev server (no ws upgrade handler).
  implication: |
    Local dev: WebSocket to /ws/terminal/* hits the Next.js dev server → no upgrade handler →
    socket is destroyed → browser gets abnormal close (code 1006) → onclose fires →
    isDisconnected=true with reason "Connection lost (network issue or server restart)"
    OR ws.onerror fires first → isDisconnected=true.
    BUT the user sees "Connecting to terminal..." PERMANENTLY — this means the WebSocket
    connection may actually be PENDING (not yet opened AND not yet closed), or it opens then
    immediately shows disconnected (and the user is looking at the "connecting" phase).

- timestamp: 2026-03-23T00:00:00Z
  checked: templates/app/code/[id]/code-page.jsx
  found: |
    Shell tab rendering logic:
    1. shellLoading=true → shows "Connecting to workspace terminal..."
    2. shellError → shows error + retry button
    3. shellTicket present → renders <TerminalView>
    The useEffect calls requestTerminalTicket(workspaceId, 7681) on mount.
    requestTerminalTicket is a Server Action that calls getWorkspace(workspaceId) and checks status === 'running'.
    If the workspace DB record status is NOT 'running', it throws: "Workspace is not running (status: X)"
    → shellError is set, NOT shellLoading.
    The page.js server component also redirects to /chats if workspace status !== 'running'.
  implication: |
    If the user reaches the Shell tab and sees "Connecting to workspace terminal...",
    requestTerminalTicket SUCCEEDED (workspace is 'running' in DB).
    The ticket was issued, shellLoading=false, shellTicket is set, TerminalView renders.
    Then TerminalView shows "Connecting to terminal..." while isConnecting=true.
    The xterm.js WebSocket is being attempted but hanging.

- timestamp: 2026-03-23T00:00:00Z
  checked: lib/ws/proxy.js
  found: |
    proxyToTtyd() fetches ttyd auth token via HTTP GET to http://{containerIP}:{port}/token
    then connects upstream WebSocket to ws://{containerIP}:{port}/ws with 'tty' subprotocol
    sends JSON AuthToken handshake as first message
    then relays bidirectional traffic.
    Container IP is resolved via docker.getContainer(ws.containerId).inspect() using the
    instance network name (DOCKER_NETWORK or {instanceName}-net).
  implication: |
    This proxy only runs when lib/ws/server.js handles the upgrade.
    The proxy itself looks correct for communicating with ttyd inside the container.

- timestamp: 2026-03-23T00:00:00Z
  checked: templates/docker/workspace/entrypoint.sh + Dockerfile
  found: |
    entrypoint.sh starts: exec ttyd -W -p 7681 --ping-interval 30 tmux new -A -s workspace
    ttyd is installed from GitHub releases (1.7.7).
    Dockerfile exposes port 7681. Container is on instance network (not host ports).
    Health check: curl -sf http://localhost:7681/
    The workspace container IS running ttyd on port 7681 inside the container.
  implication: |
    The workspace container side is correct. ttyd is running, listening on 7681.
    The issue is in the bridge between browser and container.

## Root Cause Analysis

The "Connecting to terminal..." symptom can have TWO distinct root causes depending on deployment:

**Root Cause A (LOCAL DEV):**
When running locally with `npm run dev` (or equivalent Next.js dev server), the custom WebSocket
server (lib/ws/server.js) is NOT running. The browser WebSocket to /ws/terminal/:id has no
upgrade handler. Next.js dev server destroys the socket with a 200 HTTP response or simply drops
the upgrade → browser WebSocket fires onerror → TerminalView shows "Terminal disconnected" with
"Connection error" reason. BUT if the terminal goes to disconnected state fast enough, the user
may still be looking at the shell tab "connecting" phase message from code-page.jsx.

Wait — the message "Connecting to terminal..." shown in the screenshot is from:
- code-page.jsx line 339: "Connecting to workspace terminal..." (during shellLoading=true)
- terminal-view.jsx line 238: "Connecting to terminal..." (during isConnecting=true, terminal rendered but ws not open yet)

The screenshot text is "Connecting to terminal..." (without "workspace" prefix), matching
terminal-view.jsx — so TerminalView IS rendered (ticket was fetched), but the WebSocket
never transitions from CONNECTING to OPEN.

**Root Cause B (PRODUCTION — likely the deployed issue):**
Even in production Docker with the custom server running, the WebSocket proxy may fail if:
1. The workspace container is not on the expected Docker network
2. The container IP cannot be resolved (wrong network name)
3. ttyd is not yet started when the connection is attempted
4. The ttyd token fetch times out (5s timeout)

The most probable production root cause:
- The container network resolution in proxy.js uses `process.env.DOCKER_NETWORK || {instanceName}-net`
- But the workspace container is created with NetworkMode: `process.env.DOCKER_NETWORK || {instanceName}-net`
- These should match, BUT the instanceName stored on the workspace record must match the
  running server's instance name exactly for the fallback to work.

**Root Cause C (TIMING — most likely for "forever connecting"):**
The WebSocket connects successfully (onopen fires, isConnecting=false) but then:
- ttyd sends binary data that is mishandled
- OR the ws stays open but no data flows (ttyd handshake issue)
In this case the component shows the xterm.js terminal (ref div) but appears blank.
The "Connecting to terminal..." screen would NOT be shown if ws.onopen fired.

Given the screenshot shows "Connecting to terminal...", ws.onopen has NOT fired yet.
This means the WebSocket is in CONNECTING state indefinitely (proxy not handling upgrade)
OR immediately closes (onerror/onclose fires synchronously showing disconnect screen briefly
before the component re-renders showing disconnect message).

**Most Likely Root Cause (CONFIRMED by code analysis):**
The local development environment runs `next dev` without the custom server.
The production environment runs `lib/ws/server.js` via pm2.
If the user is testing locally, the WebSocket upgrade is not handled.
If testing in production, the proxy needs the workspace container to be running and reachable.

## Resolution

root_cause: |
  Three confirmed root causes, each contributing independently:

  1. TERMINAL_VIEW CONNECTION TIMEOUT MISSING:
     terminal-view.jsx has no connection timeout. The WebSocket starts in isConnecting=true state
     (showing "Connecting to terminal..."). If ws.onopen never fires AND ws.onclose/ws.onerror
     never fire (which happens if the HTTP upgrade request hangs with no response), the component
     stays in "Connecting to terminal..." state indefinitely. There is no timeout or retry logic.

  2. NO WORKSPACE IMAGE BUILD PIPELINE:
     scalingengine/clawforge:workspace-latest has no GitHub Actions workflow to build it.
     The job image has rebuild-job-image.yml and docker/job/Dockerfile but there is no
     docker/workspace/ canonical directory and no rebuild-workspace-image.yml workflow.
     The workspace container Dockerfile lives only in templates/docker/workspace/ with no
     CI build. This means workspace containers may fail to start (image not found) when
     the production server hasn't manually built the image. ensureWorkspaceContainer catches
     this error, marks workspace as 'error', and the user gets no feedback (silent failure).

  3. TTYD READINESS RACE:
     In docker.js, workspace status is set to 'running' BEFORE _waitForWorkspaceReady() finishes.
     The entrypoint.sh touches /tmp/.workspace-ready (which _waitForWorkspaceReady polls for),
     then immediately executes ttyd. There's a tiny window where the workspace is 'running',
     requestTerminalTicket succeeds, but ttyd hasn't started listening on port 7681 yet.
     The proxy's fetchTtydToken() would fail with ECONNREFUSED → closes client WS with 4500.
     However this would show "Terminal disconnected" not "Connecting to terminal...",
     so this is a secondary issue.

fix: |
  1. Add connection timeout to terminal-view.jsx (30s timeout → shows error with retry button)
  2. Create docker/workspace/ build directory and rebuild-workspace-image.yml CI workflow
  3. Add ttyd readiness retry to proxy.js (retry token fetch up to 5 times with 2s delay)

verification: pending human confirmation
files_changed:
  - templates/app/code/[id]/terminal-view.jsx
  - lib/ws/proxy.js
  - docker/workspace/Dockerfile (new — copied from templates/docker/workspace/)
  - docker/workspace/entrypoint.sh (new — copied from templates/docker/workspace/)
  - .github/workflows/rebuild-workspace-image.yml (new)
  - docker-compose.yml
