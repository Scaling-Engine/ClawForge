---
phase: 20-named-volumes
verified: 2026-03-08T05:00:00Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 20: Named Volumes Verification Report

**Phase Goal:** Repeat jobs on the same repo start warm -- fetching in 2-3 seconds instead of cloning in 10-15 seconds
**Verified:** 2026-03-08T05:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Second job on the same repo uses git fetch instead of git clone | VERIFIED | entrypoint.sh:51-67 checks for `.git` in `/repo-cache`, takes fetch path on warm start with `git fetch origin "${BRANCH}" --depth 1 --no-tags` |
| 2 | A job after a crashed/interrupted job starts clean with no stale locks or dirty state | VERIFIED | entrypoint.sh:55-63 runs hygiene: `find .git -name "*.lock" -delete`, `git reset --hard HEAD`, `git clean -fdx -e .clawforge-lock`, `git remote set-url origin` |
| 3 | Two concurrent jobs on the same repo both complete without corrupting each other | VERIFIED | entrypoint.sh:47-77 wraps ALL git operations AND `cp -a` inside `flock -w 30 200` subshell with lock at `/repo-cache/.clawforge-lock`; copy to `/job/` provides per-container isolation |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/tools/docker.js` | volumeNameFor, ensureVolume exports, Mounts in dispatchDockerJob | VERIFIED | volumeNameFor exported (line 42), ensureVolume internal (line 51), Mounts with /repo-cache volume (lines 110-117), clawforge.volume label (line 105) |
| `templates/docker/job/entrypoint.sh` | Warm/cold start detection, hygiene step, flock mutex, cp to /job | VERIFIED | Full implementation at lines 33-83. Syntax check passes. Both WARM START and COLD START paths present. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| docker.js:dispatchDockerJob | docker.js:ensureVolume | `await ensureVolume(volName)` before createContainer | WIRED | Line 94: `await ensureVolume(volName)` called after volumeNameFor on line 93 |
| docker.js:dispatchDockerJob | docker.createContainer HostConfig.Mounts | volume mount config | WIRED | Lines 110-117: `Type: 'volume'`, `Source: volName`, `Target: '/repo-cache'` |
| entrypoint.sh step 5 | /repo-cache/.git | directory existence check | WIRED | Line 51: `if [ -d "${REPO_CACHE}/.git" ]` |
| entrypoint.sh step 5 | flock | file-level mutex on /repo-cache/.clawforge-lock | WIRED | Line 49: `flock -w 30 200`, line 77: `200>"${LOCK_FILE}"` |
| entrypoint.sh step 5 | /job | cp -a from repo-cache to isolated working directory | WIRED | Line 75: `cp -a "${REPO_CACHE}/." /job/` |
| lib/ai/tools.js | dispatchDockerJob | import and invocation | WIRED | tools.js:11 imports, tools.js:92 calls with job options |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VOL-01 | 20-01 | Named volumes created per repo per instance with convention `clawforge-{instance}-{repo-slug}` | SATISFIED | docker.js:42-45 `volumeNameFor()` returns `clawforge-${instanceName}-${slug}`, called at line 93, volume ensured at line 94 |
| VOL-02 | 20-02 | Entrypoint detects warm start and uses `git fetch` instead of `git clone` | SATISFIED | entrypoint.sh:51-67 checks `.git` dir, uses `git fetch origin "${BRANCH}" --depth 1 --no-tags` on warm path |
| VOL-03 | 20-02 | Volume hygiene step runs before each job | SATISFIED | entrypoint.sh:55-63 removes lock files, resets working tree, fixes remote URL, cleans untracked files |
| VOL-04 | 20-02 | Concurrent jobs on same repo don't corrupt shared volume state | SATISFIED | entrypoint.sh:47-77 flock subshell serializes access; cp -a to /job inside lock provides isolation |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No anti-patterns detected in either modified file |

### Human Verification Required

### 1. Warm Start Performance

**Test:** Run two consecutive Docker jobs on the same repo. Check logs for "WARM START" and repo setup time.
**Expected:** Second job prints "=== WARM START ===" and completes repo setup in under 5 seconds (target 2-3s).
**Why human:** Requires actual Docker execution with real git repos to measure timing.

### 2. Crash Recovery Hygiene

**Test:** Kill a running job container mid-execution (simulate crash), then dispatch another job on the same repo.
**Expected:** Second job prints "=== WARM START ===", successfully cleans stale locks, and completes without git errors.
**Why human:** Requires simulating container crash and observing recovery behavior.

### 3. Concurrent Job Safety

**Test:** Dispatch two jobs targeting the same repo simultaneously.
**Expected:** Both jobs complete successfully. One acquires flock first, the other waits (up to 30s). Neither corrupts the other's working directory.
**Why human:** Requires real concurrent container execution to verify flock serialization.

### Gaps Summary

No gaps found. All three success criteria are fully implemented:
- Volume creation and mounting in docker.js (Plan 01)
- Warm/cold detection, hygiene, and flock mutex in entrypoint.sh (Plan 02)
- Both artifacts are wired into the dispatch pipeline via tools.js
- All four requirements (VOL-01 through VOL-04) are satisfied
- No orphaned requirements found
- Both commits (63e9c07, 5d2a359) exist in git history
- No TODO/FIXME/placeholder patterns detected

---

_Verified: 2026-03-08T05:00:00Z_
_Verifier: Claude (gsd-verifier)_
