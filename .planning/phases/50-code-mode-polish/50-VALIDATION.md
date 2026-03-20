---
phase: 50
slug: code-mode-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Next.js build + manual browser testing |
| **Config file** | next.config.mjs |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build && npm run start` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build && npm run start`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | TBD | build | `npm run build` | ✅ | ⬜ pending |
| 50-01-02 | 01 | 1 | TBD | build+manual | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Feature flag gates Code toggle | TBD | Config + UI state | Set codeWorkspace: false in FEATURES.json, verify Code toggle hidden |
| Mobile session continuity | TBD | Multi-device | Open same chat on two devices, verify workspace link persists |
| Session persistence across page loads | TBD | Browser state | Navigate away and back, verify workspace resumes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
