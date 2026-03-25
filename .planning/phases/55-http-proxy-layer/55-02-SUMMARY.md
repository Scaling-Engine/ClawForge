---
phase: 55-http-proxy-layer
plan: 02
subsystem: proxy
tags: [proxy, http, sse, superadmin, hub, spoke, m2m]

# Dependency graph
requires:
  - "55-01 (Bearer auth on spoke /api/* routes)"
provides:
  - "HTTP proxy for /agent/[slug]/* on hub — forwards requests to spoke instances"
  - "SSE stream proxying without buffering (X-Accel-Buffering: no)"
  - "attachHttpProxy() export from lib/proxy/http-proxy.js"
affects: [phase-56-agent-picker, phase-57-scoped-nav, phase-58-ws-proxy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Node.js built-in http/https.request() + pipe() — no npm packages (ESM incompatibility avoidance)"
    - "server.on('request', ...) listener registered after createServer() for pre-Next.js interception"
    - "SSE detected via content-type: text/event-stream — manual write/flush per chunk instead of pipe()"

key-files:
  created:
    - "lib/proxy/http-proxy.js"
  modified:
    - "lib/ws/server.js"

key-decisions:
  - "resolveInstance() reads SUPERADMIN_INSTANCES at request time (not module load) — env vars updated without restart"
  - "server.on('request', ...) not createServer() callback — additive listener, does not replace Next.js handler"
  - "nextHandle param kept in attachHttpProxy signature for API symmetry — proxy sends directly, non-matching routes fall through naturally"
  - "SSE flushed per chunk via manual write() + flush() — pipe() would buffer in Nginx reverse proxy layer"

# Metrics
duration: 10min
completed: 2026-03-25
---

# Phase 55 Plan 02: HTTP Proxy Layer Summary

**Node.js built-in http/https.request() + pipe() proxy for /agent/[slug]/* on the hub — slug resolved from SUPERADMIN_INSTANCES env var, Bearer token injected, SSE streams flushed without buffering**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-25T13:20:00Z
- **Completed:** 2026-03-25T13:30:00Z
- **Tasks:** 2
- **Files created:** 1 (lib/proxy/http-proxy.js)
- **Files modified:** 1 (lib/ws/server.js)

## Accomplishments

### Task 1: Create lib/proxy/http-proxy.js

Created `lib/proxy/http-proxy.js` which exports `attachHttpProxy(server, nextHandle)`:

- `resolveInstance(slug)` — reads `SUPERADMIN_INSTANCES` JSON at request time, returns `{ url, token }` or null
- `forwardRequest(req, res, targetBaseUrl, spokePath, token)` — strips hop-by-hop headers, injects `Authorization: Bearer {token}`, detects SSE and flushes per chunk
- `attachHttpProxy(server, nextHandle)` — registers `server.on('request', ...)` listener that matches `/agent/[slug]/...` and forwards to spoke; no-op when `SUPERADMIN_HUB !== 'true'`
- Uses only Node.js built-ins: `http`, `https`, `url` — no npm packages

### Task 2: Wire attachHttpProxy() into lib/ws/server.js

Modified `lib/ws/server.js`:

- Added import: `import { attachHttpProxy } from '../proxy/http-proxy.js'`
- Added call: `attachHttpProxy(server, handle)` after `createServer()`, before `attachCodeProxy(server)`
- All existing functionality unchanged: WebSocket upgrade handler, code proxy, Next.js fallback

## Task Commits

1. **Task 1: Create lib/proxy/http-proxy.js** — `65bd3c1` (feat)
2. **Task 2: Wire attachHttpProxy() into lib/ws/server.js** — `4e29649` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `lib/proxy/http-proxy.js` — NEW: 169 lines, full proxy implementation
- `lib/ws/server.js` — MODIFIED: +4 lines (import + call)

## Decisions Made

- `resolveInstance()` reads `SUPERADMIN_INSTANCES` at request time — allows env var updates without restart
- `server.on('request', ...)` used as additive listener — does not replace the `createServer()` callback; non-matching routes fall through naturally to Next.js
- `nextHandle` parameter kept in `attachHttpProxy` signature for API symmetry even though the proxy sends responses directly (not calling through to Next.js)
- SSE flush via manual `res.write()` + `res.flush()` per chunk — `pipe()` would allow Nginx to buffer, causing gaps in live log streams

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None. Proxy activates automatically when `SUPERADMIN_HUB=true` is set. `SUPERADMIN_INSTANCES` must contain valid spoke entries with `url` and optionally `token` fields for the proxy to route requests.

## Next Phase Readiness

- Phase 56 (Agent Picker) can now render `/agent/[slug]/api/*` URLs in the browser and the hub will forward them to the correct spoke instance
- `/agent/archie/api/jobs` on hub returns same response as calling archie's `/api/jobs` directly
- SSE job log streams at `/agent/[slug]/api/jobs/[id]/stream` proxy correctly without buffering
- No blockers

## Known Stubs

None.

---

## Self-Check: PASSED

- `lib/proxy/http-proxy.js` — FOUND
- `lib/ws/server.js` — FOUND
- Commit `65bd3c1` — FOUND
- Commit `4e29649` — FOUND
- `attachHttpProxy` appears 2 times in `lib/ws/server.js` (import + call) — CONFIRMED
- `attachCodeProxy` still present in `lib/ws/server.js` — CONFIRMED
- Build (`npm run build`) — PASSED

---
*Phase: 55-http-proxy-layer*
*Completed: 2026-03-25*
