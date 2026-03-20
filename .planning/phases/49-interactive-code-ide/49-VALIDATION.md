---
phase: 49
slug: interactive-code-ide
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 49 — Validation Strategy

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
| 49-01-01 | 01 | 1 | TBD | build+migration | `npm run build` | ✅ | ⬜ pending |
| 49-01-02 | 01 | 1 | TBD | build | `npm run build` | ✅ | ⬜ pending |
| 49-02-01 | 02 | 2 | TBD | build+manual | `npm run build` | ✅ | ⬜ pending |
| 49-02-02 | 02 | 2 | TBD | build+manual | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| /code/{id} page renders with tabs | TBD | Browser UI | Navigate to /code/{id}, verify Code/Shell/Editor tabs render |
| Interactive toggle launches Docker container | TBD | Docker integration | Click Interactive toggle, verify container starts via dockerode |
| Chat links to workspace via codeWorkspaceId | TBD | DB + UI state | Start workspace from chat, verify codeWorkspaceId FK populated |
| DnD tab reordering | TBD | Drag interaction | Drag tab to new position, verify order persists |
| xterm.js WebSocket terminal attach | TBD | WebSocket + terminal | Open Code tab, verify terminal connects and accepts input |

*Phase 49 is heavily interactive — most behaviors require browser + Docker runtime.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
