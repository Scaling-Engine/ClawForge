# Phase 55: HTTP Proxy Layer - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The hub can forward any REST API call and SSE stream to any spoke instance — and spoke instances accept hub Bearer tokens on all API routes. Browser stays on clawforge.scalingengine.com for all navigation. Webhook auth (x-api-key, signing secret) remains unchanged.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key research decisions already locked (from STATE.md v4.0 decisions):
- HTTP proxy pattern: `http.request()` + `pipe()` from Node.js built-in, not a library
- No `http-proxy-middleware` — ESM incompatibility confirmed (Next.js #86434)
- Spoke Bearer auth: Additive — spoke `/api/*` routes accept `AGENT_SUPERADMIN_TOKEN` Bearer
- Existing webhook auth (x-api-key, signing secret) unchanged
- Proxy attaches to existing `server.js` custom HTTP server
- SSE streams must proxy without buffering (set appropriate headers)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server.js` — Custom HTTP server wrapping Next.js, already handles WebSocket upgrade interception
- `lib/superadmin/client.js` — `queryAllInstances()`, SUPERADMIN_INSTANCES parsing
- `lib/superadmin/config.js` — SUPERADMIN_HUB detection, instance URL resolution
- `api/superadmin.js` — verifySuperadminToken() pattern for Bearer auth
- `api/index.js` — API route handler with x-api-key and signing secret auth

### Established Patterns
- `SUPERADMIN_INSTANCES` env var has `name:url` pairs for instance routing
- `AGENT_SUPERADMIN_TOKEN` used for M2M auth between hub and instances
- API routes verified via signing secret (Slack, Telegram, GitHub)
- Server Actions used for browser-to-Docker operations

### Integration Points
- `server.js` — Add HTTP proxy handler for `/agent/[slug]/*` requests
- `api/index.js` — Add Bearer token acceptance alongside existing auth
- `lib/auth/middleware.js` — Route `/agent/[slug]/*` through proxy instead of 404

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
