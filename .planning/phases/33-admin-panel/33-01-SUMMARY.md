---
phase: 33-admin-panel
plan: 01
subsystem: ui
tags: [nextjs, admin-panel, sidebar-layout, rbac, user-management, webhooks]

# Dependency graph
requires:
  - phase: 32-auth-roles
    provides: Admin middleware guard on /admin/*, ForbiddenPage, admin sidebar link
provides:
  - AdminLayout sidebar component with 6-item navigation
  - /admin/* route tree with 6 sub-pages (crons, triggers, secrets, mcp, users, webhooks)
  - AdminUsersPage with role CRUD (promote/demote)
  - AdminWebhooksPage filtered webhook trigger display
  - /settings/* backwards-compatible redirects to /admin/*
  - getAllUsers() and updateUserRole() DB functions
  - getUsers() and updateUserRole() server actions
affects: [admin, settings, users, webhooks]

# Tech tracking
tech-stack:
  added: []
  patterns: [sidebar-layout-nav, settings-to-admin-redirect, filtered-trigger-view]

key-files:
  created:
    - lib/chat/components/admin-layout.jsx
    - lib/chat/components/admin-users-page.jsx
    - lib/chat/components/admin-webhooks-page.jsx
    - templates/app/admin/layout.js
    - templates/app/admin/page.js
    - templates/app/admin/crons/page.js
    - templates/app/admin/triggers/page.js
    - templates/app/admin/secrets/page.js
    - templates/app/admin/mcp/page.js
    - templates/app/admin/users/page.js
    - templates/app/admin/webhooks/page.js
  modified:
    - lib/chat/components/index.js
    - lib/db/users.js
    - lib/chat/actions.js
    - templates/app/settings/page.js
    - templates/app/settings/crons/page.js
    - templates/app/settings/triggers/page.js
    - templates/app/settings/mcp/page.js

key-decisions:
  - "AdminLayout uses sidebar navigation (not tabs) for scalability with 6+ sub-pages"
  - "Stub components created for UsersPage/WebhooksPage in Task 1 to unblock build before Task 2 fleshes them out"
  - "getAllUsers() uses explicit column selection to never expose passwordHash"

patterns-established:
  - "Admin sidebar layout: vertical nav with icon+label, active state via pathname match"
  - "Settings-to-admin redirect: redirect() in page.js short-circuits before layout renders"

requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04]

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 33 Plan 01: Admin Panel Summary

**Sidebar-based admin panel with 6 sub-pages, user role CRUD, webhook trigger display, and backwards-compatible /settings/* redirects**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-13T06:22:36Z
- **Completed:** 2026-03-13T06:25:31Z
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments
- AdminLayout component with sidebar navigation (crons, triggers, secrets, mcp, users, webhooks)
- Existing CronsPage, TriggersPage, SettingsSecretsPage, SettingsMcpPage reused under /admin/* without duplication
- AdminUsersPage with user listing, role badges (purple=admin, gray=user), and promote/demote with confirmation dialog
- AdminWebhooksPage showing webhook-type triggers filtered from TRIGGERS.json
- All 4 /settings/* pages redirected to /admin/* equivalents for backwards compatibility

## Task Commits

Each task was committed atomically:

1. **Task 1: AdminLayout component + admin route structure + barrel exports** - `69d84e2` (feat)
2. **Task 2: UsersPage + WebhooksPage components + DB functions + server actions** - `eca04cb` (feat)
3. **Task 3: Settings redirect pages for backwards compatibility** - `ccc119a` (feat)

## Files Created/Modified
- `lib/chat/components/admin-layout.jsx` - Sidebar layout with 6 nav items, PageLayout wrapper
- `lib/chat/components/admin-users-page.jsx` - User listing with role badges and promote/demote
- `lib/chat/components/admin-webhooks-page.jsx` - Filtered webhook trigger display from TRIGGERS.json
- `lib/chat/components/index.js` - Added AdminLayout, AdminUsersPage, AdminWebhooksPage exports
- `lib/db/users.js` - Added getAllUsers() (excludes passwordHash) and updateUserRole()
- `lib/chat/actions.js` - Added getUsers() and updateUserRole() server actions with requireAuth()
- `templates/app/admin/layout.js` - Server layout shell with auth
- `templates/app/admin/page.js` - Redirects to /admin/crons
- `templates/app/admin/crons/page.js` - Renders CronsPage
- `templates/app/admin/triggers/page.js` - Renders TriggersPage
- `templates/app/admin/secrets/page.js` - Renders SettingsSecretsPage
- `templates/app/admin/mcp/page.js` - Renders SettingsMcpPage
- `templates/app/admin/users/page.js` - Renders AdminUsersPage
- `templates/app/admin/webhooks/page.js` - Renders AdminWebhooksPage
- `templates/app/settings/page.js` - Redirects to /admin/crons
- `templates/app/settings/crons/page.js` - Redirects to /admin/crons
- `templates/app/settings/triggers/page.js` - Redirects to /admin/triggers
- `templates/app/settings/mcp/page.js` - Redirects to /admin/mcp

## Decisions Made
- AdminLayout uses sidebar navigation (not tabs) for better scalability with 6+ sub-pages
- Stub components created in Task 1 for UsersPage/WebhooksPage to keep build passing before Task 2
- getAllUsers() uses explicit column selection (id, email, role, createdAt) to never expose passwordHash
- SettingsLayout and settings/layout.js left untouched -- redirect() short-circuits before layout renders

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created stub components for AdminUsersPage and AdminWebhooksPage in Task 1**
- **Found during:** Task 1 (AdminLayout + route structure)
- **Issue:** Plan adds barrel exports for AdminUsersPage and AdminWebhooksPage in Task 1, but the actual component files are created in Task 2. The page shells import them, so build would fail.
- **Fix:** Created minimal stub components that return placeholder text, replaced with full implementations in Task 2
- **Files modified:** lib/chat/components/admin-users-page.jsx, lib/chat/components/admin-webhooks-page.jsx
- **Verification:** npm run build passes after Task 1
- **Committed in:** 69d84e2 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal -- stubs were necessary to maintain build-after-each-task discipline. Full implementations replaced stubs in the very next task.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin panel fully functional with sidebar layout and 6 sub-pages
- Existing settings URLs preserved via redirects
- Ready for future admin sub-pages (general, github, chat, voice) in later phases

---
*Phase: 33-admin-panel*
*Completed: 2026-03-13*
