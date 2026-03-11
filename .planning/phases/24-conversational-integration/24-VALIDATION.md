---
phase: 24
slug: conversational-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test` + `node:assert`) |
| **Config file** | None — run directly with `node --test` |
| **Quick run command** | `node --test lib/ws/tickets.test.js` |
| **Full suite command** | `node --test lib/ws/*.test.js lib/ai/*.test.js lib/tools/*.test.js` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test lib/ws/tickets.test.js`
- **After every plan wave:** Run `node --test lib/ws/*.test.js lib/ai/*.test.js lib/tools/*.test.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | INTG-01 | unit | `node --test lib/ai/tools.test.js` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | INTG-01 | unit | `node --test lib/ai/tools.test.js` | ❌ W0 | ⬜ pending |
| 24-01-03 | 01 | 1 | INTG-02 | unit (mock Docker) | `node --test lib/tools/docker.test.js` | ❌ W0 | ⬜ pending |
| 24-01-04 | 01 | 1 | INTG-03 | unit (mock Docker) | `node --test lib/tools/docker.test.js` | ❌ W0 | ⬜ pending |
| 24-02-01 | 02 | 1 | INTG-04 | unit (mock DB) | `node --test lib/ai/tools.test.js` | ❌ W0 | ⬜ pending |
| 24-02-02 | 02 | 1 | INTG-05 | unit (mock Slack) | `node --test lib/ai/tools.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/ai/tools.test.js` — stubs for INTG-01, INTG-04, INTG-05 tool behavior
- [ ] `lib/tools/docker.test.js` — stubs for INTG-02, INTG-03 with mocked dockerode

*Lightweight unit tests with mocked DB/Docker, not integration tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end Slack "start coding on X" | INTG-01 | Requires live Slack app + Docker daemon | Send message in Slack, verify URL returned |
| Browser terminal reconnect | INTG-04 | Requires running workspace container | List workspaces, click reconnect URL |
| Crash notification delivery | INTG-05 | Requires forcing container crash | Kill container, verify Slack notification |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
