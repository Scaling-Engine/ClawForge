---
phase: 25
slug: headless-log-streaming
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — `"test": "echo \"No tests yet\" && exit 0"` in package.json |
| **Config file** | None — Wave 0 installs `node:test` (built-in, zero deps) |
| **Quick run command** | `node --test tests/` |
| **Full suite command** | `node --test tests/` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/`
- **After every plan wave:** Run `node --test tests/` + manual SSE smoke test
- **Before `/gsd:verify-work`:** Full suite must be green + manual STRM-01, STRM-07 verification
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | STRM-01 | manual-only | `curl -N /api/jobs/stream/{id}` | ❌ W0 | ⬜ pending |
| 25-01-02 | 01 | 1 | STRM-02 | unit | `node --test tests/log-parser.test.js` | ❌ W0 | ⬜ pending |
| 25-01-03 | 01 | 1 | STRM-05 | unit | `node --test tests/log-parser.test.js` | ❌ W0 | ⬜ pending |
| 25-01-04 | 01 | 1 | STRM-08 | unit | `node --test tests/scrub-secrets.test.js` | ❌ W0 | ⬜ pending |
| 25-02-01 | 02 | 1 | STRM-03 | manual-only | Browser inspect during live job | ❌ W0 | ⬜ pending |
| 25-02-02 | 02 | 1 | STRM-04 | manual-only | Trigger cancel via conversational command | ❌ W0 | ⬜ pending |
| 25-02-03 | 02 | 1 | STRM-06 | manual-only | Observe Slack during live job | ❌ W0 | ⬜ pending |
| 25-02-04 | 02 | 1 | STRM-07 | manual-only | Docker socket monitor: `ss -p \| grep docker` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/log-parser.test.js` — stubs for STRM-02, STRM-05 (semantic event parsing, diff highlighting)
- [ ] `tests/scrub-secrets.test.js` — stubs for STRM-08 (sensitive value filtering)
- [ ] Update `package.json` test script to `node --test tests/` (Node.js built-in test runner, zero deps)

*Note: Node.js `node:test` is built-in since Node 18. No framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE endpoint streams live events | STRM-01 | Requires running Docker container + SSE client | Start job, open `/api/jobs/stream/{id}` in curl, verify events arrive |
| Progress indicator shows elapsed time | STRM-03 | UI rendering in browser | Start job, verify timer visible in chat thread |
| Cancel stops container cleanly | STRM-04 | Requires Docker container lifecycle | Say "cancel the job" during running job, verify branch preserved |
| Slack message edited in-place | STRM-06 | Requires Slack workspace observation | Start job, watch Slack channel for single updating message |
| No memory leak on disconnect | STRM-07 | Requires monitoring Docker socket connections | Close browser tab during job, verify no orphaned streams via `ss -p` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
