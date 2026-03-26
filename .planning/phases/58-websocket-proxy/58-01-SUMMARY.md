---
phase: 58-websocket-proxy
plan: "01"
subsystem: proxy
tags: [websocket, proxy, hub-routing, terminal]
dependency_graph:
  requires: [Phase 55 HTTP proxy, Phase 57 agent-scoped navigation]
  provides: [WS relay for browser terminal sessions via hub]
  affects: [lib/proxy/http-proxy.js, lib/ws/server.js, workspace terminal client]
tech_stack:
  added: []
  patterns: [Node.js net.createConnection raw TCP relay, bidirectional pipe]
key_files:
  created:
    - templates/app/agent/[slug]/workspaces/[id]/page.jsx
  modified:
    - lib/proxy/http-proxy.js
    - lib/ws/server.js
    - templates/app/workspace/[id]/workspace-terminal-page.jsx
decisions:
  - Dumb-pipe TCP relay via net.createConnection — no WS library needed for relay hop
  - Spoke validates ticket; hub does not re-validate — pass-through only
  - Backward-compatible: agentSlug unset = spoke-direct /ws/terminal/[id] path unchanged
  - sec-websocket-protocol forwarded to preserve tty subprotocol required by ttyd
metrics:
  duration_minutes: 10
  completed_date: "2026-03-26T16:17:53Z"
  tasks_completed: 2
  files_changed: 4
requirements_satisfied: [PROXY-03]
---

# Phase 58 Plan 01: WebSocket Proxy Summary

Hub WS relay via net.createConnection raw TCP pipe — browser terminal connects through wss://clawforge.scalingengine.com/agent/[slug]/ws/terminal/[id] with no direct spoke access.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add attachWsProxy to lib/proxy/http-proxy.js and wire into lib/ws/server.js | dd76644 | lib/proxy/http-proxy.js, lib/ws/server.js |
| 2 | Update workspace-terminal-page.jsx for hub routing + add agent-scoped page shell | 9194314 | templates/app/workspace/[id]/workspace-terminal-page.jsx, templates/app/agent/[slug]/workspaces/[id]/page.jsx |

## What Was Built

### Task 1: WS Proxy Core

Added `attachWsProxy(server)` export to `lib/proxy/http-proxy.js`:

- Guarded by `SUPERADMIN_HUB=true` (same as `attachHttpProxy`)
- Intercepts `server.on('upgrade', ...)` for `/agent/[slug]/ws/terminal/*`
- Resolves slug → spoke URL via existing `resolveInstance()` (no duplication)
- Opens raw TCP connection to spoke via `net.createConnection`
- Forwards HTTP Upgrade headers including `sec-websocket-protocol` (required for ttyd `tty` subprotocol)
- Preserves query string (`?ticket=...` passed through to spoke for ticket validation)
- Bidirectional pipe: `socket.pipe(upstream); upstream.pipe(socket)`
- Clean teardown: `upstream.on('end')` destroys socket and vice versa
- `import net from 'net'` added to top-level imports

Wired in `lib/ws/server.js`:
- Import updated: `{ attachHttpProxy, attachWsProxy }`
- `attachWsProxy(server)` called between `attachHttpProxy` and `attachCodeProxy`

### Task 2: Client-Side Hub Routing

Updated `WorkspaceTerminalPage` in `templates/app/workspace/[id]/workspace-terminal-page.jsx`:
- Added `agentSlug` prop (optional — backward compatible)
- Updated `getWsUrl` callback: when `agentSlug` is set, builds `/agent/${agentSlug}/ws/terminal/${workspaceId}`; falls back to `/ws/terminal/${workspaceId}` when unset
- Updated both close redirect calls: `agentSlug ? /agent/${agentSlug}/workspaces : /workspaces`

Created `templates/app/agent/[slug]/workspaces/[id]/page.jsx`:
- Server component with auth check and workspace status validation
- Passes `agentSlug={slug}` to `WorkspaceTerminalPage`
- Relative imports following templates/ convention (5 levels up to lib/)

## Verification

- `attachWsProxy` exported from `lib/proxy/http-proxy.js` ✓
- `import net from 'net'` present ✓
- `attachWsProxy(server)` called in `lib/ws/server.js` between HTTP proxy and code proxy ✓
- Agent-scoped page shell exists with `agentSlug` prop ✓
- Hub URL built from `agentSlug` in client component ✓
- No hardcoded spoke URLs in templates/ ✓
- `npm run build` passes with no new errors ✓

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data is wired. The page shell reads workspace from DB and passes real data to the terminal component.

## Self-Check: PASSED

- `lib/proxy/http-proxy.js` — exists, contains `attachWsProxy`
- `lib/ws/server.js` — exists, contains `attachWsProxy` call
- `templates/app/agent/[slug]/workspaces/[id]/page.jsx` — exists, contains `agentSlug`
- Commits dd76644 and 9194314 exist in git log
