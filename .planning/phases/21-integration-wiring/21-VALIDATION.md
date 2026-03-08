---
phase: 21
slug: integration-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None configured (manual-only verification) |
| **Config file** | none — `"test": "echo \"No tests yet\" && exit 0"` in package.json |
| **Quick run command** | Static grep verification (see below) |
| **Full suite command** | Manual Docker test |
| **Estimated runtime** | ~5 seconds (static), ~60 seconds (Docker) |

---

## Sampling Rate

- **After every task commit:** Run static grep verification commands
- **After every plan wave:** Manual Docker test
- **Before `/gsd:verify-work`:** All three fixes verified via code review + one live Docker job
- **Max feedback latency:** 5 seconds (static checks)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | DISP-03 | manual-only | `grep -n "addToThread" lib/ai/tools.js` | N/A | ⬜ pending |
| 21-01-02 | 01 | 1 | HYDR-05 | manual-only | `grep -n "AGENT_QUICK" templates/docker/job/Dockerfile` | N/A | ⬜ pending |
| 21-01-03 | 01 | 1 | DOCK-10 | manual-only | `grep -n "inspectJob" lib/ai/tools.js` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test framework to create for a gap-closure phase with manual-only verification.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| addToThread called in Docker waitAndNotify path | DISP-03 | Requires live Docker + LangGraph agent state | Run a Docker job, verify thread memory persists |
| AGENT_QUICK.md present at /defaults/ in Docker image | HYDR-05 | Requires built Docker image | `docker run --rm <image> test -f /defaults/AGENT_QUICK.md && echo OK` |
| inspectJob wired into status tool | DOCK-10 | Requires running Docker container | Call job status tool with active container, verify container state in response |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
