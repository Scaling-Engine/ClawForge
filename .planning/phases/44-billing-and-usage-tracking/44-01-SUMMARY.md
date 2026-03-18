---
phase: 44-billing-and-usage-tracking
plan: 01
subsystem: database
tags: [sqlite, drizzle-orm, billing, usage-tracking, enforcement]

# Dependency graph
requires:
  - phase: 43-observability-foundation
    provides: error_log table pattern and query helper conventions used to structure usage.js
provides:
  - usageEvents and billingLimits table definitions in schema.js
  - lib/db/usage.js — recordUsageEvent, getUsageSummary, getBillingLimits, upsertBillingLimit, markWarningSent, wasWarningSent
  - lib/billing/enforce.js — checkUsageLimit with unlimited-by-default behavior
  - Drizzle migration 0009_demonic_the_enforcers.sql
  - Full test suite: 14 passing tests covering all behaviors
affects:
  - 44-02-billing-enforcement-gate (depends on checkUsageLimit from enforce.js)
  - 44-03-billing-admin-ui (depends on getBillingLimits, upsertBillingLimit)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drizzle synchronous query pattern (better-sqlite3 .run()/.get()/.all()) for usage recording"
    - "Upsert-by-check pattern (select-then-insert-or-update) for billing limit rows"
    - "Unlimited-by-default enforcement gate (null limit = always allowed)"
    - "Period month key YYYY-MM for billing cycle isolation"

key-files:
  created:
    - lib/db/usage.js
    - lib/billing/enforce.js
    - test/billing/test-usage.js
    - test/billing/test-enforce.js
    - drizzle/0009_demonic_the_enforcers.sql
  modified:
    - lib/db/schema.js

key-decisions:
  - "All billing functions are synchronous (better-sqlite3 .run()/.get()/.all()) — consistent with existing Drizzle patterns in the codebase"
  - "Unlimited-by-default: checkUsageLimit returns allowed:true with limit:null when no billing_limits row exists — no accidental lockout"
  - "period_month stored as 'YYYY-MM' string — simplifies grouping, avoids timestamp arithmetic in queries"
  - "Upsert via select-then-update/insert — avoids SQLite INSERT OR REPLACE which would reset warningSentPeriod"

patterns-established:
  - "Billing test setup: temp SQLite DB with raw CREATE TABLE DDL, DATABASE_PATH env override, modules imported via await import() after env set"
  - "Billing period: always UTC-derived from currentPeriodMonth() helper in enforce.js"

requirements-completed:
  - BILL-01
  - BILL-03
  - BILL-04
  - BILL-05

# Metrics
duration: 8min
completed: 2026-03-18
---

# Phase 44 Plan 01: Billing Data Layer Summary

**SQLite billing foundation — usage_events + billing_limits tables, full CRUD helpers, and unlimited-by-default enforcement gate with 14 passing unit tests**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-18T01:48:00Z
- **Completed:** 2026-03-18T01:56:32Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 7

## Accomplishments

- Two new SQLite tables (usage_events, billing_limits) added to schema.js with Drizzle migration generated
- lib/db/usage.js provides all CRUD helpers: record, query, upsert limits, warning dedup (markWarningSent/wasWarningSent)
- lib/billing/enforce.js implements unlimited-by-default checkUsageLimit — returns percentUsed for threshold warnings and resetDate in YYYY-MM-DD format
- 14 unit tests passing across test-usage.js (10 tests) and test-enforce.js (4 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema tables + query helpers + test suite** - `ad4a19f` (feat)

**Plan metadata:** _(see final commit below)_

_Note: TDD task — tests written (RED), then implementation (GREEN), committed together._

## Files Created/Modified

- `lib/db/schema.js` — Added usageEvents and billingLimits table definitions
- `lib/db/usage.js` — recordUsageEvent, getUsageSummary, getBillingLimits, upsertBillingLimit, markWarningSent, wasWarningSent
- `lib/billing/enforce.js` — checkUsageLimit with unlimited-by-default behavior and resetDate calculation
- `test/billing/test-usage.js` — 10 unit tests for query helpers
- `test/billing/test-enforce.js` — 4 unit tests for enforcement logic
- `drizzle/0009_demonic_the_enforcers.sql` — Migration creating usage_events and billing_limits tables
- `drizzle/meta/_journal.json`, `0008_snapshot.json`, `0009_snapshot.json` — Drizzle meta updates

## Decisions Made

- All billing functions are synchronous (better-sqlite3 .run()/.get()/.all()) — consistent with existing Drizzle patterns
- Unlimited-by-default: checkUsageLimit returns allowed:true with limit:null when no billing_limits row — avoids accidental lockout
- period_month stored as 'YYYY-MM' string — simplifies grouping, avoids timestamp arithmetic
- Upsert via select-then-update/insert rather than INSERT OR REPLACE — preserves warningSentPeriod field on update

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. The Drizzle migration will be applied automatically by `initDatabase()` at server startup.

## Next Phase Readiness

- Billing data layer complete — Plan 02 (enforcement gate in dispatch path) can proceed immediately
- checkUsageLimit() is the primary integration point for Plan 02
- getBillingLimits() and upsertBillingLimit() are the primary integration points for Plan 03 (admin UI)

---
*Phase: 44-billing-and-usage-tracking*
*Completed: 2026-03-18*
