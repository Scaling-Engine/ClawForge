# Phase 21: Integration Wiring - Research

**Researched:** 2026-03-08
**Domain:** Integration gap closure (Node.js event handler + Docker image)
**Confidence:** HIGH

## Summary

Phase 21 closes three non-critical integration gaps and one flow gap identified by the v1.4 milestone audit. All three gaps have clear fixes with existing code patterns to follow -- no new libraries, no architectural changes, no database modifications required.

The three gaps are: (1) `waitAndNotify` in `lib/ai/tools.js` does not call `addToThread()` after Docker job completion, so the LangGraph agent loses memory of Docker job outcomes in conversation; (2) `templates/docker/job/Dockerfile` does not COPY `defaults/AGENT_QUICK.md` into `/defaults/`, so the entrypoint fallback chain fails for foreign repos on quick jobs; (3) `inspectJob()` in `lib/tools/docker.js` is exported but has no consumer -- it needs to be wired into the `get_job_status` tool so operators can detect stuck containers.

**Primary recommendation:** Each gap is a surgical 1-5 line change in an existing file. Follow the exact patterns already established in the Actions webhook path (`api/index.js:303`) for the `addToThread` fix, the existing `COPY defaults/*.md` block in the Dockerfile for the AGENT_QUICK.md fix, and the existing `getJobStatus` tool for the `inspectJob` wiring.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISP-03 (integration) | GitHub Actions dispatch path remains unchanged and fully functional -- Docker path must match its memory behavior | `addToThread` call pattern at `api/index.js:303` provides the exact template; add matching call in `waitAndNotify` after notification |
| HYDR-05 (integration) | AGENT_QUICK.md variant used for simple jobs -- Docker image must include the defaults fallback | File exists at `templates/docker/job/defaults/AGENT_QUICK.md`; add one COPY line to Dockerfile after existing defaults block |
| DOCK-10 (integration) | Running containers can be inspected for stuck job detection -- needs a consumer | `inspectJob()` already implemented in `docker.js:205-223`; wire into `getJobStatusTool` in `tools.js` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dockerode | ^4.0.9 | Docker Engine API client | Already in use, provides `container.inspect()` used by `inspectJob()` |
| @langchain/core | (existing) | LangGraph agent with `addToThread` | Already provides `AIMessage` and state management |

### Supporting
No new libraries needed. All fixes use existing imports and patterns.

## Architecture Patterns

### Pattern 1: Fire-and-Forget Memory Injection (addToThread)

**What:** After a Docker job completes and notification is sent, inject the summary into LangGraph thread memory so the agent remembers the outcome in future turns.

**When to use:** Any code path that completes a job and needs the agent to remember the result.

**Reference implementation (Actions path -- api/index.js:303):**
```javascript
// Source: api/index.js:302-303
// Inject into LangGraph memory so agent knows the job finished
addToThread(origin.threadId, `[Job completed] ${message}`).catch(() => {});
```

**Docker path fix location:** `lib/ai/tools.js`, inside `waitAndNotify()`, after the `saveJobOutcome` call (around line 210), before the platform-specific notification sends. The `addToThread` function must be imported from `../ai/index.js`.

### Pattern 2: Dockerfile COPY for Defaults

**What:** Bake default config files into the Docker image at `/defaults/` so the entrypoint fallback chain works for foreign repos that lack instance-specific config.

**Existing pattern (Dockerfile:67-68):**
```dockerfile
# Source: templates/docker/job/Dockerfile:67-68
COPY defaults/SOUL.md /defaults/SOUL.md
COPY defaults/AGENT.md /defaults/AGENT.md
```

**Fix:** Add one line after the existing block:
```dockerfile
COPY defaults/AGENT_QUICK.md /defaults/AGENT_QUICK.md
```

**File verified:** `templates/docker/job/defaults/AGENT_QUICK.md` exists (confirmed via filesystem check).

### Pattern 3: Wiring an Orphaned Export into an Existing Tool

**What:** The `inspectJob()` function in `docker.js` is fully implemented but has no consumer. Wire it into the existing `getJobStatusTool` so Docker-dispatched jobs can be inspected for stuck detection.

**Current getJobStatusTool (tools.js:255-273):**
```javascript
const getJobStatusTool = tool(
  async ({ job_id }) => {
    const result = await getJobStatus(job_id);
    return JSON.stringify(result);
  },
  // ...
);
```

**Fix:** When a `job_id` is provided and the dispatch method was Docker, call `inspectJob(job_id)` and include container state in the response. The `inspectJob` function is already imported from `../tools/docker.js` at the top of the file (line 11). The function returns `{ running, startedAt, status, exitCode }` or `null`.

### Anti-Patterns to Avoid
- **Creating a new tool for inspection:** Do NOT create a separate `inspect_job` tool. Wire into the existing `get_job_status` tool to keep the tool surface small.
- **Making addToThread blocking:** Use `.catch(() => {})` pattern (fire-and-forget) matching the Actions path. Memory injection must never block notification delivery.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Thread memory injection | Custom state management | `addToThread()` from `lib/ai/index.js` | Already handles LangGraph state updates with error handling |
| Container inspection | Raw Docker API calls | `inspectJob()` from `lib/tools/docker.js` | Already handles DB lookup, container inspect, and null safety |

## Common Pitfalls

### Pitfall 1: Import Cycle with addToThread
**What goes wrong:** Importing `addToThread` from `lib/ai/index.js` into `lib/ai/tools.js` could create a circular dependency since `tools.js` is imported by `agent.js` which is imported by `index.js`.
**Why it happens:** The LangGraph agent setup creates a dependency chain: `index.js -> agent.js -> tools.js`.
**How to avoid:** Check the import graph. Currently `tools.js` does NOT import from `../ai/index.js` -- it imports `summarizeJob` from `../ai/index.js` (line 13). This import already exists, so adding `addToThread` to the same import is safe. The circular dependency concern is mitigated because `summarizeJob` is already imported this way without issues.
**Warning signs:** Module load errors or undefined exports at startup.

### Pitfall 2: addToThread Called Without threadId
**What goes wrong:** `waitAndNotify` receives `threadId` as a parameter, but it could be null (jobs created without a conversation thread).
**How to avoid:** Guard the `addToThread` call inside the existing `if (origin)` block (line 197-243), matching the Actions path pattern. The Actions path also guards with `if (origin)`.

### Pitfall 3: inspectJob Returns null for Actions-Dispatched Jobs
**What goes wrong:** `inspectJob()` looks up the container ID in the `docker_jobs` DB table. Actions-dispatched jobs have no entry there, so it returns `null`.
**How to avoid:** Only call `inspectJob()` when the job's dispatch method is Docker, or gracefully handle `null` return by falling through to the existing GitHub Actions status check.

### Pitfall 4: Docker Image Not Rebuilt After Dockerfile Change
**What goes wrong:** Adding the COPY line to the Dockerfile has no effect until the image is rebuilt.
**How to avoid:** Document that `docker build` must be run after the Dockerfile change. This is an operator action, not a code concern.

## Code Examples

### Example 1: addToThread in waitAndNotify (after line 210 in tools.js)

```javascript
// Source: pattern from api/index.js:302-303
// Add AFTER saveJobOutcome call, INSIDE the if (origin) block

// Inject into LangGraph memory so agent knows the Docker job finished
addToThread(origin.threadId, `[Job completed] ${message}`).catch(() => {});
```

Import change at top of file (line 13):
```javascript
// Current:
import { summarizeJob } from '../ai/index.js';
// Change to:
import { summarizeJob, addToThread } from '../ai/index.js';
```

### Example 2: Dockerfile COPY line (after line 68)

```dockerfile
COPY defaults/AGENT_QUICK.md /defaults/AGENT_QUICK.md
```

### Example 3: inspectJob wiring in getJobStatusTool

```javascript
// Inside getJobStatusTool handler, when job_id is provided:
const result = await getJobStatus(job_id);

// Augment with Docker container inspection if available
if (job_id) {
  try {
    const inspection = await inspectJob(job_id);
    if (inspection) {
      result.container = inspection;
    }
  } catch { /* non-fatal */ }
}

return JSON.stringify(result);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Actions-only dispatch | Dual dispatch (Docker + Actions) | Phase 19 (2026-03-07) | Docker path missing addToThread parity |
| Single AGENT.md | Dual agent files (AGENT.md + AGENT_QUICK.md) | Phase 18 (2026-03-06) | Docker image defaults incomplete |
| No container inspection | inspectJob() implemented | Phase 19 (2026-03-07) | Export exists but no consumer |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None configured |
| Config file | none -- `"test": "echo \"No tests yet\" && exit 0"` in package.json |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISP-03 | addToThread called in Docker waitAndNotify path | manual-only | N/A -- requires live Docker + LangGraph agent | N/A |
| HYDR-05 | AGENT_QUICK.md present at /defaults/ in Docker image | manual-only | `docker run --rm <image> test -f /defaults/AGENT_QUICK.md && echo OK` | N/A |
| DOCK-10 | inspectJob wired into status tool, returns container state | manual-only | N/A -- requires running Docker container | N/A |

**Justification for manual-only:** No test framework exists in this project. All three fixes require live Docker infrastructure (running containers, Docker daemon, LangGraph agent state) that cannot be unit tested without significant mocking infrastructure that is out of scope for a gap-closure phase.

### Sampling Rate
- **Per task commit:** grep/static verification (see verification patterns below)
- **Per wave merge:** Manual Docker test
- **Phase gate:** All three fixes verified via code review + one live Docker job

### Wave 0 Gaps
None -- no test infrastructure to create for a gap-closure phase with manual-only verification.

### Static Verification Commands
```bash
# DISP-03: Verify addToThread is imported and called in tools.js
grep -n "addToThread" lib/ai/tools.js

# HYDR-05: Verify COPY line exists in Dockerfile
grep "AGENT_QUICK" templates/docker/job/Dockerfile

# DOCK-10: Verify inspectJob is called in tools.js (not just imported)
grep -n "inspectJob" lib/ai/tools.js
```

## Open Questions

1. **getJobStatus response shape for Docker jobs**
   - What we know: `getJobStatus()` in `lib/tools/github.js` queries GitHub Actions workflow runs. For Docker jobs, it also checks `getJobOutcome()` from DB.
   - What's unclear: Whether the augmented response (with container inspection data) should be a separate key or merged into the existing shape.
   - Recommendation: Add as a separate `container` key to avoid breaking the existing response shape. Return it alongside the existing data.

## Sources

### Primary (HIGH confidence)
- `lib/ai/tools.js` -- direct code inspection of `waitAndNotify` function (lines 146-253)
- `api/index.js` -- direct code inspection of Actions webhook `addToThread` pattern (line 303)
- `lib/ai/index.js` -- direct code inspection of `addToThread` function (lines 288-298)
- `lib/tools/docker.js` -- direct code inspection of `inspectJob` function (lines 205-223)
- `templates/docker/job/Dockerfile` -- direct code inspection of COPY defaults block (lines 64-68)
- `templates/docker/job/entrypoint.sh` -- direct code inspection of AGENT_QUICK.md fallback chain (lines 157-165)
- `.planning/v1.4-MILESTONE-AUDIT.md` -- milestone audit identifying all three gaps

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing code
- Architecture: HIGH - all three fixes follow established patterns already in the codebase
- Pitfalls: HIGH - import chain verified, guard patterns verified from Actions path

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable -- internal codebase, no external dependency changes)
