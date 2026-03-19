---
phase: 48
slug: code-mode-unification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 48 — Validation Strategy

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
| 48-01-01 | 01 | 1 | TBD | build | `npm run build` | ✅ | ⬜ pending |
| 48-01-02 | 01 | 1 | TBD | build | `npm run build` | ✅ | ⬜ pending |
| 48-02-01 | 02 | 1 | TBD | build+manual | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Code toggle routes to /stream/terminal | TBD | UI interaction | Toggle Code mode on, send message, verify network tab shows /stream/terminal |
| Plan/Code sub-mode dropdown | TBD | UI interaction | Click sub-mode dropdown, verify options appear, select each |
| Tool calls show expandable I/O | TBD | Visual verification | Send code request, verify tool calls render with expandable sections |
| Backtick wrapping removed | TBD | Behavioral | Send message in Code mode, verify no triple backtick wrapping in request payload |

*All phase behaviors require manual browser verification in addition to build checks.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
