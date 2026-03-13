---
phase: 31
slug: chat-enhancements
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 31 — Validation Strategy

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
| 31-01-01 | 01 | 1 | CHAT-01 | manual-only | N/A — browser file APIs | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | CHAT-02 | smoke | `npm run build` | ✅ | ⬜ pending |
| 31-02-01 | 02 | 2 | CHAT-03 | smoke | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test runner installation needed — `npm run build` catches import/type errors and component compilation failures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| File attach via paperclip click | CHAT-01 | Browser file picker not automatable without Playwright | Click paperclip, select file, verify preview appears |
| Drag-and-drop file onto chat | CHAT-01 | Drag events need Playwright | Drag image onto chat area, verify preview strip |
| Code mode toggle routing | CHAT-02 | Requires running event handler + agent | Toggle code mode, send message, verify interactive workspace created |
| Syntax highlighting in messages | CHAT-03 | Visual verification needed | Send code block, verify Shiki highlighting renders |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
