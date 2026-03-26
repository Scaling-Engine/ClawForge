---
phase: 37
slug: cluster-detail-views
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 37 — Validation Strategy

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
| 37-01-01 | 01 | 1 | CLSTUI-01 | smoke | `npm run build` | ✅ | ⬜ pending |
| 37-01-02 | 01 | 1 | CLSTUI-02, CLSTUI-03 | smoke | `npm run build` | ✅ | ⬜ pending |
| 37-01-03 | 01 | 1 | CLSTUI-04 | smoke | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test runner installation needed — `npm run build` catches import/type errors and component compilation failures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cluster overview shows agent timeline | CLSTUI-01 | Requires cluster run data | Start cluster run, navigate to /cluster/[id], verify timeline |
| Status badges reflect agent states | CLSTUI-01 | Requires running agents | Verify badges show pending/running/completed states |
| PR links are clickable | CLSTUI-01 | Requires agent PR creation | Verify PR links open in new tab |
| Live console streams output | CLSTUI-02 | Requires running container | Start cluster run, open console, verify live output |
| Historical logs display | CLSTUI-03 | Requires completed agents | View logs for completed cluster run |
| Role-specific view shows config | CLSTUI-04 | Requires role data | Navigate to /cluster/[id]/role/[roleId] |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
