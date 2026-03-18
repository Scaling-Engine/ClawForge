---
phase: 44-billing-and-usage-tracking
verified: 2026-03-17T00:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 44: Billing and Usage Tracking Verification Report

**Phase Goal:** Job dispatch is governed by configurable per-instance limits and every job's cost is captured for future billing decisions
**Verified:** 2026-03-17
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `usage_events` and `billing_limits` tables exist in the SQLite database after schema migration | VERIFIED | Both tables defined in `lib/db/schema.js` lines 159-178; migration `drizzle/0009_demonic_the_enforcers.sql` exists |
| 2 | `recordUsageEvent()` inserts a row and `getUsageSummary()` returns correct aggregates | VERIFIED | `lib/db/usage.js` exports both functions; 10/10 unit tests pass in `test/billing/test-usage.js` |
| 3 | `checkUsageLimit()` returns `allowed:true` when no limit is configured (unlimited by default) | VERIFIED | `lib/billing/enforce.js` line 34-43 returns `{ allowed: true, limit: null }`; test passes |
| 4 | `checkUsageLimit()` returns `allowed:false` when current usage >= limit | VERIFIED | `lib/billing/enforce.js` line 45; enforcement test passes |
| 5 | `checkUsageLimit()` returns `percentUsed >= 0.8` when at 80% of limit | VERIFIED | `lib/billing/enforce.js` line 47; enforcement test passes |
| 6 | `upsertBillingLimit()` creates and updates limit rows correctly | VERIFIED | `lib/db/usage.js` lines 95-126; select-then-insert-or-update pattern; test passes |
| 7 | Job dispatch is blocked with a clear error message when the instance exceeds its monthly job limit | VERIFIED | `lib/ai/tools.js` line 85-93: `!limitCheck.allowed` gate returns JSON error with current/limit/resetDate before any GitHub API call |
| 8 | A Slack warning is sent once per period when an instance crosses 80% of its job limit | VERIFIED | `lib/ai/tools.js` lines 96-108: `percentUsed >= 0.8 && !wasWarningSent()` check; `markWarningSent()` called after send |
| 9 | After a Docker job completes, a usage event is recorded with duration and jobId | VERIFIED | `lib/ai/tools.js` lines 357-368 (origin path) and 425-437 (no-origin path); `usageRecorded` flag prevents double-counting |
| 10 | After a GitHub Actions job completes via webhook, a usage event is recorded | VERIFIED | `api/index.js` lines 307-316: `recordUsageEvent` called after `saveJobOutcome`, `durationSeconds: null` |
| 11 | Admin can navigate to `/admin/billing` and see job count, total duration, and period | VERIFIED | `templates/app/admin/billing/page.js` + `lib/chat/components/admin-billing-page.jsx` renders instance, period, jobCount, duration; nav entry at `admin-layout.jsx` line 23 |
| 12 | Superadmin can configure per-instance limits; non-superadmin admins see usage but cannot edit | VERIFIED | `AdminBillingPage` line 162: `isSuperadmin = user?.role === 'superadmin'`; `LimitsEditor` only renders when `isSuperadmin`; `getBillingUsage` uses `requireAdmin()`, `setBillingLimits` uses `requireSuperadmin()` |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/db/schema.js` | `usageEvents` and `billingLimits` table definitions | VERIFIED | Both tables appended after `errorLog` at lines 159-178 |
| `lib/db/usage.js` | `recordUsageEvent`, `getUsageSummary`, `getBillingLimits`, `upsertBillingLimit`, `markWarningSent`, `wasWarningSent` | VERIFIED | All 6 functions exported; synchronous Drizzle `.run()`/`.get()`/`.all()` pattern |
| `lib/billing/enforce.js` | `checkUsageLimit` with unlimited-by-default behavior | VERIFIED | Single export; returns correct shape for null-limit and limit-exceeded cases; `currentPeriodMonth()` helper is UTC |
| `test/billing/test-usage.js` | Unit tests for usage query helpers | VERIFIED | 10/10 tests pass |
| `test/billing/test-enforce.js` | Unit tests for enforcement logic | VERIFIED | 4/4 tests pass |
| `lib/ai/tools.js` | Enforcement gate in `createJobTool` + usage recording in `waitAndNotify` | VERIFIED | `checkUsageLimit` called at line 82; 3 occurrences of `recordUsageEvent` (origin path, no-origin path, import) |
| `api/index.js` | Usage recording for Actions-path jobs after `saveJobOutcome` | VERIFIED | `recordUsageEvent` imported line 11; called at line 309 inside `handleGithubWebhook` |
| `api/superadmin.js` | `'usage'` case in `handleSuperadminEndpoint` switch | VERIFIED | `case 'usage':` at line 52; `getUsage()` function at line 200 uses dynamic import of `lib/db/usage.js` |
| `lib/chat/actions.js` | `getBillingUsage` and `setBillingLimits` Server Actions | VERIFIED | Both exported at lines 1284 and 1305; correct role guards |
| `lib/chat/components/admin-billing-page.jsx` | Admin billing page component | VERIFIED | Full implementation with `UsageBar`, `LimitsEditor`, role-gated edit form, `Unlimited` display for null |
| `templates/app/admin/billing/page.js` | Next.js page route at `/admin/billing` | VERIFIED | Async server component, calls `auth()`, passes `session.user` as prop |
| `lib/chat/components/admin-layout.jsx` | Billing nav entry in `ADMIN_NAV` | VERIFIED | `{ id: 'billing', label: 'Billing', href: '/admin/billing', icon: CreditCardIcon }` at line 23 |
| `drizzle/0009_demonic_the_enforcers.sql` | Drizzle migration SQL | VERIFIED | File exists |

**Note:** Plan 03 documented `pages/admin/billing.js` as the target path. The executor correctly identified that ClawForge uses `templates/app/admin/billing/page.js` (Next.js App Router scaffold). The page was created at the correct path — this is not a gap.

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/billing/enforce.js` | `lib/db/usage.js` | `import getUsageSummary, getBillingLimits` | WIRED | Line 1: `import { getUsageSummary, getBillingLimits } from '../db/usage.js'` |
| `lib/db/usage.js` | `lib/db/schema.js` | `import usageEvents, billingLimits` | WIRED | Line 4: `import { usageEvents, billingLimits } from './schema.js'` |
| `lib/ai/tools.js` | `lib/billing/enforce.js` | `import checkUsageLimit` | WIRED | Line 18: `import { checkUsageLimit } from '../billing/enforce.js'` |
| `lib/ai/tools.js` | `lib/db/usage.js` | `import recordUsageEvent` | WIRED | Line 19: `import { recordUsageEvent, markWarningSent, wasWarningSent } from '../db/usage.js'` |
| `api/index.js` | `lib/db/usage.js` | `import recordUsageEvent` | WIRED | Line 11: `import { recordUsageEvent } from '../lib/db/usage.js'` |
| `lib/chat/components/admin-billing-page.jsx` | `lib/chat/actions.js` | `getBillingUsage` and `setBillingLimits` | WIRED | Line 5: `import { getBillingUsage, setBillingLimits } from '../actions.js'`; both called in component |
| `api/superadmin.js` | `lib/db/usage.js` | dynamic import `getUsageSummary, getBillingLimits` | WIRED | Line 201: `const { getUsageSummary, getBillingLimits } = await import('../lib/db/usage.js')` |
| `lib/chat/components/index.js` | `admin-billing-page.jsx` | re-export `AdminBillingPage` | WIRED | Line 39: `export { AdminBillingPage } from './admin-billing-page.js'` |
| `templates/app/admin/billing/page.js` | `lib/chat/components/index.js` | `import AdminBillingPage` | WIRED | Line 2: `import { AdminBillingPage } from '../../../lib/chat/components/index.js'` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BILL-01 | 44-01, 44-02 | System records job token usage and duration to `usage_events` table after each dispatch | SATISFIED | `recordUsageEvent` called after Docker completion (with duration) and Actions webhook completion (duration null); `usage_events` table in schema |
| BILL-02 | 44-03 | Admin can view per-instance usage metrics (job count, duration) for the current billing period | SATISFIED | `/admin/billing` page renders job count, total duration (HH:MM:SS), period via `getBillingUsage` server action |
| BILL-03 | 44-01, 44-02 | System sends Slack warning to operator when instance reaches 80% of configured job limit | SATISFIED | `percentUsed >= 0.8 && !wasWarningSent()` gate in `createJobTool`; posts to `SLACK_OPERATOR_CHANNEL`; `markWarningSent` deduplication |
| BILL-04 | 44-01, 44-02 | System rejects job dispatch with a clear message (current usage, limit, reset date) when hard limit is exceeded | SATISFIED | `!limitCheck.allowed` returns JSON error with `current`, `limit`, `resetDate` before GitHub API call |
| BILL-05 | 44-01, 44-03 | Superadmin can configure per-instance billing limits (jobs per month, concurrent jobs) | SATISFIED | `setBillingLimits` server action (superadmin-guarded) + `LimitsEditor` component in admin billing page |

No orphaned requirements — all 5 BILL-0x IDs were claimed by plans and verified in the codebase.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Scan of created/modified files found no TODOs, FIXMEs, placeholder returns, or empty handlers in the billing-related code.

---

### Human Verification Required

#### 1. Slack 80% Warning Delivery

**Test:** Configure a billing limit (e.g., 5 jobs/month) with `SLACK_OPERATOR_CHANNEL` set. Dispatch 4 jobs. Verify 5th dispatch triggers Slack message to operator channel.
**Expected:** Single Slack message with current/limit/percentage text; subsequent job dispatches in same month do NOT re-send the warning.
**Why human:** WebSocket/Slack API call cannot be verified by file inspection; `wasWarningSent` dedup requires live DB state.

#### 2. Job Dispatch Block User Experience

**Test:** Set `jobs_per_month` limit to 1. Dispatch 2 jobs via chat. Observe the second dispatch response.
**Expected:** LangGraph agent returns the error message to the user clearly: "Monthly job limit reached... Current usage: 1 jobs. Limit: 1 jobs. Resets (UTC): YYYY-MM-DD"
**Why human:** End-to-end message propagation from JSON error in tool result through LangGraph to user-visible chat message requires runtime verification.

#### 3. Admin Billing Page Rendering

**Test:** Log in as an admin (non-superadmin). Navigate to `/admin/billing`.
**Expected:** Usage card visible with instance name, current period, job count, total duration. Limits card visible (read-only). No LimitsEditor form.
**Why human:** React client component rendering, Server Action call, and role-conditional UI cannot be verified by static analysis alone.

#### 4. Superadmin Limit Edit Flow

**Test:** Log in as superadmin. Navigate to `/admin/billing`. Set jobs/month to 10. Save.
**Expected:** Success indicator shown; refreshed page reflects new limit value; `billing_limits` row created/updated in SQLite.
**Why human:** Form interaction, Server Action round-trip, and DB write require browser + runtime verification.

---

### Gaps Summary

No gaps found. All 12 observable truths are verified. All 5 requirements (BILL-01 through BILL-05) are satisfied by substantive, wired implementations. Both test suites pass (14/14 tests). Build succeeds.

---

_Verified: 2026-03-17_
_Verifier: Claude (gsd-verifier)_
