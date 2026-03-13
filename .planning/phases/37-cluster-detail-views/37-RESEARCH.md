# Phase 37: Cluster Detail Views - Research

**Researched:** 2026-03-13
**Domain:** Cluster run detail UI, live agent log streaming, Next.js dynamic routes
**Confidence:** HIGH

## Summary

Phase 37 adds drill-down views for individual cluster runs. The existing `/clusters` page (`clusters-page.jsx`) shows a list of cluster definitions and run history with expandable agent rows, but all data is inline -- there are no dedicated detail pages. This phase creates four new views: a run overview with agent timeline, live console streaming for the active agent, historical logs for completed agents, and a role-specific detail view.

The critical technical finding is that **cluster agents do NOT currently have log streaming**. Regular jobs call `streamContainerLogs()` in `lib/ai/tools.js` to attach Docker log streams via `streamManager`, but the cluster coordinator (`lib/cluster/coordinator.js`) dispatches agents via `dispatchDockerJob` + `waitForContainer` without attaching any log stream. This means CLSTUI-02 (live console) requires wiring `streamContainerLogs()` into the coordinator loop, using the existing `streamManager` + SSE infrastructure. The plumbing is all there -- it just needs to be connected for cluster agents.

The DB schema is complete: `cluster_runs` and `cluster_agent_runs` tables (Drizzle ORM/SQLite) store all the data needed for overview, timeline, and status badges. The `getClusterRunDetail()` function already returns a run with its `agentRuns` array, ordered by `agentIndex`. The existing `JobStreamViewer` component provides a proven pattern for consuming SSE streams in the browser. New cluster detail components should follow this same pattern.

**Primary recommendation:** Wire `streamContainerLogs()` into the coordinator loop for each dispatched agent (using `agentRunId` as the stream key), create four new page components in `lib/chat/components/`, add corresponding Server Actions in `lib/chat/actions.js`, and scaffold thin route files in `templates/app/clusters/[id]/`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLSTUI-01 | `/cluster/[id]` shows cluster run overview with agent timeline, status badges, and PR links | `getClusterRunDetail()` already returns full run + agent runs with status, label, exitCode, prUrl, createdAt, completedAt; existing `StatusBadge` component in clusters-page.jsx; existing `AgentRunRow` component shows pattern |
| CLSTUI-02 | `/cluster/[id]/console` streams live output from the currently-executing cluster agent | `streamContainerLogs()` + `streamManager` + SSE route pattern from `lib/jobs/stream-api.js` all exist; need to wire into coordinator.js; `JobStreamViewer` component is the proven consumer pattern |
| CLSTUI-03 | `/cluster/[id]/logs` shows historical log output for completed agents in the run | `collectLogs()` in docker.js retrieves logs from stopped containers; need new Server Action + DB field or volume-based log retrieval; containers have `AutoRemove: false` |
| CLSTUI-04 | `/cluster/[id]/role/[roleId]` shows role-specific view with agent config, label history, and outputs | Cluster config from `getCluster()` provides role definitions (systemPrompt, allowedTools, mcpServers, transitions); agent runs filtered by role name from `getClusterRunDetail()` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React (client components) | >=19.0.0 | UI rendering | Peer dep, already in use |
| Next.js App Router | >=15.5.12 | Dynamic routes `/clusters/[id]/*` | Peer dep, existing pattern |
| Drizzle ORM | ^0.44.0 | SQLite queries for cluster/agent run data | Already used for all DB access |
| dockerode | ^4.0.9 | Container log retrieval + streaming | Already used in `lib/tools/docker.js` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `streamManager` (internal) | n/a | In-memory pub/sub for SSE events | Live console streaming (CLSTUI-02) |
| `parseLineToSemanticEvent` (internal) | n/a | Docker log line -> semantic events | Log parsing for both live and historical views |
| `scrubSecrets` (internal) | n/a | Redact sensitive values from logs | All log display (defense in depth) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SSE via streamManager | WebSocket | SSE is simpler, already proven in codebase, unidirectional is sufficient |
| In-memory log buffering | Persisted logs in DB | DB storage adds schema changes; logs are available from Docker containers (AutoRemove: false) until cleanup |
| Separate SSE route per cluster | Reuse existing `/api/jobs/stream/[jobId]` | Reusing existing route is ideal -- agent runs already get unique IDs that work as stream keys |

**Installation:**
```bash
# No new dependencies needed -- all infrastructure exists
```

## Architecture Patterns

### New Route Structure
```
templates/app/clusters/
  [id]/
    page.js            # Overview (CLSTUI-01)
    console/
      page.js          # Live console (CLSTUI-02)
    logs/
      page.js          # Historical logs (CLSTUI-03)
    role/
      [roleId]/
        page.js        # Role detail (CLSTUI-04)
  layout.js            # Existing (pass-through)
  page.js              # Existing list page
```

### New Components in lib/chat/components/
```
lib/chat/components/
  cluster-detail-page.jsx      # CLSTUI-01: Run overview + agent timeline
  cluster-console-page.jsx     # CLSTUI-02: Live SSE console viewer
  cluster-logs-page.jsx        # CLSTUI-03: Historical log viewer
  cluster-role-page.jsx        # CLSTUI-04: Role detail view
```

### Pattern 1: Page Component Convention
**What:** Each page is a client component receiving `session` and route params, using `PageLayout` wrapper.
**When to use:** All new cluster detail pages.
**Example:**
```javascript
// Source: templates/app/clusters/page.js (existing pattern)
import { auth } from '../../lib/auth/index.js';
import { ClusterDetailPage } from '../../lib/chat/components/index.js';

export default async function ClusterDetailRoute({ params }) {
  const session = await auth();
  const { id } = await params;
  return <ClusterDetailPage session={session} runId={id} />;
}
```

### Pattern 2: Server Action Data Fetching
**What:** Client components call Server Actions (not API routes) for data. Actions enforce auth via `requireAuth()`.
**When to use:** All data fetching from browser UI (per `api/CLAUDE.md` rules).
**Example:**
```javascript
// Source: lib/chat/actions.js (existing pattern)
export async function getClusterRunDetail(runId) {
  await requireAuth();
  const { getClusterRunDetail: fetchDetail } = await import('../db/cluster-runs.js');
  return fetchDetail(runId);
}
```

### Pattern 3: SSE Stream Consumer (for Live Console)
**What:** `EventSource` connects to `/api/jobs/stream/[agentRunId]`, renders events in real-time.
**When to use:** CLSTUI-02 live console view.
**Example:**
```javascript
// Source: lib/chat/components/job-stream-viewer.jsx (existing pattern)
useEffect(() => {
  const es = new EventSource(`/api/jobs/stream/${activeAgentRunId}`);
  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    // Handle event types: file-change, bash-output, decision, progress, complete, error
  };
  return () => es.close();
}, [activeAgentRunId]);
```

### Pattern 4: Tab Navigation Within Detail View
**What:** Sub-navigation between overview/console/logs/role views for a cluster run.
**When to use:** All cluster detail pages share a tab bar.
**Example:**
```javascript
// Tab bar component for cluster detail sub-navigation
function ClusterDetailTabs({ runId, activeTab }) {
  const tabs = [
    { key: 'overview', label: 'Overview', href: `/clusters/${runId}` },
    { key: 'console', label: 'Console', href: `/clusters/${runId}/console` },
    { key: 'logs', label: 'Logs', href: `/clusters/${runId}/logs` },
  ];
  // Render tab buttons with active state styling
}
```

### Anti-Patterns to Avoid
- **Fetching from `/api` routes in browser UI:** All data comes from Server Actions (`'use server'` + `requireAuth()`), not `/api` routes. The `/api` routes are for external callers only (see `api/CLAUDE.md`).
- **Building a new SSE infrastructure for cluster streaming:** The `streamManager` + `/api/jobs/stream/[jobId]` route already handles everything. Just wire `streamContainerLogs` into the coordinator and use `agentRunId` as the stream key.
- **Adding cluster components to templates/app:** Components with business logic belong in `lib/chat/components/` (the NPM package). Templates only contain thin route wiring files (see `templates/CLAUDE.md`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Live log streaming | Custom WebSocket or polling | `streamManager` + `streamContainerLogs` + existing SSE route | Already proven for job streaming; handles cleanup, abort, secret scrubbing |
| Docker log retrieval | Raw dockerode API calls | `collectLogs()` from `lib/tools/docker.js` | Handles Buffer vs stream return types, multiplexed stdout/stderr |
| Log line parsing | Regex-based custom parser | `parseLineToSemanticEvent()` from `lib/tools/log-parser.js` | Handles both JSONL and plain text, includes secret scrubbing |
| Status badges | New badge component | Existing `StatusBadge` from `clusters-page.jsx` | Already styled for running/complete/failed/limit-exceeded states |
| Auth in SSE route | Custom auth check | `auth()` from `lib/auth/index.js` | Existing pattern in `stream-api.js` |

**Key insight:** The entire streaming pipeline exists for regular jobs. The only missing piece is calling `streamContainerLogs(container, agentRunId, signal)` inside the coordinator's dispatch loop, right after `dispatchDockerJob` and before `waitForContainer`.

## Common Pitfalls

### Pitfall 1: Coordinator Blocks on streamContainerLogs
**What goes wrong:** `streamContainerLogs` returns a promise. If awaited before `waitForContainer`, the stream never ends because the container is still running.
**Why it happens:** The function attaches to a live `follow: true` log stream.
**How to avoid:** Call `streamContainerLogs` fire-and-forget (`.catch()` only), then `await waitForContainer`. The stream auto-completes when the container exits. This is exactly the pattern used in `lib/ai/tools.js:111`.
**Warning signs:** Console hangs after agent dispatch.

### Pitfall 2: Container Auto-Removed Before Log Retrieval
**What goes wrong:** Historical logs (CLSTUI-03) fail because the container is gone.
**Why it happens:** The coordinator currently sets `AutoRemove: false` via `dispatchDockerJob` defaults, but completed cluster runs call volume cleanup. The containers themselves should persist until logs are retrieved.
**How to avoid:** For historical logs, either (a) persist logs to the DB when the agent completes, or (b) read logs from the container before removal in `waitForContainer`. Option (a) is more reliable.
**Warning signs:** "Container not found" errors when viewing logs of old runs.

### Pitfall 3: Stream Key Collisions
**What goes wrong:** Multiple SSE consumers get mixed events.
**Why it happens:** Using `runId` as stream key when multiple agents run sequentially.
**How to avoid:** Use `agentRunId` (UUID) as the stream key, not the cluster `runId`. Each agent dispatch gets its own unique stream.
**Warning signs:** Console view shows output from wrong agent.

### Pitfall 4: No Active Agent to Stream
**What goes wrong:** Console page shows nothing when no agent is currently running.
**Why it happens:** Cluster may be between agents, or already completed.
**How to avoid:** Query the DB for the current `running` agent run. If none, show "No agent currently executing" message with last completed agent info. Auto-poll or use the cluster run status to determine state.
**Warning signs:** Blank console page with spinner that never resolves.

### Pitfall 5: Volume Cleanup Destroys Log Data
**What goes wrong:** After successful cluster completion, volumes are removed (`coordinator.js:383-395`), destroying any data that logs might reference.
**Why it happens:** Cleanup runs immediately on completion.
**How to avoid:** Persist agent logs to DB (new `logs` text column on `cluster_agent_runs`) before cleanup. Or read from container logs rather than volumes.
**Warning signs:** Historical logs unavailable for successful runs.

## Code Examples

### Wiring streamContainerLogs into Coordinator
```javascript
// In coordinator.js dispatchClusterAgent(), after container.start()
// Source: pattern from lib/ai/tools.js:110-113
import { streamContainerLogs } from '../tools/docker.js';

// Inside dispatchClusterAgent, after getting container from dispatchDockerJob:
const streamAbort = new AbortController();
streamContainerLogs(container, agentRunId, streamAbort.signal).catch((err) => {
  console.warn(`Cluster stream attach failed for agent ${agentRunId.slice(0, 8)}:`, err.message);
});

const result = await waitForContainer(container);
return result.StatusCode;
```

### New Server Action: Get Agent Logs
```javascript
// In lib/chat/actions.js
export async function getAgentRunLogs(agentRunId) {
  await requireAuth();
  const { getAgentRunById } = await import('../db/cluster-runs.js');
  const agentRun = await getAgentRunById(agentRunId);
  if (!agentRun) return null;
  // Return persisted logs from DB
  return { ...agentRun, logs: agentRun.logs || null };
}
```

### New Server Action: Get Active Agent for Console
```javascript
// In lib/chat/actions.js
export async function getActiveClusterAgent(runId) {
  await requireAuth();
  const { getClusterRunDetail: fetchDetail } = await import('../db/cluster-runs.js');
  const detail = await fetchDetail(runId);
  if (!detail) return null;
  const active = detail.agentRuns.find(a => a.status === 'running');
  return { run: detail, activeAgent: active || null };
}
```

### Agent Timeline Component Pattern
```javascript
// Visual timeline of agent execution
function AgentTimeline({ agentRuns }) {
  return (
    <div className="flex flex-col gap-0">
      {agentRuns.map((agent, i) => (
        <div key={agent.id} className="flex items-start gap-3 relative">
          {/* Vertical connector line */}
          {i < agentRuns.length - 1 && (
            <div className="absolute left-3 top-6 w-0.5 h-full bg-border" />
          )}
          {/* Status dot */}
          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
            agent.status === 'running' ? 'bg-yellow-500/20 text-yellow-500' :
            agent.status === 'completed' ? 'bg-green-500/20 text-green-500' :
            'bg-red-500/20 text-red-500'
          }`}>
            {agent.agentIndex + 1}
          </div>
          {/* Agent info */}
          <div className="flex-1 pb-4">
            <p className="text-sm font-medium">{agent.role}</p>
            <p className="text-xs text-muted-foreground">
              label: {agent.label || '---'} | exit: {agent.exitCode ?? '---'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Data Model Reference

### cluster_runs table
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| instanceName | text | e.g. 'noah' |
| clusterName | text | From CLUSTER.json |
| status | text | 'running' / 'completed' / 'failed' |
| initialPrompt | text | Trigger prompt |
| slackChannel | text | Nullable |
| slackThreadTs | text | Nullable |
| failReason | text | Nullable |
| totalAgentRuns | integer | Count of dispatched agents |
| createdAt | integer | Unix ms |
| completedAt | integer | Nullable, Unix ms |

### cluster_agent_runs table
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| clusterRunId | text FK | References cluster_runs.id |
| role | text | Role name from cluster definition |
| agentIndex | integer | Zero-based sequential index |
| status | text | 'running' / 'completed' / 'failed' |
| label | text | Output label from outbox/label.txt |
| exitCode | integer | Container exit code |
| prUrl | text | Nullable -- PR URL if created |
| volumeName | text | Docker volume name |
| createdAt | integer | Unix ms |
| completedAt | integer | Nullable, Unix ms |

### Schema Gap: No logs column
The `cluster_agent_runs` table lacks a `logs` column for persisted log output. For CLSTUI-03, either:
1. **Add `logs TEXT` column** via Drizzle migration -- store sanitized log output when agent completes
2. **Read from Docker container** at view time -- works only if container still exists (AutoRemove: false)

Recommendation: Add `logs` column. Containers may be cleaned up, but DB persists. Store the last ~100 semantic events (JSON array) rather than raw text to keep size manageable.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline expandable rows only | Dedicated detail pages | Phase 37 | Much richer cluster observability |
| No live streaming for clusters | SSE via streamManager | Phase 37 | Operators can watch cluster agents in real-time |
| Logs lost on volume cleanup | Persisted to DB | Phase 37 | Historical audit trail for all agent runs |

## Open Questions

1. **PR URL population**
   - What we know: `prUrl` column exists on `cluster_agent_runs` but is never populated in the current coordinator loop
   - What's unclear: Whether cluster agents create PRs (they may commit directly) and how to detect the PR URL
   - Recommendation: Skip PR link display for now; show when available, show "---" when null. PR creation may be a separate concern.

2. **Log retention policy**
   - What we know: Volumes are cleaned up after successful runs; containers have AutoRemove: false
   - What's unclear: How long should persisted logs be retained? How large can they get?
   - Recommendation: Store last 200 semantic events per agent (JSON array, ~50KB max). Add a TTL-based cleanup in a future phase.

3. **Console auto-switching between agents**
   - What we know: Agents run sequentially; only one is active at a time
   - What's unclear: Should the console view automatically switch to the next agent when the current one completes?
   - Recommendation: Yes, auto-switch. Poll for active agent every 3-5 seconds. When current stream ends, check for new running agent.

## Sources

### Primary (HIGH confidence)
- `lib/cluster/coordinator.js` -- Full coordinator loop, agent dispatch, volume management
- `lib/cluster/index.js` -- runCluster entry point, Slack integration
- `lib/db/cluster-runs.js` -- All CRUD operations for cluster/agent runs
- `lib/db/schema.js` -- Drizzle schema for cluster_runs and cluster_agent_runs tables
- `lib/tools/stream-manager.js` -- In-memory pub/sub for SSE events
- `lib/tools/docker.js` -- streamContainerLogs, collectLogs, dispatchDockerJob
- `lib/jobs/stream-api.js` -- SSE route handler pattern
- `lib/chat/components/job-stream-viewer.jsx` -- Proven SSE consumer pattern
- `lib/chat/components/clusters-page.jsx` -- Existing cluster list UI with StatusBadge, AgentRunRow
- `lib/chat/actions.js` -- Server Action patterns for cluster data
- `api/CLAUDE.md` -- Rules: browser UI uses Server Actions, not API routes
- `templates/CLAUDE.md` -- Rules: templates are thin wiring only

### Secondary (MEDIUM confidence)
- `templates/app/clusters/page.js` -- Existing route wiring pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all infrastructure exists in codebase, no new deps needed
- Architecture: HIGH - follows established patterns (PageLayout, Server Actions, SSE streaming)
- Pitfalls: HIGH - identified from direct code analysis of coordinator vs job streaming gap
- Data model: HIGH - schema inspected directly, gap (no logs column) clearly identified

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- internal codebase patterns)
