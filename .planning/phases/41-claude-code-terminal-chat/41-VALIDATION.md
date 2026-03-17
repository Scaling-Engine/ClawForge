---
phase: 41
slug: claude-code-terminal-chat
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual + `npm run build` verification |
| **Config file** | none — no test framework for Server Actions / UI components |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TERM-01 | integration | `npm run build` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TERM-02 | integration | `npm run build` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TERM-03 | integration | `npm run build` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TERM-04 | integration | `npm run build` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TERM-05 | integration | `npm run build` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TERM-06 | integration | `npm run build` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TERM-07 | integration | `npm run build` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TERM-08 | integration | `npm run build` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements — no new test framework needed.
- Build verification via `npm run build` for JS/JSX changes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Code session streams text in real time | TERM-01 | Requires live Agent SDK subprocess + streaming transport | Start terminal session, verify text appears incrementally |
| Tool calls appear as structured cards | TERM-02 | Requires live Agent SDK executing tools | Trigger file edit, verify card renders inline |
| File diffs render with syntax highlighting | TERM-03 | Requires real file edit generating unified diff | Edit a file via terminal, verify red/green diff display |
| Follow-up message redirects running session | TERM-04 | Requires active session + multi-turn injection | Send message during active session, verify agent receives it |
| Token usage and cost displayed per turn | TERM-05, TERM-06 | Requires real API calls with usage data | Complete a turn, verify cost display and DB persistence |
| Shell mode toggle works | TERM-07 | Requires active session with mode switch | Toggle to shell, run command, verify output |
| Thinking steps in collapsible panel | TERM-08 | Requires extended thinking enabled model | Enable thinking, verify collapsible panel renders |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
