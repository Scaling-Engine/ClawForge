---
phase: 36
slug: code-workspaces-v2
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 36 — Validation Strategy

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
| 36-01-01 | 01 | 1 | CWSV2-01 | smoke | `npm run build` | ✅ | ⬜ pending |
| 36-01-02 | 01 | 1 | CWSV2-02 | smoke | `npm run build` | ✅ | ⬜ pending |
| 36-01-03 | 01 | 1 | CWSV2-03 | smoke | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test runner installation needed — `npm run build` catches import/type errors and component compilation failures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tabs drag-reorderable | CWSV2-01 | Requires mouse interaction | Open workspace, drag tab to new position, verify reorder |
| New tab spawns tmux session | CWSV2-01 | Requires running Docker container | Click + button, verify new terminal tab appears |
| In-terminal search (Ctrl+F) | CWSV2-02 | Requires terminal interaction | Open terminal, Ctrl+F, search for text |
| Clickable URLs in terminal | CWSV2-02 | Requires URL in terminal output | Run command producing URLs, verify they're clickable |
| File tree shows directory contents | CWSV2-03 | Requires running workspace container | Open workspace, verify file tree sidebar |
| Existing workspaces unaffected | CWSV2-04 | Requires existing workspace | Open pre-existing workspace, verify it works normally |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
