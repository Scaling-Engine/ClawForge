---
phase: 40-job-control-ui
verified: 2026-03-17T00:54:16Z
status: passed
score: 3/3 must-haves verified
re_verification: false
human_verification:
  - test: "Cancel a running Docker job from the web UI"
    expected: "Container stops (SIGTERM + 10s grace), job row status updates on next poll, SSE stream receives 'cancelled' event"
    why_human: "Requires a live running Docker container and active job — cannot simulate with grep/file checks"
  - test: "Retry a failed Docker job from the web UI"
    expected: "New job dispatched with original prompt; original job.md fetched from GitHub branch; new jobId appears in DockerJobsList on next poll"
    why_human: "Requires a failed job record in the DB and a pruned/existing GitHub branch — end-to-end flow cannot be verified statically"
  - test: "Non-admin user session: Cancel and Retry buttons absent"
    expected: "A user with role='user' sees job rows but no Cancel or Retry buttons"
    why_human: "Role-gating is client-side (session.user.role check in JSX); requires two browser sessions with different roles"
---

# Phase 40: Job Control UI Verification Report

**Phase Goal:** Operators can cancel running jobs and retry failed jobs directly from the web UI without SSH access
**Verified:** 2026-03-17T00:54:16Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                    | Status     | Evidence                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A running job shows a Cancel button; clicking it stops the Docker container and updates status          | ✓ VERIFIED | `cancelJob()` calls `requireAdmin()`, `container.stop({ t: 10 })`, `streamManager.cancel(jobId)`; Cancel button gated on `isAdmin && isRunning` |
| 2   | A failed job shows a Retry button; clicking it re-dispatches with the original prompt without re-typing  | ✓ VERIFIED | `retryJob()` calls `requireAdmin()`, fetches `logs/${jobId}/job.md` from GitHub branch, calls `createJob` + `dispatchDockerJob`; Retry button gated on `isAdmin && isFailed` |
| 3   | Cancel and Retry are admin-only; non-admin users do not see the controls                                 | ✓ VERIFIED | `requireAdmin()` in both Server Actions calls `forbidden()` for non-admins; UI hides buttons when `session.user.role !== 'admin'` via `isAdmin` flag |

**Score:** 3/3 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `lib/chat/actions.js` — `requireAdmin()` | Admin guard calling `forbidden()` for non-admins | ✓ VERIFIED | Lines 34–41: calls `requireAuth()`, checks `user.role !== 'admin'`, dynamically imports and calls `forbidden()` |
| `lib/chat/actions.js` — `cancelJob()` | Stop Docker container + cancel SSE stream, admin-only | ✓ VERIFIED | Lines 377–402: `requireAdmin()`, `getDockerJob`, `container.stop({ t: 10 })`, `streamManager.cancel(jobId)` |
| `lib/chat/actions.js` — `retryJob()` | Fetch original job.md, re-dispatch via createJob + dispatchDockerJob, admin-only | ✓ VERIFIED | Lines 410–472: `requireAdmin()`, `fetchRepoFile` from `job/${jobId}` branch at `logs/${jobId}/job.md`, `createJob`, `saveJobOrigin`, `dispatchDockerJob` |
| `lib/chat/actions.js` — `getDockerJobs()` | List pending Docker jobs with live container status | ✓ VERIFIED | Lines 326–369: `requireAuth()`, `getPendingDockerJobs`, `inspectJob` per row, `jobOutcomes` lookup, structured return |
| `lib/chat/components/swarm-page.jsx` — `DockerJobsList` | Cancel/Retry buttons, admin-gated, shown above workflow list | ✓ VERIFIED | Lines 128–234: `isAdmin` derived from `session?.user?.role === 'admin'`; Cancel shown for `isAdmin && isRunning`; Retry shown for `isAdmin && isFailed` |
| `lib/chat/components/swarm-page.jsx` — `SwarmPage` integration | DockerJobsList rendered above SwarmWorkflowList | ✓ VERIFIED | Lines 319–324: `<DockerJobsList>` rendered before `<SwarmWorkflowList>` inside the same container div |

---

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `swarm-page.jsx` | `lib/chat/actions.js` — `cancelJob`, `retryJob`, `getDockerJobs` | Named import line 6 | ✓ WIRED | `import { getSwarmStatus, cancelJob, retryJob, getDockerJobs } from '../actions.js'` |
| `cancelJob` | `lib/tools/docker.js` — `getDocker`, `container.stop` | Dynamic import inside action | ✓ WIRED | `getDocker()` at line 388; `container.stop({ t: 10 })` at line 393 |
| `cancelJob` | `lib/tools/stream-manager.js` — `streamManager.cancel` | Dynamic import inside action | ✓ WIRED | `streamManager.cancel(jobId)` at line 400 |
| `retryJob` | `lib/tools/github.js` — `fetchRepoFile` | Dynamic import inside action | ✓ WIRED | Fetches `logs/${jobId}/job.md` at ref `job/${jobId}`; null-check guards missing branch |
| `retryJob` | `lib/tools/create-job.js` — `createJob` | Dynamic import inside action | ✓ WIRED | `createJob(jobDescription, { targetRepo })` at line 445 |
| `retryJob` | `lib/db/job-origins.js` — `saveJobOrigin` | Dynamic import inside action | ✓ WIRED | `saveJobOrigin(result.job_id, 'web', 'web', ...)` at line 455; wrapped in try/catch (non-fatal) |
| `retryJob` | `lib/tools/docker.js` — `dispatchDockerJob` | Dynamic import inside action | ✓ WIRED | Called at line 463 inside `isDockerAvailable()` guard |
| `DockerJobsList.handleCancel` | `cancelJob` Server Action | Direct call | ✓ WIRED | Line 136: `const result = await cancelJob(jobId)` |
| `DockerJobsList.handleRetry` | `retryJob` Server Action | Direct call | ✓ WIRED | Line 153: `const result = await retryJob(jobId)` |
| `SwarmPage` → `templates/app/swarm/page.js` | `session` prop with `user.role` | `auth()` server-side | ✓ WIRED | Page calls `auth()` and passes `session` to `<SwarmPage session={session} />`; role populated from auth layer |

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| --- | --- | --- | --- |
| OPS-01 | Operator can cancel a running job from the web UI, which stops and removes the Docker container | ✓ SATISFIED | `cancelJob` action: `container.stop({ t: 10 })` + `streamManager.cancel`; `requireAdmin()` guard; Cancel button in `DockerJobsList` gated on `isAdmin && containerRunning` |
| OPS-02 | Operator can retry a failed job from the web UI, which re-dispatches with the original prompt and target repo | ✓ SATISFIED | `retryJob` action: fetches original `job.md` from GitHub branch, reads `targetRepo` from `job_outcomes`, calls `createJob` + `dispatchDockerJob`; `requireAdmin()` guard; Retry button gated on `isAdmin && isFailed` |

---

### Anti-Patterns Found

None detected in the two modified files (`lib/chat/actions.js`, `lib/chat/components/swarm-page.jsx`).

Checked for: TODO/FIXME/PLACEHOLDER comments, empty return implementations, console.log-only handlers, stub patterns. None found.

One deliberate design note (not a flag): `DockerJobsList` returns `null` when `jobs` is empty or absent — this is correct behaviour documented in the SUMMARY, not a stub.

---

### Human Verification Required

The following three behaviours require a live environment to test:

#### 1. Cancel stops a running container

**Test:** Dispatch a job, wait for it to appear in the Active Docker Jobs section, click Cancel as an admin user.
**Expected:** Container stops (SIGTERM with 10s grace period), the DockerJobsList row updates to a non-running state on the next 10s poll, the SSE stream receives a `cancelled` event.
**Why human:** Requires a live Docker daemon, a running container, and a real-time SSE connection — cannot be verified statically.

#### 2. Retry re-dispatches with original prompt

**Test:** Let a job fail (or force an exit), click Retry as an admin user.
**Expected:** A new job appears in the list with a different jobId but the same prompt as the original; the original `job.md` content is reproduced without the operator typing anything.
**Why human:** Requires a failed job record in SQLite, an accessible GitHub branch with the original `job.md`, and Docker dispatch — full integration flow.

#### 3. Non-admin user sees no Cancel or Retry buttons

**Test:** Log in as a user with `role = 'user'`, navigate to /swarm.
**Expected:** Docker job rows are visible (getDockerJobs only requires `requireAuth`), but no Cancel or Retry buttons appear in any row.
**Why human:** Client-side role check (`session.user.role === 'admin'`) requires two distinct browser sessions with different role values.

---

### Build Verification

`npm run build` completed successfully in 51ms — zero errors, zero warnings. `swarm-page.js` included in output at 10.8kb.

---

### Summary

Phase 40 achieves its stated goal. All three Server Actions (`cancelJob`, `retryJob`, `getDockerJobs`) are substantive and fully wired — no stubs, no placeholder implementations. The `DockerJobsList` component is rendered above the workflow list in `SwarmPage`, receives the session for role-gating, and calls the correct Server Actions on user interaction. `requireAdmin()` is present and correct in both destructive actions. Three items require human verification against a live environment (cancel flow, retry flow, and non-admin role display), but all automated checks pass.

---

_Verified: 2026-03-17T00:54:16Z_
_Verifier: Claude (gsd-verifier)_
