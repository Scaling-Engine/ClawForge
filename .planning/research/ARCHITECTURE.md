# Architecture Patterns: v2.0 Web UI, Clusters, Headless Streaming, MCP Tool Layer

**Domain:** Multi-channel AI agent platform with Docker job execution and persistent workspaces
**Researched:** 2026-03-12
**Confidence:** HIGH — all cluster/streaming/MCP patterns verified against upstream PopeBot v1.2.73 source code via `git show upstream/main:...`

## System Overview

### Current System (v1.5 Baseline)

```
User
 |
 +-- Slack -------> slack.js (grammy) --+
 +-- Telegram ----> telegram.js --------+
 +-- Web Chat ----> chat-page.jsx ------+
                                        |
                                        v
                         Event Handler (Next.js 15)
                          lib/ai/agent.js (LangGraph ReAct)
                          lib/ai/tools.js (7 tools)
                                        |
                    +-------------------+-------------------+
                    |                   |                   |
                    v                   v                   v
         createJobTool           startCodingTool      getProjectStateTool
                    |                   |
                    v                   v
         lib/tools/create-job.js   lib/tools/docker.js
                    |                   |
                    v                   v
         job/{UUID} branch       Job Container         Workspace Container
         (GitHub API)            (Claude Code CLI,     (ttyd + tmux +
                                  ephemeral)            Claude Code CLI,
                                                        persistent)
                                        |                   |
                                        v                   v
                                   GitHub PR           lib/ws/proxy.js
                                   + notify                 |
                                                           v
                                                      xterm.js (browser)
```

### Target System (v2.0)

```
User
 |
 +-- Slack -------> slack.js ---------+
 +-- Telegram ----> telegram.js ------+
 +-- Web Chat ----> chat-page.jsx ----+   <-- MODIFIED: repo selector, code mode, DnD tabs
                   stream-viewer.jsx  |   <-- NEW: live log streaming from active jobs
                                      |
                                      v
                       Event Handler (Next.js 15)
                        lib/ai/agent.js (LangGraph ReAct)
                        lib/ai/tools.js (unchanged — clusters are autonomous)
                                      |
                  +-------------------+-------------------+
                  |                   |                   |
                  v                   v                   v
         createJobTool        startCodingTool       Cluster Runtime
         (unchanged)          (unchanged)           lib/cluster/runtime.js
                  |                                       |
                  v                                       |
         Job Container                         +----------+----------+
         (Claude Code CLI                      |          |          |
          + MCP servers)                  cron trigger  file watch  webhook
         (MODIFIED: .mcp.json           +----------+----------+
          in image)                                |
                  |                               v
                  v                    lib/cluster/execute.js
         GitHub PR                     runClusterRole()
         + SSE stream                            |
           to browser                            v
                                       Cluster Worker Container
                                       (AutoRemove, shared volume)
                                       stdout: stream-json NDJSON
                                                |
                                                v
                                   lib/cluster/stream.js (SSE)
                                   --> browser cluster console
```

---

## Component Map: Verified Against Upstream

### New Components (verified source: upstream/main)

| Component | Path | What It Does | Source |
|-----------|------|--------------|--------|
| Cluster actions | `lib/cluster/actions.js` | Server Actions (`'use server'`) for cluster/role CRUD; `createCluster()` creates `data/clusters/cluster-{id}/shared/` on disk | `upstream/main:lib/cluster/actions.js` |
| Cluster execute | `lib/cluster/execute.js` | `clusterNaming()`, `canRunRole()` concurrency gate, `runClusterRole()` Docker launch, `buildTemplateVars()`, template variable resolution | `upstream/main:lib/cluster/execute.js` |
| Cluster runtime | `lib/cluster/runtime.js` | In-memory trigger scheduler: cron (node-cron), file watchers (chokidar, 5s debounce), `handleClusterWebhook()` for POST triggers | `upstream/main:lib/cluster/runtime.js` |
| Cluster stream | `lib/cluster/stream.js` | SSE endpoint: polls container list every N seconds, tails running worker logs via `tailContainerLogs()`, emits `log` + `status` SSE events; calls `mapLine()` for parsed display | `upstream/main:lib/cluster/stream.js` |
| Cluster DB | `lib/db/clusters.js` | CRUD for `clusters` and `cluster_roles` tables; `roleShortId()` naming helper | `upstream/main:lib/db/clusters.js` |
| Headless stream parser | `lib/ai/headless-stream.js` | `parseHeadlessStream(dockerLogStream)` async generator: Docker frame demux → NDJSON → `mapLine()` → structured events; `mapLine()` exported separately for use in cluster/stream.js | `upstream/main:lib/ai/headless-stream.js` |
| Cluster worker Dockerfile | `templates/docker/claude-code-cluster-worker/Dockerfile` | Ubuntu 24.04, Node 22, Claude Code CLI, gh CLI, non-root `claude-code` user. No tmux/ttyd — headless only | `upstream/main:templates/docker/claude-code-cluster-worker/Dockerfile` |
| Cluster worker entrypoint | `templates/docker/claude-code-cluster-worker/entrypoint.sh` | Git setup, `cd /home/claude-code/workspace`, runs `claude -p "$PROMPT" --dangerously-skip-permissions --verbose --output-format stream-json`, tees stdout to `$LOG_DIR/stdout.jsonl` | `upstream/main:templates/docker/claude-code-cluster-worker/entrypoint.sh` |
| Headless Dockerfile | `templates/docker/claude-code-headless/Dockerfile` | Same base as cluster worker; no tmux/ttyd | `upstream/main:templates/docker/claude-code-headless/Dockerfile` |
| Headless entrypoint | `templates/docker/claude-code-headless/entrypoint.sh` | Clones REPO at BRANCH, creates FEATURE_BRANCH, runs `claude -p "$HEADLESS_TASK" --output-format stream-json`, then `git add/commit/rebase` or AI merge-back on failure | `upstream/main:templates/docker/claude-code-headless/entrypoint.sh` |
| Cluster UI components | `lib/cluster/components/` | React pages: clusters-page, cluster-page, cluster-console-page (SSE consumer), cluster-logs-page, code-log-view (renders mapLine events) | `upstream/main:lib/cluster/components/` |
| Cluster SSE route | `app/stream/cluster/[clusterId]/logs/route.js` | One-liner: `export { GET } from 'clawforge/cluster/stream'` | `upstream/main:templates/app/stream/cluster/[clusterId]/logs/route.js` |

### Modified Components (v2.0)

| Component | Path | What Changes |
|-----------|------|--------------|
| DB schema | `lib/db/schema.js` | Add `clusters` and `cluster_roles` Drizzle table definitions |
| docker.js | `lib/tools/docker.js` | Add `runClusterWorkerContainer()`, `tailContainerLogs()`, `getContainerStats()`, `listContainers(prefix)` |
| instrumentation.js | `config/instrumentation.js` | Call `startClusterRuntime()` after `reconcileOrphans()` + `reconcileWorkspaces()` |
| App router | `app/` | Add cluster pages (thin re-exports following existing chat/workspace pattern) |
| Job entrypoint | `templates/docker/job/entrypoint.sh` | Add MCP config generation step before `claude -p` invocation |
| Instance Dockerfiles | `instances/{name}/Dockerfile` | COPY `config/mcp.json` into image at `/workspace/.mcp.json` |
| Web Chat UI | `lib/chat/components/chat-page.jsx` | Repo selector, code mode toggle, DnD tabs, stream-viewer panel |

---

## Feature 1: Multi-Agent Clusters

### Architecture

Clusters are groups of role-defined Docker containers that trigger autonomously. They are NOT LangGraph tools. They run parallel to the conversational agent, triggered by cron, file events, webhooks, or manually from the UI.

```
lib/cluster/
├── actions.js     Server Actions for UI (CRUD, manual trigger)
├── execute.js     canRunRole() gate + runClusterRole() Docker launch
├── runtime.js     In-memory: cron + chokidar file watch + webhook handler
├── stream.js      SSE: poll running containers, tail logs, emit events
└── components/    React UI pages (cherry-pick from upstream)
```

**Key design:** Cluster workers are ephemeral containers with `AutoRemove: true`. They are NOT database entities. The log files on the shared host volume are the audit trail.

### DB Tables (new, from upstream schema)

```sql
-- clusters
id TEXT PRIMARY KEY
userId TEXT NOT NULL            -- ownership scoping
name TEXT NOT NULL DEFAULT 'New Cluster'
systemPrompt TEXT NOT NULL DEFAULT ''
folders TEXT                    -- JSON: shared folder names
enabled INTEGER NOT NULL DEFAULT 0
starred INTEGER NOT NULL DEFAULT 0
createdAt INTEGER NOT NULL
updatedAt INTEGER NOT NULL

-- cluster_roles (scoped to cluster)
id TEXT PRIMARY KEY
clusterId TEXT NOT NULL
roleName TEXT NOT NULL
role TEXT NOT NULL DEFAULT ''          -- role description for system prompt
prompt TEXT NOT NULL DEFAULT 'Execute your role.'
triggerConfig TEXT                     -- JSON: {cron?, file_watch?}
maxConcurrency INTEGER NOT NULL DEFAULT 1
cleanupWorkerDir INTEGER NOT NULL DEFAULT 0
folders TEXT                           -- JSON: role-scoped folder names
sortOrder INTEGER NOT NULL DEFAULT 0
createdAt INTEGER NOT NULL
updatedAt INTEGER NOT NULL
```

### Disk Structure (created by Server Actions, not worker containers)

```
data/clusters/
  cluster-{shortId}/           -- created by createCluster() Server Action
    shared/                    -- created by createCluster()
      {folder}/                -- created by updateClusterFolders()
    role-{roleShortId}/        -- created by createClusterRole() Server Action
      shared/                  -- role-scoped shared dir
      worker-{uuid}/           -- created per container launch
        tmp/
      logs/
        role-{roleShortId}/
          {date}_{time}_{uuid}/
            system-prompt.md   -- written BEFORE container starts
            user-prompt.md     -- written BEFORE container starts
            trigger.json
            meta.json          -- {roleName, startedAt, endedAt}
            stdout.jsonl       -- Claude Code stream-json output (tee from container)
            stderr.txt
```

Log files are written to disk by `execute.js` before container launch. Container tees stdout to `$LOG_DIR/stdout.jsonl`. The event handler can tail these files or use `tailContainerLogs()` for live streaming.

### Container Naming (deterministic, no DB lookup needed)

- **Cluster short ID:** `cluster.id.replace(/-/g, '').slice(0, 8)` → `a1b2c3d4`
- **Role short ID:** `role.id.replace(/-/g, '').slice(0, 8)` → `e5f6g7h8`
- **Container name:** `cluster-{clusterShortId}-role-{roleShortId}-{8-char-workerUuid}`
- **Example:** `cluster-a1b2c3d4-role-e5f6g7h8-x9y0z1w2`

This naming lets `listContainers(prefix)` discover all containers for a cluster without a DB join.

### Template Variable System (resolved in execute.js before container launch)

| Variable | Value |
|----------|-------|
| `{{CLUSTER_HOME}}` | `/home/claude-code/workspace` (container-internal volume root) |
| `{{CLUSTER_SHARED_DIR}}` | `/home/claude-code/workspace/shared` |
| `{{SELF_WORK_DIR}}` | `/home/claude-code/workspace/role-{rid}/worker-{uuid}` |
| `{{SELF_TMP_DIR}}` | `/home/claude-code/workspace/role-{rid}/worker-{uuid}/tmp` |
| `{{SELF_ROLE_NAME}}` | `roleData.roleName` from DB |
| `{{SELF_WORKER_ID}}` | worker UUID |
| `{{DATETIME}}` | ISO timestamp at spawn |
| `{{WORKSPACE}}` | JSON manifest of all workers in this cluster |

Both `SYSTEM_PROMPT` and `PROMPT` env vars are resolved through `resolveClusterVariables()` before passing to the container.

### Trigger Types (all funnel through canRunRole → runClusterRole)

| Trigger | Config | Mechanism |
|---------|--------|-----------|
| Manual | always available | Server Action → `canRunRole()` → `runClusterRole()` |
| Webhook | always-on | POST `/api/cluster/{cid}/role/{rid}/webhook` → `handleClusterWebhook()` |
| Cron | `triggerConfig.cron.schedule` | `node-cron` registered at runtime boot/reload |
| File watch | `triggerConfig.file_watch.paths` | `chokidar` watching `data/clusters/` paths, 5s debounce |

`canRunRole()` is the shared gate: checks `cluster.enabled` and counts running containers vs `maxConcurrency` via `listContainers(roleContainerPrefix)`.

### New docker.js Functions (add to existing module)

```javascript
// Runs cluster worker container (AutoRemove: true)
runClusterWorkerContainer({ containerName, env, binds, workingDir })
  // Image: clawforge-cluster-worker:{version} (separate from job image)
  // HostConfig: { AutoRemove: true, Binds: [hostDataDir:/home/claude-code/workspace] }

// Returns raw Docker log stream for tailing
tailContainerLogs(containerName)
  // GET /containers/{name}/logs?stdout=true&stderr=true&follow=true&tail=all

// Returns CPU%, memory, network stats (one-shot, not streaming)
getContainerStats(containerName)
  // GET /containers/{name}/stats?stream=false
  // Returns: { cpu, memUsage, memLimit, netRx, netTx }

// Lists containers matching a name prefix
listContainers(prefix)
  // GET /containers/json?all=true&filters={name:[prefix]}
  // Returns: [{ name, id, state }]
```

`runClusterWorkerContainer` is distinct from `dispatchDockerJob` because:
- Different image (cluster worker vs job container)
- AutoRemove: true (workers clean up themselves)
- Different volume bind (cluster data dir vs named repo cache volume)
- No `waitAndNotify` — cluster container progress is tailed separately via SSE

### Isolation Preservation

Cluster workers must use the same per-instance Docker network as job containers (`noah-net` or `strategyES-net`). The network is passed via env var and enforced in `runClusterWorkerContainer()`. Cluster `userId` scoping in DB ensures users cannot access each other's clusters via UI.

**Host path concern:** `execute.js` uses `resolveHostPath(dataDir)` to convert the event handler container's internal path to the Docker host path for bind mounting. ClawForge must ensure `DOCKER_DATA_DIR` env var is set so cluster data is accessible both from the event handler (pre-launch log file creation) and from worker containers (via bind mount).

---

## Feature 2: Headless Job Streaming

### What It Is

Headless streaming is a NEW container type (`claude-code-headless`) distinct from the existing job container, plus a parser (`lib/ai/headless-stream.js`) that converts Docker log output to structured chat events.

| Existing job container | Headless container |
|------------------------|-------------------|
| Triggered by GitHub Actions (`run-job.yml`) | Triggered directly via Docker Engine API |
| Reads `job.md` from branch | Takes `REPO`, `BRANCH`, `FEATURE_BRANCH`, `HEADLESS_TASK` env vars |
| `--allowedTools` whitelist | `--dangerously-skip-permissions` |
| Output: PR on GitHub | Output: commits on feature branch + `stdout.jsonl` |
| No live streaming | `--output-format stream-json` → tailed via SSE |

### Stream Parser (lib/ai/headless-stream.js)

Three-layer async generator (verified against upstream source):

```
Docker log stream (multiplexed binary)
  Layer 1: 8-byte Docker frame parser
           [streamType(1B), 0x00(3B), size(4B), payload]
           Only passes streamType=1 (stdout)
  Layer 2: NDJSON line splitter
           Buffers across chunk boundaries
  Layer 3: mapLine(line) — one NDJSON line → 0-N events
           {type:'assistant'} → text events + tool-call events
           {type:'user'}      → tool-result events
           {type:'result'}    → final summary event
           Non-JSON lines     → raw text event (for NO_CHANGES, MERGE_SUCCESS, etc.)
```

`mapLine()` is exported separately and reused by `lib/cluster/stream.js` for the cluster console page.

### Data Flow: Live Streaming to Web Chat

```
User sends message in Web Chat
  --> LangGraph: createHeadlessJobTool (or variant of createJobTool)
  --> dispatchHeadlessJob(): start container, return containerId
  --> tailContainerLogs(containerId): get Node.js ReadableStream
  --> parseHeadlessStream(stream): async generator of structured events
  --> inject events into AI SDK data stream
  --> browser useChat() renders tool calls, text, results in real time
  --> container exits → commits pushed → job done
```

### Headless Entrypoint (verified against upstream)

The entrypoint clones repo, runs Claude headlessly with stream-json output, then handles git merge:

1. Clone `$REPO` at `$BRANCH` (or reset if volume warm)
2. Create/reset `$FEATURE_BRANCH`
3. `claude -p "$HEADLESS_TASK" --dangerously-skip-permissions --verbose --output-format stream-json`
4. On exit 0: `git add -A`, `git commit`, `git rebase origin/$BRANCH`
5. On rebase conflict: `claude -p "$(cat /home/claude-code/.claude/commands/ai-merge-back.md)"` — AI-assisted merge
6. `git push origin $FEATURE_BRANCH`

---

## Feature 3: MCP Tool Layer

### Architecture

MCP configuration is per-instance, baked into each Docker image at build time. No runtime config storage needed. No new database tables.

**Claude Code MCP config scopes (verified against current docs):**
- `~/.claude.json` (user scope) — global to all projects
- `.mcp.json` (project scope) — in working directory, auto-loaded by Claude Code
- Managed config at system paths (enterprise, not applicable)

**ClawForge approach:** Copy a per-instance `mcp.json` into each Docker image at `/workspace/.mcp.json`. The job entrypoint's working directory is `/workspace`, so Claude Code picks up the project-scope MCP config automatically. No `--mcp-config` flag needed.

**Per-instance Dockerfile addition:**
```dockerfile
# instances/noah/Dockerfile (job container image)
COPY config/mcp.json /workspace/.mcp.json
```

**`instances/noah/config/mcp.json` example:**
```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": { "BRAVE_API_KEY": "${AGENT_LLM_BRAVE_API_KEY}" }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    }
  }
}
```

**Env var passthrough:** MCP server API keys use the existing `AGENT_LLM_` prefix convention. The `.mcp.json` `env` block references them via `${ENV_VAR_NAME}` syntax which Claude Code resolves from the container environment.

**Allowed tools:** The existing `--allowedTools` whitelist in `entrypoint.sh` must include MCP tool names in the format `mcp__serverName__toolName`. Update `AGENT.md` per instance to document which MCP tools are available.

**Instance isolation:** Each instance Dockerfile bakes its own `mcp.json`. Noah's instance gets Brave Search + filesystem. StrategyES/Epic gets only what Epic needs. No cross-contamination — isolation is structural (separate Docker images).

**Confidence:** HIGH — `.mcp.json` project scope is officially documented. `${ENV_VAR}` expansion in `.mcp.json` is standard Claude Code behavior. The `AGENT_LLM_` secret prefix convention is already established in the codebase.

---

## Feature 4: Web UI Enhancements

### Chat Stream Enhancement (consumes headless streaming)

The existing `/stream/chat` endpoint uses `@ai-sdk/react useChat` with `DefaultChatTransport`. The AI SDK v5 data stream already supports custom events. The change is to wire `parseHeadlessStream()` output into the active SSE stream when a headless job is running.

**Implementation:** `waitAndNotify()` in `tools.js` currently fire-and-forgets. For headless jobs, it can additionally pipe `parseHeadlessStream(dockerLogStream)` into a `stream-registry.js` Map keyed by jobId. The `/stream/chat` route checks if there's an active headless stream for the current chat and merges it into the SSE response.

### Repo/Branch Selector

A dropdown in the chat header showing repos from the instance `REPOS.json`. Selecting a repo anchors the conversation context. Implementation reuses `getProjectState()` which already reads `REPOS.json`. Selected repo stored in chat metadata (DB column on `chats` table or local state).

### Code Mode Toggle

Switch between conversational mode (LangGraph agent) and code mode (workspace terminal, xterm.js). This is a UI-only change — the `WorkspaceView` component from v1.5 already exists. Code mode just renders it instead of the chat component.

### DnD Tabs

Multiple workspaces/chats open simultaneously with drag-to-reorder. The DB already supports multiple workspaces (no single-workspace constraint per user). This is a pure UI component: `dnd-tabs.jsx` using a drag library (react-beautiful-dnd or @dnd-kit/core, the latter being more current as of 2025).

---

## Data Flow: All Four Features Integrated

### Cluster Worker Execution (autonomous, not user-initiated)

```
Cron fires (or webhook POST, or file change, or manual trigger)
  --> lib/cluster/runtime.js
  --> canRunRole(): check cluster.enabled + count running containers
  --> runClusterRole(): execute.js
      --> buildTemplateVars(): assemble {{PLACEHOLDER}} values
      --> buildWorkerSystemPrompt(): cluster system prompt + role instructions
      --> resolveClusterVariables(role.prompt): resolve prompt template vars
      --> Write log files to disk (system-prompt.md, user-prompt.md, meta.json)
      --> runClusterWorkerContainer(): docker.js
          --> Container starts: AutoRemove=true, shared volume bound
          --> claude -p "$PROMPT" --output-format stream-json | tee stdout.jsonl
  --> Browser (cluster console page):
      --> GET /stream/cluster/{clusterId}/logs (SSE)
      --> lib/cluster/stream.js polls listContainers(clusterPrefix) every N seconds
      --> For running containers: startTailing(containerName)
          --> tailContainerLogs(): raw Docker log stream
          --> demux frames → split lines → mapLine() → emit 'log' SSE events
      --> emit 'status' SSE events with CPU/memory stats
```

### Headless Job with Live Streaming (user-initiated)

```
User in Web Chat: "Refactor the auth module in clawforge"
  --> LangGraph agent: createHeadlessJobTool
  --> dispatchHeadlessJob():
      --> create container from claude-code-headless image
      --> pass REPO, BRANCH, FEATURE_BRANCH, HEADLESS_TASK env vars
  --> Agent response: "Starting headless job..."
  --> waitAndNotify() (fire-and-forget):
      --> tailContainerLogs(containerId) → Node.js stream
      --> parseHeadlessStream(stream) → async generator
      --> inject events into stream-registry[chatId]
  --> Browser useChat() SSE stream receives:
      --> {type:'text', text:'...'} → renders as agent thought
      --> {type:'tool-call', toolName:'...'} → renders as tool use
      --> {type:'tool-result', result:'...'} → renders as result
  --> Container exits → commits pushed → waitAndNotify() closes stream → notifies
```

### MCP Tool Access (transparent to user, at container start)

```
createJobTool dispatches job
  --> Container starts from instances/noah/Dockerfile image
      (which has /workspace/.mcp.json baked in)
  --> entrypoint.sh: cd /workspace
  --> Claude Code starts, reads /workspace/.mcp.json (project scope auto-load)
  --> MCP servers start: npx @modelcontextprotocol/server-brave-search
  --> Job runs: Claude can call mcp__brave-search__brave_web_search
  --> Output: PR + any MCP tool results in job log
```

---

## Build Order (Dependency-Driven)

### Phase 1: Cluster Infrastructure (no UI, no streaming dependency)

1. Migration SQL for `clusters` + `cluster_roles` tables
2. `lib/db/clusters.js` — CRUD functions
3. Add `runClusterWorkerContainer()`, `tailContainerLogs()`, `getContainerStats()`, `listContainers(prefix)` to `lib/tools/docker.js`
4. `templates/docker/claude-code-cluster-worker/` — Dockerfile + entrypoint.sh
5. `lib/cluster/execute.js` — `clusterNaming()`, `canRunRole()`, `runClusterRole()`, `stopRoleContainers()`
6. `lib/cluster/runtime.js` — `startClusterRuntime()`, cron + file watch + webhook handler
7. Add `startClusterRuntime()` to `config/instrumentation.js`

**Verification gate:** POST to `/api/cluster/{cid}/role/{rid}/webhook` — confirm container launches, log files created on disk.

### Phase 2: Cluster UI + SSE Streaming

8. `lib/ai/headless-stream.js` — `parseHeadlessStream()` + `mapLine()`
9. `lib/cluster/stream.js` — SSE using `tailContainerLogs()` + `mapLine()`
10. `lib/cluster/components/` — React UI pages (cherry-pick from upstream)
11. App router pages: `/clusters`, `/cluster/[clusterId]`, `/cluster/[clusterId]/console`, `/cluster/[clusterId]/logs`
12. `app/stream/cluster/[clusterId]/logs/route.js` — thin re-export

**Verification gate:** Open cluster console page in browser, trigger role manually, see live log streaming with parsed tool calls.

### Phase 3: MCP Tool Layer (independent, can run in parallel with Phase 2)

13. `instances/noah/config/mcp.json` — Noah's MCP tool definitions
14. Update `instances/noah/Dockerfile` — `COPY config/mcp.json /workspace/.mcp.json`
15. Update `instances/noah/config/AGENT.md` — document MCP tool names in `--allowedTools`
16. Repeat for StrategyES/Epic instance
17. Rebuild instance images, run test job

**Verification gate:** Job container log shows MCP server startup; Claude Code invokes MCP tool in test job.

### Phase 4: Headless Streaming + Web UI (depends on Phase 2 for stream parser)

18. `templates/docker/claude-code-headless/` — Dockerfile + entrypoint.sh
19. `lib/ws/stream-registry.js` — Map of chatId → active stream connections
20. Wire `parseHeadlessStream()` into `/stream/chat` SSE endpoint
21. Web UI: `stream-viewer.jsx`, repo/branch selector, code mode toggle, DnD tabs

**Verification gate:** Create headless job from Web Chat, watch live tool-call streaming, confirm commits appear on feature branch.

---

## New vs Modified: Complete Table

| Component | Path | Status | Feature |
|-----------|------|--------|---------|
| Cluster actions | `lib/cluster/actions.js` | NEW | Clusters |
| Cluster execute | `lib/cluster/execute.js` | NEW | Clusters |
| Cluster runtime | `lib/cluster/runtime.js` | NEW | Clusters |
| Cluster stream | `lib/cluster/stream.js` | NEW | Clusters + Streaming |
| Cluster DB | `lib/db/clusters.js` | NEW | Clusters |
| Headless stream parser | `lib/ai/headless-stream.js` | NEW | Streaming |
| Cluster worker Dockerfile | `templates/docker/claude-code-cluster-worker/Dockerfile` | NEW | Clusters |
| Cluster worker entrypoint | `templates/docker/claude-code-cluster-worker/entrypoint.sh` | NEW | Clusters |
| Headless Dockerfile | `templates/docker/claude-code-headless/Dockerfile` | NEW | Streaming |
| Headless entrypoint | `templates/docker/claude-code-headless/entrypoint.sh` | NEW | Streaming |
| Cluster UI components | `lib/cluster/components/` | NEW | Clusters |
| Cluster SSE route | `app/stream/cluster/[clusterId]/logs/route.js` | NEW | Clusters |
| MCP config | `instances/{name}/config/mcp.json` | NEW | MCP |
| stream-registry.js | `lib/ws/stream-registry.js` | NEW | Streaming |
| stream-viewer.jsx | `lib/chat/components/stream-viewer.jsx` | NEW | Streaming + Web UI |
| repo-selector.jsx | `lib/chat/components/repo-selector.jsx` | NEW | Web UI |
| dnd-tabs.jsx | `lib/chat/components/dnd-tabs.jsx` | NEW | Web UI |
| DB schema | `lib/db/schema.js` | MODIFIED | Clusters |
| docker.js | `lib/tools/docker.js` | MODIFIED | Clusters + Streaming |
| instrumentation.js | `config/instrumentation.js` | MODIFIED | Clusters |
| chat-page.jsx | `lib/chat/components/chat-page.jsx` | MODIFIED | Web UI |
| Job entrypoint | `templates/docker/job/entrypoint.sh` | MODIFIED | MCP |
| Instance Dockerfiles | `instances/{name}/Dockerfile` | MODIFIED | MCP |
| Instance AGENT.md | `instances/{name}/config/AGENT.md` | MODIFIED | MCP |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding Cluster Triggers to LangGraph Agent

**What:** Making LangGraph tools that trigger cluster roles on user request
**Why bad:** Clusters are designed to be autonomous (cron, file watch, webhook). Adding LangGraph tools conflates two architecturally distinct systems and creates feedback loops (agent triggers cluster → cluster triggers agent → ...).
**Instead:** Clusters have their own trigger system. The Web UI provides manual trigger buttons via Server Actions.

### Anti-Pattern 2: Sharing Cluster Worker Image with Job Container Image

**What:** Using the existing job image for cluster workers
**Why bad:** Cluster workers use `--dangerously-skip-permissions` and share a volume without PR creation. Job containers use `--allowedTools` and create GitHub PRs. Different security models, different entrypoints.
**Instead:** Separate `claude-code-cluster-worker` image. Same base (Node 22 + Claude Code CLI + gh CLI) but different entrypoint. Upstream uses this exact separation.

### Anti-Pattern 3: Docker Label State Machine for Cluster Coordination

**What:** Using Docker container label mutation for inter-worker state (orchestrator updates labels to route tasks)
**Why bad:** Docker API does not support label updates after container creation. `container.update()` only changes resource limits, not labels. Label-based routing would require container recreation.
**Instead:** Use the shared volume filesystem for all inter-worker communication. Workers write status files to `role-{rid}/worker-{uuid}/` directory. Orchestrator reads these files. The `logs/` subdirectory in the cluster data dir is the audit trail.

### Anti-Pattern 4: Storing MCP Config at Runtime or in Database

**What:** Dynamic MCP server registration via API or persisted in DB
**Why bad:** Adds attack surface, requires runtime file writes inside containers, creates state synchronization between DB and container filesystem.
**Instead:** MCP config is static per-instance, baked into Docker image at build time. Changes require image rebuild (same cadence as AGENT.md changes today).

### Anti-Pattern 5: Polling for Log Streaming

**What:** `setInterval` polling of a log status endpoint from the browser
**Why bad:** 10-second lag, unnecessary API calls, poor developer experience, misses log lines between polls.
**Instead:** `tailContainerLogs()` returns a live Docker log stream. Pipe directly into SSE. No polling at any layer. See `lib/cluster/stream.js` pattern in upstream for the exact implementation.

### Anti-Pattern 6: Publishing Cluster Worker Ports to Host

**What:** `-p` flag to expose cluster worker container ports on the Docker host
**Why bad:** Port conflicts with multiple workers. Bypasses per-instance network isolation. Unnecessary — workers communicate via shared volume, not network.
**Instead:** Workers have no published ports. They operate entirely within the per-instance Docker network and shared volume.

---

## Multi-Tenant Isolation Verification

| Feature | Isolation Mechanism | How to Verify |
|---------|--------------------|----|
| Clusters | `cluster.userId` scopes DB rows; cluster workers join per-instance Docker network only | Confirm `runClusterWorkerContainer()` sets `NetworkMode: process.env.DOCKER_NETWORK` |
| Cluster volumes | Host path `data/clusters/cluster-{shortId}/` — shortId derived from clusterId (UUID) which is user-scoped | Two users' cluster IDs never collide (UUID v4) |
| Headless streaming | `stream-registry` Map keyed by chatId; chatId is auth-scoped to user session | `requireAuth()` in stream endpoint; chatId from session |
| MCP tools | Per-instance Dockerfile bakes per-instance `mcp.json` | Check `instances/noah/` and `instances/strategyES/` have separate configs |
| Web UI | Existing `requireAuth()` pattern on all Server Actions; repo selector reads per-instance REPOS.json | No new auth surface needed |

---

## Scalability Considerations

| Concern | v2.0 (2 instances) | v2.1 (5 instances) | v3.0 (20+ instances) |
|---------|--------------------|--------------------|----------------------|
| Concurrent cluster containers | 10 max (5 per cluster, 2 instances) | 25 max | Consider Docker Swarm |
| SSE connections | 2-4, trivial | 10-20, fine | Need streaming proxy |
| MCP server processes | Per-job, ephemeral | Same | Same (stateless) |
| Stream registry memory | KB range, fine | Fine | Need Redis if multi-process |
| Cluster disk usage | ~1GB logs/month per active cluster | 5GB | Add log rotation cron |

**For v2.0 scope (2 instances, single Docker host), no scalability changes needed.** Apply `maxConcurrency` limits per role (default 1) and consider container resource limits (1GB RAM / 0.5 CPU per cluster worker).

---

## Open Questions (Flagged for Phase-Specific Research)

1. **`resolveHostPath()` for ClawForge:** The upstream `execute.js` calls `resolveHostPath(dataDir)` to convert the event handler container's internal path to the Docker host path for bind mounting cluster volumes. ClawForge must implement this same function using `DOCKER_HOST_DATA_DIR` env var or equivalent. This needs to be verified against how the existing `dispatchDockerJob()` handles volume bind paths today.

2. **Cluster network assignment:** Confirm `runClusterWorkerContainer()` passes the correct per-instance Docker network. The upstream implementation may use a different env var naming convention than ClawForge's `DOCKER_NETWORK`. Verify against existing `lib/tools/docker.js` `dispatchDockerJob()` implementation.

3. **`--output-format stream-json` in AGENT.md context:** Cluster workers use `--dangerously-skip-permissions`. If ClawForge wants to use MCP in cluster workers too, the cluster worker image would also need `.mcp.json`. This is an enhancement, not a blocker for Phase 1.

4. **SSE vs WebSocket for log streaming:** The existing ws/server.js already handles WebSocket upgrades. Cluster stream uses SSE (HTTP GET with `text/event-stream`). Both can coexist. Decision: keep cluster streaming as SSE (simpler, matches upstream), keep workspace terminals as WebSocket (required for bidirectional terminal protocol).

---

## Sources

- `upstream/main:lib/cluster/CLAUDE.md` — authoritative cluster architecture documentation (HIGH confidence)
- `upstream/main:lib/cluster/actions.js` — Server Actions, `createCluster()` disk setup (HIGH confidence)
- `upstream/main:lib/cluster/execute.js` — `clusterNaming()`, `buildTemplateVars()`, `runClusterRole()`, AutoRemove pattern (HIGH confidence)
- `upstream/main:lib/cluster/runtime.js` — cron (node-cron), chokidar file watch, `handleClusterWebhook()` (HIGH confidence)
- `upstream/main:lib/cluster/stream.js` — SSE tailing, `listContainers()` polling, `mapLine()` integration, CPU/memory stats (HIGH confidence)
- `upstream/main:lib/ai/headless-stream.js` — `parseHeadlessStream()` async generator, `mapLine()` NDJSON mapper (HIGH confidence)
- `upstream/main:templates/docker/claude-code-cluster-worker/entrypoint.sh` — cluster worker entrypoint, stream-json + tee pattern (HIGH confidence)
- `upstream/main:templates/docker/claude-code-headless/entrypoint.sh` — headless entrypoint, rebase + AI merge-back (HIGH confidence)
- `upstream/main:lib/db/schema.js` — `clusters` + `clusterRoles` Drizzle table definitions (HIGH confidence)
- `upstream/main:lib/tools/docker.js` — `runClusterWorkerContainer()`, `tailContainerLogs()`, `getContainerStats()`, `listContainers()` (HIGH confidence)
- ClawForge `lib/tools/docker.js` — existing `dispatchDockerJob()`, `ensureWorkspaceContainer()` patterns
- ClawForge `lib/ai/tools.js` — existing LangGraph tool patterns (`waitAndNotify`, fire-and-forget)
- ClawForge `lib/db/schema.js` — existing `codeWorkspaces` table pattern
- Claude Code documentation — `.mcp.json` project scope auto-load, `--output-format stream-json`, `AGENT_LLM_` env var prefix convention
