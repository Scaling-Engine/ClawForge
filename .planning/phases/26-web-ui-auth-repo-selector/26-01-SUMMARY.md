---
phase: 26-web-ui-auth-repo-selector
plan: 01
subsystem: auth
tags: [nextjs, nextauth, server-actions, unauthorized, next-navigation]

# Dependency graph
requires:
  - phase: 25-headless-log-streaming
    provides: lib/ws/actions.js with Server Actions for workspace terminal/git operations
provides:
  - lib/chat/actions.js with unauthorized() in requireAuth() instead of thrown Error
  - lib/ws/actions.js with unauthorized() in all four Server Actions
  - templates/app/unauthorized.js Next.js 15 unauthorized boundary page
affects: [26-web-ui-auth-repo-selector, 27-mcp-credential-vault, 28-cluster-orchestration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Use unauthorized() from next/navigation instead of throw new Error('Unauthorized') in Server Actions"
    - "Central requireAuth() helper in lib/chat/actions.js calls unauthorized() for consistent 401 signaling"
    - "Inline auth checks in lib/ws/actions.js follow same unauthorized() pattern"

key-files:
  created:
    - templates/app/unauthorized.js
  modified:
    - lib/chat/actions.js
    - lib/ws/actions.js

key-decisions:
  - "unauthorized() from next/navigation is the canonical Next.js 15 way to signal 401 from Server Actions — it integrates with the unauthorized.js boundary convention vs generic Error throwing"
  - "templates/app/unauthorized.js created (not app/unauthorized.js) because the Next.js app dir lives in templates/app/ in this repo"
  - "lib/auth/actions.js setupAdmin left fully unprotected — pre-login flow must stay accessible without session"

patterns-established:
  - "Server Action auth gate pattern: import { unauthorized } from 'next/navigation'; ... if (!session?.user?.id) { unauthorized(); }"

requirements-completed: [WEBUI-05, WEBUI-06]

# Metrics
duration: 5min
completed: 2026-03-12
---

# Phase 26 Plan 01: Server Action Auth Hardening Summary

**Next.js 15 unauthorized() boundary wired into all browser-facing Server Actions, replacing throw new Error('Unauthorized') with structured 401 signals**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-12T15:50:20Z
- **Completed:** 2026-03-12T15:55:00Z
- **Tasks:** 2
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments
- Replaced `throw new Error('Unauthorized')` with `unauthorized()` in `requireAuth()` helper — all 17 Server Actions in `lib/chat/actions.js` now signal 401 correctly
- Replaced four inline `throw new Error('Unauthorized')` calls in `lib/ws/actions.js` (`requestTerminalTicket`, `requestSpawnShell`, `requestGitStatus`, `closeWorkspaceAction`)
- Created `templates/app/unauthorized.js` as the Next.js 15 boundary page for the unauthorized() convention
- Confirmed `lib/auth/actions.js` `setupAdmin` remains unprotected (zero auth guards)
- Confirmed `api/index.js` API-key-protected routes untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Update requireAuth() in lib/chat/actions.js** - `dd83816` (feat)
2. **Task 2: Update lib/ws/actions.js + create unauthorized.js boundary** - `e3681ca` (feat)

## Files Created/Modified
- `lib/chat/actions.js` - Added `import { unauthorized } from 'next/navigation'`; replaced `throw new Error('Unauthorized')` with `unauthorized()` in `requireAuth()`
- `lib/ws/actions.js` - Added same import; replaced four inline `throw new Error('Unauthorized')` with `unauthorized()` calls
- `templates/app/unauthorized.js` - New Next.js 15 unauthorized() boundary page (renders 401 UI with sign-in link)

## Decisions Made
- Used `unauthorized()` from `next/navigation` (Next.js 15 canonical pattern) instead of the existing throw pattern — integrates with `unauthorized.js` boundary convention and returns proper HTTP 401
- Created boundary at `templates/app/unauthorized.js` not `app/unauthorized.js` — the Next.js app directory lives in `templates/app/` in this repo; instances reference from there
- Left `lib/auth/actions.js` `setupAdmin` untouched — pre-login flow must stay accessible without a session

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth hardening complete for WEBUI-05 and WEBUI-06
- All Server Actions now signal 401 via Next.js 15 convention
- Ready for Phase 26 Plan 02 (repo selector implementation)

## Self-Check: PASSED

All files verified present. Both task commits (dd83816, e3681ca) confirmed in git history.

---
*Phase: 26-web-ui-auth-repo-selector*
*Completed: 2026-03-12*
