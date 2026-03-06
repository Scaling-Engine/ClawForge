---
phase: 19
slug: docker-engine-dispatch
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual integration testing (Docker daemon required for most requirements) |
| **Config file** | none — no test framework configured |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds (placeholder tests only) |

---

## Sampling Rate

- **After every task commit:** Manual verification against Docker daemon
- **After every plan wave:** Full smoke test: dispatch via Docker, verify PR created, notification received
- **Before `/gsd:verify-work`:** End-to-end: Slack message -> Docker dispatch -> PR -> auto-merge -> notification
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | DOCK-01 | integration | Manual — requires Docker daemon | N/A | pending |
| 19-01-02 | 01 | 1 | DOCK-02 | integration | Manual — requires Docker daemon | N/A | pending |
| 19-01-03 | 01 | 1 | DOCK-03 | integration | Manual — requires Docker daemon | N/A | pending |
| 19-01-04 | 01 | 1 | DOCK-04 | integration | Manual — requires Docker daemon | N/A | pending |
| 19-01-05 | 01 | 1 | DOCK-05 | integration | Manual — requires Docker daemon | N/A | pending |
| 19-01-06 | 01 | 1 | DOCK-06 | integration | Manual — requires Docker daemon | N/A | pending |
| 19-01-07 | 01 | 1 | DOCK-07 | unit | Testable with mock DB | N/A | pending |
| 19-01-08 | 01 | 1 | DOCK-08 | integration | Manual — requires Docker daemon | N/A | pending |
| 19-01-09 | 01 | 1 | DOCK-09 | integration | Manual — requires Docker daemon | N/A | pending |
| 19-01-10 | 01 | 1 | DOCK-10 | integration | Manual — requires Docker daemon | N/A | pending |
| 19-02-01 | 02 | 1 | DISP-01 | unit | Testable with mock REPOS.json | N/A | pending |
| 19-02-02 | 02 | 1 | DISP-02 | unit | Testable with mocked docker/actions | N/A | pending |
| 19-02-03 | 02 | 2 | DISP-03 | smoke | Deploy and test via existing Actions flow | N/A | pending |
| 19-02-04 | 02 | 2 | DISP-04 | e2e | Manual — compare Docker vs Actions job outputs | N/A | pending |
| 19-02-05 | 02 | 2 | DISP-05 | integration | Manual — dispatch 2 jobs simultaneously | N/A | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- No test framework established — most DOCK requirements need Docker daemon (integration tests, manual-only)
- Unit-testable requirements (DOCK-07, DISP-01, DISP-02) could use test stubs but no framework is configured

*Existing infrastructure does NOT cover phase requirements — Wave 0 would need test framework setup if automated tests are desired.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker socket ping | DOCK-01 | Requires Docker daemon | Run Event Handler, check logs for "Docker Engine connected" |
| Container creation | DOCK-02 | Requires Docker daemon | Dispatch job, verify container appears in `docker ps` |
| Container wait | DOCK-03 | Requires Docker daemon | Dispatch job, verify exit code captured in DB |
| Log retrieval | DOCK-04 | Requires Docker daemon | After job completes, verify logs appear in notification |
| Container cleanup | DOCK-05 | Requires Docker daemon | After job completes, verify container removed from `docker ps -a` |
| Network isolation | DOCK-06 | Requires Docker daemon + network config | Verify container on correct network via `docker inspect` |
| Orphan reconciliation | DOCK-08 | Requires Docker daemon + crash simulation | Kill Event Handler mid-job, restart, verify orphan detected |
| Startup time | DOCK-09 | Requires Docker daemon | Dispatch job, check logs for startup timing |
| Container inspection | DOCK-10 | Requires Docker daemon | Dispatch job, query status while running |
| Actions path unchanged | DISP-03 | Requires deployed infrastructure | Dispatch via Actions, verify same behavior |
| Output parity | DISP-04 | Requires both dispatch paths | Compare PR from Docker vs Actions dispatch |
| Parallel dispatch | DISP-05 | Requires Docker daemon | Dispatch 2 jobs simultaneously, verify both complete |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
