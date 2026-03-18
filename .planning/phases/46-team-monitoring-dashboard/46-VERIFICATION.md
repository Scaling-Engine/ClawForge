---
phase: 46-team-monitoring-dashboard
verified: 2026-03-17T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Navigate to /admin/superadmin/monitoring as a superadmin user"
    expected: "Per-instance monitoring cards appear with error count, success rate, usage bar (jobs vs limit), onboarding badge, and last error timestamp"
    why_human: "Visual layout, color coding, and auto-refresh require browser verification"
  - test: "Wait 30 seconds on the monitoring page without reloading"
    expected: "Dashboard data refreshes silently without a manual reload"
    why_human: "Auto-refresh interval behavior can only be confirmed in a live browser session"
  - test: "Trigger 3 consecutive failing jobs on a configured instance"
    expected: "A Slack message appears in SLACK_OPERATOR_CHANNEL mentioning the instance name and failure count"
    why_human: "Requires SLACK_BOT_TOKEN + SLACK_OPERATOR_CHANNEL configured and live Docker job execution"
---

# Phase 46: Team Monitoring Dashboard — Verification Report

**Phase Goal:** The superadmin can see the health of every instance at a glance and receives automatic alerts when something is systematically wrong
**Verified:** 2026-03-17
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `getMonitoringDashboard` Server Action returns per-instance health, usage, and onboarding data merged into a single array | VERIFIED | `lib/chat/actions.js:1254–1297` calls `queryAllInstances('health')`, `queryAllInstances('usage')`, `queryAllInstances('onboarding')` concurrently and merges results per instance; gated by `requireSuperadmin()` |
| 2 | After 3 consecutive job failures, a Slack alert is sent to the operator channel | VERIFIED | `lib/monitoring/alerts.js` sets `FAILURE_THRESHOLD = 3`, calls `getConsecutiveFailureCount(FAILURE_THRESHOLD)`, then posts via `@slack/web-api` WebClient when threshold is met |
| 3 | If the same instance keeps failing after the alert, no duplicate alert is sent within the same hour | VERIFIED | Throttle stored at key `alert:consecutive_failure:{instanceName}` via `setConfigValue`; timestamp compared to `ALERT_COOLDOWN_MS = 60 * 60 * 1000` before sending |
| 4 | Superadmin can navigate to /admin/superadmin/monitoring and see a card for each instance | VERIFIED | `templates/app/admin/superadmin/monitoring/page.js` imports `MonitoringDashboard` from index; component maps `instances` array to `MonitoringCard` components |
| 5 | Each monitoring card shows error rate, job usage vs configured limit, and onboarding completion state | VERIFIED | `MonitoringCard` in `lib/chat/components/superadmin-monitoring.jsx:82–129` renders `errorCount24h`, `jobSuccessRate.rate` (color-coded), `UsageBar` (jobsDispatched vs jobsPerMonth limit with progress bar), and `OnboardingBadge` |
| 6 | Dashboard auto-refreshes every 30 seconds without manual reload | VERIFIED | `useEffect` in `MonitoringDashboard` (line 165–169) calls `loadData()` immediately and sets `setInterval(loadData, 30000)` with cleanup on unmount |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/monitoring/alerts.js` | Consecutive failure detection and throttled Slack alerting; exports `checkAndAlertConsecutiveFailures` | VERIFIED | 44 lines; exports `checkAndAlertConsecutiveFailures`; `FAILURE_THRESHOLD = 3`, `ALERT_COOLDOWN_MS = 3600000`; non-fatal try/catch around Slack call |
| `lib/db/job-outcomes.js` | Additive `getConsecutiveFailureCount` query; existing functions untouched | VERIFIED | `getConsecutiveFailureCount(n = 10)` added at line 73; queries `jobOutcomes` ordered by `createdAt DESC`, counts until first `'success'`; existing `saveJobOutcome`, `getJobSuccessRate`, `getLastMergedJobOutcome` unchanged |
| `lib/chat/actions.js` | `getMonitoringDashboard` Server Action; additive after `getSuperadminDashboard` | VERIFIED | Added at line 1254; calls `requireSuperadmin()`; merges health+usage+onboarding per instance; returns `{ instances }` or `{ error }` |
| `lib/ai/tools.js` | Alert trigger wired into `waitAndNotify` after `saveJobOutcome` | VERIFIED | Two trigger sites: origin path (line 373–380) and no-origin path (line 449–456); both use dynamic import and non-fatal try/catch |
| `lib/chat/components/superadmin-monitoring.jsx` | `MonitoringDashboard` client component with per-instance cards; min 80 lines | VERIFIED | 230 lines; exports `MonitoringDashboard`; contains `MonitoringCard`, `UsageBar`, `OnboardingBadge`, `StatusBadge`, `LoadingSkeleton` |
| `lib/chat/components/index.js` | Re-export of `MonitoringDashboard` | VERIFIED | Line 38: `export { MonitoringDashboard } from './superadmin-monitoring.js';` |
| `templates/app/admin/superadmin/monitoring/page.js` | Page shell importing `MonitoringDashboard` | VERIFIED | 5-line thin shell: imports from `../../../../lib/chat/components/index.js`, returns `<MonitoringDashboard />` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/ai/tools.js` | `lib/monitoring/alerts.js` | `checkAndAlertConsecutiveFailures()` called after `saveJobOutcome()` | WIRED | Dynamic import at lines 375 and 451; called at lines 377 and 453 — both after `saveJobOutcome()` at line 343 |
| `lib/monitoring/alerts.js` | `lib/db/job-outcomes.js` | `getConsecutiveFailureCount()` query | WIRED | Static import at line 2; called at line 19 with `FAILURE_THRESHOLD` as `n` |
| `lib/monitoring/alerts.js` | `lib/db/config.js` | `getConfigValue`/`setConfigValue` for throttle state | WIRED | Static import at line 1; `getConfigValue(throttleKey)` at line 24; `setConfigValue(throttleKey, ...)` at line 39; namespaced key `alert:consecutive_failure:{instanceName}` |
| `lib/chat/actions.js` | `lib/superadmin/client.js` | `queryAllInstances` for health+usage+onboarding | WIRED | Dynamic import at line 1257; all three endpoints called in `Promise.all` at lines 1259–1261 |
| `lib/chat/components/superadmin-monitoring.jsx` | `lib/chat/actions.js` | import `getMonitoringDashboard` Server Action | WIRED | Import at line 4; called in `loadData` callback at line 151 |
| `templates/app/admin/superadmin/monitoring/page.js` | `lib/chat/components/index.js` | import `MonitoringDashboard` | WIRED | Import at line 1; rendered at line 4 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MON-01 | 46-01, 46-02 | Superadmin portal displays per-instance monitoring cards with error rate, usage vs limits, and onboarding state | SATISFIED | `getMonitoringDashboard` Server Action (46-01) provides the data; `MonitoringDashboard` component (46-02) renders it at `/admin/superadmin/monitoring` |
| MON-02 | 46-01 | Superadmin receives a Slack alert when an instance logs 3+ consecutive job failures (throttled to once per hour per instance) | SATISFIED | `lib/monitoring/alerts.js` implements threshold (3) and cooldown (1hr); wired into `waitAndNotify` at both origin and no-origin paths |
| MON-03 | — | Historical job timeline chart per instance (future) | NOT IN PHASE | Defined in REQUIREMENTS.md as future scope; not mapped to Phase 46 in roadmap |
| MON-04 | — | Container CPU/memory utilization at job completion (future) | NOT IN PHASE | Defined in REQUIREMENTS.md as future scope; not mapped to Phase 46 in roadmap |

### Anti-Patterns Found

None detected. No TODO/FIXME/placeholder comments, no empty implementations, no stub handlers across any modified files.

### Human Verification Required

#### 1. Monitoring Page Visual Layout

**Test:** Log in as a superadmin user, navigate to `/admin/superadmin/monitoring`
**Expected:** A summary bar shows total instance count, average success rate, total 24h errors. Below it, a grid of per-instance cards each showing status badge (online/offline dot), error count, color-coded success rate, jobs-run count, usage progress bar (jobs dispatched vs monthly limit), onboarding badge (Complete/Step/N/A), and last error timestamp
**Why human:** Visual rendering, Tailwind class application, and component layout cannot be confirmed by static analysis

#### 2. Auto-Refresh Behavior

**Test:** Stay on the monitoring page for at least 30 seconds without interacting
**Expected:** Data silently refreshes; if an instance goes offline during that window, the card updates without a page reload
**Why human:** `setInterval` behavior requires live browser session; static analysis confirms the interval is set but not that it fires correctly in the Next.js client runtime

#### 3. Consecutive Failure Slack Alert

**Test:** Dispatch 3 jobs that all fail (e.g., invalid repo, broken entrypoint) from a configured instance with `SLACK_BOT_TOKEN` and `SLACK_OPERATOR_CHANNEL` set
**Expected:** A Slack message appears in the operator channel: `Alert: Instance "noah" has 3 consecutive job failures. Check /admin/superadmin/monitoring for details.`
**Why human:** Requires live Docker job execution, real Slack credentials, and the `INSTANCE_NAME` env var set; cannot simulate the full `waitAndNotify` flow with static checks

### Build Verification

`npm run build` — PASSES with zero errors. `lib/chat/components/superadmin-monitoring.js` compiled to 8.3kb, confirming the component is substantive and tree-shaken correctly.

### Gaps Summary

No gaps. All 6 observable truths are verified. All 7 artifacts exist, are substantive (not stubs), and are wired. All 4 key links confirmed present in actual code. Both in-scope requirements (MON-01, MON-02) satisfied. Build passes.

---

_Verified: 2026-03-17_
_Verifier: Claude (gsd-verifier)_
