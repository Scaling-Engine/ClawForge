# Phase 44: Billing and Usage Tracking - Research

**Researched:** 2026-03-18
**Domain:** SQLite-backed per-instance job metering, enforcement gates, Slack warning notifications, superadmin billing config UI
**Confidence:** HIGH — derived entirely from direct codebase inspection of all referenced integration points

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BILL-01 | System records job token usage and duration to `usage_events` table after each dispatch | Two new tables (`usageEvents`, `billingLimits`) added to `lib/db/schema.js`; `recordUsageEvent()` called in `waitAndNotify()` after `saveJobOutcome()` |
| BILL-02 | Admin can view per-instance usage metrics (job count, tokens, duration) for the current billing period | New `getUsageSummary()` query in `lib/db/usage.js`; new `usage` case in `handleSuperadminEndpoint()` switch; new admin billing page at `pages/admin/billing` |
| BILL-03 | System sends Slack warning to operator when instance reaches 80% of configured job limit | `checkUsageLimit()` returns `{ allowed, remaining, percentUsed, limit }` — caller sends Slack warning when `percentUsed >= 0.8 && percentUsed < 1.0` |
| BILL-04 | System rejects job dispatch with a clear message (current usage, limit, reset date) when hard limit is exceeded | `checkUsageLimit()` returns `{ allowed: false, ... }` — `createJobTool` returns error string before any GitHub API call |
| BILL-05 | Superadmin can configure per-instance billing limits (`jobs_per_month`, `concurrent_jobs`) — new limits take effect on next dispatch | New admin billing page with Server Action that writes to `billingLimits` table; only superadmin role can access; no restart needed |
</phase_requirements>

---

## Summary

Phase 44 adds four components to ClawForge: two new SQLite tables (`usage_events`, `billing_limits`), a query + enforcement library (`lib/db/usage.js` + `lib/billing/enforce.js`), a new `usage` endpoint in the superadmin API switch, and an admin billing UI page. The scope is deliberately narrow: job count metering, per-instance month limits, an 80% Slack warning, a hard-stop rejection message, and a superadmin config page.

The workspace_hour event type defined in the prior architecture research is **out of scope for Phase 44** — the STATE.md decision note says "Local SQLite enforcement only" and the research flag identified workspace-hour billing timing as unresolved. Phase 44 records only `job_dispatch` events. No Stripe integration appears in this phase (that is BILL-06/BILL-07, v2 requirements). No token-count or duration column is needed on `usage_events` at Phase 44 scope — the requirements specify recording after dispatch, and the token/duration data is only available after job completion inside `waitAndNotify()`. The correct approach is recording after `saveJobOutcome()` is called.

All integration points are confirmed from direct codebase inspection. The enforcement gate inserts before the GitHub API call in `createJobTool` (in `lib/ai/tools.js`, not `lib/tools/create-job.js` — see Architecture Patterns section for the critical distinction). Usage recording fires after `saveJobOutcome()` inside `waitAndNotify()`.

**Primary recommendation:** Build in order: schema migration → `lib/db/usage.js` query helpers → `lib/billing/enforce.js` enforcement → gate in `createJobTool` → usage recording in `waitAndNotify()` → superadmin `usage` endpoint → admin billing page. Each step is independently testable.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.44.0 | Schema definition, query building, migrations | Already in use — all DB tables defined here |
| better-sqlite3 | (via drizzle) | Synchronous SQLite queries — sub-millisecond enforcement reads | Already in use — `getDb()` returns drizzle instance |
| node-cron | (already in package.json via cron.js) | Monthly reset detection, future Stripe sync cron | Already scheduled in `lib/cron.js` |

### No New Dependencies Required

Phase 44 adds zero new npm packages. All capabilities are implemented with:
- Drizzle ORM for schema + queries (existing)
- `@slack/web-api` for Slack warning (existing, already imported dynamically in `waitAndNotify`)
- `node-cron` pattern in `lib/cron.js` for any future cron extensions
- Next.js Server Actions for admin UI (existing pattern from `lib/chat/actions.js`)

**Installation:** None — no new packages needed.

---

## Architecture Patterns

### Recommended File Structure for Phase 44

```
lib/
├── db/
│   ├── schema.js          — MODIFY: add usageEvents + billingLimits tables
│   └── usage.js           — NEW: recordUsageEvent(), getUsageSummary(), getMonthTotal(), getCurrentJobCount()
├── billing/
│   └── enforce.js         — NEW: checkUsageLimit() — reads limits + current month total
drizzle/
└── {timestamp}_billing-tables.sql  — NEW: generated migration (npm run db:generate)
api/
└── superadmin.js          — MODIFY: add 'usage' case to handleSuperadminEndpoint() switch
lib/ai/
└── tools.js               — MODIFY: add enforcement gate + usage recording to createJobTool
lib/chat/
├── actions.js             — MODIFY: add getBillingUsage() + setBillingLimits() Server Actions
└── components/
    ├── admin-billing-page.js  — NEW: admin billing UI component
    └── admin-billing-page.jsx — NEW: compiled version
pages/admin/
└── billing/
    └── index.js           — NEW: billing admin page (or equivalent Next.js page file)
test/
└── billing/
    ├── test-usage.js      — NEW: unit tests for lib/db/usage.js
    └── test-enforce.js    — NEW: unit tests for lib/billing/enforce.js
```

### Pattern 1: Additive Schema Extension

**What:** Add two new tables to `lib/db/schema.js` + run `npm run db:generate` to create the migration SQL file, then `npm run db:migrate` or `initDatabase()` at startup applies it.

**When to use:** All new persistent state in ClawForge follows this pattern. Every existing table (`errorLog`, `clusterRuns`, `terminalCosts`) was created this way.

**Example:**
```javascript
// Source: lib/db/schema.js (existing pattern, e.g. errorLog)
export const usageEvents = sqliteTable('usage_events', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),
  eventType: text('event_type').notNull(),       // 'job_dispatch'
  quantity: real('quantity').notNull().default(1),
  durationSeconds: integer('duration_seconds'),   // nullable — populated on job completion
  periodMonth: text('period_month').notNull(),     // 'YYYY-MM' — cheap indexed GROUP BY
  refId: text('ref_id'),                          // jobId for tracing
  createdAt: integer('created_at').notNull(),
});

export const billingLimits = sqliteTable('billing_limits', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),
  limitType: text('limit_type').notNull(),         // 'jobs_per_month', 'concurrent_jobs'
  limitValue: real('limit_value').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

### Pattern 2: Synchronous Enforcement Before GitHub API Call

**What:** The enforcement gate reads from local SQLite (synchronous better-sqlite3, <1ms) and returns an error string before any network call is made.

**Critical distinction:** The enforcement goes in `createJobTool` in `lib/ai/tools.js` — NOT in `lib/tools/create-job.js`. Reason: `lib/tools/create-job.js` contains only the GitHub branch/file creation logic. All dispatch-level decisions (dispatch method selection, job origin saving, Docker container start) live in `createJobTool`. This is where the limit check belongs — it gates the entire dispatch decision, not just the GitHub file write.

**Where to insert (tools.js line ~79, just before `const result = await createJob(...)`):**
```javascript
// Source: lib/ai/tools.js createJobTool — enforcement gate
const instanceName = process.env.INSTANCE_NAME || 'noah';
const limitCheck = checkUsageLimit(instanceName, 'jobs_per_month');

// Hard limit rejection
if (!limitCheck.allowed) {
  return JSON.stringify({
    success: false,
    error: `Monthly job limit reached for this instance. ` +
           `Current usage: ${limitCheck.current} jobs. Limit: ${limitCheck.limit} jobs. ` +
           `Resets: ${limitCheck.resetDate}`,
  });
}

// 80% warning — send Slack to operator channel, but allow the job
if (limitCheck.percentUsed >= 0.8) {
  notifyOperatorWarning(instanceName, limitCheck).catch(() => {}); // fire-and-forget
}
```

### Pattern 3: Fire-and-Forget Usage Recording After saveJobOutcome

**What:** After `saveJobOutcome()` is called inside `waitAndNotify()`, record the usage event synchronously (better-sqlite3 is always sync — no await needed).

**Where to insert (tools.js ~line 315, after the saveJobOutcome try/catch block):**
```javascript
// Source: lib/ai/tools.js waitAndNotify — usage recording
// After saveJobOutcome try/catch — fire-and-forget (non-fatal if it fails)
try {
  const durationSeconds = Math.round((Date.now() - jobStartTime) / 1000);
  recordUsageEvent({
    instanceName: process.env.INSTANCE_NAME || 'noah',
    eventType: 'job_dispatch',
    quantity: 1,
    durationSeconds,
    refId: jobId,
    periodMonth: new Date().toISOString().slice(0, 7), // 'YYYY-MM'
  });
} catch (err) {
  console.error('Failed to record usage event:', err);
}
```

Note: `jobStartTime` is not currently tracked in `waitAndNotify`. The container start time is before `waitForContainer()`. Add `const jobStartTime = Date.now()` at the top of the function (just after `slackUpdateInterval = null`).

### Pattern 4: Superadmin Endpoint Extension (Zero Changes to Client)

**What:** Add a `'usage'` case to the switch in `api/superadmin.js:handleSuperadminEndpoint()`. The `queryAllInstances('usage')` proxy works automatically.

```javascript
// Source: api/superadmin.js handleSuperadminEndpoint
case 'usage':
  return await getUsage();
```

```javascript
async function getUsage() {
  const { getUsageSummary } = await import('../lib/db/usage.js');
  const { getBillingLimits } = await import('../lib/db/usage.js');
  const periodMonth = new Date().toISOString().slice(0, 7);
  const summary = getUsageSummary(INSTANCE_NAME, periodMonth);
  const limits = getBillingLimits(INSTANCE_NAME);
  return {
    instance: INSTANCE_NAME,
    period: periodMonth,
    jobsDispatched: summary.jobCount,
    totalDurationSeconds: summary.totalDurationSeconds,
    limits: {
      jobsPerMonth: limits.jobsPerMonth,
      concurrentJobs: limits.concurrentJobs,
    },
  };
}
```

### Pattern 5: Server Action for Billing Config Mutations

**What:** Admin billing page mutations use Server Actions from `lib/chat/actions.js`, identical to existing admin patterns (users, secrets).

```javascript
// Source: lib/chat/actions.js pattern — requireSuperadmin() guard
export async function setBillingLimits({ instanceName, jobsPerMonth, concurrentJobs }) {
  await requireSuperadmin();
  const { upsertBillingLimit } = await import('../db/usage.js');
  upsertBillingLimit(instanceName, 'jobs_per_month', jobsPerMonth);
  upsertBillingLimit(instanceName, 'concurrent_jobs', concurrentJobs);
}

export async function getBillingUsage() {
  await requireAdmin(); // admin can view, superadmin can edit
  const { getUsageSummary, getBillingLimits } = await import('../db/usage.js');
  const periodMonth = new Date().toISOString().slice(0, 7);
  const instanceName = process.env.INSTANCE_NAME || 'default';
  return {
    summary: getUsageSummary(instanceName, periodMonth),
    limits: getBillingLimits(instanceName),
  };
}
```

### Anti-Patterns to Avoid

- **Stripe in the dispatch path:** Usage enforcement reads only local SQLite. No HTTP calls in `createJobTool`. Stripe (BILL-06) is a v2 requirement.
- **Recording usage BEFORE dispatch:** If the job fails to start (GitHub API error, Docker unavailable), a recorded event would overcount. Record AFTER `saveJobOutcome()` confirms completion.
- **Inserting usage recording in `lib/tools/create-job.js`:** That file only handles GitHub branch creation — it does not know job completion time or whether Docker succeeded. All post-dispatch lifecycle is in `waitAndNotify()`.
- **`instanceName` from request body:** Always read from `process.env.INSTANCE_NAME`. Never allow the caller to specify which instance's limits to check.
- **Hard limits on day one for existing operators (Noah, StrategyES):** Default `billingLimits` rows are absent. `checkUsageLimit()` must return `{ allowed: true }` when no limit row exists — unconfigured = unlimited.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Monthly period string | Custom date arithmetic | `new Date().toISOString().slice(0, 7)` | Returns `'YYYY-MM'` — matches SQLite `text` column format exactly, no date library needed |
| Slack warning message | New notification module | Dynamic import `@slack/web-api` WebClient — same pattern already in `waitAndNotify()` | Already imported, already authenticated, zero new dependencies |
| Billing limit storage | `settings` table key-value pairs | Dedicated `billing_limits` table | `settings` table has no indexed `instanceName` field — billing queries need `WHERE instanceName=? AND limitType=?` indexed lookups |
| Concurrent job count | New tracking table | Query `jobOrigins` for recent unnotified rows + `dockerJobs` for pending | `getPendingDockerJobs()` in `lib/db/docker-jobs.js` already returns running jobs |
| Reset date calculation | Complex date math | First day of next month: `new Date(year, month+1, 1).toISOString().slice(0, 10)` | Simple JS Date, no library |

**Key insight:** This phase adds no new dependencies. Every building block (Drizzle, better-sqlite3, Slack WebClient, Server Actions, superadmin endpoint switch) already exists and is production-tested.

---

## Common Pitfalls

### Pitfall 1: Enforcement Gate in the Wrong File

**What goes wrong:** Developer puts `checkUsageLimit()` in `lib/tools/create-job.js` instead of `lib/ai/tools.js`. The enforcement runs but `createJob()` does not know about the `instanceName` env var context — it only receives job description and target repo. More importantly, the Actions dispatch path would also need the gate, and both Docker and Actions paths converge at the `createJob()` call in `createJobTool`, not in `lib/tools/create-job.js`.

**How to avoid:** Add the gate to `createJobTool` in `lib/ai/tools.js` at line ~79, before `const result = await createJob(...)`. Both Docker and Actions paths flow through `createJobTool`. The `createInstanceJobTool` (for spinning up new instances) should NOT be gated — it creates infrastructure, not user jobs.

**Warning signs:** Enforcement code in `lib/tools/create-job.js`; enforcement not covering Actions dispatch.

### Pitfall 2: No Default When billingLimits Row is Absent

**What goes wrong:** `checkUsageLimit()` queries `billingLimits` and finds no row for the current instance. Throws an error or returns `{ allowed: false }` — blocking all jobs for Noah and StrategyES who have no limits configured.

**How to avoid:** `checkUsageLimit()` returns `{ allowed: true, current: N, limit: null, remaining: null, percentUsed: 0 }` when no limit row exists. No limit configured = unlimited. The 80% warning logic only fires when `limit !== null`.

### Pitfall 3: Usage Event Recorded on Actions Path Jobs Too

**What goes wrong:** The Actions dispatch path (GitHub Actions runner, not Docker) does not go through `waitAndNotify()`. Usage events only get recorded for Docker jobs, undercounting Actions jobs.

**How to avoid:** The Actions path records job outcomes via the GitHub webhook handler in `api/index.js` (`handleGithubWebhook`). After `saveJobOutcome()` is called there, also call `recordUsageEvent()`. This is the symmetrical recording point for the Actions path.

**Where to find:** Search `api/index.js` for `saveJobOutcome` — that call site needs the same usage recording wrapper as `waitAndNotify`.

### Pitfall 4: Slack Warning Fires on Every Job Near the Limit

**What goes wrong:** The 80% warning is sent inside `createJobTool`. Every job dispatched when usage is between 80% and 100% sends a Slack message — potentially dozens of warnings per day.

**How to avoid:** Track whether the warning has been sent this period. Options: (a) add a `warningSentAt` column to `billingLimits`, or (b) only send when the job that just succeeded is the job that crossed 80% (i.e., `previousPercent < 0.8 && currentPercent >= 0.8`). Option (b) is simpler and avoids a schema column: check the count BEFORE recording the new event, then check AFTER — if before was under 80% and after is at/over 80%, send once. However, for Phase 44 simplicity, sending at first-dispatch-above-80% each month is acceptable. A `warningSentPeriod` text column on `billingLimits` (stores `'YYYY-MM'` when warning was last sent) prevents repeat sends cheaply.

### Pitfall 5: periodMonth Timezone Mismatch

**What goes wrong:** `new Date().toISOString()` returns UTC. If the operator is in UTC-8, a job dispatched at 11pm local time is recorded as the next UTC month. At month boundaries, the current month's count resets unexpectedly from the operator's perspective.

**How to avoid:** For v1 billing, UTC is acceptable and consistent — the reset date shown to operators is also UTC. Document this. Do not introduce moment.js or date-fns for timezone handling in Phase 44 — the operator-visible message should say "Resets (UTC): 2026-04-01".

---

## Code Examples

### lib/db/usage.js — Query Helpers

```javascript
// Source: codebase pattern (see lib/db/error-log.js for identical structure)
import { randomUUID } from 'crypto';
import { eq, and, sql, sum } from 'drizzle-orm';
import { getDb } from './index.js';
import { usageEvents, billingLimits } from './schema.js';

export function recordUsageEvent({ instanceName, eventType, quantity, durationSeconds, refId, periodMonth }) {
  const db = getDb();
  db.insert(usageEvents).values({
    id: randomUUID(),
    instanceName,
    eventType,
    quantity: quantity ?? 1,
    durationSeconds: durationSeconds ?? null,
    refId: refId ?? null,
    periodMonth,
    createdAt: Date.now(),
  }).run();
}

export function getUsageSummary(instanceName, periodMonth) {
  const db = getDb();
  const result = db
    .select({
      jobCount: sql`COUNT(*)`,
      totalDurationSeconds: sql`SUM(duration_seconds)`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.instanceName, instanceName),
        eq(usageEvents.eventType, 'job_dispatch'),
        eq(usageEvents.periodMonth, periodMonth),
      )
    )
    .get();
  return {
    jobCount: result?.jobCount ?? 0,
    totalDurationSeconds: result?.totalDurationSeconds ?? 0,
  };
}

export function getBillingLimits(instanceName) {
  const db = getDb();
  const rows = db
    .select()
    .from(billingLimits)
    .where(eq(billingLimits.instanceName, instanceName))
    .all();
  const limits = {};
  for (const row of rows) {
    limits[row.limitType] = row.limitValue;
  }
  return {
    jobsPerMonth: limits['jobs_per_month'] ?? null,
    concurrentJobs: limits['concurrent_jobs'] ?? null,
  };
}

export function upsertBillingLimit(instanceName, limitType, limitValue) {
  const db = getDb();
  // SQLite UPSERT — update on conflict
  const existing = db
    .select({ id: billingLimits.id })
    .from(billingLimits)
    .where(and(eq(billingLimits.instanceName, instanceName), eq(billingLimits.limitType, limitType)))
    .get();

  if (existing) {
    db.update(billingLimits)
      .set({ limitValue, updatedAt: Date.now() })
      .where(eq(billingLimits.id, existing.id))
      .run();
  } else {
    db.insert(billingLimits).values({
      id: randomUUID(),
      instanceName,
      limitType,
      limitValue,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).run();
  }
}
```

### lib/billing/enforce.js — Enforcement

```javascript
// Source: codebase pattern — synchronous SQLite read, no network dependency
import { getUsageSummary, getBillingLimits } from '../db/usage.js';

/**
 * Check whether instanceName is allowed to dispatch a job_dispatch event.
 * Returns { allowed, current, limit, remaining, percentUsed, resetDate }
 * If no limit is configured, returns { allowed: true, limit: null }.
 */
export function checkUsageLimit(instanceName, limitType = 'jobs_per_month') {
  const periodMonth = new Date().toISOString().slice(0, 7);
  const limits = getBillingLimits(instanceName);
  const limit = limits.jobsPerMonth; // for 'jobs_per_month'

  const summary = getUsageSummary(instanceName, periodMonth);
  const current = summary.jobCount;

  // No limit configured — unlimited
  if (limit === null) {
    return { allowed: true, current, limit: null, remaining: null, percentUsed: 0, resetDate: null };
  }

  const percentUsed = current / limit;
  const remaining = Math.max(0, limit - current);

  // Calculate reset date: first day of next month (UTC)
  const now = new Date();
  const resetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString().slice(0, 10);

  return {
    allowed: current < limit,
    current,
    limit,
    remaining,
    percentUsed,
    resetDate,
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workspace-hour billing in Phase 44 scope | Deferred — job_dispatch only in Phase 44 | STATE.md decision 2026-03-17 | `workspace_hour` event type NOT added to schema in this phase |
| Stripe in dispatch path | Local SQLite enforcement only; Stripe is v2 (BILL-06/07) | REQUIREMENTS.md v2 section | Zero network calls in createJobTool |
| Hard billing limits on day one | Default = unlimited (no row = allowed) | PITFALLS.md research 2026-03-17 | Existing Noah/StrategyES instances unaffected |

**Out of scope for Phase 44:**
- `workspace_hour` event type (no schema column for it — omit to avoid dead columns)
- Stripe integration (BILL-06, BILL-07 — v2 requirements)
- `/admin/billing` cross-instance superadmin UI (monitoring dashboard, Phase 46)
- Token count per job (tokens not available at dispatch time; require Claude API response parsing from job container output — complex, deferred)

---

## Open Questions

1. **Actions path usage recording location**
   - What we know: Docker jobs record via `waitAndNotify()`; Actions jobs complete via GitHub webhook in `api/index.js`
   - What's unclear: The exact line in `api/index.js` where `saveJobOutcome()` is called for the Actions path — this needs to be found and matched with a `recordUsageEvent()` call
   - Recommendation: Planner task should grep `api/index.js` for `saveJobOutcome` and add recording at that call site

2. **80% warning deduplication approach**
   - What we know: Sending a Slack warning per job above 80% is too noisy
   - What's unclear: Whether a `warningSentPeriod` column on `billingLimits` is worth the schema complexity
   - Recommendation: Add `warningSentPeriod text` column to `billingLimits` schema — one column, simple check (`warningSentPeriod !== periodMonth`), update after send

3. **Admin billing page: per-instance self-config vs. superadmin-only**
   - What we know: BILL-05 says "Superadmin can navigate to the billing config page" — implies superadmin-only write access
   - What's clear: Read (view usage) requires `admin` role; write (change limits) requires `superadmin` role
   - Recommendation: Single page at `/admin/billing` — view accessible to `admin`, edit form only rendered for `superadmin`. Matches existing admin layout pattern.

---

## Validation Architecture

> nyquist_validation not in config.json — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test` + `node:assert`) |
| Config file | None — tests run directly: `node --test test/billing/*.js` |
| Quick run command | `node --test test/billing/test-enforce.js` |
| Full suite command | `node --test test/billing/*.js test/observability/*.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILL-01 | `recordUsageEvent()` inserts a row; `getUsageSummary()` returns jobCount=1 | unit | `node --test test/billing/test-usage.js` | ❌ Wave 0 |
| BILL-02 | `getUsageSummary()` returns correct aggregates for `periodMonth` | unit | `node --test test/billing/test-usage.js` | ❌ Wave 0 |
| BILL-03 | `checkUsageLimit()` returns `percentUsed >= 0.8` when at 80% | unit | `node --test test/billing/test-enforce.js` | ❌ Wave 0 |
| BILL-04 | `checkUsageLimit()` returns `allowed: false` when at/above limit | unit | `node --test test/billing/test-enforce.js` | ❌ Wave 0 |
| BILL-05 | `upsertBillingLimit()` persists value; subsequent `getBillingLimits()` returns new value | unit | `node --test test/billing/test-usage.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test test/billing/test-enforce.js`
- **Per wave merge:** `node --test test/billing/*.js`
- **Phase gate:** `node --test test/billing/*.js test/observability/*.js` green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/billing/test-usage.js` — covers BILL-01, BILL-02, BILL-05 (recordUsageEvent, getUsageSummary, upsertBillingLimit, getBillingLimits)
- [ ] `test/billing/test-enforce.js` — covers BILL-03, BILL-04 (checkUsageLimit allowed/rejected/80% warning threshold)
- [ ] `lib/billing/` directory — does not exist yet (Wave 0 creates it with enforce.js)

Test pattern: use temp SQLite file, same as `test/observability/test-errors.js` — create DB, create tables manually, import module, run assertions, cleanup.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `lib/db/schema.js` — confirmed `errorLog` pattern for new table definitions; confirmed no existing `usage_events` or `billing_limits` tables
- `lib/ai/tools.js` — confirmed `createJobTool` is the correct enforcement insertion point (~line 79, before `createJob()`); confirmed `waitAndNotify()` is the correct recording insertion point (~line 315, after `saveJobOutcome()`)
- `lib/tools/create-job.js` — confirmed this file handles GitHub branch creation ONLY; does not know dispatch method, Docker success, or job completion — confirmed NOT the enforcement insertion point
- `api/superadmin.js` — confirmed `handleSuperadminEndpoint()` switch pattern; confirmed `getHealth()` dynamic import pattern for new endpoint functions
- `lib/superadmin/client.js` — confirmed `queryAllInstances(endpoint)` works for any endpoint name; zero changes needed
- `lib/db/error-log.js` — confirmed query helper pattern (randomUUID, drizzle insert/select/delete, getDb() singleton); Phase 44 query helpers follow identical pattern
- `lib/db/index.js` — confirmed better-sqlite3 + drizzle WAL mode singleton; all DB operations synchronous
- `lib/db/job-outcomes.js` — confirmed `saveJobOutcome()` call site is in `waitAndNotify()` in `tools.js`; confirmed additive-only constraint (no modifications to this file)
- `lib/chat/actions.js` — confirmed Server Action pattern (`'use server'`, `requireAdmin()`, `requireSuperadmin()` guards)
- `lib/chat/components/admin-layout.js` — confirmed `ADMIN_NAV` array where billing page link is added; confirmed superadmin vs admin nav sections
- `lib/cron.js` — confirmed `node-cron` scheduler already exists; future Stripe sync cron follows `startBuiltinCrons()` pattern
- `test/observability/test-errors.js` — confirmed Node.js built-in test runner pattern; Phase 44 tests follow identical structure (temp DB file, `createTestTables`, before/after hooks)
- `.planning/STATE.md` — confirmed "workspace_hour billing deferred" research flag; confirmed "Local SQLite enforcement only in dispatch path" billing approach decision
- `.planning/REQUIREMENTS.md` — confirmed BILL-01 through BILL-05 scope; confirmed BILL-06/07 are v2 (no Stripe in Phase 44)

### Secondary (MEDIUM confidence)

- `.planning/research/ARCHITECTURE.md` — Capability 2 section (Billing and Usage Tracking) — schema designs confirmed against actual schema.js; enforcement data flow confirmed against actual tools.js
- `.planning/research/PITFALLS.md` — Pitfall 3 (wrong billing unit), Pitfall 4 (blocking Docker fast path), Pitfall 9 (free tier burst abuse) — all verified as applicable

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all integration points verified in existing code
- Architecture: HIGH — insertion points confirmed from reading actual source files, not assumed
- Pitfalls: HIGH (enforcement location, Actions path gap) / MEDIUM (80% warning deduplication options)

**Research date:** 2026-03-18
**Valid until:** 2026-04-17 (stable codebase, no upstream churn expected)
