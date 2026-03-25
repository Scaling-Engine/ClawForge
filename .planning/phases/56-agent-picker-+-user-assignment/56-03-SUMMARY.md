---
phase: 56-agent-picker-+-user-assignment
plan: "03"
subsystem: admin-ui
tags: [superadmin, user-management, agent-assignment, roles]
dependency_graph:
  requires: [56-01]
  provides: [admin-users-detail-page, agent-assignment-ui]
  affects: [lib/chat/components, templates/app/admin/users]
tech_stack:
  added: []
  patterns: [server-component-prop-passing, useEffect-data-load, form-submit-server-action]
key_files:
  created:
    - lib/chat/components/admin-user-detail-page.jsx
    - templates/app/admin/users/[id]/page.js
  modified:
    - lib/chat/components/index.js
    - lib/chat/components/admin-users-page.jsx
decisions:
  - "knownAgents passed as prop from async Server Component — getInstanceRegistry() runs server-side, never exposed to browser bundle"
  - "allSlugs = union(knownAgents, existingAssignments) — unknown agent slugs from DB always visible, never silently dropped"
  - "Default role for newly checked agent is operator (safe middle ground)"
metrics:
  duration_seconds: 82
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
requirements: [USER-01, USER-02]
---

# Phase 56 Plan 03: Admin User Detail Page Summary

**One-liner:** Per-user agent assignment UI with server-side slug hydration from getInstanceRegistry and per-agent viewer/operator/admin role dropdowns.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create AdminUserDetailPage component | f0d0596 | lib/chat/components/admin-user-detail-page.jsx |
| 2 | Add exports, page shell, Assign agents link | 50f0b6f | lib/chat/components/index.js, lib/chat/components/admin-users-page.jsx, templates/app/admin/users/[id]/page.js |

## What Was Built

- `lib/chat/components/admin-user-detail-page.jsx` — Client component rendering user info header + agent checkbox list + role dropdowns. Loads data via `getHubUserById` + `getUserAgentAssignments` on mount. Saves via `setUserAgentAssignments` on form submit.

- `templates/app/admin/users/[id]/page.js` — Async Server Component at `/admin/users/[id]`. Calls `getInstanceRegistry()` server-side and passes known agent slugs as `knownAgents` prop, keeping config.js out of the browser bundle.

- `lib/chat/components/admin-users-page.jsx` — Added "Assign agents" link per UserCard row pointing to `/admin/users/${user.id}`.

- `lib/chat/components/index.js` — Added `AdminUserDetailPage` export.

## Decisions Made

- **knownAgents as server prop:** `getInstanceRegistry()` is env-based config — calling it server-side avoids shipping it to the browser bundle. The async Server Component pattern (same as billing page) passes the result as a serialized prop.

- **allSlugs union strategy:** Agent slugs from both the prop (registry) and existing DB assignments are unioned and sorted. Unknown slugs (assigned in DB but not in current registry) appear with their current role visible, allowing operators to remove them — they are never silently dropped.

- **Default role = operator:** When a superadmin checks a new agent, the default role is `operator`. This matches the middle tier of the three-level system (viewer < operator < admin).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data is wired to server actions established in Plan 01.

## Self-Check: PASSED

- [x] lib/chat/components/admin-user-detail-page.jsx exists (172 lines)
- [x] templates/app/admin/users/[id]/page.js exists
- [x] Commits f0d0596 and 50f0b6f exist
- [x] npm run build passes (esbuild, 29ms)
