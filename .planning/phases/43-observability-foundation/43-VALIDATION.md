---
phase: 43
slug: observability-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (existing pattern from test/test-entrypoint.sh) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `node --test test/observability/` |
| **Full suite command** | `node --test test/observability/ && npm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/observability/`
- **After every plan wave:** Run `node --test test/observability/ && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| *Populated after planning* | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/observability/` — test directory for phase 43
- [ ] `test/observability/test-logger.js` — stubs for OBS-01 (pino structured output)
- [ ] `test/observability/test-errors.js` — stubs for OBS-02 (error_log persistence)
- [ ] `test/observability/test-health.js` — stubs for OBS-04 (health endpoint fields)
- [ ] `test/observability/test-job-logs.js` — stubs for OBS-05 (filesystem JSONL output)

*OBS-03 (Sentry) is manual verification — requires Sentry dashboard confirmation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sentry captures client-side JS error | OBS-03 | Requires browser + Sentry dashboard | 1. Open app in browser 2. Trigger JS error via devtools 3. Check Sentry project for event |
| Sentry captures server-side API route error | OBS-03 | Requires Sentry dashboard | 1. Hit API route that throws 2. Check Sentry project for event with stack trace |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
