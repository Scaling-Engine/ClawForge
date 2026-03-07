---
phase: 19-docker-engine-dispatch
verified: 2026-03-07T19:30:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 19: Docker Engine Dispatch Verification Report

**Phase Goal:** Jobs dispatched via Docker Engine API start in seconds instead of minutes, with full container lifecycle management and seamless fallback to GitHub Actions
**Verified:** 2026-03-07T19:30:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator sends a job via Slack/Telegram and the container starts executing within 15 seconds | VERIFIED | `dispatchDockerJob` in `lib/tools/docker.js:49-91` measures `dispatchMs` and logs it. E2E verified at ~9s per 19-03-SUMMARY. `waitAndNotify` in `lib/ai/tools.js:146-253` fires as detached async after dispatch. |
| 2 | Docker-dispatched jobs produce identical outputs to Actions-dispatched jobs | VERIFIED | `waitAndNotify` builds `results` object matching Actions webhook shape (lines 177-188). Uses same `summarizeJob`, `createNotification`, `saveJobOutcome` pipeline. Routes to same Slack/Telegram threads via `getJobOrigin`. |
| 3 | REPOS.json `dispatch` field controls whether a repo uses Docker or Actions, and both paths work simultaneously | VERIFIED | `getDispatchMethod` in `lib/tools/repos.js:45-48` reads `dispatch` field, defaults to `docker`. `createJobTool` in `lib/ai/tools.js:72-73` checks `isDockerAvailable() && getDispatchMethod(resolvedTarget) === 'docker'`, else falls back to Actions. REPOS.json entries have `"dispatch": "docker"`. |
| 4 | Orphaned containers from crashed Event Handler are detected and cleaned up on restart | VERIFIED | `reconcileOrphans` in `lib/tools/docker.js:190-245` lists containers by label `clawforge=job`, filters by instance, kills running ones, collects logs, force-removes. Called from `initDocker()` on line 19. `initDocker` is called at server startup in `config/instrumentation.js:41-42`. |
| 5 | Operator can check if a running container is stuck via job status inspection | VERIFIED | `inspectJob` in `lib/tools/docker.js:166-184` looks up containerId from DB via `getDockerJob`, calls `docker.getContainer().inspect()`, returns `{ running, startedAt, status, exitCode }`. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/tools/docker.js` | Docker Engine API wrapper with full container lifecycle | VERIFIED | 246 lines. Exports: initDocker, isDockerAvailable, dispatchDockerJob, collectLogs, waitForContainer, removeContainer, inspectJob, reconcileOrphans (8 functions). |
| `lib/db/docker-jobs.js` | DB operations for container lifecycle tracking | VERIFIED | 80 lines. Exports: saveDockerJob, getDockerJob, markDockerJobNotified, isJobNotified, getPendingDockerJobs (5 functions). |
| `lib/db/schema.js` | Updated schema with dispatchMethod on jobOrigins | VERIFIED | jobOrigins table has dispatchMethod (line 48), containerId (line 49), notified (line 50) columns with defaults. |
| `lib/db/job-origins.js` | saveJobOrigin accepts dispatchMethod param | VERIFIED | Line 12: `saveJobOrigin(jobId, threadId, platform, dispatchMethod = 'actions')`. Passes through to insert on line 15. |
| `lib/tools/repos.js` | REPOS.json parsing with dispatch field support | VERIFIED | Exports loadAllowedRepos, resolveTargetRepo, getDispatchMethod. getDispatchMethod defaults to 'docker'. |
| `lib/ai/tools.js` | Dual-path dispatch routing in createJobTool | VERIFIED | Imports all Docker functions (line 11), routes via dispatchMethod check (lines 72-73), Docker path (lines 87-106), Actions path falls through (line 108). waitAndNotify function (lines 146-253). |
| `api/index.js` | Webhook handler with notification dedup | VERIFIED | Imports isJobNotified (line 12). Dedup check at lines 259-262 early-returns when already notified. |
| `config/instrumentation.js` | initDocker() called at server startup | VERIFIED | Lines 41-42: dynamic import and await initDocker(). |
| `docker-compose.yml` | Docker socket mount and new env vars | VERIFIED | Socket mounted at line 78 (noah) and line 128 (ses) with :ro. INSTANCE_NAME, DOCKER_NETWORK, JOB_IMAGE, AGENT_SECRETS, AGENT_LLM_SECRETS configured for both instances. |
| `.env.example` | Documentation of new env vars | VERIFIED | Lines 47-57 (Noah) and 95-105 (SES) document all new vars with comments about network naming caveat. |
| `instances/noah/config/REPOS.json` | dispatch field on repos | VERIFIED | Both repo entries have `"dispatch": "docker"`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/tools/docker.js` | `lib/db/docker-jobs.js` | `saveDockerJob` after container.start() | WIRED | Line 88: `saveDockerJob(jobId, container.id, instanceName)` |
| `lib/tools/docker.js` | `dockerode` | `Docker({ socketPath })` | WIRED | Line 1: `import Docker from 'dockerode'`; Line 15: `new Docker({ socketPath: '/var/run/docker.sock' })` |
| `lib/ai/tools.js` | `lib/tools/docker.js` | import dispatchDockerJob etc. | WIRED | Line 11: imports isDockerAvailable, dispatchDockerJob, waitForContainer, collectLogs, removeContainer |
| `lib/ai/tools.js` | `lib/tools/create-job.js` | import createJob (Actions fallback) | WIRED | Line 4: `import { createJob }`, used at line 76 for both paths |
| `lib/ai/tools.js` | `lib/db/job-origins.js` | import getJobOrigin for notification routing | WIRED | Line 7: `import { saveJobOrigin, getJobOrigin }`, getJobOrigin used at line 197 in waitAndNotify |
| `api/index.js` | `lib/db/docker-jobs.js` | isJobNotified dedup check | WIRED | Line 12: import; Line 259: `if (jobId && isJobNotified(jobId))` |
| `config/instrumentation.js` | `lib/tools/docker.js` | initDocker() at startup | WIRED | Line 41-42: dynamic import + await initDocker() |
| `docker-compose.yml` | `lib/tools/docker.js` | Docker socket volume mount | WIRED | Lines 78, 128: `/var/run/docker.sock:/var/run/docker.sock:ro` |
| `docker-compose.yml` | `lib/ai/tools.js` | INSTANCE_NAME, DOCKER_NETWORK, JOB_IMAGE env vars | WIRED | Lines 72-76 (noah), 122-126 (ses) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DOCK-01 | 19-01 | Docker Engine API client connects via Unix socket | SATISFIED | `initDocker()` connects via socketPath, calls `docker.ping()` |
| DOCK-02 | 19-01 | Create and start ephemeral job containers with env vars, network, labels | SATISFIED | `dispatchDockerJob` creates container with env, labels, HostConfig |
| DOCK-03 | 19-01 | Wait for container exit and capture exit code | SATISFIED | `waitForContainer` calls `container.wait()` returning `{ StatusCode }` |
| DOCK-04 | 19-01 | Container logs retrievable after completion | SATISFIED | `collectLogs` handles Buffer and stream returns, demuxes stdout/stderr |
| DOCK-05 | 19-01 | Containers cleaned up after logs captured | SATISFIED | `removeContainer` with try/catch; `waitAndNotify` calls it in both success and error paths |
| DOCK-06 | 19-01 | Job containers run on instance Docker network | SATISFIED | `dispatchDockerJob` passes `NetworkMode: opts.networkMode`; docker-compose maps DOCKER_NETWORK |
| DOCK-07 | 19-01 | Container IDs tracked in DB | SATISFIED | `saveDockerJob` persists containerId; `getDockerJob` retrieves it |
| DOCK-08 | 19-01 | Orphan reconciliation on startup | SATISFIED | `reconcileOrphans` lists by label, kills running, collects logs, force-removes |
| DOCK-09 | 19-01 | Startup time measured and logged | SATISFIED | `dispatchMs = Date.now() - startTime`; logged on line 85 |
| DOCK-10 | 19-01 | Running containers inspectable for stuck detection | SATISFIED | `inspectJob` looks up container from DB, returns running/status/exitCode |
| DISP-01 | 19-02 | REPOS.json supports dispatch field | SATISFIED | `getDispatchMethod` reads `dispatch` field; REPOS.json has `"dispatch": "docker"` |
| DISP-02 | 19-02 | createJobTool routes based on dispatch config | SATISFIED | Line 72-73: checks `isDockerAvailable() && getDispatchMethod()` |
| DISP-03 | 19-02 | Actions dispatch path unchanged | SATISFIED | When dispatchMethod is 'actions', only `createJob()` is called (same as before); Actions workflow triggers on branch push |
| DISP-04 | 19-03 | Docker-dispatched jobs produce identical outputs | SATISFIED | `waitAndNotify` builds matching results object, uses same summarizeJob/createNotification pipeline |
| DISP-05 | 19-02 | Multiple Docker jobs dispatch in parallel | SATISFIED | Each call creates independent container with unique name (`clawforge-job-{id}`); fire-and-forget async; no shared state |

**Orphaned requirements:** None. All 15 requirement IDs from REQUIREMENTS.md Phase 19 are covered by plans 19-01, 19-02, and 19-03.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No TODOs, FIXMEs, placeholders, or stub implementations found |

### Human Verification Required

### 1. Docker Dispatch Latency Confirmation

**Test:** Send a job via Slack and measure time from message send to container start log
**Expected:** Container starts executing within 15 seconds
**Why human:** Requires live Slack + Docker environment on VPS

### 2. Dedup Under Race Condition

**Test:** Trigger a Docker-dispatched job and observe if both waitAndNotify and Actions webhook fire
**Expected:** Only one notification appears in the Slack thread
**Why human:** Depends on timing of concurrent async paths (Docker inline vs Actions webhook)

### 3. Actions Fallback Path

**Test:** Set `"dispatch": "actions"` in REPOS.json, deploy, send a job
**Expected:** Job routes through GitHub Actions as before (no Docker container created)
**Why human:** Requires config change + live deployment + monitoring

### Gaps Summary

No gaps found. All 5 success criteria verified, all 15 requirements satisfied, all artifacts exist and are substantive, all key links are wired. The E2E verification documented in 19-03-SUMMARY confirms production deployment with ~9s dispatch time. No anti-patterns or stubs detected.

---

_Verified: 2026-03-07T19:30:00Z_
_Verifier: Claude (gsd-verifier)_
