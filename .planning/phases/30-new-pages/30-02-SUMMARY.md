---
phase: 30-new-pages
plan: "02"
subsystem: web-ui
tags: [runners, profile, sidebar, navigation, pr-badge]
dependency_graph:
  requires: [30-01]
  provides: [runners-page, profile-page, sidebar-nav-complete]
  affects: [lib/chat/components/app-sidebar.jsx, lib/chat/components/index.js]
tech_stack:
  added: []
  patterns: [page-component-pattern, server-actions-dynamic-import, badge-count-pattern]
key_files:
  created:
    - lib/chat/components/runners-page.jsx
    - lib/chat/components/profile-page.jsx
    - templates/app/runners/page.js
    - templates/app/profile/page.js
  modified:
    - lib/chat/components/app-sidebar.jsx
    - lib/chat/components/index.js
decisions:
  - "Runners empty state message specifically calls out admin:org scope requirement to explain 403 gracefully"
  - "PR badge uses identical pattern to Notifications badge (collapsed absolute + expanded inline)"
  - "All three new sidebar items call setOpenMobile(false) before navigating, matching existing Clusters item behavior"
metrics:
  duration: "~3 minutes"
  completed: "2026-03-13"
  tasks_completed: 2
  files_changed: 6
---

# Phase 30 Plan 02: Runners Page, Profile Page, and Sidebar Navigation Summary

**One-liner:** RunnersPage with online/offline/busy status indicators, ProfilePage with validated password change form, and sidebar updated with Pull Requests (badge count), Runners, and Profile nav items.

## What Was Built

### Runners Page (lib/chat/components/runners-page.jsx)

`'use client'` component following the `clusters-page.jsx` and `pull-requests-page.jsx` patterns:
- Loads runner data via `getRunners()` Server Action on mount
- `RunnerStatus` sub-component: green dot (online), amber dot (busy — takes precedence over status field), gray dot (offline)
- `RunnerCard`: icon + name + status indicator + label pills (blue font-mono pills matching the cluster tool style)
- Loading skeleton: 3 pulse-animated rows
- Empty state: centered icon + message pointing to `admin:org` scope requirement (graceful 403 handling)
- Refresh button with disabled state while loading

### Profile Page (lib/chat/components/profile-page.jsx)

`'use client'` component:
- Displays `session.user.email` and `session.user.role` (violet badge for admin, muted for user)
- Password change form: Current Password, New Password, Confirm New Password
- Client-side validation: mismatch check and minimum 8-character length check before calling Server Action
- Calls `updatePassword(currentPassword, newPassword)` from `../actions.js`
- Success/error message displayed inline with themed colors
- Clears form fields on success

### Next.js Routes

- `templates/app/runners/page.js` — thin async route, fetches `auth()`, renders `<RunnersPage session={session} />`
- `templates/app/profile/page.js` — thin async route, fetches `auth()`, renders `<ProfilePage session={session} />`

### Sidebar Update (lib/chat/components/app-sidebar.jsx)

Three new nav items inserted between Clusters and Notifications:

1. **Pull Requests** — `GitPullRequestIcon`, navigates to `/pull-requests`, PR badge count matching the exact Notifications badge pattern:
   - Expanded: inline badge span with `bg-destructive` pill
   - Collapsed: absolute `h-4 w-4` badge in top-right corner
   - Only shown when `pendingPRCount > 0`
2. **Runners** — `ServerIcon`, navigates to `/runners`, no badge
3. **Profile** — `UserIcon`, navigates to `/profile`, no badge

Imports added: `GitPullRequestIcon`, `ServerIcon`, `UserIcon` from `./icons.js`; `getPendingPRCount` from `../actions.js`

State added: `pendingPRCount` (number), fetched in the existing `useEffect` alongside `unreadCount` and `getAppVersion`.

### index.js

Two new exports appended:
```js
export { RunnersPage } from './runners-page.js';
export { ProfilePage } from './profile-page.js';
```

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `test -f lib/chat/components/runners-page.jsx` — exists
- `test -f lib/chat/components/profile-page.jsx` — exists
- `test -f templates/app/runners/page.js` — exists
- `test -f templates/app/profile/page.js` — exists
- `grep "pull-requests" lib/chat/components/app-sidebar.jsx` — present
- `grep "pendingPRCount" lib/chat/components/app-sidebar.jsx` — present
- `npm run build` — passes (runners-page.js: 5.0kb, profile-page.js: 6.7kb, app-sidebar.js: 13.2kb)

## Commits

- `e4e3c0f` feat(30-02): build RunnersPage and ProfilePage with route files
- `5be0ce9` feat(30-02): update sidebar with Pull Requests, Runners, Profile nav items and PR badge

## Self-Check: PASSED
