---
phase: 46
slug: team-monitoring-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 46 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test + npm run build |
| **Quick run command** | `node --test test/monitoring/ && npm run build` |
| **Full suite command** | `node --test test/monitoring/ && npm run build` |
| **Estimated runtime** | ~20 seconds |

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite
- **Max feedback latency:** 20 seconds

## Wave 0 Requirements

- [ ] `test/monitoring/` — test directory
- [ ] `test/monitoring/test-alerts.js` — stubs for MON-02 (consecutive failure detection + throttle)

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Monitoring cards display per-instance data | MON-01 | Requires running app + superadmin login | Navigate to /superadmin/monitoring, verify cards |
| Slack alert fires on 3 consecutive failures | MON-02 | Requires Slack workspace | Simulate 3 failures, check superadmin Slack |

## Validation Sign-Off

- [ ] All tasks have automated verify
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
