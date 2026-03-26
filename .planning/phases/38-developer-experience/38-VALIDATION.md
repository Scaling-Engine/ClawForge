---
phase: 38
slug: developer-experience
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 38 — Validation Strategy

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
| 38-01-01 | 01 | 1 | DX-03 | smoke | `npm run build` | ✅ | ⬜ pending |
| 38-01-02 | 01 | 1 | DX-02 | smoke | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test runner installation needed — `npm run build` catches import/type errors and component compilation failures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| web_search tool returns results | DX-03 | Requires BRAVE_API_KEY | Set env var, send message requiring web search, verify results |
| CLI create-instance scaffolds files | DX-02 | Requires filesystem interaction | Run `node bin/cli.js create-instance test`, verify directory created |
| CLI run-job dispatches to GitHub | DX-02 | Requires GitHub API | Run `node bin/cli.js run-job`, verify branch created |
| CLI check-status shows job state | DX-02 | Requires active job | Run `node bin/cli.js check-status <jobId>`, verify output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
