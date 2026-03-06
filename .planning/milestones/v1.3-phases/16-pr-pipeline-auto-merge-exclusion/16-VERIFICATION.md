---
phase: 16-pr-pipeline-auto-merge-exclusion
verified: 2026-03-05T06:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 16: PR Pipeline Auto-Merge Exclusion Verification Report

**Phase Goal:** Add explicit blocked-paths defense to auto-merge workflow so instance scaffolding PRs never auto-merge, and switch entrypoint.sh to --body-file for robust PR body delivery.
**Verified:** 2026-03-05T06:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Instance scaffolding PRs (touching instances/ or docker-compose.yml) are never auto-merged, even when ALLOWED_PATHS=/ | VERIFIED | `check-blocked` step (lines 49-67) matches `instances/*` and `docker-compose.yml`, runs BEFORE ALLOWED_PATHS check. Merge step condition (line 133) requires `steps.check-blocked.outputs.blocked != 'true'`. |
| 2 | Regular job PRs that only touch allowed paths still auto-merge normally | VERIFIED | `check-blocked` only sets `blocked=true` for `instances/*` and `docker-compose.yml`. ALLOWED_PATHS logic (lines 69-130) remains untouched and runs after blocked check passes. |
| 3 | PR body uses --body-file when /tmp/pr-body.md exists, avoiding shell argument length limits | VERIFIED | entrypoint.sh lines 268-278: branches on `-f /tmp/pr-body.md`, uses `--body-file /tmp/pr-body.md` when present, falls back to `--body "Automated job by ClawForge"`. |
| 4 | Both auto-merge.yml copies (.github/workflows/ and templates/.github/workflows/) are identical | VERIFIED | `diff` of both files returns exit 0 (no differences). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/auto-merge.yml` | Blocked-paths step before ALLOWED_PATHS check | VERIFIED | 138 lines, contains `check-blocked` step with `instances/` and `docker-compose.yml` pattern matching |
| `templates/.github/workflows/auto-merge.yml` | Template copy identical to .github copy | VERIFIED | Identical (diff exit 0) |
| `templates/docker/job/entrypoint.sh` | PR creation with --body-file flag | VERIFIED | Lines 268-278 use `--body-file /tmp/pr-body.md` with fallback |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `.github/workflows/auto-merge.yml` check-blocked step | Merge PR step | `steps.check-blocked.outputs.blocked != 'true'` in Merge PR condition | WIRED | Line 133 condition: `steps.merge-check.outputs.mergeable == 'MERGEABLE' && steps.check-setting.outputs.enabled == 'true' && steps.check-blocked.outputs.blocked != 'true' && steps.check-paths.outputs.allowed == 'true'` |
| check-blocked step | Check ALLOWED_PATHS step | `steps.check-blocked.outputs.blocked != 'true'` in ALLOWED_PATHS condition | WIRED | Line 70 condition gates ALLOWED_PATHS on blocked check passing |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DELIV-01 | 16-01-PLAN | PR body includes instance-specific operator setup checklist | SATISFIED | entrypoint.sh uses `--body-file /tmp/pr-body.md` (Phase 15 generates the file); REQUIREMENTS.md marks complete |
| DELIV-02 | 16-01-PLAN | Instance scaffolding PRs excluded from auto-merge | SATISFIED | `check-blocked` step blocks `instances/*` and `docker-compose.yml` regardless of ALLOWED_PATHS; REQUIREMENTS.md marks complete |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No anti-patterns detected |

### Human Verification Required

None required. All truths are verifiable through static code analysis. The workflow behavior will be validated end-to-end in Phase 17.

### Gaps Summary

No gaps found. All four observable truths are verified. Both workflow files are in sync, the blocked-paths step is correctly wired to gate both the ALLOWED_PATHS check and the Merge PR step, and entrypoint.sh correctly uses `--body-file` when available. Requirements DELIV-01 and DELIV-02 are both satisfied.

---

_Verified: 2026-03-05T06:00:00Z_
_Verifier: Claude (gsd-verifier)_
