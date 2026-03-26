---
phase: 35
slug: voice-input
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 35 — Validation Strategy

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
| 35-01-01 | 01 | 1 | VOICE-01, VOICE-02 | smoke | `npm run build` | ✅ | ⬜ pending |
| 35-01-02 | 01 | 1 | VOICE-01, VOICE-03 | smoke | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test runner installation needed — `npm run build` catches import/type errors and component compilation failures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mic button toggles recording state | VOICE-01 | Requires browser + microphone | Click mic button, verify visual state change |
| Volume bars animate during recording | VOICE-01 | Requires live audio input | Speak while recording, verify bars respond |
| Transcription appears in chat input | VOICE-02 | Requires AssemblyAI API + audio | Speak, verify text appears in input field |
| Permission denial shows toast | VOICE-03 | Requires denying browser permission | Deny mic permission, verify toast notification |
| No server-side audio storage | VOICE-04 | Architecture verification | Inspect network tab, verify no audio uploads to app server |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
