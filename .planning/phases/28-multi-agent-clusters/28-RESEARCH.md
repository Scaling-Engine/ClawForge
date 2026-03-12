# Phase 28: Multi-Agent Clusters - Research

**Researched:** 2026-03-12
**Domain:** Multi-agent cluster orchestration, Docker container dispatch, label-based state machines, sequential agent pipelines
**Confidence:** HIGH

## Summary

Phase 28 implements a multi-agent cluster system where operators define named pipelines of sequential agents in `CLUSTER.json`. Each agent runs in its own ephemeral Docker container with a role-specific system prompt, MCP server assignments, and allowed tool set. Agents communicate via shared named volumes (inbox/outbox/reports directories). A Node.js coordinator module in the event handler drives the dispatch loop, copies outbox to next agent's inbox between dispatches, and enforces hard safety limits (5 iterations per agent, 15 per run).

The cluster system builds directly on Phase 27's MCP layer (`buildMcpConfig()`), the existing Docker dispatch infrastructure (`dispatchDockerJob()`, `docker.js`), Drizzle+SQLite DB patterns, LangGraph tool patterns (`tools.js`), and the existing settings UI patterns (`swarm-page.jsx`, `crons-page.jsx`). No new external dependencies are required — the entire stack (dockerode, Drizzle, Slack Web API, LangGraph) is already installed.

Two key pre-check sub-decisions flagged in STATE.md are resolved: (1) The cluster coordinator is a Node.js async function — NOT a Claude Code agent — for predictability and cost control. (2) Docker `container.update()` label mutation is not needed — coordinator tracks all state in the DB.

**Primary recommendation:** Implement a standalone `lib/cluster/` module (coordinator, config loader, DB helpers) that integrates with existing `lib/ai/tools.js`, `lib/actions.js`, and `lib/chat/` infrastructure rather than scattering cluster logic across existing files.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLST-01 | Operator defines cluster via `CLUSTER.json` with named groups of agents (roles, system prompts, trigger conditions, MCP server assignments) | `lib/paths.js` pattern for config file resolution; `MCP_SERVERS.json` schema as direct model |
| CLST-02 | Cluster coordinator dispatches agents sequentially; each agent runs in its own Docker container with role-specific system prompt and tool access | `dispatchDockerJob()` in `lib/tools/docker.js` is the dispatch primitive; coordinator is a Node.js async loop |
| CLST-03 | Agents communicate via shared named volume (inbox/outbox/reports); coordinator copies outbox to next agent's inbox between dispatches | `ensureVolume()` + dockerode `docker.createVolume()` for per-agent volumes; `fs.cp` via Docker exec or bind-mount copy for outbox→inbox |
| CLST-04 | Label-based state machine routes to next agent based on labels emitted in previous agent's output | Agent writes `label.txt` to `OUTBOX_DIR`; coordinator reads label post-container-exit to determine next dispatch |
| CLST-05 | Cluster runs tracked in DB with per-agent status, role, label, PR URL, and timestamps | Two new Drizzle tables: `clusterRuns` and `clusterAgentRuns`; pattern from `jobOrigins`/`jobOutcomes` |
| CLST-06 | Operator starts cluster via conversation using `create_cluster_job` LangGraph tool | New tool in `lib/ai/tools.js` following `createJobTool` pattern; calls coordinator dispatch |
| CLST-07 | Clusters triggered via manual dispatch, webhook events, or cron schedules via `executeAction()` with `cluster` action type | `lib/actions.js` `executeAction()` extended with `type: 'cluster'`; TRIGGERS.json/CRONS.json already support `type` field |
| CLST-08 | Operator views cluster definitions, running jobs, and completion history on `/clusters` management page | `swarm-page.jsx` + `crons-page.jsx` as direct UI models; Server Actions in `lib/chat/actions.js` |
| CLST-09 | Hard iteration limits (5/agent, 15/run) and cycle detection on `(agent_type, label_in)` pairs prevent infinite loops | Coordinator maintains `Map<string, number>` for cycle detection; limits checked before each dispatch |
| CLST-10 | Each cluster agent gets its own Docker volume — per-repo warm-start volumes never shared between concurrent cluster agents | New volume naming: `clawforge-cluster-{runId}-{agentIndex}` — distinct from repo-based `clawforge-{instance}-{slug}` |
| CLST-11 | All cluster agent containers use `--allowedTools` whitelist per role; zero `--dangerously-skip-permissions` in cluster code | `buildMcpConfig()` already produces `allowedToolsFragment`; role definitions include `allowedTools` array |
| CLST-12 | Cluster notifications post one Slack thread per cluster run with agent updates as thread replies | `chat.postMessage` with `thread_ts` — same Slack Web API pattern already in `tools.js`; `clusterRuns.slackThreadTs` stores parent message TS |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dockerode | Already installed | Docker container dispatch, volume management | Used in `lib/tools/docker.js` for all job containers |
| drizzle-orm | Already installed | SQLite schema + queries for cluster run tracking | All existing tables use Drizzle; zero new dependencies |
| @slack/web-api | Already installed | Slack thread-per-run notifications | Already used in `lib/ai/tools.js` for job notifications |
| @langchain/langgraph | Already installed | `create_cluster_job` tool integration with ReAct agent | All conversational tools use LangGraph |
| Node.js `fs/promises` | Built-in | Outbox→inbox file copy between agent dispatches | No library needed; plain `fs.cp()` or exec into shared volume |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Phase 27 `lib/tools/mcp-servers.js` | Internal | `buildMcpConfig()` for per-role MCP assignment | Every cluster agent dispatch — provides `--mcp-config`, `--allowedTools` |
| `lib/tools/docker.js` | Internal | `dispatchDockerJob()`, `ensureVolume()`, container lifecycle | Coordinator calls these directly |
| `lib/paths.js` | Internal | `clusterFile` path resolver | Config loading in `loadClusterConfig()` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node.js coordinator | Claude Code as orchestrator | Claude Code orchestrator is unpredictable, expensive (burns tokens deciding what to dispatch), and harder to enforce safety limits programmatically |
| Per-agent volumes (`clawforge-cluster-{runId}-{agentIndex}`) | Shared repo-based volume | Shared volumes between concurrent cluster agents cause git lock conflicts and data corruption — explicitly prohibited by CLST-10 |
| SQLite via Drizzle | External DB | Consistent with entire existing data layer; no new infra |
| Label file in outbox | stdout label parsing | File-based label is explicit, auditable, and doesn't require post-hoc stdout parsing which is fragile |

**Installation:** No new packages required. All dependencies already present.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── cluster/
│   ├── index.js              # runCluster(clusterName, initialPrompt, options) — main entry point
│   ├── config.js             # loadClusterConfig(), getCluster(name), validateClusterConfig()
│   ├── coordinator.js        # dispatchClusterAgent(), runClusterLoop()
│   └── volume.js             # clusterVolumeNameFor(runId, agentIndex), ensureClusterVolume(), copyOutboxToInbox()
├── db/
│   ├── cluster-runs.js       # createClusterRun(), updateClusterRun(), createAgentRun(), updateAgentRun(), getClusterRuns()
│   └── schema.js             # + clusterRuns table, clusterAgentRuns table (add to existing)
├── ai/
│   └── tools.js              # + createClusterJobTool (add to existing)
└── actions.js                # + 'cluster' type in executeAction() switch (add to existing)

config/
└── CLUSTER.json              # Operator-defined cluster definitions

templates/
└── docker/
    └── cluster-agent/
        └── entrypoint.sh     # Cluster-agent-specific entrypoint (role injection, inbox/outbox paths)

lib/chat/
├── actions.js                # + getClusterConfig(), getClusterRuns(), getClusterRunDetail()
└── components/
    ├── clusters-page.jsx     # New — /clusters management page
    └── app-sidebar.jsx       # Add "Clusters" nav item
```

### Pattern 1: CLUSTER.json Schema
**What:** Operator-defined cluster configuration file. Mirrors `MCP_SERVERS.json` schema style.
**When to use:** Defining any named multi-agent pipeline.
**Example:**
```json
{
  "clusters": [
    {
      "name": "code-review-pipeline",
      "description": "Three-stage code review: analysis → suggestions → summary",
      "triggers": ["manual", "webhook"],
      "roles": [
        {
          "name": "analyzer",
          "systemPrompt": "You are a code analysis agent. Read files in INBOX_DIR, analyze code quality, write findings to OUTBOX_DIR/findings.md and emit a label.",
          "allowedTools": ["Read", "Write", "Bash"],
          "mcpServers": ["github-mcp"],
          "maxIterations": 5,
          "transitions": {
            "analysis-complete": "suggester",
            "no-changes-needed": null
          }
        },
        {
          "name": "suggester",
          "systemPrompt": "You are a code improvement agent. Read findings from INBOX_DIR/findings.md, generate suggestions.",
          "allowedTools": ["Read", "Write"],
          "mcpServers": [],
          "maxIterations": 5,
          "transitions": {
            "suggestions-ready": "summarizer"
          }
        },
        {
          "name": "summarizer",
          "systemPrompt": "You are a summary agent. Synthesize all reports from INBOX_DIR into a final summary.",
          "allowedTools": ["Read", "Write"],
          "mcpServers": [],
          "maxIterations": 3,
          "transitions": {
            "complete": null
          }
        }
      ]
    }
  ]
}
```

### Pattern 2: Coordinator Dispatch Loop
**What:** Node.js async function that drives sequential agent execution with safety limits and cycle detection.
**When to use:** Every cluster run invocation.
**Example:**
```javascript
// lib/cluster/coordinator.js
async function runClusterLoop(cluster, runId, initialPrompt, options) {
  const { instanceName, slackClient, channelId, threadTs } = options;

  let currentRole = cluster.roles[0];
  let agentIndex = 0;
  let totalIterations = 0;
  const cycleMap = new Map(); // "roleName:labelIn" -> count
  const AGENT_LIMIT = 5;
  const RUN_LIMIT = 15;

  while (currentRole && totalIterations < RUN_LIMIT) {
    const cycleKey = `${currentRole.name}:${agentIndex > 0 ? lastLabel : 'initial'}`;
    const cycleCount = (cycleMap.get(cycleKey) ?? 0) + 1;
    if (cycleCount > AGENT_LIMIT) {
      await updateClusterRun(runId, { status: 'failed', failReason: `Cycle limit exceeded: ${cycleKey}` });
      break;
    }
    cycleMap.set(cycleKey, cycleCount);

    // Dispatch agent container
    const agentRunId = await createAgentRun(runId, { role: currentRole.name, agentIndex, status: 'running' });
    const volumeName = clusterVolumeNameFor(runId, agentIndex);
    await ensureClusterVolume(volumeName);

    const exitCode = await dispatchClusterAgent({
      role: currentRole,
      runId, agentRunId, agentIndex, volumeName,
      instanceName, initialPrompt: agentIndex === 0 ? initialPrompt : null,
    });

    // Read label from outbox
    const label = await readLabelFromOutbox(volumeName);
    await updateAgentRun(agentRunId, { status: exitCode === 0 ? 'complete' : 'failed', label, exitCode });

    // Copy outbox to next agent's inbox
    const nextRole = currentRole.transitions?.[label];
    if (nextRole) {
      const nextVolumeName = clusterVolumeNameFor(runId, agentIndex + 1);
      await ensureClusterVolume(nextVolumeName);
      await copyOutboxToInbox(volumeName, nextVolumeName);
    }

    // Notify Slack
    if (slackClient && channelId && threadTs) {
      await slackClient.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `Agent [${currentRole.name}] ${exitCode === 0 ? 'complete' : 'failed'} — label: \`${label ?? 'none'}\``,
      });
    }

    currentRole = nextRole ? cluster.roles.find(r => r.name === nextRole) : null;
    lastLabel = label;
    agentIndex++;
    totalIterations++;
  }

  const finalStatus = totalIterations >= RUN_LIMIT ? 'limit-exceeded' : 'complete';
  await updateClusterRun(runId, { status: finalStatus, completedAt: Date.now() });
}
```

### Pattern 3: Volume Naming for Cluster Agents
**What:** Cluster agents get volumes named by run ID and agent position — never by repo slug.
**When to use:** Every `ensureClusterVolume()` call.
**Example:**
```javascript
// lib/cluster/volume.js
function clusterVolumeNameFor(runId, agentIndex) {
  // e.g., "clawforge-cluster-abc123-0", "clawforge-cluster-abc123-1"
  return `clawforge-cluster-${runId}-${agentIndex}`;
}

async function copyOutboxToInbox(srcVolumeName, destVolumeName) {
  // Mount both volumes in a temporary alpine container, copy /outbox/* to /inbox/
  const docker = getDocker();
  const container = await docker.createContainer({
    Image: 'alpine:3',
    Cmd: ['sh', '-c', 'cp -r /src/outbox/. /dest/inbox/'],
    HostConfig: {
      Binds: [
        `${srcVolumeName}:/src`,
        `${destVolumeName}:/dest`,
      ],
      AutoRemove: true,
    },
  });
  await container.start();
  await container.wait();
}
```

### Pattern 4: Drizzle Schema Additions
**What:** Two new tables for cluster run tracking. Follow existing Drizzle sqlite-core patterns exactly.
**When to use:** `lib/db/schema.js` additions.
**Example:**
```javascript
// Add to lib/db/schema.js
export const clusterRuns = sqliteTable('cluster_runs', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),
  clusterName: text('cluster_name').notNull(),
  status: text('status').notNull().default('running'), // running|complete|failed|limit-exceeded
  initialPrompt: text('initial_prompt'),
  slackChannel: text('slack_channel'),
  slackThreadTs: text('slack_thread_ts'),
  failReason: text('fail_reason'),
  totalAgentRuns: integer('total_agent_runs').default(0),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
});

export const clusterAgentRuns = sqliteTable('cluster_agent_runs', {
  id: text('id').primaryKey(),
  clusterRunId: text('cluster_run_id').notNull().references(() => clusterRuns.id),
  role: text('role').notNull(),
  agentIndex: integer('agent_index').notNull(),
  status: text('status').notNull().default('running'), // running|complete|failed
  label: text('label'),
  exitCode: integer('exit_code'),
  prUrl: text('pr_url'),
  volumeName: text('volume_name'),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
});
```

### Pattern 5: Cluster Agent Entrypoint
**What:** Cluster agents use a modified entrypoint that reads from `INBOX_DIR`, writes to `OUTBOX_DIR`, and accepts role-specific env vars.
**When to use:** `templates/docker/cluster-agent/entrypoint.sh` — separate from the standard job entrypoint.
**Example (key differences from standard entrypoint.sh):**
```bash
# Cluster-specific env vars (set by coordinator at dispatch time)
ROLE_NAME="${ROLE_NAME:-unknown}"
INBOX_DIR="${INBOX_DIR:-/workspace/inbox}"
OUTBOX_DIR="${OUTBOX_DIR:-/workspace/outbox}"
CLUSTER_RUN_ID="${CLUSTER_RUN_ID:-}"

mkdir -p "$INBOX_DIR" "$OUTBOX_DIR" "${OUTBOX_DIR}/reports"

# Role-specific system prompt injected via ROLE_SYSTEM_PROMPT env var
# (coordinator base64-encodes it to avoid shell escaping issues)
ROLE_PROMPT=$(echo "$ROLE_SYSTEM_PROMPT_B64" | base64 -d)

# Claude Code invocation includes inbox/outbox context
claude -p "$FULL_PROMPT" \
  --allowedTools "$ALLOWED_TOOLS" \
  --mcp-config "$MCP_CONFIG_JSON" \
  --output-format stream-json \
  --verbose \
  2>&1 | node /usr/local/lib/node_modules/clawforge/log-parser.js

# After claude exits — label.txt must exist in OUTBOX_DIR
if [ ! -f "$OUTBOX_DIR/label.txt" ]; then
  echo "complete" > "$OUTBOX_DIR/label.txt"
fi
```

### Pattern 6: create_cluster_job LangGraph Tool
**What:** LangGraph tool for conversational cluster trigger — follows exact `createJobTool` pattern.
**When to use:** `lib/ai/tools.js` addition.
**Example:**
```javascript
// lib/ai/tools.js — add alongside createJobTool
const createClusterJobTool = tool(
  async ({ clusterName, prompt }, config) => {
    const { instanceName, threadId, platform, channelId, threadTs } = extractContext(config);
    const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);

    // Save origin for notification routing
    await saveJobOrigin(runId, { instanceName, threadId, platform, channelId, threadTs });

    // Fire-and-forget — coordinator runs async
    runCluster(clusterName, prompt, { runId, instanceName, channelId, threadTs }).catch(console.error);

    return `Cluster run started: **${clusterName}** (run ID: \`${runId}\`). I'll post updates here as agents complete.`;
  },
  {
    name: 'create_cluster_job',
    description: 'Start a multi-agent cluster run for complex multi-step tasks requiring sequential specialized agents.',
    schema: z.object({
      clusterName: z.string().describe('Name of the cluster from CLUSTER.json'),
      prompt: z.string().describe('Initial task description passed to the first agent'),
    }),
  }
);
```

### Pattern 7: Slack Thread-Per-Run Notification
**What:** One parent Slack message per cluster run; each agent completion posts as a thread reply.
**When to use:** At cluster run start (create parent), after each agent dispatch (reply).
**Example:**
```javascript
// At cluster run start — create parent thread message
const parentMsg = await slackClient.chat.postMessage({
  channel: channelId,
  text: `Cluster run started: *${clusterName}*\nRun ID: \`${runId}\``,
});
const threadTs = parentMsg.ts;
await updateClusterRun(runId, { slackChannel: channelId, slackThreadTs: threadTs });

// After each agent — reply in thread
await slackClient.chat.postMessage({
  channel: channelId,
  thread_ts: threadTs,
  text: `[${agentIndex + 1}/${cluster.roles.length}] Agent \`${role.name}\` complete — label: \`${label}\``,
});

// At cluster completion — final reply
await slackClient.chat.postMessage({
  channel: channelId,
  thread_ts: threadTs,
  text: `Cluster *${clusterName}* complete after ${totalIterations} agent runs.`,
});
```

### Anti-Patterns to Avoid
- **Claude Code as cluster coordinator:** Using `claude -p` to decide which agent to dispatch next adds token cost, unpredictability, and makes safety limits difficult to enforce. The coordinator must be pure Node.js.
- **Shared repo-based volumes for cluster agents:** `clawforge-{instance}-{slug}` volumes are warm-start caches for solo jobs. Cluster agents must use `clawforge-cluster-{runId}-{agentIndex}` volumes. Never reuse the repo volume for cluster agents.
- **Inline label parsing from stdout:** Don't parse Claude's stdout looking for label keywords. Require agents to write `label.txt` to `OUTBOX_DIR` explicitly. Stdout parsing is fragile against format changes.
- **Container.update() for state tracking:** Don't rely on mutating Docker container labels to track cluster state. All state lives in the `clusterRuns` / `clusterAgentRuns` DB tables.
- **`--dangerously-skip-permissions` anywhere in cluster code:** Every cluster agent container must use `--allowedTools` per CLST-11. This is a hard constraint, not a soft preference.
- **Single volume for all agents in a run:** Even within a single run, agents at different positions must have separate volumes. The inbox/outbox copy between agents is the communication mechanism.
- **Scatter cluster logic across existing files:** Don't add cluster dispatch logic to `lib/tools/create-job.js` or `lib/ai/tools.js`. The `lib/cluster/` module owns coordination; `tools.js` only adds a thin LangGraph wrapper.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Docker container dispatch | Custom Docker API calls | `dispatchDockerJob()` in `lib/tools/docker.js` | Already handles env injection, volume binding, network assignment, label tagging, container lifecycle |
| Volume creation and management | `docker volume create` shell calls | `ensureVolume()` in `lib/tools/docker.js` | Idempotent, handles errors, uses existing dockerode instance |
| MCP config per agent | Manual `--mcp-config` JSON building | `buildMcpConfig(role.mcpServers)` from Phase 27 | Already filters by server name, resolves template vars, produces `allowedToolsFragment` |
| Slack thread replies | Custom Slack API wrapper | `slackClient.chat.postMessage({ thread_ts })` directly | Slack Web API `thread_ts` param is the complete solution; no abstraction needed |
| Cluster config path resolution | Hardcoded path strings | Add `clusterFile` to `lib/paths.js` | Consistent with `mcpServersFile`, `cronsFile`, `triggersFile` pattern |
| LangGraph tool schema | Custom tool registry | `tool()` from `@langchain/core/tools` + zod schema | Exact pattern used by all existing tools in `tools.js` |
| DB CRUD for cluster runs | Raw SQL | Drizzle ORM with `eq()`, `desc()` | Consistent with all existing DB helpers |

**Key insight:** Cluster orchestration reuses ~80% of existing infrastructure. The novel pieces are: the coordinator loop logic, the volume naming convention for cluster agents, and the inbox/outbox copy step. Everything else maps directly to existing patterns.

## Common Pitfalls

### Pitfall 1: Volume Naming Collision Between Concurrent Cluster Runs
**What goes wrong:** Two concurrent cluster runs for the same repo both use the repo-slug-based volume name, causing git lock conflicts and data corruption between agents.
**Why it happens:** Developer copies `volumeNameFor(instanceName, repoUrl)` from `docker.js` for cluster agents.
**How to avoid:** Cluster agents ALWAYS use `clawforge-cluster-{runId}-{agentIndex}`. The `runId` is a UUID generated at run creation time, ensuring no collisions even with concurrent runs of the same cluster on the same repo.
**Warning signs:** `git lock` errors in cluster agent logs; agents reading each other's outbox files.

### Pitfall 2: Missing Label File Causes Infinite Loop
**What goes wrong:** Agent Claude Code process exits without writing `label.txt` to `OUTBOX_DIR`. Coordinator reads undefined label, can't route, silently fails or throws.
**Why it happens:** Claude Code doesn't know it needs to emit a label, or writes to wrong path.
**How to avoid:** (1) Entrypoint writes a default `"complete"` label if `label.txt` is missing post-exit. (2) System prompt explicitly instructs agent to write label. (3) Coordinator treats missing/empty label as `"complete"` and logs a warning.
**Warning signs:** Cluster run hangs after agent container exits; no label in `clusterAgentRuns` row.

### Pitfall 3: Cycle Detection Map Key Collision
**What goes wrong:** Two different agents with the same role name at different positions in a run share a cycle count, causing premature termination.
**Why it happens:** Cycle key uses only `"roleName:labelIn"` without position index. If a pipeline has two `"analyzer"` roles, their cycles are conflated.
**How to avoid:** Include `agentIndex` in cycle key: `"${agentIndex}:${roleName}:${labelIn}"`. Or use separate per-role Maps keyed by agentIndex.
**Warning signs:** Runs failing after fewer iterations than expected; cycle limit errors on first occurrence of a role.

### Pitfall 4: Base64 Encoding System Prompt Passed Through Docker Env
**What goes wrong:** Role system prompts with quotes, newlines, or special characters cause shell parsing errors when passed as env vars to Docker containers.
**Why it happens:** Direct string assignment to Docker env vars without encoding.
**How to avoid:** Coordinator base64-encodes the system prompt: `Buffer.from(role.systemPrompt).toString('base64')` → `ROLE_SYSTEM_PROMPT_B64`. Entrypoint decodes with `base64 -d`. This is the same pattern used in Phase 27 for `MCP_CONFIG_JSON`.
**Warning signs:** Container fails immediately with shell parse error; truncated system prompt in agent logs.

### Pitfall 5: executeAction() 'cluster' Type Running Synchronously
**What goes wrong:** Cron or trigger fires `executeAction({ type: 'cluster', ... })` which blocks the event loop waiting for the full cluster run (potentially minutes).
**Why it happens:** Implementing cluster dispatch as an `await runCluster(...)` in `executeAction()`.
**How to avoid:** `executeAction()` for cluster type fires-and-forgets: `runCluster(...).catch(console.error)` then returns immediately. Cluster coordinator posts its own Slack updates via thread. This matches the existing job dispatch pattern.
**Warning signs:** Cron worker times out; webhook responses delay by minutes.

### Pitfall 6: Drizzle Schema Not Exported from Schema Barrel
**What goes wrong:** New `clusterRuns` and `clusterAgentRuns` tables added to `schema.js` but not picked up by Drizzle migrations or the DB connection.
**Why it happens:** Forgetting to add the new tables to the Drizzle `db` instance or missing the schema export.
**How to avoid:** After adding tables to `schema.js`, verify `lib/db/index.js` imports them and passes them to `drizzle()`. Run the app and verify tables are created on first access.
**Warning signs:** `no such table: cluster_runs` error at runtime; Drizzle type errors on new table references.

### Pitfall 7: Outbox Copy Using Host Path Instead of Volume Mount
**What goes wrong:** `copyOutboxToInbox()` tries to copy files using host filesystem paths (`/var/lib/docker/volumes/...`) which requires root access and is non-portable.
**Why it happens:** Attempting direct host filesystem manipulation instead of the Docker volume API.
**How to avoid:** Use a temporary Alpine container with both volumes bind-mounted. The `cp -r /src/outbox/. /dest/inbox/` command runs inside Docker where volume paths are predictable. Use `AutoRemove: true` so the helper container cleans up immediately.
**Warning signs:** `ENOENT` or `EACCES` errors during inbox copy step; files missing in next agent's inbox.

## Code Examples

Verified patterns from existing codebase:

### Existing Volume Name Pattern (lib/tools/docker.js)
```javascript
// Source: lib/tools/docker.js
export function volumeNameFor(instanceName, repoUrl) {
  const slug = repoUrl.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(-20);
  return `clawforge-${instanceName}-${slug}`;
}

// Cluster agent equivalent (NEW — lib/cluster/volume.js)
export function clusterVolumeNameFor(runId, agentIndex) {
  return `clawforge-cluster-${runId}-${agentIndex}`;
}
```

### Existing Container Dispatch Pattern (lib/tools/docker.js)
```javascript
// Source: lib/tools/docker.js — dispatchDockerJob() signature
export async function dispatchDockerJob({
  instanceName, repoUrl, jobId, jobBranch,
  envVars, volumeName, networkName,
}) { /* ... */ }

// Cluster agent dispatch wraps this with role-specific env vars
const agentEnvVars = {
  ...baseEnvVars,
  ROLE_NAME: role.name,
  INBOX_DIR: '/workspace/inbox',
  OUTBOX_DIR: '/workspace/outbox',
  CLUSTER_RUN_ID: runId,
  ROLE_SYSTEM_PROMPT_B64: Buffer.from(role.systemPrompt).toString('base64'),
  ALLOWED_TOOLS: role.allowedTools.join(','),
  MCP_CONFIG_JSON: mcpConfig.configJson,
};
```

### Existing Slack Thread Reply Pattern (lib/ai/tools.js)
```javascript
// Source: lib/ai/tools.js — waitAndNotify()
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
await slackClient.chat.postMessage({
  channel: channelId,
  thread_ts: threadTs,  // <-- this is the key for thread replies
  text: message,
});
```

### Existing Drizzle Query Pattern (lib/db/workspaces.js)
```javascript
// Source: lib/db/workspaces.js
import { db } from './index.js';
import { codeWorkspaces } from './schema.js';
import { eq, desc } from 'drizzle-orm';

export async function listWorkspaces(instanceName) {
  return db.select().from(codeWorkspaces)
    .where(eq(codeWorkspaces.instanceName, instanceName))
    .orderBy(desc(codeWorkspaces.createdAt));
}
```

### Existing Server Action Pattern (lib/chat/actions.js)
```javascript
// Source: lib/chat/actions.js
'use server';
import { requireAuth } from '../auth/index.js';

export async function getSwarmConfig() {
  await requireAuth();
  // ... read config file, return data
}

// Cluster equivalent:
export async function getClusterConfig() {
  await requireAuth();
  const { loadClusterConfig } = await import('../cluster/config.js');
  return loadClusterConfig();
}
```

### Existing UI Page Pattern (lib/chat/components/swarm-page.jsx)
```jsx
// Source: lib/chat/components/swarm-page.jsx — pattern for clusters-page.jsx
'use client';
import { useEffect, useState } from 'react';
import { getSwarmConfig } from '../actions.js';

export function SwarmPage() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    getSwarmConfig().then(setConfig);
  }, []);
  // ... render
}
```

### Existing paths.js Pattern (lib/paths.js)
```javascript
// Source: lib/paths.js — add clusterFile alongside existing exports
export const mcpServersFile = path.join(PROJECT_ROOT, 'config', 'MCP_SERVERS.json');
export const cronsFile = path.join(PROJECT_ROOT, 'config', 'CRONS.json');
export const triggersFile = path.join(PROJECT_ROOT, 'config', 'TRIGGERS.json');
// NEW:
export const clusterFile = path.join(PROJECT_ROOT, 'config', 'CLUSTER.json');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude Code as meta-orchestrator | Node.js coordinator loop | This phase (design decision) | Deterministic routing, enforceable safety limits, no token waste on orchestration decisions |
| Shared warm-start volumes | Per-agent-per-run volumes | This phase (CLST-10 requirement) | Eliminates git lock conflicts in concurrent runs; each agent starts fresh |
| Single Slack message per notification | Thread-per-run with reply-per-agent | This phase (CLST-12 requirement) | Reduces channel noise; all cluster updates in one collapsible thread |
| Labels in stdout | Labels in `label.txt` file | This phase (design decision) | Explicit, auditable, not sensitive to Claude output format changes |

**Deprecated/outdated:**
- Using `volumeNameFor(instanceName, repoUrl)` for cluster agents: Replaced by `clusterVolumeNameFor(runId, agentIndex)` — the repo-based naming is for solo job warm-starts only.

## Open Questions

1. **Cluster agent Dockerfile — same image as job containers or separate?**
   - What we know: Job containers use `templates/docker/job/Dockerfile` (Node 22 + Claude Code CLI + GSD + Chrome deps). Cluster agents have the same runtime requirements but different entrypoint logic.
   - What's unclear: Whether to use a separate `templates/docker/cluster-agent/Dockerfile` with a different `ENTRYPOINT`, or pass the cluster entrypoint path as a Docker container cmd override.
   - Recommendation: Use a separate entrypoint script (`templates/docker/cluster-agent/entrypoint.sh`) but the same base Dockerfile (or a minimal extension). This avoids maintaining two divergent Docker images. Override via `docker.createContainer({ Cmd: ['/usr/local/bin/cluster-entrypoint.sh'] })`.

2. **How does the cluster coordinator handle a cluster agent that creates a PR?**
   - What we know: Standard job containers create PRs via the job entrypoint. Cluster agents might also create PRs (e.g., a "committer" agent role).
   - What's unclear: Should PR URLs be tracked in `clusterAgentRuns.prUrl`? How does the coordinator detect if a PR was created?
   - Recommendation: Make PR creation optional per role (CLUSTER.json `"createPr": true/false`). If enabled, coordinator queries GitHub API for PRs on the job branch post-container-exit. Track in `clusterAgentRuns.prUrl`.

3. **Volume cleanup after cluster run completes**
   - What we know: Per-agent volumes (`clawforge-cluster-{runId}-{agentIndex}`) accumulate. There's no automatic Docker volume GC.
   - What's unclear: When and how to clean up cluster volumes. Immediately after run? After N days?
   - Recommendation: Coordinator deletes all cluster volumes after a successful run completes. On failure, retain volumes for debugging (op can manually remove). Add a note to operator docs about manual cleanup of failed run volumes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test infrastructure in codebase |
| Config file | none — see Wave 0 |
| Quick run command | `node --test lib/cluster/config.test.js` (if using Node built-in test runner) |
| Full suite command | `node --test lib/cluster/**/*.test.js` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLST-01 | `loadClusterConfig()` parses valid CLUSTER.json | unit | `node --test lib/cluster/config.test.js::loadClusterConfig` | ❌ Wave 0 |
| CLST-01 | `validateClusterConfig()` rejects missing required fields | unit | `node --test lib/cluster/config.test.js::validateClusterConfig` | ❌ Wave 0 |
| CLST-02 | Coordinator dispatches agents in sequence | integration | Manual — requires Docker | manual-only: requires live Docker daemon |
| CLST-04 | Label routing resolves correct next role | unit | `node --test lib/cluster/coordinator.test.js::labelRouting` | ❌ Wave 0 |
| CLST-09 | Cycle detection triggers at limit | unit | `node --test lib/cluster/coordinator.test.js::cycleLimits` | ❌ Wave 0 |
| CLST-10 | `clusterVolumeNameFor()` produces unique names per runId+agentIndex | unit | `node --test lib/cluster/volume.test.js::volumeNaming` | ❌ Wave 0 |
| CLST-05 | DB helpers create/update/query cluster run rows | unit | `node --test lib/db/cluster-runs.test.js` | ❌ Wave 0 |
| CLST-03 | `copyOutboxToInbox()` copies files between volumes | integration | Manual — requires Docker | manual-only: requires live Docker daemon |
| CLST-07 | `executeAction({ type: 'cluster' })` fires without awaiting full run | unit | `node --test lib/actions.test.js::clusterType` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test lib/cluster/config.test.js lib/cluster/coordinator.test.js`
- **Per wave merge:** `node --test lib/cluster/**/*.test.js lib/db/cluster-runs.test.js lib/actions.test.js`
- **Phase gate:** All unit tests green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `lib/cluster/config.test.js` — covers CLST-01 config parsing and validation
- [ ] `lib/cluster/coordinator.test.js` — covers CLST-04 label routing, CLST-09 cycle detection
- [ ] `lib/cluster/volume.test.js` — covers CLST-10 volume naming uniqueness
- [ ] `lib/db/cluster-runs.test.js` — covers CLST-05 DB CRUD operations
- [ ] `lib/actions.test.js` — covers CLST-07 fire-and-forget dispatch
- [ ] Framework install: `node --test` is built into Node 22 (already in job Dockerfile) — no install needed

## Sources

### Primary (HIGH confidence)
- `lib/tools/docker.js` — `dispatchDockerJob()`, `volumeNameFor()`, `ensureVolume()`, container lifecycle patterns
- `lib/ai/tools.js` — `createJobTool`, `waitAndNotify()`, Slack thread reply pattern, LangGraph tool schema
- `lib/db/schema.js` — Drizzle sqlite-core table patterns, primary key and timestamp conventions
- `lib/db/workspaces.js` — DB helper module pattern (createX/updateX/listX)
- `lib/chat/components/swarm-page.jsx` — UI page pattern for cluster management page
- `lib/chat/components/crons-page.jsx` — Config display pattern (expandable cards per definition)
- `lib/chat/actions.js` — Server Action pattern with `requireAuth()`
- `lib/paths.js` — Config file path resolver pattern
- `lib/actions.js` — `executeAction()` switch pattern for new action types
- `.planning/REQUIREMENTS.md` — CLST-01 through CLST-12 authoritative definitions
- `.planning/STATE.md` — Pre-check sub-decisions resolved, v2.0 research decisions (volume isolation, safety limits)

### Secondary (MEDIUM confidence)
- `.planning/phases/27-mcp-tool-layer/27-RESEARCH.md` — `buildMcpConfig()` API and MCP integration patterns (Phase 27 output, highly reliable)
- `templates/docker/job/entrypoint.sh` — Job entrypoint structure that cluster entrypoint adapts from

### Tertiary (LOW confidence)
- None — all findings based on direct codebase inspection and existing patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use; no new external dependencies
- Architecture: HIGH — all patterns derived from existing working code in the same codebase
- Pitfalls: HIGH — most pitfalls are based on direct analysis of existing code patterns and the specific CLST requirements
- Validation: MEDIUM — Node built-in test runner is available but no test files exist yet; test structure is speculative

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable — no external dependencies changing; all internal patterns)
