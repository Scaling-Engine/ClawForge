---
phase: 23
slug: websocket-browser-terminal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node --test`) |
| **Config file** | none — Wave 0 creates test files |
| **Quick run command** | `node --test lib/ws/tickets.test.js` |
| **Full suite command** | `node --test lib/ws/*.test.js lib/tools/docker.test.js` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test lib/ws/tickets.test.js`
- **After every plan wave:** Run `node --test lib/ws/*.test.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-xx-01 | 01 | 1 | TERM-01 | integration | Manual: `wscat -c wss://host/ws/terminal/ID?ticket=X` | No - Wave 0 | pending |
| 23-xx-02 | 01 | 1 | TERM-02 | unit | `node --test lib/ws/tickets.test.js` | No - Wave 0 | pending |
| 23-xx-03 | 02 | 2 | TERM-03 | e2e | Manual: open workspace page, type commands | No | pending |
| 23-xx-04 | 02 | 2 | TERM-04 | integration | Manual: open second tab, verify independent session | No | pending |
| 23-xx-05 | 02 | 2 | TERM-05 | unit | `node --test lib/tools/docker.test.js` | No - Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `lib/ws/tickets.test.js` — unit tests for ticket issuance/validation/expiry (covers TERM-02)
- [ ] Test infrastructure: Node.js built-in test runner (`node --test`) is available, no framework install needed
- [ ] Integration test script for WebSocket upgrade flow (requires running workspace container)

*Existing infrastructure covers Node.js test runner. Wave 0 creates test stubs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WebSocket upgrade proxied to ttyd | TERM-01 | Requires running workspace container with ttyd | Start workspace, connect via wscat, verify terminal output |
| Browser terminal renders and accepts input | TERM-03 | Full browser rendering + WebSocket chain | Open workspace page in browser, type commands, verify output |
| Additional shell tabs spawn | TERM-04 | Requires running container + multiple ttyd instances | Open second tab, verify independent tmux session |
| Git safety warning on close | TERM-05 | Requires uncommitted changes in container | Make changes in workspace, attempt close, verify warning dialog |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
