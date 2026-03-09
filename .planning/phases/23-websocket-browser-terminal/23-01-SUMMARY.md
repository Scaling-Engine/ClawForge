---
phase: 23-websocket-browser-terminal
plan: 01
subsystem: infra
tags: [websocket, ws, ttyd, terminal, proxy, docker, ticket-auth]

# Dependency graph
requires:
  - phase: 22-workspace-infra
    provides: workspace DB schema, Docker lifecycle, container networking
provides:
  - Custom HTTP server with WebSocket upgrade handler for /ws/terminal/* paths
  - Single-use ticket auth module with 30s TTL and replay prevention
  - Bidirectional WebSocket proxy to ttyd inside workspace containers
  - Server Action for authenticated ticket issuance
  - PM2 config pointing to custom server instead of next start
affects: [23-02 (browser terminal UI), 24-workspace-chat]

# Tech tracking
tech-stack:
  added: [ws (WebSocket library, already in deps)]
  patterns: [ticket-based WebSocket auth, noServer WSS upgrade interception, binary frame relay]

key-files:
  created: [lib/ws/server.js, lib/ws/tickets.js, lib/ws/tickets.test.js, lib/ws/proxy.js, lib/ws/actions.js]
  modified: [templates/docker/event-handler/ecosystem.config.cjs]

key-decisions:
  - "Custom HTTP server wraps Next.js app.prepare() to intercept upgrade before Next.js handler"
  - "Tickets are in-memory Map with periodic cleanup, not DB-backed (ephemeral by design, 30s TTL)"
  - "Origin check against APP_URL as secondary CSWSH defense alongside ticket validation"
  - "Binary frame relay preserves ttyd protocol without re-encoding"

patterns-established:
  - "WebSocket upgrade interception: server.on('upgrade') with path-based routing before Next.js"
  - "Ticket auth flow: Server Action issues ticket -> client adds to WS URL -> server validates on upgrade"

requirements-completed: [TERM-01, TERM-02]

# Metrics
duration: 2min
completed: 2026-03-09
---

# Phase 23 Plan 01: WebSocket Server Infrastructure Summary

**Custom HTTP server with ticket-based WebSocket auth and bidirectional ttyd proxy for browser terminal connectivity**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T04:01:07Z
- **Completed:** 2026-03-09T04:03:17Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Ticket auth module with full test coverage: issue, validate, single-use enforcement, TTL expiry, replay prevention
- Custom server.js intercepts /ws/terminal/* upgrade requests before Next.js, validates tickets, and proxies to ttyd
- Bidirectional WebSocket proxy resolves container IP via Docker API and relays binary frames
- PM2 ecosystem config updated from `next start` to `server.js`

## Task Commits

Each task was committed atomically:

1. **Task 1: Ticket auth module with tests** - `307c9ec` (test) - TDD: 7 passing tests
2. **Task 2: WebSocket server, proxy, actions, PM2 config** - `4d8ce91` (feat)

## Files Created/Modified
- `lib/ws/tickets.js` - Single-use ticket issuance and validation with TTL and cleanup
- `lib/ws/tickets.test.js` - 7 unit tests covering all ticket auth behaviors
- `lib/ws/server.js` - Custom HTTP server wrapping Next.js with WebSocket upgrade handler
- `lib/ws/proxy.js` - Bidirectional WebSocket proxy to ttyd via container IP resolution
- `lib/ws/actions.js` - Server Action for authenticated ticket issuance
- `templates/docker/event-handler/ecosystem.config.cjs` - PM2 config now runs server.js

## Decisions Made
- Custom HTTP server wraps Next.js app.prepare() to intercept upgrades before Next.js handler
- Tickets stored in in-memory Map (not DB) since they are ephemeral with 30s TTL
- Origin header checked against APP_URL as secondary CSWSH defense
- Binary frame relay preserves ttyd protocol without re-encoding

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WebSocket infrastructure ready for browser terminal UI (Phase 23 Plan 02)
- Server Action `requestTerminalTicket` ready for React component integration
- Proxy tested with syntax checks; integration test requires running workspace containers

---
*Phase: 23-websocket-browser-terminal*
*Completed: 2026-03-09*
