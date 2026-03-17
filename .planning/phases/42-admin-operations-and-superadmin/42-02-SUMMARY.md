---
phase: 42-admin-operations-and-superadmin
plan: 02
subsystem: admin
tags: [superadmin, cross-instance, api-proxy, server-actions, react, admin-ui]

# Dependency graph
requires:
  - phase: 42-01
    provides: admin layout, requireAdmin guard, settings table, repo CRUD
provides:
  - Superadmin role with requireSuperadmin() guard
  - Cross-instance HTTP client (lib/superadmin/client.js) with Promise.allSettled
  - API endpoints for machine-to-machine health/stats/jobs queries
  - Superadmin dashboard with auto-refreshing instance health cards
  - Cross-instance job search with keyword/repo/status filters
  - Instance switcher dropdown in admin sidebar
affects: [admin-panel, auth-roles, instance-management]

# Tech tracking
tech-stack:
  added: []
  patterns: [api-proxy-pattern, bearer-token-m2m-auth, promise-allSettled-partial-results, auto-refresh-polling]

key-files:
  created:
    - lib/superadmin/config.js
    - lib/superadmin/client.js
    - api/superadmin.js
    - lib/chat/components/superadmin-dashboard.jsx
    - lib/chat/components/superadmin-search.jsx
    - lib/chat/components/instance-switcher.jsx
    - templates/app/admin/superadmin/page.js
    - templates/app/admin/superadmin/search/page.js
  modified:
    - api/index.js
    - lib/chat/actions.js
    - lib/chat/components/admin-layout.jsx
    - lib/chat/components/app-sidebar.jsx
    - lib/chat/components/icons.jsx
    - lib/chat/components/index.js

key-decisions:
  - "API proxy pattern: hub instance queries child instances via HTTP with Bearer token auth, not shared DB"
  - "Superadmin routes bypass x-api-key auth in GET handler, use their own Bearer token validation"
  - "Local instance always included in registry with url:null, queries handled by direct import (no HTTP)"
  - "queryAllInstances uses Promise.allSettled for graceful partial results when instances are offline"

patterns-established:
  - "Bearer token M2M auth: AGENT_SUPERADMIN_TOKEN for cross-instance API calls"
  - "Role-gated admin nav: SUPERADMIN_NAV array rendered only when session.user.role === superadmin"
  - "Instance switcher: localStorage persistence for active instance selection"

requirements-completed: [SUPER-01, SUPER-02, SUPER-03, SUPER-04, SUPER-05]

# Metrics
duration: 15min
completed: 2026-03-17
---

# Phase 42 Plan 02: Superadmin Portal Summary

**Cross-instance API proxy layer with dashboard, job search, and instance switcher for single-login multi-instance management**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-17T03:15:16Z
- **Completed:** 2026-03-17T03:30:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Superadmin config module reads hub mode and instance registry from environment variables
- HTTP client queries remote instances via fetch with 5s timeout, local instance via direct import
- API endpoints (health, stats, jobs) authenticated with Bearer token for machine-to-machine auth
- requireSuperadmin() guard and 3 Server Actions (dashboard aggregation, job search, instance registry)
- Dashboard with instance health cards, summary bar, and 30-second auto-refresh
- Cross-instance job search with keyword, repo, and status filters in a tabular layout
- Instance switcher dropdown in admin sidebar for superadmin users
- Admin link in main sidebar now accessible to both admin and superadmin roles

## Task Commits

Each task was committed atomically:

1. **Task 1: Superadmin config, API endpoints, and cross-instance client** - `057093b` (feat)
2. **Task 2: Superadmin dashboard, job search, and instance switcher UI** - `2d9250d` (feat)

## Files Created/Modified
- `lib/superadmin/config.js` - Hub mode detection, instance registry parsing, role check
- `lib/superadmin/client.js` - queryInstance (local/remote) and queryAllInstances with Promise.allSettled
- `api/superadmin.js` - Health, stats, and jobs endpoints with Bearer token validation
- `api/index.js` - Registered superadmin routes before x-api-key auth check in GET handler
- `lib/chat/actions.js` - Added requireSuperadmin(), getSuperadminDashboard(), searchJobsAcrossInstances(), getInstanceRegistryAction()
- `lib/chat/components/superadmin-dashboard.jsx` - Instance health cards with auto-refresh and summary bar
- `lib/chat/components/superadmin-search.jsx` - Job search form with results table and instance/status badges
- `lib/chat/components/instance-switcher.jsx` - Dropdown for switching active instance context
- `lib/chat/components/admin-layout.jsx` - Added superadmin nav section and instance switcher (role-gated)
- `lib/chat/components/app-sidebar.jsx` - Admin link now shows for superadmin role too
- `lib/chat/components/icons.jsx` - Added GlobeIcon
- `lib/chat/components/index.js` - Added SuperadminDashboard, SuperadminSearch, InstanceSwitcher exports
- `templates/app/admin/superadmin/page.js` - Page shell for dashboard
- `templates/app/admin/superadmin/search/page.js` - Page shell for job search

## Decisions Made
- **API proxy pattern**: Hub queries child instances via HTTP rather than sharing a database. Each instance maintains its own SQLite DB with natural isolation.
- **Superadmin routes bypass x-api-key**: Superadmin endpoints are matched before the standard auth check in the GET handler, using their own Bearer token validation.
- **Local instance via direct import**: When querying the local instance, the client imports handleSuperadminEndpoint directly instead of making an HTTP call to itself.
- **Promise.allSettled for partial results**: queryAllInstances never throws, returns per-instance error info so the dashboard shows available instances even when some are offline.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None

## User Setup Required
- Set `SUPERADMIN_HUB=true` on the hub instance
- Set `AGENT_SUPERADMIN_TOKEN` on all instances (same token)
- Set `SUPERADMIN_INSTANCES` JSON array on hub instance with remote instance URLs and tokens
- Promote a user to superadmin role by updating the `role` column in the users table to `superadmin`

## Next Phase Readiness
- Superadmin portal fully functional with dashboard, job search, and instance switcher
- Phase 42 complete (both plans done)
- Ready for next milestone phase

## Self-Check: PASSED

All 8 created files verified on disk. Both commit hashes (057093b, 2d9250d) verified in git log.
