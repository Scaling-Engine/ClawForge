---
phase: 46-team-monitoring-dashboard
plan: 01
subsystem: monitoring
tags: [slack, drizzle, sqlite, server-actions, superadmin]

# Dependency graph
requires:
  - phase: 44-billing-and-usage-tracking
    provides: recordUsageEvent, job_outcomes table, saveJobOutcome pattern in waitAndNotify
  - phase: 45-self-service-onboarding
    provides: onboarding endpoint on queryAllInstances switch
provides:
  - getConsecutiveFailureCount(n) query on job_outcomes (additive)
  - lib/monitoring/alerts.js with checkAndAlertConsecutiveFailures (3-failure threshold, 1hr cooldown)
  - getMonitoringDashboard Server Action merging health+usage+onboarding per instance
  - Alert trigger wired into waitAndNotify origin and no-origin paths
affects: [46-02-monitoring-ui, future-alerting-rules]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import for alert module in waitAndNotify (avoids circular dependency risk)"
    - "Namespaced config keys for alert throttle: alert:consecutive_failure:{instanceName}"
    - "Non-fatal try/catch wrapping all monitoring side effects in job completion path"

key-files:
  created:
    - lib/monitoring/alerts.js
  modified:
    - lib/db/job-outcomes.js
    - lib/chat/actions.js
    - lib/ai/tools.js

key-decisions:
  - "Alert cooldown stored as plain config value (setConfigValue) with namespaced key alert:consecutive_failure:{instanceName} — no new table needed"
  - "Dynamic import for alerts.js in tools.js — consistent with existing dynamic import pattern (getHealth), avoids circular dependency"
  - "Alert trigger placed in BOTH origin and no-origin paths in waitAndNotify — ensures all jobs count regardless of channel source"
  - "getConsecutiveFailureCount default n=10 — allows checking more rows than the threshold of 3"

patterns-established:
  - "Monitoring alert modules: import getConfigValue/setConfigValue for throttle state, dynamic import @slack/web-api, non-fatal try/catch"
  - "Alert throttle key convention: alert:{alert-type}:{scope}"

requirements-completed: [MON-01, MON-02]

# Metrics
duration: 8min
completed: 2026-03-18
---

# Phase 46 Plan 01: Team Monitoring Dashboard — Backend Summary

**Consecutive-failure Slack alerting (3-failure threshold, 1hr cooldown) and cross-instance monitoring dashboard Server Action using queryAllInstances health+usage+onboarding**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-18T03:15:00Z
- **Completed:** 2026-03-18T03:23:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `getConsecutiveFailureCount(n)` added to `lib/db/job-outcomes.js` — queries N most recent outcomes, counts consecutive failures from newest, breaks at first success
- `lib/monitoring/alerts.js` created with `checkAndAlertConsecutiveFailures(instanceName)` — fires Slack alert when 3+ consecutive failures detected, throttled to once per instance per hour via settings table
- `getMonitoringDashboard` Server Action added to `lib/chat/actions.js` — merges health, usage, and onboarding data per instance via `queryAllInstances`, gated by `requireSuperadmin`
- Alert trigger wired into `waitAndNotify` in `lib/ai/tools.js` at both the origin-thread path and the no-origin path, using dynamic import to avoid circular dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1: Consecutive failure query + alert module + Server Action** - `ce87c51` (feat)
2. **Task 2: Wire alert trigger into waitAndNotify** - `1a3613f` (feat)

## Files Created/Modified

- `lib/monitoring/alerts.js` - New module: checkAndAlertConsecutiveFailures with FAILURE_THRESHOLD=3, ALERT_COOLDOWN_MS=1hr
- `lib/db/job-outcomes.js` - Added getConsecutiveFailureCount(n=10) (additive, no existing functions changed)
- `lib/chat/actions.js` - Added getMonitoringDashboard Server Action after getSuperadminDashboard
- `lib/ai/tools.js` - Two alert trigger blocks added in waitAndNotify (origin path + no-origin path)

## Decisions Made

- Alert throttle stored as plain config value with namespaced key (`alert:consecutive_failure:{instanceName}`) — avoids adding a new table and fits the existing config.js pattern exactly
- Dynamic import for `alerts.js` in tools.js — consistent with the existing `getHealth()` dynamic import pattern, prevents circular dependency risk at module load time
- Alert fires in both origin and no-origin waitAndNotify paths — ensures jobs without a chat origin still contribute to consecutive failure counting and alerting
- `getConsecutiveFailureCount` defaults to `n=10` (not just 3) to give some buffer above threshold for edge cases

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no new external service configuration required. Existing `SLACK_BOT_TOKEN` and `SLACK_OPERATOR_CHANNEL` env vars are used (already documented from Phase 44 billing alerts).

## Next Phase Readiness

- Backend data pipeline is complete — `getMonitoringDashboard` provides the data, alert logic fires automatically after every job
- Phase 46-02 can build the monitoring UI page against `getMonitoringDashboard` immediately
- No blockers

---
*Phase: 46-team-monitoring-dashboard*
*Completed: 2026-03-18*
