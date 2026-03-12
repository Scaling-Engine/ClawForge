---
phase: 28
slug: multi-agent-clusters
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node --test`) |
| **Config file** | none — Node 22 built-in, no install needed |
| **Quick run command** | `node --test lib/cluster/config.test.js lib/cluster/coordinator.test.js` |
| **Full suite command** | `node --test lib/cluster/**/*.test.js lib/db/cluster-runs.test.js` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test lib/cluster/config.test.js lib/cluster/coordinator.test.js`
- **After every plan wave:** Run `node --test lib/cluster/**/*.test.js lib/db/cluster-runs.test.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | CLST-01 | unit | `node --test lib/cluster/config.test.js` | ❌ W0 | ⬜ pending |
| 28-01-02 | 01 | 1 | CLST-05 | unit | `node --test lib/db/cluster-runs.test.js` | ❌ W0 | ⬜ pending |
| 28-01-03 | 01 | 1 | CLST-10 | unit | `node --test lib/cluster/volume.test.js` | ❌ W0 | ⬜ pending |
| 28-02-01 | 02 | 2 | CLST-02 | manual integration | inspect container logs | N/A | ⬜ pending |
| 28-02-02 | 02 | 2 | CLST-03 | manual integration | check inbox/outbox files | N/A | ⬜ pending |
| 28-02-03 | 02 | 2 | CLST-04 | unit | `node --test lib/cluster/coordinator.test.js` | ❌ W0 | ⬜ pending |
| 28-02-04 | 02 | 2 | CLST-09 | unit | `node --test lib/cluster/coordinator.test.js` | ❌ W0 | ⬜ pending |
| 28-02-05 | 02 | 2 | CLST-11 | code review | N/A | N/A | ⬜ pending |
| 28-02-06 | 02 | 2 | CLST-12 | manual integration | check Slack thread | N/A | ⬜ pending |
| 28-03-01 | 03 | 2 | CLST-06 | manual integration | say "run cluster" in chat | N/A | ⬜ pending |
| 28-03-02 | 03 | 2 | CLST-07 | unit | `node --test lib/actions.test.js` | ❌ W0 | ⬜ pending |
| 28-04-01 | 04 | 3 | CLST-08 | manual | navigate to /clusters | N/A | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/cluster/config.test.js` — stubs for CLST-01 config parsing and validation
- [ ] `lib/cluster/coordinator.test.js` — stubs for CLST-04 label routing, CLST-09 cycle detection
- [ ] `lib/cluster/volume.test.js` — stubs for CLST-10 volume naming uniqueness
- [ ] `lib/db/cluster-runs.test.js` — stubs for CLST-05 DB CRUD operations
- [ ] `lib/actions.test.js` — stubs for CLST-07 fire-and-forget dispatch

*Framework: Node.js built-in test runner (`node --test`) — already available in Node 22, no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sequential agent dispatch in Docker | CLST-02 | Requires live Docker daemon | Define 2-role cluster, run it, verify containers start sequentially |
| Outbox→inbox file copy between agents | CLST-03 | Requires Docker volumes | Write file to agent 1 outbox, verify it appears in agent 2 inbox |
| Slack thread-per-run notifications | CLST-12 | Requires Slack workspace | Run cluster, verify one parent message + per-agent thread replies |
| Conversational cluster trigger | CLST-06 | Requires LangGraph agent | Say "run the X cluster on repo Y", verify cluster starts |
| /clusters management page | CLST-08 | Requires browser | Navigate to /clusters, verify cluster definitions and run history render |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
