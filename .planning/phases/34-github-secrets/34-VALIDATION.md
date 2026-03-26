---
phase: 34
slug: github-secrets
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 34 — Validation Strategy

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
| 34-01-01 | 01 | 1 | GHSEC-01 | smoke | `npm run build` | ✅ | ⬜ pending |
| 34-01-02 | 01 | 1 | GHSEC-02 | smoke | `npm run build` | ✅ | ⬜ pending |
| 34-01-03 | 01 | 1 | GHSEC-03 | smoke | `npm run build` | ✅ | ⬜ pending |
| 34-01-04 | 01 | 1 | GHSEC-04 | smoke | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test runner installation needed — `npm run build` catches import/type errors and component compilation failures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub secrets list displays masked values | GHSEC-02 | Requires live GitHub API connection | Navigate to /admin/secrets, verify GitHub secrets section shows secret names with last 4 chars |
| Create/update/delete secrets round-trip | GHSEC-02 | Requires GitHub API + UI interaction | Create a test secret, verify it appears in list, update value, delete, verify removal |
| Sealed-box encryption works with GitHub | GHSEC-01 | Requires live GitHub API key | Create secret via UI, verify it's usable in a GitHub Action |
| AGENT_* prefix enforcement | GHSEC-04 | Requires form interaction | Try creating secret without AGENT_ prefix, verify validation prevents it |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
