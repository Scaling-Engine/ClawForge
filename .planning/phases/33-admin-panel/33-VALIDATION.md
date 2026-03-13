---
phase: 33
slug: admin-panel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 33 — Validation Strategy

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
| 33-01-01 | 01 | 1 | ADMIN-01 | smoke | `npm run build` | ✅ | ⬜ pending |
| 33-01-02 | 01 | 1 | ADMIN-02 | smoke | `npm run build` | ✅ | ⬜ pending |
| 33-01-03 | 01 | 1 | ADMIN-03 | smoke | `npm run build` | ✅ | ⬜ pending |
| 33-01-04 | 01 | 1 | ADMIN-04 | smoke | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test runner installation needed — `npm run build` catches import/type errors and component compilation failures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin layout renders with sidebar nav | ADMIN-01 | Visual verification needed | Navigate to /admin, verify sidebar with sub-page links |
| Settings pages accessible under /admin/* | ADMIN-02 | Requires browser navigation | Visit /admin/crons, /admin/triggers, /admin/secrets, /admin/mcp |
| Users page CRUD operations | ADMIN-03 | Requires DB + UI interaction | List users, change role, verify DB update |
| /settings/* redirects to /admin/* | ADMIN-04 | Requires browser redirect verification | Visit /settings/crons, verify redirect to /admin/crons |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
