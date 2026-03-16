---
phase: 39-smart-execution
verified: 2026-03-16T23:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 39: Smart Execution Verification Report

**Phase Goal:** Jobs automatically run quality checks and self-correct before creating PRs, with per-repo merge policies
**Verified:** 2026-03-16T23:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Plan 01)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Quality gates run after claude -p completes and before PR creation | VERIFIED | `entrypoint.sh:526-569` — gate block positioned after `HAS_NEW_COMMIT` detection (line 524), before `gh pr create` (line 577) |
| 2 | When gates fail, claude -p is re-invoked exactly once with failure output as context | VERIFIED | `entrypoint.sh:538-568` — `GATE_ATTEMPT=0` guard (line 531), incremented to `1` (line 539), correction-prompt.txt built from `gate-failures.md` content, `claude -p` re-invoked (line 550) |
| 3 | After self-correction, if gates still fail, PR is still created but labeled needs-fixes | VERIFIED | `entrypoint.sh:589-603` — `GATE_PASS=false` branch creates PR with `--label "needs-fixes"` |
| 4 | gate-failures.md is committed to the job branch on any gate failure | VERIFIED | `entrypoint.sh:292-296` — `echo "false" > /tmp/gate_pass`, `printf` writes `$GATE_FAILURES_FILE`, `git add "$GATE_FAILURES_FILE"`, `git commit`, `git push` |
| 5 | QUALITY_GATES env var is passed from REPOS.json through Docker dispatch into the container | VERIFIED | `docker.js:123-124` — `env.push("QUALITY_GATES=...")` from `opts.qualityGates`; `tools.js:96,108` — `getQualityGates(resolvedTarget)` passed to `dispatchDockerJob()` |

### Observable Truths (Plan 02)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | PRs from repos with mergePolicy 'manual' are never auto-merged | VERIFIED | `auto-merge.yml:185-187` — `manual` policy outputs `allowed=false`; Merge PR `if:` at line 192 gates on `check-merge-policy.outputs.allowed == 'true'` |
| 7 | PRs from repos with mergePolicy 'gate-required' are blocked from auto-merge when gate-failures.md exists | VERIFIED | `auto-merge.yml:178-181` — `gate-required` + file existence check outputs `allowed=false` |
| 8 | PRs from repos with mergePolicy 'auto' or absent are auto-merged as before | VERIFIED | `auto-merge.yml:197-199` — `auto` policy outputs `allowed=true` |
| 9 | Operator notification includes gate failure excerpts when gate-failures.md exists | VERIFIED | `notify-job-failed.yml:44-75` — reads file, sets `quality_gates` stage, appends to `LOG_CONTENT`; `notify-pr-complete.yml:128-136,204-212` — both same-repo and cross-repo paths; `tools.js:270-288` — Docker path scans stdout for `[GATE] FAILED` marker |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/tools/repos.js` | `getQualityGates()` and `getMergePolicy()` exported | VERIFIED | Both functions present (lines 55-68), exported at line 70 with all 5 functions |
| `templates/docker/job/entrypoint.sh` | Quality gate execution block, self-correction, gate-failures.md artifact | VERIFIED | `run_quality_gates()` at line 270, gate execution at 526-569, `bash -n` passes |
| `instances/noah/config/REPOS.json` | `qualityGates` and `mergePolicy` fields on repo entries | VERIFIED | Both repos have fields; clawforge has `["npm run build"]` / `"gate-required"`, neurostory has `[]` / `"auto"` |
| `instances/strategyES/config/REPOS.json` | `qualityGates` and `mergePolicy` fields | VERIFIED | strategyes-lab has `[]` / `"auto"` |
| `templates/.github/workflows/auto-merge.yml` | Merge policy enforcement step wired into Merge PR condition | VERIFIED | `check-merge-policy` step at line 139, `check-merge-policy.outputs.allowed == 'true'` in Merge PR `if:` at line 192 |
| `templates/.github/workflows/notify-job-failed.yml` | Gate failure excerpt inclusion | VERIFIED | `gate-failures.md` read, `quality_gates` stage, `QUALITY GATE FAILURES` appended |
| `templates/.github/workflows/notify-pr-complete.yml` | Gate failure excerpt inclusion in both paths | VERIFIED | Same-repo path (lines 128-136) and cross-repo path (lines 204-212) both enriched |
| `lib/ai/tools.js` | Gate failure output in Docker-dispatched job results.log | VERIFIED | `gateFailures` extraction from stdout (line 270-274), `hasGateFailures` check (line 278), `results.log` enriched (line 288), `failure_stage` updated (line 287) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/ai/tools.js` | `lib/tools/repos.js` | `import { getQualityGates, getMergePolicy }` | VERIFIED | Line 9: full named import; called at lines 96-97 |
| `lib/tools/docker.js` | entrypoint.sh env | `QUALITY_GATES` and `MERGE_POLICY` env vars | VERIFIED | Lines 123-127: both vars pushed to env array conditionally |
| `entrypoint.sh` | `gate-failures.md` | writes on gate failure, git commit | VERIFIED | Lines 292-296: file written, staged, committed, pushed inside `run_quality_gates()` |
| `auto-merge.yml check-merge-policy` | Merge PR `if:` condition | `steps.check-merge-policy.outputs.allowed == 'true'` | VERIFIED | Line 192: condition includes the output; enforcement is live |
| `notify-job-failed.yml` | `gate-failures.md` on branch | reads file, appends to `LOG_CONTENT` | VERIFIED | Lines 44-75: file read, stage detection, content appended |
| `lib/ai/tools.js waitAndNotify` | gate-failures content | scans container stdout for `[GATE] FAILED` | VERIFIED | Lines 270-288: marker scan, `gateFailures` populated, `results.log` enriched |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| EXEC-01 | 39-01 | Job container runs configurable quality gates after Claude Code completes and before PR creation | SATISFIED | `run_quality_gates()` in entrypoint.sh executes gates from `QUALITY_GATES` env var; gate block positioned after `HAS_NEW_COMMIT`, before PR creation |
| EXEC-02 | 39-01 | When quality gates fail, agent automatically sees the failure output and attempts one self-correction pass | SATISFIED | `GATE_ATTEMPT` guard enforces exactly one retry; correction prompt reads `gate-failures.md` content; claude -p re-invoked at line 550 |
| EXEC-03 | 39-02 | Each repo in REPOS.json can specify a merge policy (auto, gate-required, manual) enforced by auto-merge | SATISFIED | `check-merge-policy` step reads REPOS.json, outputs `allowed=true/false`; Merge PR `if:` wired to this output |
| EXEC-04 | 39-01, 39-02 | Gate failures surfaced in operator's chat notification with failure excerpts | SATISFIED | Three notification paths all enriched: notify-job-failed, notify-pr-complete (both paths), and waitAndNotify Docker path |

All four EXEC requirements satisfied. No orphaned requirements found — all IDs declared in plan frontmatter match REQUIREMENTS.md and have implementation evidence.

---

### Anti-Patterns Found

None. No TODOs, placeholders, empty implementations, or stub patterns found in any modified files. The `return null` occurrences in `docker.js` are legitimate early-return guards in existing unmodified functions.

---

### Human Verification Required

None — all must-haves are verifiable programmatically. The gate execution flow (gate runs, self-correction fires, PR label applied) is fully wired in `entrypoint.sh` and validated by `bash -n`. The merge policy enforcement is wired into the GitHub Actions `if:` condition which is a static declaration.

---

### Verified Commits

All four task commits confirmed in git history:

- `641699b` — feat(39-01): add quality gate config schema and JS helpers
- `764f7fa` — feat(39-01): implement quality gate execution and self-correction in entrypoint.sh
- `ec15f2e` — feat(39-02): add merge policy enforcement to auto-merge workflow
- `2286889` — feat(39-02): enrich notifications with gate failure excerpts

---

### Summary

Phase 39 goal achieved. Quality gates, self-correction, merge policy enforcement, and notification enrichment are all fully implemented and wired:

- `lib/tools/repos.js` exports `getQualityGates()` and `getMergePolicy()` with correct defaults
- Docker dispatch passes `QUALITY_GATES` and `MERGE_POLICY` env vars into containers
- `entrypoint.sh` runs gates after the main commit, writes `gate-failures.md`, fires one self-correction, labels PR `needs-fixes` on persistent failure
- `auto-merge.yml` enforces per-repo merge policy with the critical `check-merge-policy.outputs.allowed` wired into the Merge PR condition
- All three notification paths (Actions failure, Actions PR-complete, Docker waitAndNotify) surface gate failure excerpts to the operator
- `npm run build` passes; `bash -n` validates entrypoint syntax

---

_Verified: 2026-03-16T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
