# Feature Landscape: v2.0 Full Platform

**Domain:** AI agent platform — Web UI, Multi-Agent Clusters, Headless Streaming, MCP Tool Layer
**Researched:** 2026-03-12
**Scope:** NEW features only for v2.0. Everything in v1.0–v1.5 (job pipeline, Docker dispatch, workspaces, channels, cross-repo, instance generation) is shipped and not re-researched.

---

## Context: What Is Being Built

v2.0 cherry-picks four capability areas while preserving ClawForge's multi-tenant architecture. These are additive to the existing two-layer system:

- **Web UI**: Enhanced chat interface with code mode, repo/branch selector — the terminal workspace UI is complete; what remains is the chat-side improvements
- **Multi-Agent Clusters**: Role-based agent teams coordinating via shared filesystem and label-based state machine
- **Headless Job Streaming**: Live log output from running Docker containers piped to chat UI
- **MCP Tool Layer**: Per-instance MCP server configs with curated tool subsets

**What's already built that these features touch (confirmed by direct codebase inspection):**
- Docker Engine API dispatch with dockerode — `lib/tools/docker.js` (headless streaming extends `collectLogs()`)
- LangGraph ReAct agent with SQLite checkpointing — `lib/ai/tools.js` (tools expand this; 7 tools currently exported)
- xterm.js browser terminal with WebSocket proxy — `lib/ws/` (ws proxy, ticket auth, actions all shipped)
- Per-instance `REPOS.json` and isolation model — `instances/noah/config/`, `instances/strategyES/config/` (MCP configs extend this pattern)
- Chat streaming via AI SDK v5 with `createUIMessageStream` — `lib/chat/api.js`
- Full chat UI with 22+ components — `lib/chat/components/` (all key pages: chat, swarm, notifications, settings, chats, crons, triggers)
- `closeWorkspace` tool shipped in v1.5 — `lib/tools/docker.js:991`
- `startCodingTool` and `listWorkspacesTool` shipped in v1.5 — `lib/ai/tools.js`
- `code_workspaces` DB table with full lifecycle tracking — `lib/db/schema.js:77`

**PopeBot analysis source:** Direct codebase inspection of `lib/chat/components/` (18 components), `lib/triggers.js`, `lib/cron.js`, `lib/actions.js`, plus `lib/ws/`, `lib/tools/docker.js`, and `lib/ai/tools.js`. The upstream components are already fully ported. What remains is building what PopeBot stubs or omits in the context of ClawForge's multi-tenant design.

---

## Area 1: Web UI

### What Is Already Shipped (v1.5 — Do Not Rebuild)

| Component | Location | Status |
|-----------|----------|--------|
| Chat page with streaming | `lib/chat/components/chat-page.jsx` | Shipped |
| Chat input with file upload, DnD | `lib/chat/components/chat-input.jsx` | Shipped |
| Message rendering with tool calls | `lib/chat/components/message.jsx`, `tool-call.jsx` | Shipped |
| Sidebar history with starred chats | `lib/chat/components/sidebar-history.jsx` | Shipped |
| Notifications page | `lib/chat/components/notifications-page.jsx` | Shipped |
| Swarm page (job status) | `lib/chat/components/swarm-page.jsx` | Shipped |
| Settings + API key management | `lib/chat/components/settings-secrets-page.jsx` | Shipped |
| Crons + triggers pages | `lib/chat/components/crons-page.jsx`, `triggers-page.jsx` | Shipped |
| Workspace terminal (xterm.js) | `lib/ws/` + terminal component | Shipped |

### Table Stakes (New for v2.0)

| Feature | Why Expected | Complexity | Implementation Notes |
|---------|--------------|------------|----------------------|
| **Code mode toggle** | Operators sending code snippets need syntax highlighting and monospace rendering. Without mode switching, code-heavy conversations are illegible. | LOW | Toolbar button that wraps input in triple backtick blocks and renders as `<pre>`. Add to `chat-input.jsx`. Detect code block parts in `message.jsx` and render with `<pre>` instead of prose. |
| **Repo/branch selector in chat input** | Operators repeat "run this against repo X" in every message. A persistent selector replaces the natural language repo resolution round-trip. The selected repo becomes the default for `create_job` dispatches. | MEDIUM | Select component populated from `loadAllowedRepos()` via Server Action. Stored in chatId-scoped state, serialized into `body` of the `/stream/chat` POST. Agent reads pre-selected repo from request metadata. `lib/tools/repos.js:loadAllowedRepos()` and `lib/chat/api.js` body metadata both already exist. |

### Differentiators

| Feature | Value Proposition | Complexity | Implementation Notes |
|---------|-------------------|------------|----------------------|
| **Feature flags system (FeaturesContext)** | Enable/disable in-development v2.0 features without code deploys. Operators can toggle clusters UI, streaming view, or MCP settings per instance. | LOW | React context following PopeBot pattern: `FeaturesContext` with boolean flags per feature. Read from environment variable or instance config. Wrap new pages/components in `<FeatureFlag name="clusters">`. |
| **DnD tab interface for multi-workspace** | Operators with multiple workspaces open benefit from a drag-reorderable tab bar rather than navigating separate URLs. | HIGH | Requires a tab management layer over the existing `WorkspacePage` — each tab proxies a separate WebSocket to a different container. Each tab needs its own xterm.js instance and WebSocket connection. High complexity for low operator count. Defer to v2.1. |
| **Live job streaming output in chat view** | Instead of "Job dispatched, waiting...", operators see real-time log output from running containers directly in the chat message stream. | HIGH | Depends on Area 3 (Headless Streaming) being built first. The streaming output feeds into the AI SDK v5 `createUIMessageStream` pattern already used by chat. |

### Anti-Features

| Anti-Feature | Why Avoid | Alternative |
|--------------|-----------|-------------|
| **Code editor (Monaco, CodeMirror) in chat UI** | The workspace terminal with Claude Code already provides a full editing environment. Adds confusing dual-environment. Operators are supervisors, not editors. | Keep chat as conversation surface. Code artifacts visible in tool call outputs and PR diffs. |
| **Custom theme/color picker** | CSS variables handle light/dark via Tailwind. Zero platform value. | Tailwind's `prefers-color-scheme` handles this automatically. |
| **Chat export to PDF/markdown** | Export infrastructure adds a new code path with minimal operational value for a 2-instance platform. | The `messages` table is directly queryable. Export is a one-liner SQLite query if needed. |

---

## Area 2: Multi-Agent Clusters

### Table Stakes

| Feature | Why Expected | Complexity | PopeBot Pattern | ClawForge Dependencies |
|---------|--------------|------------|-----------------|------------------------|
| **Cluster config schema (CLUSTER.json)** | A cluster is a named group of agents with defined roles. Without a config schema, there is no way to define what a cluster does. Schema must express: cluster name, list of agents (each with role, prompt template, trigger type), routing rules (what label causes which agent to run next). | MEDIUM | PopeBot's trigger model uses `TRIGGERS.json` (ported: `lib/triggers.js`) and `CRONS.json` (ported: `lib/cron.js`). A cluster config extends this with role definitions and label-based routing. CLUSTER.json structure: `{ name, agents: [{ role, systemPrompt, triggerType, triggerCondition, mcpServers }], routing: [{ label, nextAgent }] }`. | `lib/triggers.js` and `lib/cron.js` are direct precedents — same `executeAction()` dispatch path. `lib/tools/create-job.js` creates the job branch. `lib/ai/tools.js:createJobTool` is the entry point. Cluster runtime wraps these. |
| **Role-based agent dispatch** | Different agents in a cluster should have different system prompts, tool access, and responsibilities. A CTO agent reviews architecture; a Security agent audits credentials; a Developer agent writes code. | HIGH | PopeBot defines roles as named config objects with associated system prompt templates (SOUL.md equivalent per role). Each role maps to a SOUL.md override injected at dispatch time. ClawForge's existing `target.json` sidecar on job branches carries target metadata — extend to carry `{ role, clusterJobId }`. | `templates/docker/job/entrypoint.sh` reads `target.json` at runtime. Add `role` field: entrypoint selects `/defaults/{role}-SOUL.md` if present, else falls back to `/defaults/SOUL.md`. `lib/tools/create-job.js` writes `target.json`. |
| **Shared filesystem communication (inbox/outbox)** | Agents in a cluster communicate by writing to a shared directory on a named volume. Agent A writes `outbox/result.md`; Agent B reads `inbox/result.md` as its prompt context. Without shared state, agents cannot coordinate. | HIGH | PopeBot uses a named Docker volume (shared across all containers in the cluster) mounted at `/cluster/{clusterId}/`. Agents write structured output to `outbox/` and read from `inbox/`. The cluster runtime copies outbox to next agent's inbox before dispatch. | `lib/tools/docker.js:ensureVolume()` and volume binding already work. Cluster coordinator: (1) create cluster volume, (2) mount it on each container at `/cluster/`, (3) after each agent completes, read outbox and write to next agent's inbox on the same volume. |
| **Label-based state machine routing** | The coordinator must know which agent to run next. Labels emitted by an agent (e.g., "needs-security-review", "ready-to-implement") trigger routing to the next agent in the pipeline. | HIGH | PopeBot stubs this in the DB schema (cluster/worker/role tables) but has no runtime. Pattern from LangGraph: each agent appends a `label:` line to its output; the coordinator reads the last label and matches it to the `routing` config to determine next dispatch. Job containers output to `claude-output.jsonl` — coordinator extracts the final label from the assistant's last message. | `templates/docker/job/entrypoint.sh` saves `claude-output.jsonl`. Coordinator `collectLogs()` then parses JSONL to extract the final label. No changes to job containers — label protocol is a convention imposed by agent prompts. |
| **Cluster run DB tracking** | Cluster runs must be persisted so operators can inspect what happened, which agents ran, in what order, and what each produced. | MEDIUM | New SQLite tables: `cluster_runs` (id, clusterId, status, startedAt, completedAt), `cluster_agent_runs` (id, clusterRunId, agentRole, jobId, status, label, prUrl, startedAt, completedAt). Drizzle ORM schema addition following existing patterns. | Extends `lib/db/schema.js` following the `jobOutcomes` and `codeWorkspaces` table patterns. New `lib/db/cluster-runs.js` CRUD module. |

### Differentiators

| Feature | Value Proposition | Complexity | PopeBot Pattern | ClawForge Dependencies |
|---------|-------------------|------------|-----------------|------------------------|
| **Cluster trigger types: manual, webhook, cron** | Clusters useful beyond manual dispatch. A webhook trigger fires a review cluster when a PR is opened; a cron trigger runs a daily health-check cluster. | MEDIUM | `lib/triggers.js` and `lib/cron.js` already support `agent` action type via `executeAction()`. Extend `executeAction()` to recognize a `cluster` action type: read `CLUSTER.json`, find cluster by name, dispatch first agent. | `lib/actions.js:executeAction()` — add `case 'cluster':` that calls `dispatchCluster(action.clusterId, context)`. No changes needed to `lib/triggers.js` or `lib/cron.js`. |
| **`create_cluster_job` LangGraph tool** | Operators can start a cluster through conversation: "run a code review cluster on the neurostory PR." Without a tool, operators must use the API directly. | MEDIUM | New LangGraph tool following `createJobTool` pattern in `lib/ai/tools.js`. Accepts `cluster_name` and `context` (e.g., PR URL, description). Creates a cluster run record, dispatches the first agent, returns `clusterRunId`. | `lib/ai/tools.js` — add `createClusterJobTool`. Reuses `createJob()` and `waitAndNotify()` for the first agent. Cluster coordinator takes over after first completion. |
| **Cluster management UI page** | Operators need to see cluster definitions, running cluster jobs, and completion history. | MEDIUM | PopeBot has no cluster UI (DB/runtime only). New page at `/clusters` listing clusters from CLUSTER.json, recent runs with timeline, agent status per run. Follows swarm-page pattern. | New `lib/chat/components/clusters-page.jsx` following `swarm-page.jsx` skeleton. `getClusterStatus()` Server Action reads from `cluster_runs` + `cluster_agent_runs` tables. |
| **Parallel agent dispatch within cluster** | Some cluster workflows allow parallel agents (Security and Performance audits simultaneously). Coordinator dispatches both, waits for both to complete, then routes to a synthesis agent. | HIGH | Not present in PopeBot. Requires `Promise.all()` over agent dispatches with a join point in the coordinator. Complex interaction with label routing model. | Builds on `waitAndNotify()` fire-and-forget pattern. Coordinator tracks pending agents; only routes to next stage when all complete. High complexity — defer to v2.1. |

### Anti-Features

| Anti-Feature | Why Avoid | Alternative |
|--------------|-----------|-------------|
| **Cross-instance cluster coordination** | Noah's cluster dispatching jobs to StrategyES's containers breaks the isolation model that is a core ClawForge security guarantee. | Each instance runs its own clusters. Cluster config lives in `instances/{name}/config/CLUSTER.json`. Coordinator respects instance Docker network boundaries. |
| **Visual cluster builder (drag-and-drop workflow editor)** | A 2-instance platform with 1-2 operators does not need a visual editor. CLUSTER.json is readable and operator-editable. Building a workflow editor is 2-4 weeks of UI work for zero operational value at current scale. | CLUSTER.json + documentation. If this becomes a product, add it in v3. |
| **Agent-to-agent direct messaging** | Direct API calls between agents creates tight coupling and defeats the sniper agent model. | Shared named volume for inter-agent state. Each agent is stateless; the volume is the state. |

---

## Area 3: Headless Job Streaming

### Table Stakes

| Feature | Why Expected | Complexity | Implementation Notes |
|---------|--------------|------------|----------------------|
| **Container log streaming via Docker API** | When a job runs (~2-15 minutes), operators stare at "Job dispatched, waiting..." with no feedback. Streaming live logs tells them what Claude Code is actually doing. | HIGH | `lib/tools/docker.js:collectLogs()` already collects stdout/stderr via dockerode's `container.logs()` post-hoc. Streaming requires switching to `container.attach({stream:true, stdout:true, stderr:true})` which returns a live stream. The dockerode event demuxer handles stdout/stderr multiplexing. New `attachStream()` function alongside existing `collectLogs()`. |
| **Log forwarding to originating channel** | Log chunks must reach the operator: Slack thread replies, Telegram messages, or web chat SSE events. Without a forwarding path, streaming is captured but not delivered. | HIGH | Web: emit log chunks via `addToThread()` as streaming `AIMessage` parts — AI SDK v5 supports partial streaming. Slack: buffer 5s of log and post a single update, edit the previous message when new content arrives (chat.update API). Telegram: same buffering approach. `lib/ai/index.js:addToThread()` is the injection point for web channel. |
| **Progress indicators in chat UI** | Operators need to know a job is still running, not frozen. A "Job running... (2m 15s elapsed)" indicator prevents premature cancellation. | LOW | `lib/chat/components/message.jsx` already renders `SpinnerIcon` + "Working..." for in-progress LangGraph tool calls. The same component renders job-status messages if log chunks are injected as streaming tool output. No new component needed — just the streaming injection path. |
| **Log filtering and truncation** | Claude Code JSONL output is verbose (every tool call is logged). Raw streaming would flood the chat with noise. Filter should surface: file modifications, bash command outputs, key decisions, final summary — suppressing internal reasoning and redundant tool calls. | MEDIUM | `lib/tools/github.js:summarizeJob()` already does post-hoc log parsing. A streaming filter applies the same rules incrementally: accumulate JSONL lines, emit a summary every 5s covering what changed. Full log still available in the PR / GitHub Actions run. |
| **Stream cancellation / job abort** | If an operator sees Claude Code going in the wrong direction, they should be able to cancel without waiting for the 30-minute timeout. Cancellation must stop the container and leave a clean state. | MEDIUM | `lib/tools/docker.js` has `removeContainer()`. A `cancelJob()` function: (1) find the container by job ID via `inspectJob()`, (2) call `container.stop({t:10})` then `container.remove()`, (3) notify the thread "Job cancelled by operator." New `cancel_job` LangGraph tool. |

### Differentiators

| Feature | Value Proposition | Complexity | Implementation Notes |
|---------|-------------------|------------|----------------------|
| **Log diff highlighting** | Instead of raw log lines, show only files that changed since the last update. "Modified: src/api/index.js" every 10s is more useful than a wall of JSONL. | MEDIUM | Parse `claude-output.jsonl` for `tool_result` entries where tool is `Write` or `Edit`. Extract filename from input. Deduplicate and emit as "Modified: {file}" messages. No new infrastructure — streaming filter identifies these events. `lib/tools/github.js:collectChangedFiles()` already extracts changed files from GitHub PR API for post-hoc use. |
| **GSD phase progress in stream** | If the job uses GSD skills (`/gsd:execute-phase`), surface the current phase and sub-task in the stream. "Phase 3: Building authentication → Writing lib/auth/index.js" turns raw logs into a readable narrative. | HIGH | Requires parsing GSD's progress output from `claude-output.jsonl`. GSD writes `## Phase {N}: {name}` headers to stdout. Stream filter detects these and emits them as structured progress events. Tight coupling to GSD output format — fragile if GSD changes. |
| **Streaming to Slack with message editing** | Rather than spamming a Slack thread with 50 log messages, maintain a single "in-progress" message and edit it every 10s with the latest status. | MEDIUM | Slack `chat.update()` API. Requires tracking the `ts` of the in-progress message. `waitAndNotify()` in `lib/ai/tools.js` posts to Slack — extend with `updateMessage()` during the job. `@slack/web-api` already imported. |

### Anti-Features

| Anti-Feature | Why Avoid | Alternative |
|--------------|-----------|-------------|
| **Full unfiltered JSONL stream to chat** | A typical Claude Code job produces 200-500KB of JSONL. Streaming all of it into a Slack thread or web chat is illegible and potentially rate-limit-triggering. | Filter to semantic events: file writes, bash outputs, key decisions. Full logs available in GitHub Actions or as PR artifact. |
| **Persistent log storage beyond PR** | Logs are already captured in GitHub Actions artifacts and the job Docker container output. Storing them again in SQLite or a separate file doubles storage with no added value. | Reference the GitHub PR URL for full logs. SQLite stores only the final `logSummary` (short summary, not raw JSONL). This already exists in `jobOutcomes` table. |
| **Log replay / seek** | Allowing operators to scrub backward through a job's log stream is video-player complexity for a linear text log. | Show last N lines or the filtered summary. Historical access via GitHub PR. |

---

## Area 4: MCP Tool Layer

### Table Stakes

| Feature | Why Expected | Complexity | Implementation Notes |
|---------|--------------|------------|----------------------|
| **Per-instance MCP_SERVERS.json config** | Different instances need different tool access. Noah's instance might have Brave Search, GitHub, and a custom BI MCP server. StrategyES should only have tools scoped to its repos. | MEDIUM | No MCP config exists anywhere in codebase currently (confirmed: `instances/noah/config/` has AGENT.md, AGENT_QUICK.md, EVENT_HANDLER.md, REPOS.json, SOUL.md — no MCP_SERVERS.json). Pattern modeled after `REPOS.json`: `instances/{name}/config/MCP_SERVERS.json` defines `{ name, command, args, env, toolSubset }[]`. New `loadMcpServers()` in `lib/tools/repos.js` alongside `loadAllowedRepos()`. |
| **MCP server lifecycle in job containers** | MCP servers must be started before `claude -p` is called, and their connection info passed via `--mcp-config`. Without lifecycle management, MCP tools are configured but unavailable. | HIGH | `templates/docker/job/entrypoint.sh` is the integration point. Entrypoint startup: (1) read `MCP_CONFIG` env var (JSON array of server specs), (2) for stdio-based servers, mark the command in the config, (3) write a temp `mcp-config.json`, (4) pass `--mcp-config /tmp/mcp-config.json` to `claude -p`. MCP servers that need env vars receive them via `AGENT_LLM_*` secrets. `MCP_CONFIG` env var injected by `dispatchDockerJob()` from loaded `MCP_SERVERS.json`. |
| **Tool subset curation per instance** | An instance that can reach every tool on every MCP server is a security risk. StrategyES should only access tools relevant to its repos. `toolSubset` in `MCP_SERVERS.json` specifies which tool names are included in the Claude Code `--allowedTools` flag. | MEDIUM | MCP tool names follow the format `mcp:{serverName}:{toolName}`. Extend the existing `--allowedTools` construction in `entrypoint.sh` to include MCP tool names from the `toolSubset` arrays. `ALLOWED_TOOLS` env var already exists — inject the MCP tool subset into it at dispatch time. |
| **Template variable resolution in MCP configs** | MCP server configs may reference runtime values: `{{workspace}}` for the working directory, `{{self.roleName}}` for cluster agent identity, `{{instance}}` for the instance name. Static configs cannot adapt to context. | LOW | `lib/triggers.js:resolveTemplate()` already implements `{{source.field}}` template resolution for trigger/cron actions. Reuse directly. `loadMcpServers()` returns raw config; caller resolves templates before use. Context object: `{ self: { roleName, instanceName }, workspace: '/job', env: process.env }`. |
| **MCP tool exposure to workspace containers** | MCP servers configured for an instance should also be available in workspace (interactive) containers, not just headless job containers. | MEDIUM | `templates/docker/claude-code-workspace/entrypoint.sh` needs the same MCP startup block as the job entrypoint. `ensureWorkspaceContainer()` in `lib/tools/docker.js` injects `MCP_CONFIG` alongside other env vars. Same `loadMcpServers()` + template resolution path as for job dispatch. |

### Differentiators

| Feature | Value Proposition | Complexity | Implementation Notes |
|---------|-------------------|------------|----------------------|
| **MCP server health checks at startup** | If an MCP server fails to start (bad config, missing API key), the job should fail fast with a clear error rather than silently proceeding without tools. | MEDIUM | Entrypoint extension: after starting MCP servers, call `mcp list-tools` (or equivalent) for each server. If any fail, log a clear error and exit with code 1 (triggering existing failure_stage detection in `collectLogs()`). New failure stage: `mcp_startup`. |
| **MCP config UI in settings** | Operators need to see which MCP servers are configured per instance without reading JSON files. A read-only view in the settings page shows active servers and their tool subsets. | LOW | Simple addition to `lib/chat/components/settings-secrets-page.jsx` — a new section that reads from a `getMcpServers()` Server Action and displays server names, commands, and tool counts. Read-only (editing via JSON file remains the operator interface). |
| **Pre-run MCP context hydration** | Before Claude Code starts, execute specific MCP tools to inject current context: fetch latest PR comments, run a database schema introspection, pull the current Slack thread. Enriches the job prompt beyond what `FULL_PROMPT` currently provides. | HIGH | Entrypoint extension: for each MCP server with `preRun: [toolName]` in config, call the tool and append the output to the job prompt file. Requires MCP client in entrypoint script. Defer to v2.1 unless a specific use case demands it. |
| **Shared MCP servers across cluster agents** | All agents in a cluster can share a single MCP server instance rather than each starting its own. Reduces startup overhead and API rate limits. | HIGH | Requires a sidecar container pattern: MCP server runs in a dedicated container on the cluster network; agent containers connect to it via TCP instead of stdio. Significant architectural change. Defer to v2.1. |

### Anti-Features

| Anti-Feature | Why Avoid | Alternative |
|--------------|-----------|-------------|
| **Org-wide MCP access (no per-instance scoping)** | A single MCP config shared across all instances defeats the isolation model. StrategyES should not access Noah's Brave Search API key or GitHub token. | `instances/{name}/config/MCP_SERVERS.json` with separate API keys per instance stored in respective `.env` files. The `AGENT_LLM_*` secret prefix handles key injection without cross-instance exposure. |
| **Dynamic MCP server installation (npm install in container)** | Installing MCP servers at container startup is slow (npm install can take 30-60s) and creates reproducibility problems. | Bake commonly needed MCP server packages into the Docker image at build time. Dynamic config specifies the command and args; the binary is already installed. |
| **MCP servers with persistent state inside containers** | Containers are ephemeral. An MCP server that writes state to the container filesystem loses that state when the container is removed. | MCP servers should be stateless. If persistence is needed, the MCP server should write to the named volume (`/job/`) or an external service (the DB, the GitHub API). |

---

## Feature Dependencies

```
[Existing v1.5 Infrastructure — All Shipped]
├── Docker Engine API + dockerode (lib/tools/docker.js)
├── LangGraph ReAct agent + 7 tools (lib/ai/tools.js)
├── WebSocket proxy + xterm.js terminal (lib/ws/)
├── SQLite via Drizzle ORM (lib/db/schema.js)
├── AI SDK v5 chat streaming (lib/chat/api.js)
├── REPOS.json per-instance config (instances/*/config/)
├── TRIGGERS.json + CRONS.json + executeAction() (lib/triggers.js, lib/cron.js, lib/actions.js)
├── startCodingTool + listWorkspacesTool + closeWorkspace (shipped v1.5)
└── Full chat UI with 22+ components (lib/chat/components/)

[Area 1: Web UI]
├── Code mode toggle ──modifies──> chat-input.jsx + message.jsx
├── Repo/branch selector ──uses──> loadAllowedRepos() + chat-input.jsx body metadata
├── Feature flags (FeaturesContext) ──new-pattern──> React context wrapping new pages
└── Live streaming in chat ──depends-on──> Area 3 streaming being built first

[Area 4: MCP Tool Layer] (Build First — Others Depend on It)
├── MCP_SERVERS.json ──follows-pattern-of──> REPOS.json
├── loadMcpServers() ──mirrors──> loadAllowedRepos()
├── Template resolution ──reuses──> resolveTemplate() from triggers.js
├── Job container MCP ──modifies──> entrypoint.sh (job)
│       └──requires──> MCP_CONFIG env var injection in dispatchDockerJob()
└── Workspace container MCP ──modifies──> entrypoint.sh (workspace)
        └──requires──> MCP_CONFIG injection in ensureWorkspaceContainer()

[Area 3: Headless Streaming]
├── Container log streaming ──extends──> collectLogs() with docker.attach()
├── Log forwarding ──uses──> addToThread() + existing Slack/Telegram clients
├── Progress indicators ──uses-existing──> ToolCall rendering in message.jsx
└── Cancel job ──uses-existing──> removeContainer() in docker.js

[Area 2: Clusters] (Largest Build — Needs MCP First for Role Tool Access)
├── Cluster config ──follows-pattern-of──> TRIGGERS.json + CRONS.json
├── Role dispatch ──extends──> create_job + target.json sidecar
├── Shared filesystem ──extends──> named volumes from v1.4
├── Label routing ──reads-from──> claude-output.jsonl (job output)
├── Cluster DB ──extends──> schema.js (jobOutcomes pattern)
└── create_cluster_job tool ──follows──> createJobTool pattern

[Cross-Area Dependencies]
├── Area 2 Clusters ──benefits-from──> Area 4 MCP (per-role tool access)
├── Area 2 Clusters ──benefits-from──> Area 3 Streaming (cluster agent progress)
└── Area 1 Streaming view ──requires──> Area 3 Streaming (infrastructure first)
```

### Critical Dependency: MCP Before Clusters

MCP must be built before clusters because cluster role definitions reference `mcpServers` in their config. A Security agent role might require a security-scanner MCP tool. Building clusters without MCP means role definitions are incomplete and all roles get the same default tool access.

### No Dependency: Web UI vs Infrastructure

The Web UI features in Area 1 are almost entirely already shipped in v1.5. The remaining pieces (code mode toggle, repo selector) are isolated UI additions with no dependency on Areas 2, 3, or 4.

---

## MVP Recommendation

### Build First (v2.0 launch)

- **MCP_SERVERS.json config + loadMcpServers()** — config schema and loader. Fast to build, unblocks cluster role definitions.
- **MCP lifecycle in job entrypoint** — inject MCP servers into job containers. Primary MCP deliverable — enables Brave Search, GitHub API, custom tools.
- **MCP lifecycle in workspace entrypoint** — identical pattern; operators in workspaces get the same tool access as jobs.
- **Container log streaming (web channel)** — attach Docker log stream, forward chunks to originating web chat thread. Highest operator impact: replaces "waiting..." with live feedback.
- **Code mode toggle** — 2-hour UI addition; immediate quality-of-life improvement for code-heavy operators.
- **Repo/branch selector** — removes repetitive "run this on repo X" prefix from every message. 4-hour UI addition.
- **Cluster config schema + coordinator runtime** — CLUSTER.json, first-agent dispatch, label routing, shared volume. Core cluster capability.
- **`create_cluster_job` LangGraph tool** — conversational cluster launch.
- **Cluster run DB tracking** — required to support the cluster coordinator; follows existing schema patterns.

### Add After Validation (v2.x)

- **Streaming to Slack with message editing** — operators have Slack notifications from v1.x; this upgrades the format, not adds capability.
- **Cancel job tool** — nice-to-have; 30-minute timeout handles most cases.
- **Cluster management UI page** — operators can inspect cluster runs via DB queries initially.
- **MCP health checks at startup** — add when misconfigured MCP becomes a real support issue.
- **MCP config UI** — read-only JSON is sufficient for 2-instance operator count.
- **Feature flags system (FeaturesContext)** — helpful but can be added incrementally.

### Defer (v3+)

- **DnD tab interface** — complex, low operator count, workspaces are already usable via single URL.
- **Parallel agent dispatch within clusters** — sequential clusters cover most use cases; parallelism adds coordinator complexity.
- **Pre-run MCP context hydration** — powerful but requires MCP client in entrypoint script; defer until a specific use case demands it.
- **Shared MCP servers across cluster agents** — sidecar container pattern; too complex for initial cluster implementation.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| MCP_SERVERS.json + loadMcpServers() | HIGH | LOW | P1 |
| MCP lifecycle in job containers | HIGH | MEDIUM | P1 |
| Container log streaming (web) | HIGH | HIGH | P1 |
| Cluster config + coordinator | HIGH | HIGH | P1 |
| `create_cluster_job` tool | HIGH | MEDIUM | P1 |
| Cluster DB tracking | MEDIUM | LOW | P1 (required for clusters) |
| Code mode toggle | MEDIUM | LOW | P1 |
| Repo/branch selector | MEDIUM | LOW | P1 |
| MCP lifecycle in workspace containers | MEDIUM | LOW | P1 (piggyback on job MCP) |
| Cancel job tool | MEDIUM | LOW | P2 |
| Streaming to Slack (edited messages) | MEDIUM | MEDIUM | P2 |
| Cluster management UI | LOW | MEDIUM | P2 |
| MCP health checks | MEDIUM | LOW | P2 |
| MCP config UI | LOW | LOW | P2 |
| Feature flags (FeaturesContext) | LOW | LOW | P2 |
| Log diff highlighting | LOW | MEDIUM | P3 |
| DnD tab interface | LOW | HIGH | P3 |
| Parallel cluster agents | MEDIUM | HIGH | P3 |
| Pre-run MCP hydration | MEDIUM | HIGH | P3 |

---

## PopeBot Implementation Pattern Reference

| Feature Area | PopeBot Status | ClawForge Approach |
|--------------|---------------|---------------------|
| Chat UI components (all pages) | Production — fully ported to ClawForge v1.5 | Use as-is; minor extensions (code mode, repo selector) |
| Swarm page (job status view) | Production — ported | Use as-is |
| Triggers (webhook-triggered actions) | Production — `lib/triggers.js` ported | Extend `executeAction()` with cluster action type |
| Crons (scheduled actions) | Production — `lib/cron.js` ported | Extend `executeAction()` with cluster action type |
| Cluster DB schema | Stub — tables defined, no runtime | Build coordinator runtime ourselves |
| Cluster runtime | Not built in PopeBot | Build from scratch following existing job dispatch patterns |
| Headless log streaming | Not present in PopeBot | Build from scratch using dockerode `attach()` API |
| MCP server configs | Not present in PopeBot | Build from scratch following REPOS.json pattern |
| Code mode toggle | Not present | Build from scratch (2-hour UI change) |
| Repo/branch selector | Not present | Build from scratch using `loadAllowedRepos()` |
| FeaturesContext | Present in PopeBot | Port pattern; adapt to per-instance config |

---

## Sources

- ClawForge `lib/chat/components/` (22 files) — direct inspection of all UI components; HIGH confidence
- ClawForge `lib/ai/tools.js` — 7 LangGraph tools confirmed (createJob, getJobStatus, getSystemTechnicalSpecs, createInstanceJob, getProjectState, startCoding, listWorkspaces); HIGH confidence
- ClawForge `lib/tools/docker.js:collectLogs()` and `closeWorkspace` — Docker log collection and workspace close; HIGH confidence
- ClawForge `lib/db/schema.js` — All tables confirmed (users, chats, messages, notifications, jobOrigins, jobOutcomes, settings, codeWorkspaces); HIGH confidence
- ClawForge `lib/triggers.js` — trigger loading and template resolution; HIGH confidence
- ClawForge `lib/cron.js` — cron scheduling and action dispatch; HIGH confidence
- ClawForge `lib/actions.js` — `executeAction()` dispatch for agent/command/webhook; HIGH confidence
- ClawForge `instances/noah/config/` and `instances/strategyES/config/` — confirmed no MCP_SERVERS.json exists; HIGH confidence
- ClawForge `lib/chat/api.js` — `/stream/chat` handler with AI SDK v5; HIGH confidence
- ClawForge `.planning/VISION.md` — gap analysis vs Stripe and PopeBot; HIGH confidence
- [dockerode API docs](https://github.com/apocas/dockerode) — `container.attach()` streaming API; HIGH confidence
- PopeBot upstream analysis from `.planning/VISION.md` — cluster DB schema stubs, trigger model, container patterns; HIGH confidence (direct codebase read documented in VISION.md)
- [Anthropic Claude Code MCP docs](https://docs.anthropic.com/claude-code/mcp) — `--mcp-config` flag, server spec format; MEDIUM confidence (need to verify current format during implementation)

---

*Feature research for: ClawForge v2.0 — Web UI, Clusters, Headless Streaming, MCP Tool Layer*
*Researched: 2026-03-12*
*Verified against codebase: 2026-03-12*
