---
phase: 39
slug: smart-execution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual + bash script verification |
| **Config file** | none — no test framework for shell scripts / GitHub Actions |
| **Quick run command** | `bash -n templates/docker/job/entrypoint.sh` (syntax check) |
| **Full suite command** | `npm run build && bash -n templates/docker/job/entrypoint.sh` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bash -n templates/docker/job/entrypoint.sh`
- **After every plan wave:** Run `npm run build && bash -n templates/docker/job/entrypoint.sh`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | EXEC-01 | integration | `grep 'quality_gate' entrypoint.sh` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | EXEC-02 | integration | `grep 'GATE_ATTEMPT' entrypoint.sh` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | EXEC-03 | integration | `grep 'gate-failures' entrypoint.sh` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | EXEC-04 | integration | `grep 'mergePolicy' lib/tools/repos.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements — no new test framework needed.
- Shell syntax validation via `bash -n` and `npm run build` for JS changes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Quality gates run after Claude Code completes in Docker container | EXEC-01 | Requires Docker + live repo | Dispatch a test job, verify gate output in container logs |
| Self-correction produces corrected PR | EXEC-02 | Requires Claude Code CLI execution | Dispatch job against repo with failing lint, verify correction attempt in PR |
| Gate failure excerpts appear in chat notification | EXEC-03 | Requires Slack/Telegram delivery | Dispatch failing job, check notification text |
| Merge policy blocks auto-merge for gate-required repos | EXEC-04 | Requires GitHub Actions + real PR | Create PR on gate-required repo, verify auto-merge is blocked |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
