# Phase 58: WebSocket Proxy - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Mode:** Smart discuss (grey areas presented, all accepted)

<domain>
## Phase Boundary

Add WebSocket proxy to the hub so browser terminal sessions route through `wss://clawforge.scalingengine.com/agent/[slug]/ws/*` instead of connecting directly to spoke instance subdomains. Extends the existing HTTP proxy layer (Phase 55) with upgrade handling.

</domain>

<decisions>
## Implementation Decisions

### D-01: WS Proxy Location
New `attachWsProxy(server)` function in `lib/proxy/http-proxy.js` — same file as HTTP proxy, shares `resolveInstance()`. Called from `lib/ws/server.js` alongside existing upgrade handlers.

### D-02: URL Pattern
`/agent/[slug]/ws/*` triggers the WS proxy. Hub strips `/agent/[slug]` prefix and forwards to spoke. E.g., `wss://hub/agent/noah/ws/terminal/abc?ticket=xyz` → `ws://noah-app:80/ws/terminal/abc?ticket=xyz`.

### D-03: Auth
Pass-through ticket auth. Spoke instance validates the ticket as it does for direct connections. Hub doesn't re-validate — it's a dumb pipe.

### D-04: Client-Side WS URL
When on `/agent/[slug]/workspaces/[id]`, terminal component builds WS URL as `wss://[current-host]/agent/[slug]/ws/terminal/[workspaceId]?ticket=...`. No hardcoded spoke URLs in browser.

### D-05: Reconnection
No hub-side reconnect logic. ttyd client handles reconnect natively. Hub proxy is dumb pipe — if upstream closes, close downstream.

### Claude's Discretion
Implementation details for the WS proxy function, upgrade event handler registration order, and terminal component URL building. Follow existing codebase patterns (proxyToTtyd for WS piping, attachHttpProxy for server attachment).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/proxy/http-proxy.js` — HTTP proxy with `resolveInstance()`, `forwardRequest()`, `attachHttpProxy()`
- `lib/ws/server.js` — Custom server with upgrade handling, calls `attachCodeProxy()` and `attachHttpProxy()`
- `lib/ws/proxy.js` — `proxyToTtyd()` — bidirectional WS proxy pattern (client ↔ container)
- `lib/ws/tickets.js` — Ticket validation for WS auth

### Key Patterns
- `server.on('upgrade', ...)` in `lib/ws/server.js:38` handles `/ws/terminal/*` upgrades
- `lib/proxy/http-proxy.js:14` strips hop-by-hop headers including `upgrade` — this prevents WS through HTTP proxy
- `resolveInstance(slug)` reads `SUPERADMIN_INSTANCES` env var to map slug → spoke URL + token
- Existing WS proxy uses raw `ws` library (not socket.io)

</code_context>
