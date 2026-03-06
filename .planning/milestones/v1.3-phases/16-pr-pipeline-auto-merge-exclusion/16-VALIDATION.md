---
phase: 16
slug: pr-pipeline-auto-merge-exclusion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual workflow validation + act (GitHub Actions local runner) |
| **Config file** | .github/workflows/auto-merge.yml |
| **Quick run command** | `grep -c "BLOCKED_PATHS" .github/workflows/auto-merge.yml` |
| **Full suite command** | `diff .github/workflows/auto-merge.yml templates/.github/workflows/auto-merge.yml` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command to verify blocked paths exist
- **After every plan wave:** Diff both workflow copies to ensure sync
- **Before `/gsd:verify-work`:** Full diff + manual PR label review
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | DELIV-02 | integration | `grep "instances/" .github/workflows/auto-merge.yml` | N/A | pending |
| 16-01-02 | 01 | 1 | DELIV-02 | integration | `diff .github/workflows/auto-merge.yml templates/.github/workflows/auto-merge.yml` | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — workflow YAML changes only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Instance PR not auto-merged | DELIV-02 | Requires actual GitHub Actions run | Create test PR touching instances/ and verify it is NOT auto-merged |
| Regular job PR still auto-merged | Regression | Requires actual GitHub Actions run | Create test PR touching only allowed paths and verify it IS auto-merged |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
