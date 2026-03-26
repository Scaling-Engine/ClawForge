---
phase: 58-websocket-proxy
verified: 2026-03-26T16:19:30Z
status: passed
score: 7/7 must-haves verified
---

# Phase 58: WebSocket Proxy Verification Report

**Phase Goal:** Browser terminal sessions work through the hub URL — users never need to connect directly to instance subdomains for workspace terminals
**Verified:** 2026-03-26T16:19:30Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `attachWsProxy` exists in `lib/proxy/http-proxy.js` and is exported | VERIFIED | Exported at line 187; full implementation with raw TCP relay |
| 2 | `attachWsProxy` is called in `lib/ws/server.js` | VERIFIED | Imported and called at line 8 and 32 respectively |
| 3 | WS proxy intercepts `/agent/[slug]/ws/terminal/*` upgrade requests | VERIFIED | `server.on('upgrade', ...)` with regex `/^\/agent\/([a-z0-9-]+)(\/ws\/terminal\/.+)$/` at line 198 |
| 4 | WS proxy forwards to spoke using `resolveInstance()` | VERIFIED | `resolveInstance(slug)` called inside upgrade handler; TCP connection opened to spoke at lines 204-221 |
| 5 | `workspace-terminal-page.jsx` builds hub-relative WS URL when `agentSlug` prop is present | VERIFIED | `getWsUrl()` at line 55-64 returns `wss://[host]/agent/${agentSlug}/ws/terminal/${workspaceId}` when `agentSlug` is truthy |
| 6 | Agent-scoped workspace page shell exists at `templates/app/agent/[slug]/workspaces/[id]/page.jsx` | VERIFIED | File exists, substantive (33 lines, auth + workspace guard + render) |
| 7 | Page shell passes `agentSlug` to `WorkspaceTerminalPage` | VERIFIED | `agentSlug={slug}` prop passed at line 30 |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/proxy/http-proxy.js` | WS proxy function exported | VERIFIED | `attachWsProxy` exported alongside existing `attachHttpProxy`; full TCP relay implementation |
| `lib/ws/server.js` | Imports and calls `attachWsProxy` | VERIFIED | Named import at line 8, called at line 32 before legacy `upgrade` handler |
| `templates/app/workspace/[id]/workspace-terminal-page.jsx` | Hub-relative WS URL logic | VERIFIED | `getWsUrl()` branches on `agentSlug`; hub path uses `window.location.host` (stays on hub domain) |
| `templates/app/agent/[slug]/workspaces/[id]/page.jsx` | Agent-scoped page shell | VERIFIED | Auth guard, workspace state guard, renders `WorkspaceTerminalPage` with `agentSlug` prop |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/ws/server.js` | `lib/proxy/http-proxy.js` | named import | WIRED | `import { attachHttpProxy, attachWsProxy } from '../proxy/http-proxy.js'` |
| `lib/ws/server.js` | `attachWsProxy(server)` | function call | WIRED | Called at line 32 before legacy upgrade handler |
| `page.jsx (agent/[slug]/workspaces/[id])` | `WorkspaceTerminalPage` | relative import | WIRED | Import from `../../../../workspace/[id]/workspace-terminal-page.jsx` |
| `WorkspaceTerminalPage` | hub WS URL | `agentSlug` prop | WIRED | `agentSlug` prop received and used in `getWsUrl()` callback |
| `attachWsProxy` | `resolveInstance(slug)` | internal call | WIRED | Called at line 204; 404s if slug not found, proceeds to TCP relay otherwise |

### Data-Flow Trace (Level 4)

Not applicable — this phase delivers routing/proxy infrastructure, not data-rendering components. The terminal component renders ttyd output streamed via WebSocket; the proxy is a transparent TCP relay with no data transformation.

### Behavioral Spot-Checks

Step 7b: SKIPPED — requires a running server with `SUPERADMIN_HUB=true` and a registered spoke instance. The WS proxy intercepts Node.js `upgrade` events which cannot be exercised without a live HTTP server and active WebSocket client. All wiring is verified statically.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PROXY-03 | Phase 58 | WebSocket connections for terminal sessions are proxied through the hub to the correct instance container | SATISFIED | `attachWsProxy` implements raw TCP relay from hub upgrade events to spoke; marked Complete in REQUIREMENTS.md |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/ws/server.js` | 15 | `// HACK:` comment | Info | Documents a deliberate workaround for Next.js `setupWebSocketHandler` conflict; not incomplete code |

No blockers or warnings found. The `HACK` comment documents a known Next.js limitation (`app.didWebSocketSetup = true`) with an explanation — it is structural documentation, not a stub.

### Human Verification Required

#### 1. End-to-end WS relay under hub mode

**Test:** Set `SUPERADMIN_HUB=true` and register a spoke in `SUPERADMIN_INSTANCES`. Navigate to `/agent/[slug]/workspaces/[id]` on the hub. Open the terminal and issue a command.
**Expected:** Terminal connects and responds without any direct connection to the spoke subdomain; all traffic flows through the hub URL.
**Why human:** Requires a live server with a registered spoke instance and a running ttyd process; cannot be exercised with static file inspection.

#### 2. WS relay stays alive across spoke reconnect

**Test:** While connected to a hub-proxied terminal, restart the spoke container.
**Expected:** Terminal shows disconnect; reconnect button re-establishes the session through the hub relay.
**Why human:** Requires live infrastructure and real network interruption.

### Gaps Summary

No gaps. All seven must-haves are implemented and wired end-to-end:

- `attachWsProxy` is a complete, substantive implementation (raw TCP relay, bidirectional pipe, error handling on both sides).
- It is correctly imported and invoked in `lib/ws/server.js` before the legacy upgrade handler, ensuring `/agent/[slug]/ws/terminal/*` upgrades are intercepted first.
- `workspace-terminal-page.jsx` correctly branches the WS URL on `agentSlug`, routing hub sessions through the hub domain.
- The agent-scoped page shell (`templates/app/agent/[slug]/workspaces/[id]/page.jsx`) correctly passes `agentSlug={slug}` so the terminal component uses the hub-relative URL.
- PROXY-03 is marked Complete in REQUIREMENTS.md and fully supported by the implementation.

---

_Verified: 2026-03-26T16:19:30Z_
_Verifier: Claude (gsd-verifier)_
