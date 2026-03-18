---
phase: 44-billing-and-usage-tracking
plan: "03"
subsystem: admin-ui
tags: [billing, admin-panel, superadmin, server-actions, usage-metrics]
dependency_graph:
  requires: ["44-01"]
  provides: [admin-billing-page, superadmin-usage-endpoint, billing-server-actions]
  affects: [api/superadmin.js, lib/chat/actions.js, lib/chat/components/admin-layout.jsx]
tech_stack:
  added: []
  patterns: [server-actions-with-role-guard, client-component-data-fetch, superadmin-endpoint-switch]
key_files:
  created:
    - lib/chat/components/admin-billing-page.jsx
    - templates/app/admin/billing/page.js
  modified:
    - api/superadmin.js
    - lib/chat/actions.js
    - lib/chat/components/icons.jsx
    - lib/chat/components/admin-layout.jsx
    - lib/chat/components/index.js
decisions:
  - "Template page (templates/app/admin/billing/page.js) uses auth() to get session and passes session.user as user prop to AdminBillingPage — role check stays in the component"
  - "Plan referenced pages/admin/billing.js which doesn't exist in ClawForge; corrected to templates/app/admin/billing/page.js (the actual scaffold path)"
  - "setBillingLimits allows setting either or both limits independently; null input treated as no-op (not clearing existing limit)"
metrics:
  duration: "~25 minutes (spanning two sessions)"
  completed: "2026-03-17"
  tasks_completed: 2
  files_changed: 7
---

# Phase 44 Plan 03: Admin Billing Page UI Summary

Admin billing page with usage metrics and superadmin limit editor — CreditCardIcon nav entry, role-gated LimitsEditor, and superadmin usage endpoint for cross-instance hub queries.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Superadmin usage endpoint + Server Actions | 1afbef2 | api/superadmin.js, lib/chat/actions.js |
| 2 | Admin billing page UI + nav entry | 9d8df47 | icons.jsx, admin-layout.jsx, admin-billing-page.jsx, index.js, templates/app/admin/billing/page.js |

## What Was Built

**Task 1 — Data layer wiring:**
- Added `case 'usage'` to `handleSuperadminEndpoint` switch in `api/superadmin.js` — enables superadmin hub to query all instances for usage data via `queryAllInstances('usage')`
- `getUsage()` function dynamically imports `getUsageSummary` and `getBillingLimits` from `lib/db/usage.js`, returns `{ instance, period, jobsDispatched, totalDurationSeconds, limits }`
- `getBillingUsage()` Server Action (admin-guarded) — fetches current month usage + limits for the local instance
- `setBillingLimits({ jobsPerMonth, concurrentJobs })` Server Action (superadmin-guarded) — updates either or both limits via `upsertBillingLimit`

**Task 2 — UI:**
- `CreditCardIcon` added to `icons.jsx` (credit card rectangle with stripe line, stroke-based SVG)
- Billing nav entry added to `ADMIN_NAV` in `admin-layout.jsx` at `/admin/billing`
- `admin-billing-page.jsx` exports `AdminBillingPage({ user })`:
  - Usage card: instance name, period, jobs dispatched (with optional progress bar when limit set), total duration (HH:MM:SS)
  - Limits card: jobs/month and concurrent jobs, "Unlimited" when null
  - `LimitsEditor` (superadmin only): number inputs with "Unlimited" placeholders, Save button, inline success/error feedback
  - `UsageBar` subcomponent: fills proportionally, yellow at ≥80%, red at ≥100%
- `templates/app/admin/billing/page.js`: async server component, calls `auth()`, passes `session.user` as `user` prop

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Page path corrected from pages/admin/billing.js to templates/app/admin/billing/page.js**
- **Found during:** Task 2
- **Issue:** Plan specified `pages/admin/billing.js` but ClawForge's Next.js app scaffold uses `templates/app/admin/{page}/page.js` — no `pages/` directory exists in the project
- **Fix:** Created `templates/app/admin/billing/page.js` as an async server component that calls `auth()` and passes `session.user` as the `user` prop
- **Files modified:** templates/app/admin/billing/page.js (created)
- **Commit:** 9d8df47

None for Task 1 — executed exactly as planned.

## Self-Check: PASSED

- lib/chat/components/admin-billing-page.jsx: FOUND
- templates/app/admin/billing/page.js: FOUND
- Commit 1afbef2 (Task 1): FOUND
- Commit 9d8df47 (Task 2): FOUND
