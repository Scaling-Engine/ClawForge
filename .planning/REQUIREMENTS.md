# Requirements: ClawForge v2.0

**Defined:** 2026-03-12
**Core Value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results

## v2.0 Requirements

Requirements for v2.0 Full Platform milestone. Each maps to roadmap phases.

### Headless Streaming

- [x] **STRM-01**: Operator sees live log output from a running job container in the web chat thread as it executes
- [x] **STRM-02**: Log output is filtered to semantic events (file modifications, bash outputs, key decisions) — raw JSONL is suppressed
- [x] **STRM-03**: Operator sees a progress indicator with elapsed time while a job is running
- [x] **STRM-04**: Operator can cancel a running job via conversational command; container stops cleanly and branch is preserved for inspection
- [x] **STRM-05**: Log stream shows only changed files since last update (diff highlighting) instead of raw log lines
- [x] **STRM-06**: Slack channel receives a single auto-updating message with latest job status every 10s (not per-chunk message spam)
- [x] **STRM-07**: Stream consumer disconnection (browser tab close) releases resources; no memory leak from orphaned Docker log streams
- [x] **STRM-08**: Sensitive values (tokens, keys, secrets) are never forwarded in log stream output

### Web UI

- [x] **WEBUI-01**: Operator can toggle code mode in chat input for syntax-highlighted monospace rendering of code blocks
- [x] **WEBUI-02**: Operator can select a repo and branch from a persistent dropdown in the chat header; selection becomes the default for job dispatch in that chat
- [x] **WEBUI-03**: Feature flags system (FeaturesContext) enables/disables in-development features per instance without code deploys
- [x] **WEBUI-04**: Live job streaming output renders inline in chat messages as the job executes (consumes SSE from streaming infrastructure)
- [x] **WEBUI-05**: All Server Actions enforce server-side auth via NextAuth `auth()` — no client-only session checks
- [x] **WEBUI-06**: API-key-protected routes continue to work unchanged alongside new session-protected Server Actions

### MCP Tool Layer

- [x] **MCP-01**: Each instance has a `MCP_SERVERS.json` config file defining available MCP servers with name, command, args, env, and tool subset
- [x] **MCP-02**: `loadMcpServers()` reads and validates instance MCP config, resolving `{{AGENT_LLM_*}}` template variables at load time
- [ ] **MCP-03**: Job containers receive MCP server configs via `--mcp-config` flag; MCP servers are available to Claude Code during job execution
- [ ] **MCP-04**: Workspace (interactive) containers receive the same MCP server configs as job containers
- [x] **MCP-05**: Tool subset curation restricts which MCP tools are included in the `--allowedTools` whitelist per instance
- [ ] **MCP-06**: MCP startup health check validates server connections at container start; logs clear error on failure with `mcp_startup` failure stage
- [ ] **MCP-07**: Operator can view configured MCP servers and their tool subsets in a read-only settings page section
- [ ] **MCP-08**: Pre-run MCP context hydration executes specified tools before `claude -p` and appends output to the job prompt
- [x] **MCP-09**: MCP credentials are never stored in git; `{{AGENT_LLM_*}}` template variables resolve from environment at container start

### Multi-Agent Clusters

- [ ] **CLST-01**: Operator can define a cluster as a named group of agents with roles, system prompts, trigger conditions, and MCP server assignments via `CLUSTER.json`
- [ ] **CLST-02**: Cluster coordinator dispatches agents sequentially based on role definitions; each agent runs in its own Docker container with role-specific system prompt and tool access
- [ ] **CLST-03**: Agents in a cluster communicate via shared named volume (inbox/outbox/reports directories); coordinator copies outbox to next agent's inbox between dispatches
- [ ] **CLST-04**: Label-based state machine routes to the next agent based on labels emitted in the previous agent's output
- [ ] **CLST-05**: Cluster runs are tracked in the database with per-agent status, role, label, PR URL, and timestamps
- [ ] **CLST-06**: Operator can start a cluster through conversation via `create_cluster_job` LangGraph tool
- [ ] **CLST-07**: Clusters can be triggered via manual dispatch, webhook events, or cron schedules through `executeAction()` with `cluster` action type
- [ ] **CLST-08**: Operator can view cluster definitions, running jobs, and completion history on a `/clusters` management page
- [ ] **CLST-09**: Hard iteration limits (5 per agent, 15 per run) and cycle detection on `(agent_type, label_in)` pairs prevent infinite delegation loops
- [ ] **CLST-10**: Each cluster agent gets its own Docker volume — per-repo warm-start volumes are never shared between concurrent cluster agents
- [ ] **CLST-11**: All cluster agent containers use `--allowedTools` whitelist per role; zero instances of `--dangerously-skip-permissions` in any cluster code
- [ ] **CLST-12**: Cluster notifications post one Slack thread per cluster run with agent updates as thread replies (not per-agent messages)

## Future Requirements

Deferred to v2.1+. Tracked but not in current roadmap.

### Web UI

- **WEBUI-F01**: DnD tab interface for drag-reorderable multi-workspace tabs
- **WEBUI-F02**: GSD phase progress parsing in stream (surface current phase/sub-task from GSD output)

### Clusters

- **CLST-F01**: Parallel agent dispatch within clusters (multiple agents run simultaneously, join at synthesis point)
- **CLST-F02**: Visual cluster builder (drag-and-drop workflow editor for CLUSTER.json)

### MCP Tool Layer

- **MCP-F01**: Shared MCP servers across cluster agents via sidecar container pattern
- **MCP-F02**: Dynamic MCP server installation at container startup (npm install)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Code editor (Monaco/CodeMirror) in chat | Workspace terminal with Claude Code already provides full editing; dual-environment is confusing |
| Custom theme/color picker | CSS variables + Tailwind prefers-color-scheme handles this automatically |
| Chat export to PDF/markdown | Messages table is directly queryable; zero operational value at 2-instance scale |
| Cross-instance cluster coordination | Breaks the isolation model that is a core security guarantee |
| Agent-to-agent direct messaging | Creates tight coupling; defeats the sniper agent model. Use shared volume instead |
| Full unfiltered JSONL stream to chat | 200-500KB per job; illegible and rate-limit-triggering. Use filtered semantic events |
| Persistent log storage beyond PR | Logs already in GitHub Actions artifacts + PR; SQLite stores only logSummary |
| Log replay / seek | Video-player complexity for linear text log; use GitHub PR for historical access |
| Org-wide MCP access (no per-instance scoping) | Defeats isolation model; each instance needs separate configs and API keys |
| MCP servers with persistent state in containers | Containers are ephemeral; MCP servers should be stateless or write to external services |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STRM-01 | Phase 25 | Complete |
| STRM-02 | Phase 25 | Complete |
| STRM-03 | Phase 25 | Complete |
| STRM-04 | Phase 25 | Complete |
| STRM-05 | Phase 25 | Complete |
| STRM-06 | Phase 25 | Complete |
| STRM-07 | Phase 25 | Complete |
| STRM-08 | Phase 25 | Complete |
| WEBUI-01 | Phase 26 | Complete |
| WEBUI-02 | Phase 26 | Complete |
| WEBUI-03 | Phase 26 | Complete |
| WEBUI-04 | Phase 26 | Complete |
| WEBUI-05 | Phase 26 | Complete |
| WEBUI-06 | Phase 26 | Complete |
| MCP-01 | Phase 27 | Complete |
| MCP-02 | Phase 27 | Complete |
| MCP-03 | Phase 27 | Pending |
| MCP-04 | Phase 27 | Pending |
| MCP-05 | Phase 27 | Complete |
| MCP-06 | Phase 27 | Pending |
| MCP-07 | Phase 27 | Pending |
| MCP-08 | Phase 27 | Pending |
| MCP-09 | Phase 27 | Complete |
| CLST-01 | Phase 28 | Pending |
| CLST-02 | Phase 28 | Pending |
| CLST-03 | Phase 28 | Pending |
| CLST-04 | Phase 28 | Pending |
| CLST-05 | Phase 28 | Pending |
| CLST-06 | Phase 28 | Pending |
| CLST-07 | Phase 28 | Pending |
| CLST-08 | Phase 28 | Pending |
| CLST-09 | Phase 28 | Pending |
| CLST-10 | Phase 28 | Pending |
| CLST-11 | Phase 28 | Pending |
| CLST-12 | Phase 28 | Pending |

**Coverage:**
- v2.0 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 -- traceability complete after roadmap creation*
