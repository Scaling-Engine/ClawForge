---
phase: 44
slug: billing-and-usage-tracking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (existing pattern) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `node --test test/billing/` |
| **Full suite command** | `node --test test/billing/ && npm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/billing/`
- **After every plan wave:** Run `node --test test/billing/ && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| *Populated after planning* | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/billing/` — test directory for phase 44
- [ ] `test/billing/test-usage.js` — stubs for BILL-01 (usage event recording)
- [ ] `test/billing/test-limits.js` — stubs for BILL-03, BILL-04 (soft/hard limit enforcement)
- [ ] `test/billing/test-billing-config.js` — stubs for BILL-05 (superadmin limit config)

*BILL-02 (admin billing page) requires build verification — covered by `npm run build`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin billing page shows usage metrics | BILL-02 | Requires running app + browser | 1. Navigate to /admin/billing 2. Verify job count, tokens, duration for current month |
| Slack warning at 80% limit | BILL-03 | Requires Slack workspace | 1. Set limit to 5, dispatch 4 jobs 2. Check operator Slack channel for warning |
| Superadmin billing config page | BILL-05 | Requires running app + browser | 1. Navigate to /superadmin/billing 2. Change limits, verify takes effect |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
