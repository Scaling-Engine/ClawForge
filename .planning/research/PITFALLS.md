# Domain Pitfalls

**Domain:** Adding Web UI, Multi-Agent Clusters, Headless Job Streaming, and MCP Tool Layer to an existing multi-tenant Docker agent platform (ClawForge v2.0)
**Researched:** 2026-03-12
**Confidence:** HIGH (codebase inspection + official docs) / MEDIUM (community patterns, WebSearch-verified) / LOW (flagged where applicable)

---

> **Note:** This file supersedes the v1.5 PITFALLS.md (persistent workspaces). The prior file's pitfalls (WebSocket upgrade, idle timeout, CSWSH, Docker socket exposure, terminal resize, prompt injection via bridge) remain valid — they are preconditions for v2.0 work, not duplicated here. This file focuses exclusively on the four v2.0 feature additions and their integration risks.

---

## Critical Pitfalls

### Pitfall 1: Session Auth Bypasses API Key Auth on New Web Routes

**What goes wrong:**
ClawForge currently has no web pages — every route is an API endpoint authenticated by a per-instance API key (checked in `api/index.js`). Adding React pages introduces NextAuth session-cookie auth for the browser UI. The risk is that new page routes and Server Actions are protected by session cookies while the existing API routes remain protected by API keys — and these two auth systems never verify each other.

The concrete failure: a developer adds a Server Action (`/src/app/actions/startJob.ts`) for the Web UI, wraps it in a `useSession()` check, and ships it. The check works in the browser. But Server Actions are also callable via POST requests from any HTTP client. If the Server Action does not also validate the API key or perform its own server-side session check (not just the client-side hook), any unauthenticated caller can invoke it with a crafted POST.

Separately, Next.js middleware-based auth is bypassed when attackers spoof the `x-middleware-subrequest` header (CVE disclosed 2024-2025 affecting Next.js 11-14). Middleware-only protection is insufficient.

**Why it happens:**
Next.js App Router blurs the distinction between "client-side UI" and "server-side API." Server Actions feel like frontend code but they are HTTP endpoints. Developers who come from Pages Router or React SPA patterns underestimate that `useSession()` on the client does not protect the server.

**How to avoid:**
1. **Server-side session check in every Server Action.** Use `auth()` from NextAuth v5 (not `useSession()`) at the top of every Server Action. Fail fast with `throw new Error('Unauthorized')` if no session.
2. **Never rely solely on middleware for auth.** Middleware is a performance optimization (redirecting early), not a security boundary. Validate auth in Server Components, Server Actions, and API routes independently.
3. **Keep API routes on the existing API key auth path.** Do not migrate existing API routes to session auth. Add new web-only Server Actions that sit behind session auth. This creates clear boundaries: API key for bots/webhooks, session cookie for browser users.
4. **Audit all new routes before shipping.** Before any v2.0 phase ships, run a route audit: list every API route and Server Action, verify which auth method protects it, verify the protection is server-side.

**Warning signs:**
- A Server Action or API route is only protected by a client-side `useSession()` or `getSession()` hook
- Middleware is the only auth layer for a route
- Curl to a Server Action endpoint returns 200 without credentials

**Phase to address:**
Phase 1 (Web UI foundation) — auth architecture must be established before any feature routes are added. Retrofitting auth is orders of magnitude harder than designing it correctly on day one.

---

### Pitfall 2: Cluster Agents Enter Infinite Delegation Loop

**What goes wrong:**
Multi-agent clusters use a label-based state machine: each job produces a label (`ready`, `in_review`, `approved`, etc.) and the cluster router dispatches the next agent based on the label. The failure mode is a cycle: Agent A produces label `needs_revision`, Agent B (the reviser) produces label `needs_review`, Agent A receives the label and dispatches again. The loop runs indefinitely.

In ClawForge's Docker dispatch model, each loop iteration spins up a new Docker container, runs Claude Code (burning API tokens), creates a PR branch, and notifies the operator. A 10-iteration loop costs $5-50 in API spend and floods the operator's Slack channel with notifications within minutes.

**Why it happens:**
Label-based routing defines edges in a graph. If the graph has a cycle and no termination condition, the cycle runs forever. Developers define the "happy path" (A → B → done) but forget the "revision path" (A → B → A → B → ...). The state machine has no "visited" memory, no iteration counter, no external circuit breaker.

**How to avoid:**
1. **Hard iteration limit per cluster run.** Track iteration count in the cluster's metadata (in the `job.md` sidecar or a `cluster.json` in the job branch). Abort with failure notification after N iterations (suggest: 5 max per agent, 15 total).
2. **Cycle detection at route time.** Before dispatching the next agent, check if the same `(agent_type, label_in)` pair has been seen in this cluster run. If yes, terminate the cluster.
3. **Budget envelope at cluster spawn.** When an operator initiates a cluster, cap the total API cost (tokens or dollar estimate) for the entire run. ClawForge hooks already track invocations — add cluster-level cost aggregation and halt if the cap is exceeded.
4. **Revision limit per file/section.** If the cluster includes a reviewer agent, track how many times a specific file has been revised. Refuse to revise the same section more than twice without operator input.
5. **Human-in-the-loop for ambiguous labels.** If an agent produces a label not explicitly defined in the routing table, do not try to infer the next agent — notify the operator and pause.

**Warning signs:**
- Multiple PRs opened on the same branch within minutes
- Operator's Slack channel receives 5+ cluster notifications in rapid succession
- Docker container list shows multiple containers with similar names running concurrently
- API spend spike visible in Anthropic dashboard

**Phase to address:**
Phase 2 (cluster state machine) — iteration limits and cycle detection must be part of the first cluster dispatch implementation, not added as a safety patch after a runaway loop costs $200 in a dev environment.

---

### Pitfall 3: --dangerously-skip-permissions in Cherry-Picked Cluster Code Bypasses allowedTools Whitelist

**What goes wrong:**
ClawForge uses `--allowedTools` whitelist in job containers — a deliberate security decision over the `--dangerously-skip-permissions` approach used by thepopebot upstream. When cherry-picking cluster features from PopeBot v1.2.73, any cluster agent configuration that includes `--dangerously-skip-permissions` in its entrypoint or Docker exec command will silently override the allowedTools restriction.

The specific risk: PopeBot's cluster agents likely use `--dangerously-skip-permissions` because the upstream was designed for single-tenant use where the operator fully trusts the environment. If ClawForge's StrategyES instance (which is scoped to `strategyes-lab`) runs a cluster agent with bypass mode, the agent gains unrestricted tool access — including the ability to read files outside `strategyes-lab`, execute shell commands, and make network requests.

There is also a known interaction where `--allowedTools` may be silently ignored when `bypassPermissions` is also set (documented in Claude Code issues). The safe pattern is `--disallowedTools` which works correctly across all permission modes.

**Why it happens:**
Cherry-picking code from a less-restricted upstream introduces permission-model mismatches. The upstream code is correct for its context (single-tenant, trusted environment) and incorrect for ClawForge's context (multi-tenant, scoped instances). The mismatch is not obvious from reading the code — both approaches result in a Claude Code process that runs without prompting. The difference is in what that process can do.

**How to avoid:**
1. **Audit every entrypoint fragment cherry-picked from PopeBot.** Search for `dangerously-skip-permissions` in any imported code before merging. Replace with `--allowedTools` whitelist consistent with existing job containers.
2. **Use `--disallowedTools` as defense-in-depth.** Even with `--allowedTools` whitelist, add `--disallowedTools` for the tools that must never fire in any mode: `computer`, `bash_exec_unrestricted`, any tool not in the current whitelist.
3. **Per-instance tool whitelists in cluster configs.** Cluster agent configs (role definitions, AGENT.md files) should specify the allowed tools for that agent role. A "reviewer" agent does not need write tools; a "coder" agent does not need deployment tools.
4. **Test with minimal-privilege Claude Code.** Before shipping any cluster agent, run it in a test environment with an intentionally narrow `--allowedTools` list and verify it completes the task. If it cannot, the task definition is wrong, not the tool list.
5. **Hooks as mandatory backstop.** The existing `PostToolUse` hook logs all invocations. Add a `PreToolUse` hook that rejects any tool invocation not in the instance's explicit whitelist, even if the Claude Code flag was misconfigured.

**Warning signs:**
- A cherry-picked file contains `dangerously-skip-permissions` anywhere in shell commands
- A cluster agent config does not specify `--allowedTools`
- A StrategyES cluster agent creates files outside `/workspace/strategyes-lab/`
- The PreToolUse hook logs a tool invocation not in the expected whitelist

**Phase to address:**
Phase 2 (cluster agent configuration) — permission model must be verified before any cluster agent runs in production. A single misconfigured cluster agent in the StrategyES instance could expose Noah's environment variables.

---

### Pitfall 4: Headless Log Stream Accumulates Memory When Consumer Disconnects

**What goes wrong:**
Headless job streaming works by: Docker container emits logs → Event Handler attaches via `docker.getContainer().logs()` stream → Event Handler proxies log chunks over WebSocket to the browser → Browser renders them in the chat UI. When the user closes the browser tab mid-job, the WebSocket closes. But the Docker log stream is still running on the server side. If the Event Handler continues reading from the Docker stream and buffering chunks (waiting for a consumer to reconnect), memory accumulates indefinitely.

A 30-minute Claude Code job produces approximately 50-200MB of log output (ANSI escape codes, JSON tool calls, file content). With 5 concurrent jobs and disconnected consumers, the Event Handler process can accumulate 1-4GB of buffered log data before OOM.

**Why it happens:**
Node.js streams are push-based by default — the producer pushes data regardless of whether the consumer is ready. When the WebSocket (the consumer) closes, `ws.send()` will throw or return false, but the Docker log stream (the producer) keeps emitting. Without explicit backpressure handling or consumer-detection, the Event Handler accumulates data in memory.

**How to avoid:**
1. **Track active WebSocket consumers per job.** Maintain a `Map<jobId, Set<WebSocket>>` in the Event Handler. When a WebSocket closes, remove it from the set. When the set is empty, pause or destroy the Docker log stream for that job — do not buffer.
2. **Respect stream backpressure.** Check `ws.bufferedAmount` before sending. If it exceeds a threshold (suggest: 1MB), pause reading from the Docker stream until the client catches up or disconnects. The `ws` library's `pause()/resume()` API or checking `socket.writableLength` is the correct mechanism.
3. **Ring buffer for reconnection.** Instead of full buffering, maintain a fixed-size ring buffer of the last 500 lines per active job. On WebSocket reconnect, replay only the ring buffer. After reconnect, switch to live streaming.
4. **Hard memory cap per stream.** If a job's stream buffer exceeds 10MB (no consumer), terminate the stream proxy and log a warning. The job continues running in Docker — only the log forwarding stops.
5. **Periodic flush + destroy.** If no consumer reconnects within 60 seconds, destroy the stream. The operator can always check raw job logs via `docker logs <container_id>`.

**Warning signs:**
- Event Handler process memory grows continuously during active jobs
- `process.memoryUsage().heapUsed` exceeds 500MB during normal operation
- Node.js OOM crash correlates with concurrent job count
- Log stream proxy never pauses even with no WebSocket consumers

**Phase to address:**
Phase 3 (headless streaming) — consumer tracking and backpressure must be in the first streaming implementation. Streaming without consumer lifecycle management is a memory leak by design.

---

### Pitfall 5: MCP Tools Discovered Only at Claude Code Startup, Not Hot-Reloadable in Containers

**What goes wrong:**
MCP server configs are read when Claude Code starts. If a per-instance MCP server config is written to the container after Claude Code has already launched, the new tools are not available for the current session. In headless job containers (short-lived, fresh start per job), this is fine — each job starts fresh and reads the current config. In persistent workspace containers (long-lived), a config update requires stopping and restarting the entire workspace, which means killing the operator's active terminal session.

Additionally, MCP servers started as child processes inside a container must be running before Claude Code reads the config. If the MCP server fails to start (bad config, missing credential, version mismatch), Claude Code silently treats those tools as unavailable — there is no startup error, just missing tools.

**Why it happens:**
This is an architectural constraint of the MCP protocol: tool discovery happens at initialization, not dynamically. Claude Code does not poll for new MCP servers or reload configs mid-session. The GitHub issue #17975 on `anthropics/claude-code` confirms hot-reload support is a feature request, not a current capability.

**How to avoid:**
1. **Write MCP config before container starts.** In the container creation flow (`createContainer()` in `lib/tools/docker.js`), write the per-instance MCP config to the container's volume before the entrypoint runs. The entrypoint reads it on start. Config is stable for the job lifecycle.
2. **MCP server health check at entrypoint.** The workspace/job entrypoint should start each configured MCP server and verify it responds before launching Claude Code. If any MCP server fails to start, log the failure prominently and proceed without it — do not silently skip.
3. **Separate MCP config per instance in REPOS.json or instance config.** Extend the existing per-instance config pattern to include an `mcp_servers` block: `[{ "name": "brave-search", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-brave-search"], "env": { "BRAVE_API_KEY": "${AGENT_LLM_BRAVE_API_KEY}" } }]`. The entrypoint templates this into `.claude/mcp.json`.
4. **Restart signal for workspace MCP changes.** When a workspace is long-lived and the operator updates MCP config, provide an explicit "Apply MCP changes" button in the UI that stops and restarts the workspace container. Do not attempt in-place hot reload.

**Warning signs:**
- `claude --mcp-debug` output shows MCP tools missing that should be configured
- Claude Code references tools that are not available ("I don't have access to search")
- MCP server process is not running inside the container (`ps aux | grep mcp`)
- Config changes have no effect until workspace is manually restarted

**Phase to address:**
Phase 4 (MCP Tool Layer) — MCP config templating must be part of container creation, not a post-creation patch step.

---

### Pitfall 6: Shared Named Volumes in Cluster Runs Create Cross-Agent State Corruption

**What goes wrong:**
ClawForge uses named volumes per repo per instance (`clawforge-{instance}-{slug}`) for warm starts. These volumes contain a cached git clone, warmed by `git fetch` on each job start. In a multi-agent cluster where Agent A and Agent B both operate on the same repo, they share the same named volume. If Agent A commits and pushes while Agent B is mid-operation on the same volume, Agent B's git state becomes inconsistent: `git status` shows unexpected changes, `git push` fails with non-fast-forward errors, or `git fetch` pulls Agent A's commits and corrupts Agent B's in-progress work.

The flock mutex in `lib/tools/docker.js` serializes volume access for job dispatch — but cluster agents that run concurrently bypass this if two agents are dispatched simultaneously for the same repo.

**Why it happens:**
The named volume design optimized for the case where jobs are sequential (one job at a time per repo). Clusters break this assumption by design — multiple agents work in parallel. The mutex is at the dispatch level, not maintained for the entire agent lifetime.

**How to avoid:**
1. **One volume clone per cluster agent, not per repo.** Create a fresh volume for each cluster run: `clawforge-{instance}-{slug}-cluster-{clusterid}-{agentid}`. Each agent gets a clean clone. No sharing, no corruption. Cost: slower starts (fresh clone vs warm fetch), but correctness is not negotiable.
2. **Alternatively: separate working directories within one volume.** Each agent works in a separate subdirectory (`/repo/agent-{id}/`) of a shared volume. Use hard links for the git object store (reducing disk usage) but separate index and working tree per agent.
3. **Serialize cluster agents that operate on the same repo.** If Agent A and Agent B both touch the same repo, do not dispatch them concurrently. Use the existing flock mutex across the entire agent lifetime, not just dispatch. Only parallelize agents operating on different repos.
4. **Cluster-scoped branch naming.** Each cluster agent works on its own branch: `clawforge/{cluster_id}/{agent_id}/{uuid}`. Agents never push to each other's branches. The cluster orchestrator merges results.

**Warning signs:**
- Cluster jobs fail with `git push rejected: non-fast-forward` errors
- Two cluster agents show different `git log` output for the same repo at the same time
- Entrypoint logs show `flock: timeout` errors during cluster runs
- Agent B's PR contains Agent A's commits

**Phase to address:**
Phase 2 (cluster architecture) — volume isolation strategy must be defined before first cluster job dispatch. Retrofitting volume isolation after a cluster corrupts a production repo is expensive.

---

### Pitfall 7: SQLite Write Contention Collapses Under v2.0 Concurrent Load

**What goes wrong:**
ClawForge uses SQLite via Drizzle ORM and LangGraph's `SqliteSaver` for all persistent state. The v1.x load was tolerable: one job at a time, sequential writes, low concurrency. v2.0 triples concurrent writers: the streaming log proxy writes job status updates, the cluster orchestrator writes agent state transitions, the Web UI writes chat messages, and the LangGraph checkpoint saver writes conversation state — all simultaneously.

SQLite allows only one writer at a time. The `@langchain/langgraph-checkpoint-sqlite` documentation explicitly warns: "The synchronous `SqliteSaver` is meant for lightweight, synchronous use cases (demos and small projects) and does not scale to multiple threads." With WAL mode enabled, multiple readers are fine but writes still serialize. Under v2.0 load, the write queue backs up, `SQLITE_BUSY` errors surface, and the Event Handler's async code retries in a tight loop that compounds the problem.

The LangGraph team's official recommendation for production multi-threaded workloads is PostgreSQL, not SQLite.

**Why it happens:**
SQLite's write serialization is a design property, not a bug. The `busy_timeout` setting (how long SQLite retries before returning `SQLITE_BUSY`) is the only tuning knob. With long-running write transactions (e.g., the LangGraph checkpoint saver holding a write lock during agent inference), other writers queue indefinitely.

**Consequences:**
- Log streaming writes drop silently (non-fatal, but streaming becomes choppy)
- LangGraph checkpoint writes fail, causing agent state loss (fatal for multi-turn conversations)
- Web UI chat messages interleave incorrectly
- Under load, the Event Handler process becomes non-responsive to new connections

**How to avoid:**
1. **Enable WAL mode explicitly.** `PRAGMA journal_mode=WAL` — allows reads while writing. Set this at DB init. Also set `busy_timeout = 5000` to prevent immediate `SQLITE_BUSY` failures on write contention.
2. **Separate databases for separate concerns.** Split into three SQLite files: `agent.db` (LangGraph checkpoints), `ops.db` (job state, notifications, workspaces), `chat.db` (messages, UI state). Each file has its own write queue. Reduces contention substantially.
3. **Minimize write transaction duration.** Avoid holding write locks during async operations. Do not `await fetch()` inside a write transaction. Write, close transaction, then do async work.
4. **Assess PostgreSQL migration threshold.** If v2.0 production load exceeds 3 concurrent cluster runs or 10+ active Web UI sessions, migrate `agent.db` (LangGraph) to PostgreSQL. The LangGraph JS library ships `@langchain/langgraph-checkpoint-postgres` — migration is a saver swap, not an architecture change.
5. **Monitor write queue depth.** Add a metric: count of `SQLITE_BUSY` retries per minute. If this exceeds 10/min in production, it is time to migrate or shard.

**Warning signs:**
- `SQLITE_BUSY` or `database is locked` errors in logs
- LangGraph conversation state is lost mid-session
- Streaming updates arrive in bursts (queued) rather than continuously
- Event Handler responds slowly to new connections during heavy cluster activity

**Phase to address:**
Phase 2 (clusters) and Phase 3 (streaming) together create the critical load increase. WAL mode and DB separation should be in Phase 1 (foundation) before the load arrives.

---

### Pitfall 8: MCP Per-Agent Isolation Not Supported by Claude Code CLI

**What goes wrong:**
The v2.0 MCP Tool Layer intends to give each cluster role (CTO, Security, UI-UX, Developer) a different set of MCP tools — the CTO agent gets architecture tools, the Security agent gets vulnerability scanning tools, etc. This requires per-agent MCP server isolation.

Claude Code CLI does not currently support per-agent MCP isolation. Any MCP server configured globally is enumerable and callable from any context, including the main thread and all sub-agents. The GitHub issue #4476 on `anthropics/claude-code` filed July 2025 confirms: "Expected: sub-agents configured with MCP servers in non-inheriting mode. Actual: any MCP server configured via global scopes is enumerable and callable from the main thread."

The practical consequence: if the Security role's MCP server includes a vulnerability database tool, the Developer role can also call it — including in ways the Security role's prompt would not allow. In ClawForge's multi-tenant model, this leaks capability across role boundaries.

**Why it happens:**
Claude Code's MCP config is read from `.claude/settings.json` at startup and applies globally to the process. There is no mechanism to restrict MCP tool availability to specific sub-agent contexts within a single Claude Code session.

**How to avoid:**
1. **One container per cluster role.** The cleanest isolation is process isolation: each cluster role runs in its own container with its own Claude Code instance and its own `.claude/settings.json`. Role-specific MCP servers are configured only in that container's settings. This is the architecture ClawForge already uses for job containers — apply the same pattern to cluster agents.
2. **Do not rely on prompt-based MCP isolation.** Telling the CTO agent in its system prompt "do not use the Security tools" is not a security boundary. Tools remain callable regardless of prompt instructions.
3. **Monitor the upstream issue.** Follow `anthropics/claude-code` issue #4476. If per-agent MCP scoping ships, it is preferable to the per-container approach for workspace containers. For job containers, per-container isolation remains correct regardless.

**Warning signs:**
- A cluster agent calls an MCP tool that its role definition does not grant
- MCP tool invocation logs show cross-role tool calls
- A Developer agent calls a Security-scoped tool that should be restricted

**Phase to address:**
Phase 4 (MCP Tool Layer) — per-role MCP isolation architecture must be decided before any cluster MCP config is written. The per-container approach resolves this but requires cluster agent dispatch to create role-scoped containers, not a single multi-role container.

---

## Moderate Pitfalls

### Pitfall 9: React State Goes Stale on Job Status Updates via WebSocket

**What goes wrong:**
The Web UI shows live job status: "Running", "Complete", "Failed". Status updates arrive via WebSocket. React state that closes over the initial render captures the old job list. When a WebSocket message updates job ID `abc`, the `setJobs` updater uses the stale closure and produces `jobs` without the update. The UI shows stale state until a full re-render (navigation or refresh).

This is the classic React stale closure problem, exacerbated by WebSocket event listeners registered once in `useEffect` and never re-registered.

**Why it happens:**
`useEffect` with an empty dependency array (`[]`) registers the WebSocket handler once. The handler closes over the initial `jobs` state. Every subsequent update references the empty initial state, not the current state. The fix is always a `useRef` for the latest state or using a functional update: `setJobs(prev => ...)`.

**How to avoid:**
1. **Always use functional updates in WebSocket handlers.** `setJobs(prev => prev.map(j => j.id === msg.jobId ? { ...j, status: msg.status } : j))` — the `prev` argument is always the latest state.
2. **Extract WebSocket logic into a custom hook.** `useJobStream(jobId)` encapsulates connection lifecycle, cleanup, and state updates. UI components consume the hook without touching WebSocket internals.
3. **Use a ref for the current state in handlers.** `const jobsRef = useRef(jobs); jobsRef.current = jobs;` — update the ref on every render, reference it inside handlers.
4. **Consider Zustand or Jotai for job state.** Atomic state stores are WebSocket-friendly because handlers can update store atoms without closure concerns. The current project has no state management library — for real-time job status across multiple components, a lightweight store is worth the dependency.

**Warning signs:**
- Job status shows "Running" after a "Complete" WebSocket message
- UI only updates correctly after navigation or tab switch
- Console logs show the WebSocket message received correctly, but UI does not update

**Phase to address:**
Phase 1 (Web UI foundation) — establish the WebSocket state management pattern before building any feature that depends on real-time updates. A wrong pattern repeated across 10 components requires fixing all 10.

---

### Pitfall 10: MCP Protocol Version Mismatch Silently Disables Tools

**What goes wrong:**
MCP protocol versions are negotiated at initialization. The MCP server installed in the container (via npm package or Docker image layer) may implement protocol version `2024-11-05` while Claude Code in the container expects `2025-11-25`. If the versions are incompatible, the MCP connection fails — but Claude Code does not surface this as an error to the operator. Tools are simply unavailable, and the agent proceeds without them.

The MCP spec has had breaking changes between quarterly releases: batching was added in `2025-03-26` and removed in `2025-06-18`. An MCP server pinned to a version that added batching will fail to connect with a Claude Code version that removed it.

**Why it happens:**
MCP server npm packages in Docker images are pinned at image build time. Claude Code CLI updates independently. If the image is not rebuilt when Claude Code's MCP client version advances, the pinned MCP server package may implement a stale protocol version.

**How to avoid:**
1. **Pin both Claude Code CLI version and MCP server versions together.** In the job Dockerfile, pin Claude Code to a specific npm version and pin each MCP server to a version that is compatible with it. Update both together.
2. **Log MCP negotiation at startup.** In the entrypoint, run `claude --mcp-debug` or check Claude Code's startup output for MCP connection results. Log each MCP server's connection status explicitly: `MCP server 'brave-search': connected (2025-11-25)` or `FAILED: version mismatch`.
3. **Test MCP tools in the container explicitly.** Part of the container build verification (alongside the existing GSD test harness) should invoke a tool via MCP and verify the response.
4. **Follow Anthropic's Claude Code release notes.** When Claude Code releases a new version, check if MCP client behavior changed before updating the Docker image.

**Warning signs:**
- Agent tasks that previously used web search now complete without searching
- No MCP-related entries in Claude Code's JSONL output when tools should have been used
- `claude --mcp-debug` shows version negotiation failures at startup

**Phase to address:**
Phase 4 (MCP Tool Layer) — MCP version verification should be in the container build test step before shipping.

---

### Pitfall 11: Web UI Adds Build Complexity to an API-Only Next.js App

**What goes wrong:**
The current Event Handler is Next.js configured as API-only — no pages, no App Router UI, no client JavaScript bundles. Adding React pages introduces:
- `next/image` requires a configured domain allowlist or breaks
- Server Components require the App Router, which may conflict with existing Pages Router API routes
- Tailwind CSS (or any CSS framework) adds a build step that was not in the original CI
- `next build` time increases significantly with UI components
- The `server.js` custom HTTP server may need updates to serve static assets correctly

The specific risk: a PR that "just adds a chat page" accidentally breaks the API routes because App Router and Pages Router handle the same path prefix differently.

**Why it happens:**
Next.js tries to be backward compatible but the App Router and Pages Router have different behavior for routing, middleware, and data fetching. Developers familiar with one pattern make assumptions that break the other.

**How to avoid:**
1. **Audit router conflicts before adding any pages.** Map every existing API route path and verify none conflict with the planned page structure. `/api/slack/events` (Pages Router API) must not clash with `app/api/slack/events/route.ts` (App Router).
2. **Keep API routes in `pages/api/`** (Pages Router). New web pages go in `app/` (App Router). This is a supported hybrid mode in Next.js 13+. Do not migrate existing API routes to App Router route handlers.
3. **Update the custom `server.js`** to correctly serve the App Router's static assets and RSC payload. The current `server.js` (which handles WebSocket upgrades) must be compatible with Next.js App Router's `__nextjs_original-stack-frame` and RSC streaming response headers.
4. **Add `next build` to the CI verification step.** The VERIFICATION-RUNBOOK.md should include a build check after UI additions. A build that succeeds in dev (`next dev`) but fails in prod (`next build`) is a common trap.
5. **Test API routes after every UI addition.** Run the existing API integration tests (S1-S5 regression scenarios) after each UI phase ships.

**Warning signs:**
- `next dev` works but `next build` fails
- An API route returns 404 after adding a new page at the same URL prefix
- The custom `server.js` crashes on startup after a Next.js version bump

**Phase to address:**
Phase 1 (Web UI foundation) — establish the hybrid router setup (Pages Router API + App Router pages) in the first UI PR, verified by running the full VERIFICATION-RUNBOOK.md.

---

### Pitfall 12: Cluster Notifications Flood Slack Channel and Lose Operator Signal

**What goes wrong:**
A 3-agent cluster on a coding task produces: 1 dispatch notification + 3 job-started notifications + 3 job-completed notifications + 1 cluster-done summary = 8 Slack messages per cluster run. If the cluster loops once (one revision cycle), that doubles to 16 messages. An active coding session with 5 clusters generates 40-80 Slack messages in an hour, making the channel unusable for anything other than cluster noise.

The existing job notification system sends one message per job. Clusters multiply this without a grouping mechanism.

**How to avoid:**
1. **Cluster-level summary, not per-agent notifications.** Suppress per-agent job notifications when a job is part of a cluster. Only send a cluster-level summary when all agents complete: "Cluster [name] complete: Agent A wrote tests, Agent B implemented feature, Agent C reviewed and approved. PR #42 ready."
2. **Thread replies for cluster updates.** The first cluster notification opens a new Slack thread. All subsequent cluster updates (agent progress, revisions) reply to that thread. The channel shows one message per cluster; the thread shows the full log.
3. **Operator opt-in for verbose mode.** Default to cluster-level summary. Let the operator request verbose per-agent updates via a command or UI toggle.

**Warning signs:**
- Slack channel shows more than 2 messages per cluster run
- Operator misses important notifications because they are buried in cluster noise
- Multiple threads opened for the same cluster run

**Phase to address:**
Phase 2 (cluster orchestration) — notification strategy must be designed alongside cluster dispatch. The existing `waitAndNotify` pattern is per-job and will not work without modification for clusters.

---

### Pitfall 13: Headless Log Stream Includes Raw ANSI Escape Codes in Chat UI

**What goes wrong:**
Claude Code outputs rich terminal formatting: color codes (`\x1b[32m`), cursor movement sequences (`\x1b[2K`), spinner animations (`\x1b[1A`), progress bars, and bold/italic text. These are ANSI escape sequences designed for a terminal emulator. When streamed directly into a chat UI (Slack message, web chat text node), the raw escape sequences appear as garbage characters: `[32mRunning tests...[0m`.

Docker's log stream outputs the raw bytes from the container's stdout/stderr, which include all ANSI sequences. Note also that ANSI escape sequences are an active security concern: CVE-2025-58160 (March 2026) documents how user-controlled input containing ANSI codes can poison logs. Do not reflect raw container output to the operator without sanitization.

**How to avoid:**
1. **Strip ANSI escape codes before forwarding to chat.** Use `strip-ansi` (npm package, maintained) to clean log lines before sending to Slack/Telegram/web chat. Apply only to non-terminal destinations — the xterm.js terminal can handle raw ANSI.
2. **Use the `NO_COLOR` environment variable.** Set `NO_COLOR=1` in the job container environment. Claude Code and most CLI tools respect this flag and suppress ANSI formatting. Simpler than stripping on the consumer side.
3. **Selective forwarding.** Not every log line needs to be forwarded. Filter to summary lines only: lines matching `Tool:`, `Result:`, `Error:`, `PR created`. Skip verbose JSON tool output and raw file content.

**Warning signs:**
- Slack messages contain `[32m`, `[0m`, `[2K` characters
- Log output in the web chat UI is unreadable
- Users report seeing "weird characters" in job updates

**Phase to address:**
Phase 3 (headless streaming) — apply ANSI stripping in the first streaming implementation before any demo or production use.

---

### Pitfall 14: xterm.js Instances in DnD Tab System Leak Memory on Unmount

**What goes wrong:**
The Web UI includes a drag-and-drop tab system for multiple terminal sessions. Each tab contains an xterm.js `Terminal` instance. When a tab is closed or dragged to a different panel, the React component unmounts. If `Terminal.dispose()` is not called in the cleanup function, the xterm.js instance continues to hold references to:
- The DOM node it was attached to
- Its internal buffer (scrollback history, potentially 34MB for a 160x24 terminal with 5000 lines of scrollback)
- Event listeners on `document`
- WebSocket references for the ttyd proxy

With DnD tabs, the same `Terminal` instance may be detached and reattached to different DOM nodes during drag operations. If the component mounts a new `Terminal` on reattach without disposing the old one, memory doubles per drag cycle. A session with 4 tabs dragged 5 times each accumulates 20 orphaned Terminal instances.

**Why it happens:**
xterm.js is not a React component — it is an imperative library that manages its own DOM. React's component lifecycle does not automatically clean up external imperative resources. The `useEffect` cleanup function is the only opportunity to call `Terminal.dispose()`, and it is easy to omit or to call it at the wrong lifecycle moment (e.g., before the Terminal has finished rendering).

**How to avoid:**
1. **Call `Terminal.dispose()` in every `useEffect` cleanup.** No exceptions: `return () => { terminal.dispose(); }` in the same effect that created the Terminal. The terminal must outlive the effect (store in a ref), not be recreated on every render.
2. **Store the Terminal instance in a `useRef`, never in `useState`.** State changes trigger re-renders which would recreate the Terminal. Refs persist across renders without triggering re-renders.
3. **Use a stable Terminal key for DnD moves.** When a tab is dragged, pass the existing Terminal ref to the new position — do not unmount and remount the component. React's `key` prop causes unmount/remount; avoid changing keys on drag.
4. **Implement a Terminal pool for reuse.** For a tab system with a fixed max (e.g., 4 tabs), pre-create Terminal instances at app load and reuse them across tab opens/closes. Dispose only when the session ends, not when a tab moves.
5. **Test with Chrome DevTools Memory panel.** Before shipping the tab system, take heap snapshots before and after dragging tabs. Any growing `Terminal` count is a leak.

**Warning signs:**
- Browser tab memory grows continuously as terminal tabs are opened and closed
- Chrome Task Manager shows Event Handler page memory above 500MB
- Performance degrades on long sessions with multiple terminal tabs
- `Terminal` instances appear in heap snapshot as detached nodes

**Phase to address:**
Phase 1 (Web UI) when the DnD tab system is built. Memory leak patterns in terminal emulators compound over long sessions — operators running 8-hour coding sessions will encounter this.

---

### Pitfall 15: NextAuth Session Expires Under Active Long-Running Browser Sessions

**What goes wrong:**
NextAuth sessions default to 30-day lifetime but access tokens do not auto-refresh when the page is idle. More critically: WebSocket connections do not trigger NextAuth's session refresh mechanism. If an operator has the ClawForge Web UI open for a 4+ hour coding session without page navigation, the NextAuth JWT token expires silently. The next Server Action or fetch request returns a session error, and the WebSocket connection drops because the underlying ticket system cannot issue new tickets for an expired session.

The specific flow: operator opens workspace → starts a 4-hour coding job → leaves the tab open → JWT expires → streaming stops → next UI interaction requires re-login — but the terminal session is already gone.

**Why it happens:**
NextAuth's `updateAge` property (how often to extend the session) requires HTTP requests to trigger. WebSocket connections do not generate HTTP requests, so long WebSocket sessions (like an active ttyd terminal proxy) do not extend the session. The tab appears active to the operator but is idle from NextAuth's perspective.

**How to avoid:**
1. **Implement session keepalive in the Web UI.** Every 15 minutes, make a lightweight fetch to a session-validating endpoint (`/api/auth/session`). This triggers NextAuth's rolling session extension.
2. **Check session validity before issuing WebSocket tickets.** The `issueTicket()` function in `lib/ws/tickets.js` should verify the session is valid (not near expiry) before issuing. If the session expires in less than 10 minutes, force a re-auth.
3. **Detect expired session at the WebSocket level.** When the ttyd proxy receives a close event from the upstream, check whether the session is still valid. If not, send a structured close message to the browser that triggers a re-login flow rather than a confusing "connection lost" error.
4. **Set session maxAge to 24 hours for operator use cases.** Operators run long sessions. The default 30 days is fine but `updateAge` should be set to `3600` (1 hour) so sessions refresh frequently with normal usage.

**Warning signs:**
- "Unauthorized" errors appear in the browser console after hours of active use
- WebSocket connections drop after a fixed time interval
- Operators report needing to re-login mid-session without closing the tab

**Phase to address:**
Phase 1 (Web UI auth foundation) — session keepalive must be in the initial auth implementation, not added after an operator loses a 3-hour session.

---

### Pitfall 16: GitHub Webhook Ordering Cannot Be Assumed for Cluster State Machine

**What goes wrong:**
The cluster state machine relies on GitHub label events delivered via webhook: when an agent labels a PR `approved`, the Event Handler receives the webhook, reads the label, and dispatches the next cluster agent. The problem: GitHub does not guarantee webhook delivery order. GitHub's documentation states explicitly that webhooks are best-effort and may arrive out of order.

In practice: Agent A applies label `ready-for-review` at T=0 and label `in-review` at T=1. The Event Handler may receive the `in-review` event before `ready-for-review`. The state machine reads the first-received label, thinks the PR is `in-review` without going through `ready-for-review`, and dispatches the wrong agent — or dispatches no agent if the state transition from `(initial → in-review)` is not defined.

Additionally, GitHub webhook delays of 20-40 minutes are documented for high-load periods. A cluster that expects sub-second state transitions cannot use webhook-arrival-time as a reliable sequencing mechanism.

**Why it happens:**
GitHub webhooks are delivered over HTTP with eventual-consistency guarantees. The webhook system retries failed deliveries, further scrambling the sequence. Event delivery order is not guaranteed to match event occurrence order.

**How to avoid:**
1. **Use GitHub event timestamps, not arrival order.** When processing label events, compare the `created_at` timestamp of the event against the cluster's known state transitions. Ignore events that arrive out of order relative to the cluster's current state.
2. **Validate state against GitHub API, not just webhooks.** Before dispatching the next cluster agent, query the GitHub API to confirm the PR's current label set directly. Do not rely solely on the webhook payload — it may be stale or reordered.
3. **Design idempotent state transitions.** If the Event Handler receives `in-review` when already `in-review`, it should be a no-op, not a re-dispatch. Every state transition handler must be idempotent.
4. **Use a database-side state machine, not pure webhook routing.** Store the cluster's authoritative state in the SQLite `cluster` table. The webhook updates the DB; the DB drives dispatch. Webhooks are inputs, not commands.

**Warning signs:**
- A cluster agent is dispatched twice for the same label event
- Cluster state shows `in-review` without passing through `ready-for-review`
- Cluster hangs indefinitely when a webhook is delayed

**Phase to address:**
Phase 2 (cluster state machine design) — idempotent state transitions and webhook-order independence must be requirements, not afterthoughts.

---

## Minor Pitfalls

### Pitfall 17: Docker Socket Mount Increases Host Compromise Surface in Clusters

**What goes wrong:**
The Event Handler mounts the Docker socket (`/var/run/docker.sock`) to manage job and workspace containers. This mount grants the Event Handler process root-equivalent access to the host. In v1.x, this was an acceptable tradeoff because only the Event Handler process could create containers. In v2.0, cluster agents — which are themselves Docker containers — may need to spawn child containers (cluster-worker containers). This would require either: (a) passing the Docker socket into cluster-worker containers (container-in-container), or (b) having the Event Handler relay container spawn requests.

CVE-2025-9074 (CVSS 9.3, patched in Docker Desktop 4.44.3) demonstrated that malicious containers can access the Docker Engine API without explicit socket mounts via subnet-level SSRF. The more containers touch Docker APIs, the larger the attack surface.

**How to avoid:**
1. **Never mount the Docker socket in cluster-worker containers.** All container lifecycle management must stay in the Event Handler. Cluster-worker containers request new agent spawns by writing a structured request to their `outbox/` directory (the shared filesystem pattern), and the Event Handler's cluster orchestrator reads and executes the spawn.
2. **Rate-limit container creation per cluster.** The cluster orchestrator should enforce: max N containers per cluster run, max M containers per minute across all clusters. Prevents both runaway loops and potential abuse from a compromised cluster agent.
3. **Keep Docker Desktop updated.** CVE-2025-9074 is patched in 4.44.3 — verify production Docker version is not vulnerable.

**Phase to address:**
Phase 2 (cluster architecture) — the spawn-via-outbox pattern must be specified before any cluster container creates child containers.

---

### Pitfall 18: Port Conflicts Between MCP Servers in Workspace Containers

**What goes wrong:**
MCP servers started as child processes inside workspace containers communicate over stdio (pipe) or over local HTTP ports. If multiple MCP servers are configured for a workspace and two attempt to bind the same local port, the second server fails silently and its tools disappear without error. Claude Code's `--mcp-debug` output may not be visible to the operator in normal use.

With the v2.0 MCP layer potentially adding 3-5 MCP servers per instance (brave-search, filesystem, GitHub, custom), the probability of port collision increases.

**How to avoid:**
1. **Prefer stdio transport for MCP servers where possible.** Stdio MCP servers do not bind ports — they communicate via stdin/stdout. All official Anthropic MCP reference servers support stdio. Only use HTTP transport when the MCP server requires it.
2. **Assign explicit port ranges for HTTP MCP servers.** Reserve a block (e.g., 9000-9010) for MCP servers. Document the per-server port assignment in the instance config. The entrypoint verifies each port is free before starting the server.
3. **Health check all MCP servers before Claude Code starts.** Add a pre-launch check in the entrypoint that pings each configured MCP server and logs failure if it does not respond. Fail fast rather than silently.

**Phase to address:**
Phase 4 (MCP Tool Layer) — port assignment strategy in the instance config schema, checked at entrypoint.

---

### Pitfall 19: Cherry-Pick Conflicts When PopeBot Assumes Single-Tenant Model

**What goes wrong:**
PopeBot v1.2.73 is single-tenant: one set of environment variables, one Slack app, one agent configuration, one Docker network. Cherry-picked code from PopeBot often contains hard-coded assumptions about this single-tenant model: config read directly from `process.env.SLACK_BOT_TOKEN` (not from an instance map), Docker network names computed without an instance prefix, file paths relative to a single working directory.

When these fragments are cherry-picked into ClawForge's multi-tenant codebase, they silently break instance isolation: the StrategyES instance's Slack token gets confused with Noah's, container names collide across instances, and file path resolution misidentifies the target repo.

**Why it happens:**
PopeBot's code is correct in its context. Cherry-picking extracts code from its context. Multi-tenant substitutions (instance name, per-instance env vars, namespaced volumes) must be added to every cherry-picked fragment.

**How to avoid:**
1. **Treat every cherry-pick as a port, not a copy.** Do not merge verbatim. For every cherry-picked file, identify: all `process.env` reads (replace with per-instance config lookup), all Docker container names (add instance prefix), all file paths (add instance namespace), all hardcoded URLs/tokens.
2. **Write a "multi-tenant checklist" for cherry-picks.** A simple audit list checked against every cherry-picked file:
   - `process.env.SLACK_BOT_TOKEN` → `getInstanceConfig(instanceName).slack_token`
   - `containerName = 'clawforge-job-...'` → `containerName = \`clawforge-${instanceName}-job-...\``
   - Docker network `noah-net` → `${instanceName}-net`
3. **Run the StrategyES smoke test after every cherry-pick.** The StrategyES instance is the canary — if a cherry-pick breaks instance isolation, the StrategyES instance is the first to show it.

**Phase to address:**
Every phase that cherry-picks from PopeBot — the checklist must be applied before the PR is reviewed.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Web UI auth foundation | Middleware-only auth bypass; stale session on long sessions | Server-side `auth()` in every Server Action; session keepalive every 15 min |
| Phase 1: DnD tab system | xterm.js memory leaks on tab close/drag | `Terminal.dispose()` in every unmount cleanup; Terminal stored in `useRef` |
| Phase 1: WebSocket state management | Stale closure on job status updates | Functional state updates `setJobs(prev => ...)`; custom hook pattern |
| Phase 1: App Router + Pages Router hybrid | API route path conflicts; build failures | Router audit before first page PR; keep API routes in `pages/api/` |
| Phase 2: Cluster dispatch | Infinite delegation loops; $50+ runaway jobs | Hard iteration limit (15 total); cycle detection at route time |
| Phase 2: Cluster volumes | Concurrent git state corruption | Per-cluster-agent volumes; never share volumes across concurrent agents |
| Phase 2: Cluster state machine | Out-of-order GitHub webhook events | DB-authoritative state; validate via GitHub API before dispatch |
| Phase 2: Cluster notifications | Slack channel flooded | Cluster-level summary; thread replies for per-agent updates |
| Phase 2: Cherry-picks from PopeBot | Single-tenant assumptions break instance isolation | Multi-tenant checklist applied to every cherry-picked file |
| Phase 2: Docker socket in clusters | Host compromise surface expansion | Never mount Docker socket in cluster-worker containers; spawn via outbox |
| Phase 3: Log streaming | Memory accumulation when consumers disconnect | Consumer tracking map; ring buffer; destroy stream after 60s without consumer |
| Phase 3: ANSI escape codes | Garbage characters in Slack/web chat | `strip-ansi` before forwarding; `NO_COLOR=1` in container env |
| Phase 4: MCP config | Hot-reload not supported; silently missing tools | Write MCP config before container start; health check at entrypoint |
| Phase 4: MCP version | Protocol version mismatch disables tools silently | Pin Claude Code + MCP server versions together; test MCP in container build |
| Phase 4: MCP per-role isolation | Cross-role tool access in same container | One container per cluster role; do not rely on prompt-based isolation |
| Phase 4: MCP port conflicts | Second HTTP MCP server silently fails | Prefer stdio transport; explicit port assignment in instance config |
| All phases: SQLite contention | Write queue backup under v2.0 concurrent load | WAL mode + busy_timeout; separate DB files by concern |
| All phases: cherry-picks | Single-tenant env vars, network names, paths break multi-tenant | Multi-tenant audit checklist for every cherry-pick PR |

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Cherry-pick PopeBot cluster code without security audit | Faster shipping | `--dangerously-skip-permissions` silently introduced; StrategyES scoping broken | Never — always audit permission flags before merging |
| Shared named volumes for cluster agents on same repo | No new volume provisioning logic | Concurrent agent git state corruption; PRs contain each other's commits | Never for concurrent cluster agents |
| Buffer all Docker logs in memory for reconnection | Simple reconnection replay | OOM with large jobs or many concurrent jobs | Only with hard size cap (ring buffer, max 10MB) |
| Middleware-only auth for web UI routes | Fast implementation | Auth bypass via header spoofing; Server Actions unprotected | Never — middleware is supplemental, not primary auth |
| MCP config hardcoded in Docker image | No config templating logic | Config changes require image rebuild; no per-instance customization | Only for global tools; instance-specific tools need templating |
| Per-agent job notifications in clusters | Reuse existing notification code | Channel flooded; operator loses signal | Never for clusters with more than 2 agents |
| Single `--allowedTools` list for all cluster roles | Simple configuration | Reviewer agent can write code; coder agent can deploy — no role separation | Never in multi-tenant instances |
| SQLite for all v2.0 concurrent state | No infrastructure change | Write contention; `SQLITE_BUSY` under cluster + streaming + UI load | Acceptable with WAL mode and DB splitting; migrate LangGraph to Postgres at 3+ concurrent clusters |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Docker log stream + WebSocket | Pipe Docker stream directly to WebSocket without consumer check | Track consumers per job; pause/destroy stream when consumer count reaches 0 |
| MCP servers + job containers | Install MCP servers globally in image without version pinning | Pin MCP server versions; verify compatibility with Claude Code CLI version at build time |
| NextAuth v5 + existing API key auth | Replace API key auth with session auth on existing routes | Keep API routes on API key auth; add session auth only on new page-serving routes and Server Actions |
| Cluster dispatch + named volumes | Reuse per-repo named volumes for concurrent cluster agents | Create per-cluster-agent volumes; never share volumes across concurrent agents on the same repo |
| ANSI logs + Slack/web chat | Forward raw Docker log bytes to non-terminal destinations | Strip ANSI codes or set `NO_COLOR=1` in container environment |
| MCP version + Claude Code version | Update Claude Code CLI without updating MCP server packages | Pin both versions together; test MCP connection at container build time |
| PopeBot cluster code + allowedTools | Import PopeBot cluster entrypoints verbatim | Audit every shell command; replace `--dangerously-skip-permissions` with `--allowedTools` whitelist |
| LangGraph SqliteSaver + concurrent cluster writes | Assume SQLite handles concurrent LangGraph checkpoints | Enable WAL mode; separate `agent.db` from ops tables; migrate to Postgres at scale |
| NextAuth session + long WebSocket sessions | Assume active WebSocket extends session | Add HTTP keepalive ping every 15 min; session check before ticket issuance |
| Cluster MCP roles + single container | Configure per-role MCP in one container and restrict via prompt | One container per role for isolation; MCP isolation via process boundary, not prompt |
| GitHub webhooks + cluster state transitions | Trust webhook arrival order as event order | DB-authoritative state; validate current PR labels via GitHub API before dispatch |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded log buffer per streaming job | Event Handler OOM crash correlating with job count | Ring buffer with hard size cap; destroy stream when consumer disconnects | At 3-5 concurrent 30-min jobs with no active viewers |
| Cluster agents on warm-start shared volumes | Concurrent git operations; lock timeouts; corrupt working trees | Per-cluster-agent volumes; serialize agents on same repo | At first concurrent 2-agent cluster on the same repo |
| Per-agent Slack notifications in clusters | Channel unusable; operator ignores all notifications | Cluster-level summary; thread replies for per-agent updates | At 3+ agents per cluster |
| MCP servers as child processes in workspace containers | Workspace startup time grows with each MCP server; failed MCP servers cause silent tool unavailability | Startup health check; log MCP connection results; parallel MCP server start | At 5+ MCP servers per instance |
| Full history replay on WebSocket reconnect | Reconnecting after 30 min sends 50MB of logs; browser tab freezes | Ring buffer (last 500 lines) for reconnect replay | After any job longer than 5 minutes |
| SQLite write serialization under cluster + streaming + UI | `SQLITE_BUSY` errors; agent state loss; choppy streaming | WAL mode; busy_timeout; DB file splitting | At 3+ concurrent cluster runs or 10+ active Web UI sessions |
| xterm.js instances without dispose on tab close | Browser memory grows to 500MB+ over long sessions | `Terminal.dispose()` in every cleanup; Terminal stored in refs | After 10+ terminal tab open/close cycles in a session |

---

## Sources

- [LangGraph SqliteSaver documentation warning on concurrent threads](https://www.npmjs.com/package/@langchain/langgraph-checkpoint-sqlite)
- [SQLite WAL mode concurrency semantics](https://sqlite.org/wal.html)
- [GitHub PR label race conditions with workflow triggers](https://github.com/orgs/community/discussions/69337)
- [Docker socket critical security risk (CVE-2025-9074, CVSS 9.3)](https://socprime.com/blog/cve-2025-9074-docker-desktop-vulnerability/)
- [WebSocket backpressure in Node.js](https://nodejs.org/en/learn/modules/backpressuring-in-streams)
- [xterm.js Terminal.dispose memory leak](https://github.com/xtermjs/xterm.js/issues/1518)
- [NextAuth session expiry with idle tabs](https://lightrun.com/answers/nextauthjs-next-auth-next-auth-access-token-not-refreshing-when-site-is-left-idle)
- [Claude Code MCP per-agent isolation feature request (#4476)](https://github.com/anthropics/claude-code/issues/4476)
- [Multi-agent LLM system failure taxonomy (2025 paper)](https://arxiv.org/abs/2503.13657)
- [ANSI escape sequence log poisoning CVE-2025-58160](https://www.netservicesgroup.com/msrc-blog-alerts/cve-2025-58160-tracing-logging-user-input-may-result-in-poisoning-logs-with-ansi-escape-sequences/)
- [MCP container startup latency research](https://arxiv.org/html/2602.15214)
- [Docker resource constraints official documentation](https://docs.docker.com/engine/containers/resource_constraints/)
- [GitHub Actions webhook delay documentation](https://github.com/orgs/community/discussions/156282)
