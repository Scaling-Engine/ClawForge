# Phase 40: Job Control UI - Research

**Researched:** 2026-03-16
**Domain:** Next.js Server Actions, Dockerode container lifecycle, admin role enforcement, job status listing
**Confidence:** HIGH

## Summary

Phase 40 adds Cancel and Retry buttons to the web UI for running/failed jobs. Both actions are admin-only. The cancellation path is already fully implemented as a LangGraph agent tool (`cancelJobTool` in `lib/ai/tools.js`); the UI work wraps that same logic behind a Server Action and renders it in the Swarm page (or a dedicated Jobs page). The retry path requires fetching the original job description from GitHub (`logs/{jobId}/job.md` on the `job/{jobId}` branch) and re-dispatching via `createJob()` + `dispatchDockerJob()`.

The key architectural constraint is **admin enforcement at the Server Action layer, not just the UI layer**. The Docker socket is fully writable. An unguarded Server Action calling `container.stop()` is a host-escape vector. Every destructive action must call `requireAdmin()` as its first line (per STATE.md architecture note).

The job status data needed to know which jobs are cancellable (running) or retryable (failed) lives in two places: (1) Docker daemon via `docker.listContainers()` for running Docker-dispatched jobs, and (2) `job_origins` + `job_outcomes` DB tables for status/outcome. The existing `inspectJob(jobId)` function in `lib/tools/docker.js` queries the Docker API by container ID stored in `job_origins.container_id`.

**Primary recommendation:** Add `cancelJob` and `retryJob` Server Actions to `lib/chat/actions.js`, expose a new `getActiveDockerJobs` Server Action that lists running Docker jobs from the DB + Docker daemon, and add Cancel/Retry buttons to the existing Swarm page (extend the `SwarmWorkflowList` component). Do not build a separate jobs page — Swarm already shows this list.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OPS-01 | Operator can cancel a running job from the web UI, which stops and removes the Docker container | `cancelJobTool` in `lib/ai/tools.js` already implements `container.stop({ t: 10 })` + `streamManager.cancel()`. Needs a `cancelJob` Server Action that wraps this logic with `requireAdmin()`, and a Cancel button on the Swarm page for in_progress jobs. |
| OPS-02 | Operator can retry a failed job from the web UI, which re-dispatches with the original prompt and target repo | Original prompt is in `logs/{jobId}/job.md` on the `job/{jobId}` branch — fetchable via `fetchRepoFile()` from `lib/tools/github.js`. Target repo is in `job_outcomes.targetRepo`. `createJob()` + `dispatchDockerJob()` are the dispatch path. Needs a `retryJob` Server Action + Retry button for failed jobs. |
</phase_requirements>

## Standard Stack

### Core
| Component | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| Next.js Server Actions | `lib/chat/actions.js` | All destructive operations | Already the pattern for every admin action (secrets, role changes, PR approval) |
| `cancelJobTool` logic | `lib/ai/tools.js:660-708` | Container stop + stream cleanup | Already battle-tested; reuse directly, don't duplicate |
| `fetchRepoFile()` | `lib/tools/github.js` | Fetch original job.md from branch | Already used for project state hydration; handles 404 gracefully |
| `inspectJob(jobId)` | `lib/tools/docker.js:378-396` | Verify container is still running | Returns `{running, status, exitCode}` before attempting stop |
| `getDockerJob(jobId)` | `lib/db/docker-jobs.js:27` | Look up containerId from DB | Returns jobOrigins row with containerId |
| `getDocker()` | `lib/tools/docker.js:238` | Access Dockerode client | Used by cancelJobTool already |
| `requireAdmin()` pattern | inline in actions.js | Guard destructive actions | Every existing admin action follows this pattern |
| `session.user.role` | from `auth()` | Role check value | JWT-embedded, available in all Server Actions |

### Supporting
| Component | Location | Purpose | When to Use |
|-----------|----------|---------|-------------|
| `streamManager.cancel(jobId)` | `lib/tools/stream-manager.js` | Emit 'cancelled' to SSE subscribers | Call after container.stop() to update live stream viewers |
| `saveJobOutcome()` | `lib/db/job-outcomes.js` | Record cancelled/retried status | Write 'cancelled' outcome when cancel succeeds |
| `getPendingDockerJobs()` | `lib/db/docker-jobs.js:66` | List un-notified Docker jobs | Use for listing active jobs from DB |
| `jobOutcomes.targetRepo` | DB column | Original target repo for retry | Already persisted by `waitAndNotify()` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend Swarm page | New dedicated Jobs page | Swarm already shows this data; a second page duplicates the list |
| Server Action cancel | Separate API route `/api/jobs/:id/cancel` | Server Actions are the project pattern; API routes add CSRF surface area |
| Fetch job.md for retry | Store description in DB | DB schema change required; GitHub is the authoritative store — job.md is already there |

**Installation:** No new dependencies required.

## Architecture Patterns

### Recommended Project Structure

No new directories needed. All additions are:
```
lib/
├── chat/
│   ├── actions.js          # Add cancelJob(), retryJob(), getActiveDockerJobs()
│   └── components/
│       └── swarm-page.jsx  # Add Cancel/Retry buttons to SwarmWorkflowList rows
```

### Pattern 1: requireAdmin() Server Action guard

**What:** Every destructive Server Action starts with an admin role check before any other logic.
**When to use:** Any action that modifies state (cancel container, re-dispatch job).

```javascript
// Pattern used in all existing admin actions (e.g., deleteGitHubSecret)
async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) unauthorized();
  if (session.user.role !== 'admin') forbidden();
  return session.user;
}

export async function cancelJob(jobId) {
  await requireAdmin(); // MUST be first line — Docker socket is fully writable
  const { getDockerJob } = await import('../db/docker-jobs.js');
  const row = getDockerJob(jobId);
  if (!row?.containerId) return { error: 'Job not found or not a Docker job' };
  // ... container.stop(), streamManager.cancel(), saveJobOutcome()
}
```

Note: `unauthorized()` and `forbidden()` are Next.js navigation helpers already used in the codebase.

### Pattern 2: Cancel implementation (mirrors cancelJobTool)

**What:** Stop container with SIGTERM grace period, clean up stream, record outcome.
**When to use:** When operator clicks Cancel on a running job.

```javascript
export async function cancelJob(jobId) {
  await requireAdmin();
  const { getDocker, inspectJob } = await import('../tools/docker.js');
  const { getDockerJob } = await import('../db/docker-jobs.js');
  const { streamManager } = await import('../tools/stream-manager.js');

  const row = getDockerJob(jobId);
  if (!row?.containerId) return { error: 'Job not found or not a Docker job' };

  const docker = getDocker();
  if (!docker) return { error: 'Docker not available' };

  const container = docker.getContainer(row.containerId);
  try {
    await container.stop({ t: 10 }); // SIGTERM, 10s grace, then SIGKILL
  } catch (err) {
    if (!err.message.includes('not running') && err.statusCode !== 304) {
      throw err;
    }
  }

  streamManager.cancel(jobId); // Emits 'cancelled' to SSE subscribers

  // Optionally save outcome row for audit trail
  // saveJobOutcome({ jobId, status: 'cancelled', mergeResult: 'cancelled', ... })

  return { success: true };
}
```

### Pattern 3: Retry implementation

**What:** Fetch original job.md from GitHub branch, re-dispatch as new job.
**When to use:** When operator clicks Retry on a failed job.

```javascript
export async function retryJob(jobId) {
  await requireAdmin();
  const { fetchRepoFile } = await import('../tools/github.js');
  const { getDockerJob } = await import('../db/docker-jobs.js');

  const GH_OWNER = process.env.GH_OWNER;
  const GH_REPO = process.env.GH_REPO;

  // Fetch original prompt from the job branch
  const jobDescription = await fetchRepoFile(
    GH_OWNER, GH_REPO,
    `logs/${jobId}/job.md`,
    { ref: `job/${jobId}` }
  );
  if (!jobDescription) return { error: 'Original job description not found' };

  // Look up target repo from job_outcomes (nullable — null means same repo)
  const { getDb } = await import('../db/index.js');
  const { jobOutcomes } = await import('../db/schema.js');
  const { eq, desc } = await import('drizzle-orm');
  const db = getDb();
  const outcome = db.select().from(jobOutcomes)
    .where(eq(jobOutcomes.jobId, jobId))
    .orderBy(desc(jobOutcomes.createdAt))
    .limit(1).get();

  // Re-dispatch: createJob + dispatchDockerJob
  const { createJob } = await import('../tools/create-job.js');
  const { dispatchDockerJob, isDockerAvailable } = await import('../tools/docker.js');
  const { saveJobOrigin } = await import('../db/job-origins.js');

  const result = await createJob(jobDescription, {
    targetRepo: outcome?.targetRepo ? parseTargetRepo(outcome.targetRepo) : null,
  });

  // ... dispatch + save origin with platform='web'
  return { success: true, newJobId: result.job_id };
}
```

### Pattern 4: Swarm page Cancel/Retry button injection

**What:** Show Cancel button on rows where `status === 'in_progress'` (Docker jobs), Retry button where `conclusion === 'failure'`.
**When to use:** Admin session only — check `session.user.role === 'admin'`.

The Swarm page already receives `session` as a prop. Role check is a simple prop comparison.

```jsx
// In SwarmWorkflowList, after the existing "View" link:
{isAdmin && isRunning && isDockerJob && (
  <button onClick={() => handleCancel(run.job_id)} disabled={cancelling === run.job_id}
    className="text-xs text-red-500 hover:underline shrink-0 disabled:opacity-50">
    {cancelling === run.job_id ? 'Cancelling...' : 'Cancel'}
  </button>
)}
{isAdmin && run.conclusion === 'failure' && run.job_id && (
  <button onClick={() => handleRetry(run.job_id)} disabled={retrying === run.job_id}
    className="text-xs text-blue-500 hover:underline shrink-0 disabled:opacity-50">
    {retrying === run.job_id ? 'Retrying...' : 'Retry'}
  </button>
)}
```

### Anti-Patterns to Avoid

- **Missing requireAdmin() first line:** Docker socket is fully writable; an unguarded cancelJob action is a container host-escape vector. The check must come before any Docker interaction.
- **Cancelling non-Docker jobs:** The Swarm page shows both GitHub Actions and Docker jobs. Cancel should only be offered for Docker-dispatched jobs (`run.dispatchMethod === 'docker'` or container is actually listed in Docker daemon). Actions-dispatched jobs cannot be cancelled via Dockerode.
- **Retrying without checking job.md exists:** `fetchRepoFile()` returns null if the branch has been pruned. Guard with a null check and return a user-visible error.
- **Duplicate cancelJobTool logic:** Do not copy-paste the cancellation code. Import from `lib/tools/docker.js` and `lib/tools/stream-manager.js` directly.
- **Catching all errors silently in Server Actions:** Return structured `{ error: string }` objects so the UI can display failure reasons.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Container stop | Custom SIGTERM/kill sequence | `container.stop({ t: 10 })` via Dockerode | Grace period + SIGKILL fallback already handled |
| SSE cancellation notification | Custom WebSocket message | `streamManager.cancel(jobId)` | Already emits 'cancelled' to all SSE subscribers for the job |
| Job.md fetching | Custom GitHub API call | `fetchRepoFile(owner, repo, path, { ref })` | Already handles 404/403, truncation, auth headers |
| Admin role check | Custom middleware or decorator | `requireAdmin()` inline pattern | All existing admin actions use this pattern |

**Key insight:** The cancel path is already ~40 lines in `cancelJobTool`. The Server Action is a thin wrapper calling the same dependencies.

## Common Pitfalls

### Pitfall 1: Offering Cancel for GitHub Actions jobs
**What goes wrong:** User clicks Cancel on an Actions-dispatched job; `getDockerJob(jobId)` returns null; error is shown.
**Why it happens:** The Swarm page shows all workflow runs, but only Docker-dispatched jobs have a containerId.
**How to avoid:** In the UI, determine which jobs are Docker-dispatched. Option A: query `getDockerJob(jobId)` server-side and include a `isDockerJob` flag in the Swarm data. Option B: Only show Cancel for jobs where `dispatchMethod === 'docker'` (from DB). The Server Action must also guard against missing containerId.
**Warning signs:** Cancel button appears for all in-progress jobs without any filtering.

### Pitfall 2: job.md not found on retry
**What goes wrong:** Operator clicks Retry on an old failed job; branch has been auto-pruned or merged; `fetchRepoFile` returns null; generic error is displayed.
**Why it happens:** Job branches are merged (or may be deleted post-merge). The job.md is preserved in the branch history but `ref: 'job/{jobId}'` won't exist after branch deletion.
**How to avoid:** Fetch job.md from the commit SHA, not the branch ref, OR accept that retry is best-effort for recent jobs only. Document the limitation. If null, return `{ error: 'Original job description no longer available (branch was pruned)' }`.
**Warning signs:** All retries fail silently for jobs older than a week.

### Pitfall 3: Cancel not updating job status in UI
**What goes wrong:** Operator clicks Cancel; container stops; Swarm page still shows job as `in_progress` on next auto-refresh.
**Why it happens:** The Swarm page polls GitHub Actions workflow runs, not the Docker daemon. GitHub Actions run status lags behind actual container state.
**How to avoid:** After successful cancel, immediately remove the job from local state in the Swarm component (optimistic update) rather than waiting for the next polling cycle. The `container.stop()` call is synchronous so the action can return cleanly.
**Warning signs:** Job still shows as running 30 seconds after cancel completes.

### Pitfall 4: `forbidden()` vs `unauthorized()` in Server Actions
**What goes wrong:** Using `unauthorized()` for admin role failures; the user gets redirected to login instead of /forbidden.
**Why it happens:** Next.js `unauthorized()` redirects to the login page; `forbidden()` redirects to /forbidden.
**How to avoid:** Use `unauthorized()` when `!session?.user?.id` (not logged in), `forbidden()` when logged in but not admin. Both are imported from `next/navigation` and already used in the codebase.
**Warning signs:** Non-admin users get redirected to login instead of /forbidden.

### Pitfall 5: Retrying enriched job descriptions
**What goes wrong:** Original `job.md` contains the "## Prior Job Context" block prepended by `createJobTool`. Retrying dispatches this enriched description, which includes stale prior-job context.
**Why it happens:** `createJobTool` enriches the description with prior merged outcome before writing to job.md.
**How to avoid:** Accept the behavior as-is (the prior context was valid when the job was created) OR strip the "## Prior Job Context" section before re-dispatch. Simplest: leave it as-is for v1 of retry.

## Code Examples

Verified patterns from existing codebase:

### requireAdmin pattern (from actions.js)
```javascript
// From lib/chat/actions.js — existing pattern used for all destructive ops
async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    unauthorized();
  }
  return session.user;
}

// For admin-only actions, add role check:
async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== 'admin') {
    forbidden(); // from next/navigation
  }
  return user;
}
```

### cancelJobTool (from lib/ai/tools.js:660-708)
```javascript
// Existing cancel logic — Server Action reuses same pattern
const row = getDockerJob(job_id);
if (!row?.containerId) return { success: false, error: 'Not a Docker job' };
const container = docker.getContainer(row.containerId);
await container.stop({ t: 10 }); // SIGTERM, 10s grace, then SIGKILL
streamManager.cancel(job_id); // Emit 'cancelled' to SSE subscribers
```

### fetchRepoFile (from lib/tools/github.js)
```javascript
// Fetch job.md from job branch for retry
const jobDescription = await fetchRepoFile(
  GH_OWNER, GH_REPO,
  `logs/${jobId}/job.md`,
  { ref: `job/${jobId}` }
);
// Returns null if branch pruned or file not found — must guard
```

### Swarm page polling pattern (from lib/chat/components/swarm-page.jsx)
```javascript
// Auto-refresh every 10s — existing pattern
useEffect(() => {
  const interval = setInterval(() => fetchPage(page), 10000);
  return () => clearInterval(interval);
}, [fetchPage, page]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cancel via chat ("cancel job X") | Cancel via UI button | Phase 40 | Operators don't need to type job IDs |
| Retry by re-typing prompt | Retry via UI button | Phase 40 | Zero re-typing required |

**Deprecated/outdated:**
- None — no existing patterns are being replaced.

## Open Questions

1. **Should Cancel show for Actions-dispatched jobs?**
   - What we know: Actions-dispatched jobs have no containerId; `getDockerJob()` returns null.
   - What's unclear: GitHub Actions does have a cancel API (`POST /repos/{owner}/{repo}/actions/runs/{run_id}/cancel`). We could cancel Actions jobs too.
   - Recommendation: For Phase 40 scope (OPS-01 says "stops and removes the Docker container"), only Docker jobs. Do not add Actions cancel — out of scope.

2. **Where to show Cancel/Retry buttons?**
   - What we know: The Swarm page exists and shows all jobs. The swarm-page.jsx data comes from GitHub Actions API, not the Docker daemon.
   - What's unclear: Docker-dispatched jobs may not appear in the GitHub Actions workflow list at all (they don't trigger run-job.yml).
   - Recommendation: For Docker jobs, query `getPendingDockerJobs()` + `inspectJob()` from the DB/Docker daemon to build a separate "Active Jobs" list at the top of the Swarm page, distinct from the GitHub Actions workflow list.

3. **Should cancel also remove the container after stopping?**
   - What we know: `cancelJobTool` calls `container.stop()` but does NOT call `container.remove()`. Branch is preserved.
   - What's unclear: Whether the container should be removed for cleanliness.
   - Recommendation: Follow existing pattern — stop but don't remove. The `reconcileOrphans()` function will clean up on next restart.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` |
| Config file | none — no jest.config or vitest.config |
| Quick run command | `node --experimental-vm-modules --test lib/chat/actions.cancel-retry.test.js` |
| Full suite command | `node --test $(find lib -name '*.test.js' | tr '\n' ' ')` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-01 | cancelJob() returns error when containerId missing | unit | `node --test lib/chat/actions.cancel-retry.test.js` | ❌ Wave 0 |
| OPS-01 | cancelJob() calls container.stop() with t:10 | unit | `node --test lib/chat/actions.cancel-retry.test.js` | ❌ Wave 0 |
| OPS-01 | cancelJob() returns error for non-admin user | unit | `node --test lib/chat/actions.cancel-retry.test.js` | ❌ Wave 0 |
| OPS-02 | retryJob() returns error when job.md not found | unit | `node --test lib/chat/actions.cancel-retry.test.js` | ❌ Wave 0 |
| OPS-02 | retryJob() dispatches new job with original description | unit | `node --test lib/chat/actions.cancel-retry.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test lib/chat/actions.cancel-retry.test.js`
- **Per wave merge:** `node --test $(find lib -name '*.test.js' | tr '\n' ' ')`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `lib/chat/actions.cancel-retry.test.js` — covers OPS-01 and OPS-02 unit tests

*(Mock dockerode `container.stop()`, mock `getDockerJob()`, mock `fetchRepoFile()`, mock `createJob()`. Use same pattern as `lib/actions.test.js`.)*

## Sources

### Primary (HIGH confidence)
- `lib/ai/tools.js:660-708` — `cancelJobTool` implementation, verified directly
- `lib/tools/docker.js` — `container.stop()`, `inspectJob()`, `getDocker()`, verified directly
- `lib/db/docker-jobs.js` — `getDockerJob()`, `getPendingDockerJobs()`, verified directly
- `lib/chat/actions.js` — all existing admin Server Actions, `requireAuth()` pattern, verified directly
- `lib/db/schema.js` — `jobOrigins`, `jobOutcomes` table shapes, verified directly
- `lib/tools/github.js` — `fetchRepoFile()`, `getSwarmStatus()`, verified directly
- `lib/tools/create-job.js` — `createJob()` dispatch, verified directly
- `lib/auth/middleware.js` — `/admin` route protection, role check pattern, verified directly

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — architecture note: "requireAdmin() pattern: Every destructive Server Action must call requireAdmin() as first line"

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every referenced file was read directly from the codebase
- Architecture: HIGH — cancelJobTool already exists; Server Action wrapper is a thin layer
- Pitfalls: HIGH — derived from direct code inspection (Docker-only constraint, branch pruning, optimistic update gap)

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable infrastructure, low churn)
