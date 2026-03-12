---
phase: 26
slug: web-ui-auth-repo-selector
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — `"test": "echo \"No tests yet\" && exit 0"` in package.json |
| **Config file** | None |
| **Quick run command** | `npm test` (no-op) |
| **Full suite command** | `npm test` (no-op) |
| **Estimated runtime** | ~1 second |

---

## Sampling Rate

- **After every task commit:** Manual smoke test in browser
- **After every plan wave:** Browser devtools + curl verification
- **Before `/gsd:verify-work`:** All 6 requirements manually verified
- **Max feedback latency:** N/A (all manual)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | WEBUI-05 | manual | `curl` Server Action without session | n/a | ⬜ pending |
| 26-01-02 | 01 | 1 | WEBUI-06 | manual | `curl /api/ping`, `/api/slack/events` with API key | n/a | ⬜ pending |
| 26-01-03 | 01 | 1 | WEBUI-03 | manual | Browser: check FeaturesContext gates UI | n/a | ⬜ pending |
| 26-02-01 | 02 | 1 | WEBUI-02 | manual | Browser: select repo/branch, dispatch job | n/a | ⬜ pending |
| 26-02-02 | 02 | 1 | WEBUI-01 | manual | Browser: toggle code mode, check monospace | n/a | ⬜ pending |
| 26-02-03 | 02 | 1 | WEBUI-04 | manual | Browser: verify JobStreamViewer renders inline | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test framework setup needed — all validation is manual (UI behavior, auth boundary checks).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Server Actions return 401 without session | WEBUI-05 | Requires browser devtools or curl to verify auth response | Call Server Action without session, verify 401 response |
| API-key routes still work | WEBUI-06 | Requires curl with API key header | `curl /api/ping`, verify 200; `curl /api/slack/events` with signing secret |
| Feature flags gate UI elements | WEBUI-03 | Requires browser with FEATURES.json configured | Set flag to false, verify element hidden; set to true, verify visible |
| Repo/branch dropdown works | WEBUI-02 | Requires browser + running instance with REPOS.json | Select repo, verify branches load; dispatch job, verify repo context used |
| Code mode toggle | WEBUI-01 | Requires browser UI interaction | Toggle code mode, verify monospace textarea; send message, verify rendering |
| JobStreamViewer renders inline | WEBUI-04 | Already wired in Phase 25 — smoke test only | Start job, verify stream viewer appears in chat thread |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
