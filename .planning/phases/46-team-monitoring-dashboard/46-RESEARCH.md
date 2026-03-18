# Phase 46: Team Monitoring Dashboard — Research

**Researched:** 2026-03-18
**Domain:** Superadmin dashboard extension, consecutive-failure alert system, cross-instance health aggregation
**Confidence:** HIGH — all findings derived from direct codebase inspection; no external libraries required

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MON-01 | Superadmin portal displays per-instance monitoring cards with error rate, usage vs limits, and onboarding state | `queryAllInstances('health')`, `queryAllInstances('usage')`, and `queryAllInstances('onboarding')` already work via existing proxy pattern; new monitoring page aggregates the three into per-instance cards |
| MON-02 | Superadmin receives a Slack alert when an instance logs 3+ consecutive job failures (throttled to once per hour per instance) | `job_outcomes` table already stores status values; consecutive-failure check queries the N most recent rows ordered by `created_at DESC`; throttle state stored in a new `alert_state` DB key or a dedicated in-memory + SQLite approach |
</phase_requirements>

---

## Summary

Phase 46 is a pure aggregation and alerting layer built on top of three prior phases. Every data source it needs already exists: `error_log` (Phase 43), `usage_events` + `billing_limits` (Phase 44), and `onboarding_state` (Phase 45). The superadmin endpoint switch in `api/superadmin.js` already has `usage` and `onboarding` cases. The `queryAllInstances()` proxy in `lib/superadmin/client.js` requires zero changes — it handles any endpoint name automatically.

The monitoring page (`/admin/superadmin/monitoring`) is a new page shell in `templates/app/admin/superadmin/` that imports a new React component from `lib/chat/components/`. The component follows the exact same pattern as the existing `SuperadminDashboard` — uses a Server Action backed by `queryAllInstances()` calls, auto-refreshes every 30 seconds with `setInterval`, and renders per-instance cards.

The alert logic (MON-02) is the only non-trivial piece. It requires: (1) detecting 3+ consecutive `failed` statuses in `job_outcomes`, (2) sending a Slack message to `SLACK_OPERATOR_CHANNEL`, and (3) suppressing repeat alerts within the same hour per instance. The throttle state can be stored in the `settings` table (already used for key-value pairs) with a `type='alert_state'` discriminator — no new table needed.

**Primary recommendation:** Build the monitoring page as a thin aggregation component that re-uses existing `queryAllInstances()` calls. Implement consecutive-failure detection as a new function in `lib/db/job-outcomes.js`. Store alert throttle timestamps in the `settings` table under `type='alert_state'`. Trigger alert checks from the `waitAndNotify` callback in `lib/tools/create-job.js` after job outcome is saved — not from a polling cron.

---

## Standard Stack

### Core (all already installed — zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@slack/web-api` | ^7.8.0 | Send Slack alert via `WebClient.chat.postMessage()` | Already used in billing 80% warning in `lib/ai/tools.js` |
| `drizzle-orm` | ^0.44.0 | Query `job_outcomes`, `error_log`, `usage_events`, `onboarding_state` | All DB access uses Drizzle |
| `better-sqlite3` | ^12.6.2 | Synchronous SQLite reads for throttle checks | All existing DB helpers use this |
| React (Next.js built-in) | — | Client component for monitoring dashboard | `SuperadminDashboard` established the pattern |

### Zero New Dependencies

The architecture research summary is confirmed: "Team monitoring and health checks require zero new libraries." Package.json audit confirms `@slack/web-api` v7.8.0 is already installed. No charting library is needed for the v1 monitoring cards (the requirement is cards with status fields, not charts — MON-03 historical timeline chart is a v2 requirement out of scope for Phase 46).

**Recharts flag resolved:** No charting library is present in `package.json`. The monitoring card UI uses plain HTML/Tailwind (progress bars, status badges, text metrics) — not a charting library. This is correct for the current requirements.

**Installation:** No `npm install` required for this phase.

---

## Architecture Patterns

### Recommended Project Structure

New files for this phase:

```
lib/
├── db/
│   └── job-outcomes.js         # ADD: getConsecutiveFailureCount(n)
├── monitoring/
│   └── alerts.js               # NEW: checkAndAlertConsecutiveFailures()
└── chat/
    ├── components/
    │   └── superadmin-monitoring.jsx   # NEW: MonitoringDashboard component
    └── actions.js              # ADD: getMonitoringDashboard() Server Action

templates/
└── app/
    └── admin/
        └── superadmin/
            └── monitoring/
                └── page.js     # NEW: page shell importing MonitoringDashboard

api/
└── superadmin.js               # ADD: 'errors' case (health already has errorCount24h)
```

### Pattern 1: Superadmin Endpoint Extension (existing, proven)

**What:** Add new case to `handleSuperadminEndpoint()` switch in `api/superadmin.js`. The `queryAllInstances()` proxy picks it up automatically.

**Current state:** `api/superadmin.js` already has `health`, `stats`, `jobs`, `usage`, and `onboarding` cases. The `health` endpoint already returns `errorCount24h`, `lastErrorAt`, `jobSuccessRate`, and `dbStatus` — so a separate `errors` endpoint may not be strictly needed. The monitoring card can consume existing `health` + `usage` + `onboarding` endpoints.

**When to use:** Any per-instance data the hub needs. Each new case = one HTTP fan-out cycle. At 2-5 instances, cost is ~100ms per endpoint.

**Example (existing pattern):**
```javascript
// api/superadmin.js — existing switch structure (DO NOT CHANGE client.js)
export async function handleSuperadminEndpoint(endpoint, params) {
  switch (endpoint) {
    case 'health':  return getHealth();     // already returns errorCount24h, jobSuccessRate
    case 'stats':   return await getStats();
    case 'jobs':    return await getJobs(params);
    case 'usage':   return await getUsage(); // already exists (Phase 44)
    case 'onboarding': { ... }               // already exists (Phase 45)
    default: throw new Error(`Unknown superadmin endpoint: ${endpoint}`);
  }
}
```

### Pattern 2: Server Action + 30-second Polling (existing pattern from SuperadminDashboard)

**What:** `'use client'` component calls a `'use server'` action that calls `queryAllInstances()`. Auto-refresh via `setInterval(loadData, 30000)`.

**When to use:** All superadmin dashboard pages. This avoids the SSE fan-out complexity while providing acceptable freshness at 2-5 instance scale.

**Exact pattern from `superadmin-dashboard.jsx`:**
```javascript
// lib/chat/components/superadmin-monitoring.jsx (source: direct codebase inspection)
'use client';
import { useState, useEffect, useCallback } from 'react';
import { getMonitoringDashboard } from '../actions.js';

export function MonitoringDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const result = await getMonitoringDashboard();
    setData(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // render per-instance cards
}
```

### Pattern 3: Consecutive Failure Detection

**What:** Query the N most recent `job_outcomes` rows ordered by `createdAt DESC`, check if all N have `status = 'failed'` (or equivalent failure status values).

**Status values in `job_outcomes`:** The schema stores `status` as a plain text column. From `getJobSuccessRate()`, success is detected with `r.status === 'success'`. Failure statuses include `'failed'`, `'error'`, and potentially `'timeout'` — need to verify the complete set from `waitAndNotify`.

**Implementation in `lib/db/job-outcomes.js` (additive, per do-not-touch rules):**
```javascript
// Source: direct inspection of lib/db/job-outcomes.js + lib/db/schema.js
/**
 * Return the count of consecutive terminal failures at the tail of job_outcomes.
 * "Consecutive" = the N most recent rows are all non-success statuses.
 * @param {number} [n=3] - how many consecutive failures to check
 * @returns {number} - consecutive failure count (0 if latest job succeeded)
 */
export function getConsecutiveFailureCount(n = 10) {
  const db = getDb();
  const rows = db
    .select({ status: jobOutcomes.status })
    .from(jobOutcomes)
    .orderBy(desc(jobOutcomes.createdAt))
    .limit(n)
    .all();
  let count = 0;
  for (const row of rows) {
    if (row.status !== 'success') count++;
    else break;  // stop at first success
  }
  return count;
}
```

### Pattern 4: Alert Throttle Using settings Table

**What:** Store last-alert-sent timestamp in the existing `settings` table with `type='alert_state'` and `key='consecutive_failure_alert_{instanceName}'`. No new table.

**Why settings table:** The `settings` table is explicitly documented as a key-value store for config/secret/llm_provider types. Adding an `alert_state` type is consistent with its design. The `getConfigValue()` / `setConfigValue()` helpers in `lib/db/config.js` provide the read/write API.

**Throttle logic:**
```javascript
// lib/monitoring/alerts.js (NEW file)
import { getConfigValue, setConfigValue } from '../db/config.js';
import { getConsecutiveFailureCount } from '../db/job-outcomes.js';

const FAILURE_THRESHOLD = 3;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export async function checkAndAlertConsecutiveFailures(instanceName) {
  const count = getConsecutiveFailureCount(FAILURE_THRESHOLD);
  if (count < FAILURE_THRESHOLD) return;

  // Check throttle — last alert timestamp
  const alertKey = `consecutive_failure_alert_${instanceName}`;
  const lastAlertRaw = getConfigValue('alert_state', alertKey);
  const lastAlertAt = lastAlertRaw ? parseInt(lastAlertRaw, 10) : 0;

  if (Date.now() - lastAlertAt < ALERT_COOLDOWN_MS) return; // still within cooldown

  // Send alert
  await sendConsecutiveFailureAlert(instanceName, count);

  // Record timestamp
  setConfigValue('alert_state', alertKey, String(Date.now()));
}
```

**Trigger point:** Call `checkAndAlertConsecutiveFailures()` from `waitAndNotify` in `lib/tools/create-job.js` after `saveJobOutcome()` is called. This is an append-only call in the existing fire-and-forget path — no structural change to `waitAndNotify`.

### Pattern 5: Slack Alert Message

**What:** Send a plain-text Slack message using the existing `WebClient` pattern from `lib/ai/tools.js`.

**Env vars already established:**
- `SLACK_BOT_TOKEN` — used in billing warnings and job notifications
- `SLACK_OPERATOR_CHANNEL` — introduced in Phase 44 for billing 80% warnings

**Pattern (from lib/ai/tools.js billing alert):**
```javascript
// Source: direct inspection of lib/ai/tools.js:98-110
const { SLACK_BOT_TOKEN, SLACK_OPERATOR_CHANNEL } = process.env;
if (SLACK_BOT_TOKEN && SLACK_OPERATOR_CHANNEL) {
  const { WebClient } = await import('@slack/web-api');
  const slack = new WebClient(SLACK_BOT_TOKEN);
  await slack.chat.postMessage({
    channel: SLACK_OPERATOR_CHANNEL,
    text: `Alert: Instance "${instanceName}" has ${count} consecutive job failures. Check logs immediately.`,
  });
}
```

Non-fatal: wrap in try/catch, log warning on failure, never block job flow.

### Pattern 6: getConfigValue / setConfigValue (existing API)

**What:** `lib/db/config.js` exposes `getConfigValue(type, key)` and `setConfigValue(type, key, value)` for key-value storage in the `settings` table.

**Verification needed during planning:** Confirm the exact API signatures of `getConfigValue` and `setConfigValue` before using them for throttle state. The `settings` table uses `(type, key)` as composite lookup — the `alert_state` type must not collide with existing types (`config`, `secret`, `llm_provider`).

### Anti-Patterns to Avoid

- **Adding a polling cron for failure detection:** The consecutive failure check only needs to run after a job completes — not on a timer. Running it from `waitAndNotify` is free (synchronous SQLite query, <1ms) and avoids a cron-based polling loop.
- **New alert_throttle table:** The `settings` table already handles key-value with `type` discrimination. A new table adds schema migration with no architectural benefit.
- **Querying all job_outcomes for consecutive failures:** Use `LIMIT n ORDER BY createdAt DESC` — only the last N rows matter. Never do a full table scan.
- **Blocking `waitAndNotify` with Slack API call:** The Slack `postMessage` is async. Call it with `await` but inside the fire-and-forget detached async block — not in the synchronous dispatch path.
- **Separate `errors` superadmin endpoint:** The existing `health` endpoint already returns `errorCount24h`, `lastErrorAt`, and `jobSuccessRate`. The monitoring card can consume `health` + `usage` + `onboarding` without a fourth fan-out.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-instance HTTP fan-out | Custom fetch loop | `queryAllInstances()` in `lib/superadmin/client.js` | Already handles timeout (5s), error isolation, local instance bypass |
| Slack message delivery | Custom HTTP to Slack API | `@slack/web-api` `WebClient` | Already installed, already used in billing warnings |
| Key-value alert throttle state | New SQLite table | `settings` table via `lib/db/config.js` `setConfigValue()` | Already handles arbitrary key-value, no migration needed |
| Job failure status detection | Custom regex on logSummary | Query `job_outcomes.status` column directly | Status is already a structured field, not free text |

**Key insight:** Every infrastructure piece this phase needs was built by Phases 43-45. This phase is a dashboard + alert layer, not a new infrastructure layer.

---

## Common Pitfalls

### Pitfall 1: Missing `errors` Endpoint — But It's Not Needed

**What goes wrong:** Research summary mentions an `errors` superadmin endpoint; planner adds it as a task.
**Why it happens:** Architecture doc was written before Phase 43 extended `getHealth()` to include `errorCount24h` and `lastErrorAt`.
**How to avoid:** Use the existing `health` endpoint. It already returns `errorCount24h`, `lastErrorAt`, `dbStatus`, and `jobSuccessRate`. A separate `errors` endpoint is only needed if the monitoring card requires the last 5 error messages (not part of MON-01).
**Decision:** MON-01 requires "error rate" (a count), not error message list. The `health` endpoint covers it. No `errors` endpoint needed.

### Pitfall 2: Consecutive Failure Check — What Counts as Failure?

**What goes wrong:** Checking `status !== 'success'` may match intermediate or unexpected status values, producing false positives.
**Why it happens:** `job_outcomes.status` is a free text column. The complete set of values written by `waitAndNotify` needs confirmation.
**How to avoid:** Verify the complete status value set by inspecting `lib/tools/create-job.js` `waitAndNotify` callback and any GitHub Actions webhook handler that writes `saveJobOutcome()`. Only count rows with explicitly known failure statuses as failures; treat unknown statuses as non-conclusive.
**Warning signs:** Alert fires immediately after deploy before any jobs run (indicates empty table edge case or wrong status matching).

### Pitfall 3: Throttle State Lost on Process Restart

**What goes wrong:** Alert throttle stored only in memory resets on server restart, causing repeat alerts within the same hour after a deploy.
**Why it happens:** Simple in-memory Map/object does not survive process restart.
**How to avoid:** Store throttle timestamp in `settings` table (SQLite survives restarts). This is why Pattern 4 uses `setConfigValue()` rather than a module-level Map.

### Pitfall 4: Fan-Out to 5 Endpoints Adds Latency

**What goes wrong:** Monitoring page calls `queryAllInstances('health')`, `queryAllInstances('usage')`, `queryAllInstances('onboarding')` sequentially — page takes 15 seconds to load.
**Why it happens:** Sequential awaits instead of parallel `Promise.all()`.
**How to avoid:** Run all three `queryAllInstances()` calls in parallel with `Promise.all()` or `Promise.allSettled()`. The `getSuperadminDashboard` action already demonstrates this pattern with `Promise.all([queryAllInstances('health'), queryAllInstances('stats')])`.

### Pitfall 5: Alert Fires on Instance With No Jobs

**What goes wrong:** `getConsecutiveFailureCount(3)` returns 3 on a fresh instance where the only 3 rows are failed onboarding test jobs.
**Why it happens:** The consecutive failure logic counts any 3 non-success rows, including the onboarding first-job attempt.
**How to avoid:** Add a minimum job count guard: only fire the alert if the instance has at least 5 total jobs in `job_outcomes`. Onboarding instances with 3 failed test jobs should not trigger production alerts.

### Pitfall 6: Monitoring Page Not Gated to Superadmin

**What goes wrong:** Page is accessible to admin role, exposing cross-instance health data to non-superadmin users.
**Why it happens:** New page shell misses the `requireSuperadmin()` guard.
**How to avoid:** Server Action must call `requireSuperadmin()` (not `requireAdmin()`). The page shell also needs the `isSuperadminHub` check — if the instance is not the hub, the monitoring page has no data to show.

---

## Code Examples

Verified patterns from direct codebase inspection:

### Existing getSuperadminDashboard Action Pattern (to mirror)
```javascript
// Source: lib/chat/actions.js:1219 — direct codebase inspection
export async function getSuperadminDashboard() {
  await requireSuperadmin();
  try {
    const { queryAllInstances } = await import('../superadmin/client.js');
    const [healthResults, statsResults] = await Promise.all([
      queryAllInstances('health'),
      queryAllInstances('stats'),
    ]);
    // Merge per instance ...
    return { instances };
  } catch {
    return { error: 'Failed to load superadmin dashboard' };
  }
}
```

### New getMonitoringDashboard Action (follows same structure)
```javascript
// lib/chat/actions.js — NEW action (additive)
export async function getMonitoringDashboard() {
  await requireSuperadmin();
  try {
    const { queryAllInstances } = await import('../superadmin/client.js');
    const [healthResults, usageResults, onboardingResults] = await Promise.all([
      queryAllInstances('health'),
      queryAllInstances('usage'),
      queryAllInstances('onboarding'),
    ]);
    // Merge all three per instance, return array
    const instances = healthResults.map((h) => {
      const usage = usageResults.find((u) => u.instance === h.instance);
      const onboarding = onboardingResults.find((o) => o.instance === h.instance);
      return {
        name: h.instance,
        status: h.data?.status || 'offline',
        errorCount24h: h.data?.errorCount24h ?? 0,
        lastErrorAt: h.data?.lastErrorAt ?? null,
        jobSuccessRate: h.data?.jobSuccessRate ?? null,
        usage: usage?.data ?? null,
        onboarding: onboarding?.data?.onboarding ?? null,
        error: h.error || null,
      };
    });
    return { instances };
  } catch {
    return { error: 'Failed to load monitoring dashboard' };
  }
}
```

### Existing health Endpoint Output (what monitoring card already has)
```javascript
// Source: api/superadmin.js:getHealth() — direct codebase inspection
{
  instance: 'noah',
  status: 'online',
  uptime: 3600,
  errorCount24h: 2,          // error rate for MON-01
  lastErrorAt: 1710000000000,
  dbStatus: 'ok',
  jobSuccessRate: {           // success rate for MON-01
    total: 10,
    succeeded: 8,
    rate: 0.8                 // null when total === 0
  }
}
```

### Existing usage Endpoint Output (usage vs limits for MON-01)
```javascript
// Source: api/superadmin.js:getUsage() — direct codebase inspection
{
  instance: 'noah',
  period: '2026-03',
  jobsDispatched: 12,         // usage for MON-01
  totalDurationSeconds: 3600,
  limits: {
    jobsPerMonth: 50,         // limit for usage vs limit display
    concurrentJobs: 3
  }
}
```

### Existing onboarding Endpoint Output (onboarding state for MON-01)
```javascript
// Source: api/superadmin.js — 'onboarding' case, lib/onboarding/state.js — direct inspection
{
  onboarding: {
    id: 'singleton',
    currentStep: 'first_job',
    githubConnect: 'complete',
    dockerVerify: 'complete',
    channelConnect: 'complete',
    firstJob: 'pending',
    completedAt: null,        // null = not complete yet
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  }
}
```

### Slack Alert Pattern (billing warning in lib/ai/tools.js)
```javascript
// Source: lib/ai/tools.js:98-110 — direct codebase inspection — use identical pattern
const { SLACK_BOT_TOKEN, SLACK_OPERATOR_CHANNEL } = process.env;
if (SLACK_BOT_TOKEN && SLACK_OPERATOR_CHANNEL) {
  try {
    const { WebClient } = await import('@slack/web-api');
    const slack = new WebClient(SLACK_BOT_TOKEN);
    await slack.chat.postMessage({
      channel: SLACK_OPERATOR_CHANNEL,
      text: `Alert: Instance "${instanceName}" has logged ${count} consecutive job failures. Check /admin/superadmin/monitoring for details.`,
    });
  } catch (err) {
    console.warn('Failed to send consecutive failure alert:', err.message);
    // Non-fatal
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | Status |
|--------------|-----------------|--------|
| Superadmin dashboard = `health` + `stats` only | Monitoring dashboard = `health` + `usage` + `onboarding` merged per instance | New for Phase 46 |
| No consecutive failure alerting | 3-consecutive-failure threshold + 1-hour throttle per instance | New for Phase 46 |
| Error data not surfaced in superadmin UI | `errorCount24h` + `jobSuccessRate` from `health` endpoint visible in monitoring cards | `getHealth()` already returns these — Phase 43 built it |
| Usage vs limits not in superadmin UI | `usage` endpoint returns `jobsDispatched` + `limits` — available since Phase 44 | Already built, needs UI surfacing |

**Confirmed already done (zero re-work needed):**
- `health` endpoint extended with `errorCount24h`, `lastErrorAt`, `dbStatus`, `jobSuccessRate` — Phase 43 complete
- `usage` and `onboarding` cases added to `handleSuperadminEndpoint()` switch — Phase 44/45 complete
- `getUsageSummary()`, `getBillingLimits()`, `getOnboardingState()` — all implemented

---

## Open Questions

1. **What failure status values does `waitAndNotify` write to `job_outcomes.status`?**
   - What we know: `'success'` is confirmed in `getJobSuccessRate()`. The `mergeResult` column has values like `'merged'`, `'skipped'`.
   - What's unclear: Whether `status` can be `'failed'`, `'error'`, `'timeout'`, or other values for non-success outcomes.
   - Recommendation: During planning, inspect `lib/tools/create-job.js` `waitAndNotify` and the GitHub Actions webhook handler (`api/index.js`) for all `saveJobOutcome()` call sites to enumerate the complete `status` value set. Define the failure set explicitly in `getConsecutiveFailureCount()`.

2. **Does `lib/db/config.js` expose `getConfigValue(type, key)` and `setConfigValue(type, key, value)` with these exact signatures?**
   - What we know: `getConfigValue` and `setConfigValue` are used in `lib/chat/actions.js` for settings management.
   - What's unclear: Exact function signatures and whether they accept a `type` discriminator parameter.
   - Recommendation: Read `lib/db/config.js` during task authoring to confirm exact API before writing alert throttle code.

3. **Should the monitoring page live at `/admin/superadmin/monitoring` or `/admin/monitoring`?**
   - What we know: Superadmin routes in templates live at `templates/app/admin/superadmin/` (the existing superadmin dashboard is at `templates/app/admin/superadmin/page.js`).
   - Recommendation: Use `/admin/superadmin/monitoring` — consistent with existing superadmin page location. The sidebar link should be added under the superadmin section, guarded by `user?.role === 'superadmin'`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | No test framework detected (no jest.config, vitest.config, or test directories found) |
| Config file | None — no Wave 0 gap to fill; project does not use automated tests |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MON-01 | Monitoring page renders per-instance cards with error rate, usage, onboarding | manual-only | N/A | N/A |
| MON-02 | 3 consecutive failures triggers Slack alert; throttled to once per hour | manual-only | N/A | N/A |

**Justification for manual-only:** The project has no test infrastructure. MON-01 requires a running multi-instance superadmin hub environment to verify rendering. MON-02 requires either a real Slack workspace or a mock — both require test infrastructure that does not exist.

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements (trivially: no test infrastructure exists; no gaps to fill at Wave 0).

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `api/superadmin.js` — confirmed existing `health`, `stats`, `jobs`, `usage`, `onboarding` cases; confirmed `getHealth()` already returns `errorCount24h`, `lastErrorAt`, `jobSuccessRate`, `dbStatus`
- `lib/superadmin/client.js` — confirmed `queryAllInstances(endpoint)` accepts any endpoint name; confirmed do-not-touch rule
- `lib/chat/actions.js:1219` — `getSuperadminDashboard()` action pattern confirmed; `requireSuperadmin()` guard pattern confirmed
- `lib/chat/components/superadmin-dashboard.jsx` — `useEffect` + `setInterval` 30-second polling pattern confirmed
- `lib/db/schema.js` — confirmed `job_outcomes` schema (`status`, `createdAt` columns); confirmed `errorLog`, `usageEvents`, `billingLimits`, `onboardingState` tables from Phases 43-45
- `lib/db/job-outcomes.js` — confirmed `getJobSuccessRate()` uses `status === 'success'` comparison; additive column rule confirmed
- `lib/db/usage.js` — confirmed `getUsageSummary()` and `getBillingLimits()` return shapes
- `lib/onboarding/state.js` — confirmed `getOnboardingState()` returns singleton row structure; confirmed step columns (`githubConnect`, `dockerVerify`, `channelConnect`, `firstJob`)
- `lib/ai/tools.js:98-110` — Slack `WebClient` + `postMessage` pattern confirmed; `SLACK_BOT_TOKEN` + `SLACK_OPERATOR_CHANNEL` env vars confirmed
- `lib/chat/components/app-sidebar.jsx` — confirmed superadmin link guard: `user?.role === 'superadmin'`
- `package.json` — confirmed `@slack/web-api ^7.8.0` installed; confirmed NO charting library present

### Secondary (MEDIUM confidence)

- `.planning/research/ARCHITECTURE.md` — Capability 4 section; endpoint design shapes confirmed against actual code
- `.planning/research/SUMMARY.md` — Phase 4 (monitoring) summary; "zero new libraries" confirmed by package.json audit
- `.planning/STATE.md` — Decisions section; "Zero new libraries. Extends existing dockerode stats, Drizzle queries, superadmin endpoint switch pattern." confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed by package.json; all libraries pre-installed
- Architecture: HIGH — derived from direct inspection of 11 source files; all integration points verified
- Pitfalls: HIGH (structural) — Edge cases derived from reading actual query logic and existing alert patterns
- Alert throttle approach: MEDIUM — `settings` table is correct pattern but `getConfigValue`/`setConfigValue` API signatures need confirmation during planning

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable codebase; only invalidated by schema changes to `job_outcomes` or `settings` table)
