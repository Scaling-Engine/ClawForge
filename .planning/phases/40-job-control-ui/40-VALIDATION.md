---
phase: 40
slug: job-control-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual + `npm run build` verification |
| **Config file** | none — no test framework for Server Actions / UI components |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | OPS-01 | integration | `grep 'requireAdmin' app/actions/jobs.js` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | OPS-02 | integration | `grep 'requireAdmin' app/actions/jobs.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements — no new test framework needed.
- Build verification via `npm run build` for JS/JSX changes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cancel button stops running Docker container and updates job status | OPS-01 | Requires live Docker container + running job | Dispatch a test job, click Cancel, verify container stops and status updates |
| Retry button re-dispatches failed job with original prompt | OPS-02 | Requires failed job in DB + Docker dispatch | Fail a job intentionally, click Retry, verify new job dispatched with same prompt |
| Non-admin users cannot see Cancel/Retry controls | OPS-01, OPS-02 | Requires two user sessions with different roles | Log in as non-admin, verify buttons are hidden; log in as admin, verify buttons appear |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
