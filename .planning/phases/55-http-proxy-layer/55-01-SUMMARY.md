---
phase: 55-http-proxy-layer
plan: 01
subsystem: api
tags: [auth, bearer-token, m2m, superadmin, proxy]

# Dependency graph
requires: []
provides:
  - "Bearer token (AGENT_SUPERADMIN_TOKEN) accepted on all /api/* non-webhook routes in checkAuth()"
  - "Hub-to-spoke M2M auth — spoke instances accept proxied requests from hub"
affects: [55-02-http-proxy-layer, phase-56-agent-picker, phase-57, phase-58]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bearer-first auth in checkAuth(): try Bearer token before falling through to x-api-key"

key-files:
  created: []
  modified:
    - "api/index.js"

key-decisions:
  - "Bearer fallback falls through (not hard-reject) to x-api-key when Bearer is present but invalid — preserves ability for callers to switch auth method without getting a different error code"
  - "timingSafeEqual already imported from 'crypto' — no new imports added"

patterns-established:
  - "checkAuth() tier order: PUBLIC_ROUTES bypass → Bearer token → x-api-key. Additive pattern for future auth tiers."

requirements-completed:
  - PROXY-05

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 55 Plan 01: Spoke Bearer Auth Summary

**checkAuth() in api/index.js accepts AGENT_SUPERADMIN_TOKEN Bearer token as additive M2M auth on all /api/* routes, enabling hub-proxied requests to pass through without requiring x-api-key**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-25T13:10:00Z
- **Completed:** 2026-03-25T13:15:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added Bearer token fallback inside `checkAuth()` in `api/index.js` — accepts `AGENT_SUPERADMIN_TOKEN` using `timingSafeEqual` (already imported)
- PUBLIC_ROUTES (Slack/Telegram/GitHub webhook) remain unchanged — bypass all auth as before
- Existing `x-api-key` path unchanged — zero regression for existing callers
- Build passes with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Bearer token fallback to checkAuth()** - `2fb0b30` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `api/index.js` - Added 16-line Bearer token auth block inside `checkAuth()`, before the existing x-api-key check

## Decisions Made

- Bearer present but invalid falls through to x-api-key check rather than hard-rejecting — avoids breaking callers that send both headers during a transition period
- No new imports needed — `timingSafeEqual` was already imported from `crypto` at the top of the file

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. `AGENT_SUPERADMIN_TOKEN` must already be set as an env var for the spoke instances (this was a prerequisite from Phase 52/superadmin portal work).

## Next Phase Readiness

- Plan 02 (HTTP proxy layer) can now forward requests to spoke `/api/*` routes with `Authorization: Bearer {AGENT_SUPERADMIN_TOKEN}` and they will be accepted
- No blockers

---
*Phase: 55-http-proxy-layer*
*Completed: 2026-03-25*
