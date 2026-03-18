---
phase: 45
slug: self-service-onboarding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | npm run build (Next.js compilation) |
| **Config file** | none |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd:verify-work`:** Build must succeed
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| *Populated after planning* | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No test framework detected. Build verification is the primary automated gate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Onboarding redirect on first login | ONB-01 | Requires running app + ONBOARDING_ENABLED env | 1. Set env var 2. Login as new user 3. Verify redirect to /onboarding |
| Wizard resume across sessions | ONB-02 | Requires browser close/reopen | 1. Start wizard 2. Close browser 3. Reopen and verify same step |
| GitHub PAT verification | ONB-03 | Requires valid PAT token | 1. Enter PAT 2. Click verify 3. Check pass/fail result |
| Docker socket verification | ONB-03 | Requires Docker running | 1. Verify step runs 2. Check pass/fail with Docker up/down |
| First-job dispatch | ONB-04 | Requires full job pipeline | 1. Click dispatch in wizard 2. Wait for PR URL 3. Verify wizard completes |
| Tooltips on admin fields | ONB-05 | Requires browser interaction | 1. Focus AGENT_* field 2. Verify tooltip appears |
| Empty states on pages | ONB-06 | Requires visual inspection | 1. Visit repos/secrets/MCP with no items 2. Verify actionable empty state |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
