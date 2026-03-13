---
phase: 32
slug: auth-roles
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no test runner configured — established project pattern) |
| **Config file** | None |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd:verify-work`:** Full build must pass + manual smoke test
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | ROLE-01 | smoke | `npm run build` | ✅ | ⬜ pending |
| 32-01-02 | 01 | 1 | ROLE-02 | smoke | `npm run build` | ✅ | ⬜ pending |
| 32-01-03 | 01 | 1 | ROLE-03 | smoke | `npm run build` | ✅ | ⬜ pending |
| 32-01-04 | 01 | 1 | ROLE-04 | smoke | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test runner installation needed — `npm run build` catches import/type errors and component compilation failures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Non-admin redirect to /forbidden | ROLE-02 | Requires two user accounts with different roles | Create second user, login, navigate to /admin, verify redirect |
| /forbidden page renders correctly | ROLE-03 | Visual verification needed | Access /forbidden directly, verify styling and messaging |
| Admin sidebar link visibility | ROLE-04 | Requires role toggle in session | Login as admin — see Admin link; login as user — no Admin link |
| createUser() defaults to 'user' role | ROLE-01 | Requires DB inspection | Create user via registration, inspect DB role column |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
