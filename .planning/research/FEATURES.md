# Feature Research: v2.2 Smart Operations

**Domain:** AI agent platform — Claude Code chat mode, superadmin portal, UI operations parity, smart execution
**Researched:** 2026-03-16
**Confidence:** HIGH (codebase inspection + official docs + WebSearch verified)
**Scope:** NEW features only for v2.2. Everything through v2.1 is shipped and not re-researched.

---

## Context: What Is Being Built

v2.2 adds four capability areas to the existing ClawForge platform. These are additive to the complete v2.1 system:

- **Real Claude Code chat mode**: Interactive embedded terminal UX with streaming tool calls, file edits, thinking steps, interrupt/resume — runs via Agent SDK, not the existing LangGraph headless job pipeline
- **Superadmin portal**: Single login across all instances with an instance switcher — a new auth layer above the per-instance admin panel
- **UI operations parity**: All operations currently requiring SSH/CLI are available through the web UI — repo CRUD, job cancel/retry/logs, config editing, instance management
- **Smart execution**: Pre-CI quality gates, test feedback loops, configurable merge policies — execution guardrails that reduce bad merges

**What is confirmed shipped (v2.1 — do not rebuild):**

| Capability | Location |
|-----------|----------|
| Web chat with AI SDK v5 streaming, tool call visibility | `lib/chat/api.js`, `lib/chat/components/chat.jsx` |
| Terminal workspaces with xterm.js + ttyd + tmux | `lib/ws/`, workspace Docker image |
| Job dispatch (Docker Engine API ~9s), SSE streaming, JobStreamViewer | `lib/tools/create-job.js`, `lib/chat/components/job-stream-viewer.jsx` |
| Multi-agent clusters with coordinator, shared volumes | `lib/cluster/` |
| MCP tool layer with per-instance config | `instances/*/config/MCP_SERVERS.json` |
| Admin panel: general, github, users, secrets, voice, chat, webhooks | `lib/chat/components/admin-*.jsx`, `app/admin/` |
| Auth RBAC: admin/user roles, /forbidden page | `lib/auth/middleware.js`, `lib/auth/actions.js` |
| GitHub secrets CRUD, runners page, PR page | Admin panel sub-pages |
| Job semantic event streaming: file-change, bash-output, decision, progress | `lib/chat/components/job-stream-viewer.jsx` |
| Interactive mode toggle (headless vs workspace) | `codeMode` state in `chat.jsx` |

---

## Area 1: Real Claude Code Chat Mode

### What This Is

The existing chat sends messages to a LangGraph ReAct agent (Layer 1), which may dispatch headless jobs (Layer 2). Claude Code chat mode is different: it runs `claude` interactively in a persistent container, streams every tool call, file edit, and thinking step directly into the chat UI in real time, and allows the operator to interrupt and send follow-up instructions while it is working — matching the interactive mode behavior Claude Code has in a native terminal.

This is modeled after the Claude Agent SDK's streaming model: `claude -p` with `--output-format stream-json --include-partial-messages` emits newline-delimited JSON events (message_start, content_block_start/delta/stop, tool calls, message_stop). These map directly to UI elements: text delta = streaming prose, tool_use content_block = tool call panel, file write/edit events = file change rows.

**Official streaming events (HIGH confidence — Claude Agent SDK docs):**

| Event | Type | UI Mapping |
|-------|------|------------|
| `content_block_delta` with `text_delta` | Text chunk | Stream into message bubble |
| `content_block_start` with `tool_use` | Tool invocation starts | Open tool call panel with tool name |
| `content_block_delta` with `input_json_delta` | Tool input streaming | Update tool call panel with partial JSON |
| `content_block_stop` (after tool_use) | Tool invocation complete | Close tool call panel, show result |
| `ResultMessage` | Final output | Mark turn complete |

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Streaming text output in real time** | Without real-time streaming, operators see nothing until Claude finishes a multi-minute task. The existing LangGraph chat already streams, so streaming-by-default is the baseline expectation. | MEDIUM | Claude Agent SDK: `claude -p --output-format stream-json --include-partial-messages`. Server reads STDOUT via child_process/spawn, parses newline-delimited JSON events, forwards to client via SSE or AI SDK v5 data stream. Different from existing LangGraph streaming — new server-side stream handler needed. |
| **Live tool call visualization** | Every file edit, bash command, and MCP tool call must appear in the chat UI as it happens. "Claude is editing `lib/auth/index.js`..." is required feedback. Existing `JobStreamViewer` shows filtered semantic events from headless jobs — chat mode shows every tool call inline as message parts. | HIGH | Map Agent SDK `content_block_start` (tool_use) events to AI SDK v5 `tool-call` message parts. Tool name + partial input renders progressively. On completion, attach tool result. Reuses existing `tool-call.jsx` component structure but at message-part granularity, not job-level. |
| **File edit visibility with diff-style display** | When Claude edits a file, operators need to see what changed — not just "edited `lib/auth.js`" but the actual diff. Without this, operators can't supervise the agent's work. | HIGH | Parse tool results for `Edit` and `Write` tool completions. Extract before/after content. Render as a unified diff (removed lines red, added lines green) using existing Shiki syntax highlighting. Inline in the message stream, not in a separate panel. |
| **Interrupt / send follow-up while running** | Operators need to redirect the agent mid-task: "actually, skip the tests and just fix the import". Without interrupt, operators must wait for the full task to complete or kill it. The Claude Agent SDK supports session-based `--resume`, enabling follow-up turns. | HIGH | Track `session_id` from `ResultMessage` or initial JSON output. Send follow-up prompts by spawning a new `claude -p --resume {session_id}` process. The running process must be stoppable (SIGINT or stdin pipe). UI shows "Send instruction to running agent" input when chat mode is active. |
| **Working directory and repo context** | Claude Code chat mode needs to know which repo it's working in. Without a repo context, it operates on the ClawForge repo itself rather than a target repo. | MEDIUM | When operator starts a chat mode session, inject the target repo path (checked-out named volume from existing `clawforge-{instance}-{slug}` volumes) as the working directory. Reuse existing repo volume warm-start pattern. Agent SDK receives `--cwd /workspace/{repoSlug}`. |
| **Token usage and cost visibility** | `ResultMessage` from the Agent SDK includes `usage` (input tokens, output tokens). Operators need visibility into cost per conversation. | LOW | Parse `usage` from final `ResultMessage`. Append a small cost summary line after each Claude Code turn. Store in DB alongside message content. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Shell mode alongside chat mode** | The native Claude Code terminal supports two input modes: chat (natural language requests) and bash (direct shell commands with conversation context). Offering both in the web UI gives operators the full native terminal experience without SSH. | HIGH | Shell mode: input is sent directly as a bash command to the container, output streamed back. Chat mode: input sent as Claude prompt. Toggle in chat input bar (existing `codeMode` toggle can be repurposed). Claude Agent SDK does not support mixed modes in one session — shell mode requires separate container exec. |
| **Thinking steps display (when extended thinking is enabled)** | Extended thinking produces `thinking` content blocks before the response. Surfacing these as a collapsible "Claude's reasoning" panel gives operators insight into why a decision was made. | MEDIUM | Note: Agent SDK docs state extended thinking (`maxThinkingTokens`) disables `StreamEvent` streaming — you only get complete messages per turn. Decide: thinking steps with turn-level streaming, or real-time text streaming without thinking. Given streaming is the core value, default to streaming. Offer thinking-mode as a toggle that slows down feedback. |
| **Tool call approval mode (ask before running)** | Instead of auto-approving all tools via `--allowedTools`, pause before each destructive operation (file write, bash execution) and show the operator what will happen with approve/deny. | HIGH | Agent SDK does not have a built-in prompt-before-tool callback in CLI mode — this requires the TypeScript/Python SDK with `onBeforeToolCall` callback. Switching from CLI to SDK package is an architecture change. Lower priority: existing `--allowedTools` whitelist provides adequate safety. |

### Anti-Features

| Anti-Feature | Why Avoid | Alternative |
|--------------|-----------|-------------|
| **Replacing the existing LangGraph chat with Agent SDK** | LangGraph provides persistent SQLite memory, multi-tool orchestration (create_job, get_job_status, web_search), and the headless job dispatch model. Agent SDK is single-session, stateless across turns. Replacing LangGraph loses all of these. | Keep LangGraph as the default event handler. Claude Code chat mode is an additive mode — a separate code path invoked when the operator toggles to "Claude Code" mode. |
| **Running Agent SDK on the Event Handler server process** | Running `claude -p` as a child process inside the Next.js Event Handler creates resource contention, PID accumulation, and cross-instance interference. | Run Agent SDK in a dedicated container per session, using the same workspace Docker image that ttyd/tmux uses. The Event Handler spawns the container; streams flow through the existing WebSocket/SSE proxy. |
| **Unfiltered tool call streaming (every partial JSON chunk)** | Tool input streams as partial JSON deltas (e.g., `{"path": "/li`, then `b/auth`, then `...`). Rendering every fragment in the UI creates visual jitter. | Buffer tool input until `content_block_stop`, then render the complete call. Show "Claude is using Edit..." with a spinner while buffering, render the full call on completion. |

---

## Area 2: Superadmin Portal with Instance Switcher

### What This Is

Currently, ClawForge has one web UI deployment per instance (or a shared deployment with per-instance middleware). Operators with access to multiple instances must maintain separate sessions or separate browser tabs. The superadmin portal is a single login point that shows all instances, lets an operator switch context, and provides a cross-instance control plane — all within one authenticated session.

**Multi-tenant SaaS standard pattern (MEDIUM confidence — WebSearch verified):** A superadmin account at the top of the auth hierarchy sees every tenant. A tenant switcher (like Microsoft 365 admin center's "All tenants" page) allows jumping between tenants while maintaining a single session. Instance-scoped data remains isolated; only the auth layer is shared.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Single login across all instances** | Operators managing multiple instances today need separate sessions. This is friction — two browser tabs, two login flows. A shared auth layer behind one URL eliminates this. | HIGH | Options: (a) single Next.js deployment with per-instance routing (`/i/noah/`, `/i/strategyES/`), instance determined from URL prefix; (b) separate deployments sharing a common auth DB. Option (a) is the right approach given the existing single-codebase model: add a top-level `superadmin` role to the users table, add an instance context to the session, route all admin actions through the instance context. |
| **Instance switcher UI** | After login, the operator sees a list of all instances. Selecting one sets the active instance context for all subsequent operations. | MEDIUM | A top-level route (`/`) that only superadmins see: lists instances from `instances/*/config/` directories or a DB table. Selecting an instance stores `activeInstance` in the session cookie. All existing admin pages (`/admin/*`) route their Server Actions through the active instance context. |
| **Instance-scoped data isolation in the shared DB** | Currently, the SQLite DB has no `instanceId` column on most tables. For a superadmin portal, jobs, chats, and configs must be queryable by instance without cross-contamination. | HIGH | Most tables need `instanceId` column added (nullable initially for backward compat, then backfilled). `instanceId` added to: `chats`, `job_outcomes`, `cluster_runs`, `code_workspaces`, `notifications`. The `users` table already has enough granularity through `role`. All queries in `lib/db/*.js` updated to filter by `instanceId` when an instance context is set. |
| **Per-instance admin access (not just superadmin)** | Instance operators should be able to manage their own instance without needing superadmin access. The existing `admin` role is per-deployment. In the superadmin model, `admin` means "admin of a specific instance." | MEDIUM | Extend users table: add `instanceId` column to users (which instance this admin manages). `admin` role = admin of `instanceId`. `superadmin` role = admin of all instances. Middleware reads `session.user.role` and `session.user.instanceId` to scope access. |
| **Instance health overview** | The superadmin landing page shows the status of each instance — runners online/offline, active jobs, recent errors. Without this, the superadmin portal is just an instance list with no operational value. | MEDIUM | New `/superadmin` page with a card per instance. Each card shows: active job count (from `job_outcomes` where `status = 'running'`), runner status (existing `getRunners()` per instance), last job timestamp. Data fetched via Server Actions scoped to each instance. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Cross-instance job search** | Find a job across all instances without knowing which one ran it. "Show me all jobs that touched neurostory repo" searches across instances. | MEDIUM | `job_outcomes` with `instanceId` column enables `SELECT * FROM job_outcomes WHERE target_repo LIKE '%neurostory%'`. New search page or filter in the superadmin portal. |
| **Instance comparison view** | See config differences between instances side-by-side: which repos, which MCP servers, which secrets are configured for each. Useful for managing configuration drift. | LOW | Config diff: read `REPOS.json` and `MCP_SERVERS.json` for each instance, render as a comparison table. Read-only. No new infrastructure beyond the config loaders that already exist. |
| **Impersonation (superadmin acts as instance admin)** | Superadmin can temporarily take on an instance admin's session to debug issues without needing that user's credentials. | HIGH | Requires session token swap: generate a short-lived session for the target instance admin, store the original session for revert. Standard SaaS pattern (MakerKit, Auth.js) but non-trivial to implement securely. LOW priority for 2-instance setup. |

### Anti-Features

| Anti-Feature | Why Avoid | Alternative |
|--------------|-----------|-------------|
| **Separate auth service (Auth0, Okta, Entra ID)** | An external auth service for 2 instances and 1-2 operators is massively over-engineered. 3rd party dependency, cost, and complexity for zero scale benefit. | Extend the existing NextAuth v5 + SQLite users table. Add `superadmin` role. Total change: one new column, one new middleware guard, one new page. |
| **Per-instance deployments with shared OAuth** | Maintaining a separate Vercel/VPS deployment per instance with shared OAuth redirects creates deployment complexity and race conditions on the shared auth DB. | Single deployment, URL-prefix routing. `/i/{instanceName}/*` scopes all routes to an instance. Existing `instances/*` directory structure already provides the config hierarchy. |
| **Real-time cross-instance activity feed** | A live feed of every job, message, and event across all instances is interesting but not operational. It requires a pub/sub layer that does not exist. | Show aggregate stats on the superadmin dashboard (counts, last-seen timestamps). Drill into a specific instance for live views. |

---

## Area 3: UI Operations Parity

### What This Is

"Operations parity" means: any action currently performed via SSH, direct SQLite query, or manual file edit is available through the web UI. Today's gaps include: no way to cancel a running job via the UI, no way to retry a failed job, no way to view the full job log, no repo CRUD, no instance management beyond what the admin panel exposes. This area closes those gaps.

**Industry pattern (MEDIUM confidence — Dockhand/Portainer/Dozzle comparison):** Modern Docker management dashboards expose start/stop/restart, live log streaming, file editing, and container terminal access all through the UI. The principle is "no SSH needed for routine operations."

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Job cancel via UI** | Operators see a job going wrong (via JobStreamViewer) but cannot cancel it. They must SSH in, find the container, run `docker stop`. The 30-minute timeout is the only escape hatch. Job cancel is table stakes for any job management UI. | MEDIUM | Existing `lib/tools/docker.js` has `removeContainer()`. New Server Action `cancelJob(jobId)`: find running container for jobId (container label `clawforge.job_id={jobId}`), call `container.stop({t:10})`, `container.remove()`, update `job_outcomes` status. UI: cancel button in `JobStreamViewer` when status is `streaming`. Existing `stop` function in `chat.jsx` stops the LangGraph stream — this is for the Docker container itself. |
| **Job retry via UI** | When a job fails (clone failure, OOM, tool timeout), operators must re-type the original request to retry. The job's original prompt is stored in `job_outcomes.logSummary` (partial) but the full original request is not surfaced. A retry button re-dispatches the job with the same parameters. | MEDIUM | Store the original job prompt in `job_outcomes` as a new `originalPrompt TEXT` column (add in migration). `retryJob(jobId)` Server Action: read original prompt + target repo from `job_outcomes`, call existing `createJob()` with same params. UI: retry button on failed job entries in the Swarm page and inline in chat messages. |
| **Full job log viewer** | The existing `JobStreamViewer` shows filtered semantic events (last 25). Operators investigating a failure need the full raw log. "View full log" should show all JSONL output from the job, with syntax highlighting. | MEDIUM | The full log is in GitHub Actions artifacts or stored in the container before removal. Best approach: store `rawLogSummary` (first 50KB of JSONL) in `job_outcomes` alongside existing `logSummary`. New log viewer page `/jobs/[jobId]/logs` renders JSONL line-by-line with type-based coloring. Alternatively, link to the GitHub Actions run URL (already stored in `prUrl`). Linking to GitHub is the 2-hour path; full embedded viewer is the 2-day path. |
| **Repo CRUD in admin panel** | Operators add a new target repo by editing `instances/{name}/config/REPOS.json` on the server. No web UI exists. Adding a repo mid-session requires SSH + file edit + restart. | HIGH | New admin sub-page `/admin/repos`. Reads `REPOS.json` via `loadAllowedRepos()`. Form to add/edit/delete repo entries (slug, name, alias, dispatchMethod, defaultBranch). Saves by writing the updated JSON back to the config file via a Server Action. Same pattern as the GitHub secrets page: read from storage, CRUD in UI, write back. Validation: slug uniqueness, URL format check. |
| **Config editing in admin panel** | DB-backed config (`lib/db/config.js` key-value store) is only editable by operators who know the DB schema. Core settings (LLM provider, model names, default branch) should be editable from the admin panel. | MEDIUM | Extend the existing General settings page (`/admin/general`) with form fields for all `getConfig()`/`setConfig()` keys. Already exists for some keys (LLM provider, auth settings); audit for missing keys (job timeout, max concurrent jobs, auto-merge settings). Save via existing `setConfig()` Server Action. |
| **Instance management page** | Operators create new instances via conversation (the `createInstanceJob` tool), but there is no page showing all instances, their status, or allowing basic management (enable/disable, view config). | MEDIUM | New admin page `/admin/instances` (or `/superadmin/instances`). Lists all directories under `instances/`. Per-instance card: name, configured repos count, active jobs, last job timestamp. Links to per-instance config (REPOS.json viewer, MCP_SERVERS.json viewer). No destructive operations — instance deletion is out of scope. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Job pause / resume** | Pause a running job, review its current state, then resume or redirect it. More surgical than cancel. | HIGH | Claude Code does not support pause/resume of a running `claude -p` process. Container `pause()` (SIGSTOP) freezes the container but Claude Code's internal state is not checkpointed. Effective pause requires Agent SDK `--resume` session model (Area 1 feature). Defer until Claude Code chat mode (Area 1) is built. |
| **Bulk job operations** | Select multiple failed jobs, retry all at once. Select all jobs older than 7 days, archive. | MEDIUM | UI complexity is higher than implementation complexity. Checkbox selection on the Swarm page, bulk action toolbar. Implementation: `Promise.all()` over individual `retryJob()` / archive calls. Low priority for 2-instance operator count. |
| **Live container resource metrics** | Show CPU%, memory usage, and network I/O for running job containers in the Runners page or job detail view. | MEDIUM | `dockerode` exposes `container.stats()` streaming endpoint. New Server Action `getContainerStats(containerId)`. Renders as a small sparkline in the Runners page. Value: operators can identify runaway jobs before timeout. |

### Anti-Features

| Anti-Feature | Why Avoid | Alternative |
|--------------|-----------|-------------|
| **Instance deletion via UI** | Deleting an instance removes Docker volumes, DB records, and config files. Accidental deletion is catastrophic and not recoverable. | Manual deletion via SSH with explicit volume pruning. UI shows a warning: "Instance deletion requires SSH access." |
| **Real-time log streaming to a full log viewer page** | A dedicated log streaming page per job is duplicate functionality: `JobStreamViewer` already shows live events inline in chat. A separate full-page log view adds navigation overhead. | Inline streaming in chat (existing). "View raw log" links to GitHub Actions. Reserve the log viewer page for historical/completed jobs only. |
| **Direct file editing in the admin UI** | A file editor for `REPOS.json`, `MCP_SERVERS.json`, or entrypoint scripts in the admin panel creates a footgun — one bad save can break job dispatch. | Form-based CRUD with validation. Operators who need raw JSON access can use the workspace terminal. |

---

## Area 4: Smart Execution

### What This Is

"Smart execution" means the platform makes decisions about code quality before and after jobs complete: running tests before auto-merging, blocking merges when tests fail, collecting test output to feed back into the agent for self-correction, and configuring merge policies per repo.

**Industry pattern (HIGH confidence — standard CI/CD quality gate pattern):** A quality gate is an enforced check in the pipeline that code must pass before proceeding. Standard gates: linting, unit tests, type checking. Smart execution adds: (a) run these gates before merge, (b) if they fail, capture the output and re-dispatch the agent with the failure context as a correction prompt, (c) configurable per-repo merge policy (auto-merge on green, require human review, block on failing tests).

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Pre-CI quality gates in job container** | Claude Code jobs can create PRs that break the build. Without quality gates, bad code merges silently or requires manual review. Gates should run inside the job container before the PR is created: `npm test`, `tsc --noEmit`, `npm run lint`. | MEDIUM | Extend `templates/docker/job/entrypoint.sh`: after Claude Code completes, run a configurable gate script. Gate config in `REPOS.json` per repo: `"qualityGates": ["npm run lint", "tsc --noEmit", "npm test"]`. If any gate fails, capture stderr output in a `gate-failures.md` artifact on the job branch. PR is still created but labeled `needs-fixes`. |
| **Test failure feedback loop** | When quality gates fail, the agent should see the failure output and attempt a fix before creating the PR. One iteration of self-correction catches the majority of simple failures (type errors, lint warnings). | HIGH | After quality gates fail: (1) read `gate-failures.md`, (2) re-invoke `claude -p` with a correction prompt: "The following tests/checks failed after your changes. Fix them: {gate output}". (3) Re-run gates. (4) If second pass passes, continue to PR. If second pass fails, create PR with `needs-fixes` label and include gate output in PR description. Max 1 correction iteration to avoid infinite loops. |
| **Merge policy config per repo** | Different repos need different merge policies. A "sandbox" repo can auto-merge anything. A "production" repo requires passing all gates + human review. Policy is per-repo, stored in `REPOS.json`. | MEDIUM | Extend `REPOS.json` per-repo entry: `"mergePolicy": "auto" | "gate-required" | "manual"`. `auto-merge.yml` GitHub Actions workflow already exists — it checks `ALLOWED_PATHS`. Extend it to also check for `gate-required` label: if present and `gate-failures.md` artifact exists, block merge until label is removed. `manual` policy: never auto-merge, always require PR review. |
| **Gate result visibility in chat** | When a job completes with gate failures, the operator should see which gates failed and what the output was, directly in the chat thread — not just a notification link. | LOW | Gate output is stored in `gate-failures.md` on the job branch. The existing `summarizeJob()` in `lib/tools/github.js` reads PR artifacts. Extend `summarizeJob()` to detect `gate-failures.md` and include gate failure excerpts in the notification message back to the operator. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Staged gate execution (fast gates first)** | Lint (seconds) runs before unit tests (minutes). Running tests before lint wastes time when lint would have caught the same issues. Ordered execution stops at first failure. | LOW | Entrypoint executes gates in array order. `break` on first failure. Log which gate failed and its position in the pipeline. Operators configure gate order in `REPOS.json` `qualityGates` array. |
| **Gate timeout and resource limits** | A runaway test suite can block the job container indefinitely. Each gate needs a configurable timeout (default: 5 minutes per gate, total job timeout 30 minutes as before). | LOW | Wrap gate execution in `timeout {N}s {command}`. Capture timeout as a special failure reason: "Gate timed out after 5 minutes." Include in `gate-failures.md`. |
| **Branch protection rule sync** | Automatically set branch protection rules on GitHub to require status checks matching the configured quality gates. Operators no longer need to configure branch protection manually when adding a new repo. | HIGH | GitHub API: `PUT /repos/{owner}/{repo}/branches/{branch}/protection`. Requires `repo` admin scope on the PAT. Triggered when a new repo is added via the repos admin page. Complex: different repos may have different workflows. Defer — branch protection is manageable manually at 2-instance scale. |
| **Flaky test detection and retry** | If a test fails, re-run it once to distinguish flaky from genuinely broken. Only fail the gate if it fails twice. | MEDIUM | Wrap each gate command in a retry function: run once, if non-zero exit re-run, if non-zero again mark as failed. Two-run overhead acceptable for test reliability. |

### Anti-Features

| Anti-Feature | Why Avoid | Alternative |
|--------------|-----------|-------------|
| **Unlimited correction iterations** | "Self-correcting" agents can enter infinite loops when a failure is caused by a dependency issue, environment problem, or architectural constraint the agent cannot resolve. | Max 1 correction iteration (2 total attempts). If second attempt fails, human review is required. Gate failure output is always surfaced to the operator. |
| **Security scanning gates (SAST)** | Static analysis tools (Snyk, Semgrep) have high false-positive rates, slow execution, and require separate API keys. Adding them as required gates blocks legitimate PRs for non-security-critical codebases. | Add as an optional gate type in `REPOS.json` config: `"type": "security"`. Not included in default gates. |
| **Parallel gate execution** | Running lint, typecheck, and tests simultaneously sounds faster but creates race conditions on shared test state and makes failure attribution ambiguous ("did lint fail or did tests fail?"). | Sequential execution. Each gate's result is individually attributed. Total overhead is acceptable: lint (~3s), typecheck (~10s), tests (~60s). |

---

## Feature Dependencies

```
[Shipped v2.1 Infrastructure]
├── Docker Engine API + dockerode (lib/tools/docker.js)
├── LangGraph ReAct agent + tools (lib/ai/tools.js)
├── WebSocket proxy + xterm.js terminal (lib/ws/)
├── SQLite via Drizzle ORM (lib/db/schema.js)
├── AI SDK v5 chat streaming (lib/chat/api.js)
├── MCP tool layer (instances/*/config/MCP_SERVERS.json)
├── Admin panel with auth roles (lib/chat/components/admin-*.jsx)
├── JobStreamViewer SSE streaming (lib/chat/components/job-stream-viewer.jsx)
├── cluster_runs, cluster_agent_runs tables in DB
└── Named workspace volumes (clawforge-ws-{instance}-{id})

[Area 1: Claude Code Chat Mode] ──NEW──
├── Agent SDK session container ──reuses──> workspace Docker image
├── Streaming event parser ──new-path──> separate from LangGraph streaming
├── Tool call message parts ──extends──> tool-call.jsx rendering
├── Interrupt/resume ──uses──> Agent SDK --resume flag + session_id
└── Working directory ──reuses──> named job volumes (warm-start pattern)

[Area 2: Superadmin Portal] ──NEW──
├── superadmin role ──extends──> users table role column (admin/user/superadmin)
├── instanceId scoping ──requires──> DB migration (instanceId on chats, job_outcomes, etc.)
├── Instance switcher ──reads──> instances/* directory listing
├── Session context ──extends──> NextAuth v5 session with activeInstance
└── Per-instance admin access ──extends──> existing admin middleware

[Area 3: UI Operations Parity] ──NEW──
├── Job cancel ──uses-existing──> removeContainer() + docker.js
├── Job retry ──requires──> originalPrompt column on job_outcomes
├── Full log viewer ──requires──> rawLogSummary column on job_outcomes
├── Repo CRUD ──extends──> REPOS.json + loadAllowedRepos()
├── Config editing ──extends──> existing /admin/general page + getConfig/setConfig
└── Instance management ──reads──> instances/* directory + job_outcomes

[Area 4: Smart Execution] ──NEW──
├── Quality gates ──extends──> entrypoint.sh (job container)
├── Feedback loop ──reuses──> claude -p re-invocation in entrypoint
├── Merge policy ──extends──> REPOS.json + auto-merge.yml workflow
└── Gate visibility ──extends──> summarizeJob() in lib/tools/github.js

[Cross-Area Dependencies]
├── Area 1 (Chat Mode) ──benefits-from──> Area 3 cancel/retry (interrupt = cancel + restart)
├── Area 2 (Superadmin) ──requires──> DB instanceId migration before meaningful cross-instance views
├── Area 4 (Smart Execution) ──independent of──> Areas 1, 2, 3 (can be built in parallel)
└── Area 3 (UI Ops) ──blocks──> Area 2 (instance management page is part of UI parity)
```

### Dependency Notes

- **Area 4 is the most independent**: Smart execution is entirely in the job container entrypoint and GitHub Actions workflow. Zero dependency on UI changes, DB migrations, or auth changes. Can be built in parallel with everything else.
- **Area 2 requires a DB migration**: Adding `instanceId` to core tables is a breaking change if not handled carefully. Must be backward-compatible (nullable column, default to `'noah'` for existing rows). Sequence: migration first, then UI.
- **Area 1 is the largest new build**: No existing code path handles Agent SDK subprocess management, session tracking, or streaming at tool-call granularity in the chat UI. Dedicated container + new streaming pipeline.
- **Area 3 job cancel/retry are quick wins**: Both can be built without dependencies on other v2.2 areas. `cancelJob()` reuses `removeContainer()`. `retryJob()` reuses `createJob()`. UI additions to existing pages.

---

## MVP Recommendation

### Build First (v2.2 launch)

Priority order based on operator value vs. implementation complexity:

- **Quality gates (Area 4)** — Highest ROI: protects all existing and future jobs from bad merges. Entirely in entrypoint.sh. Estimated 1-2 days. Build first because it requires no UI work.
- **Feedback loop: one self-correction iteration (Area 4)** — Extends the quality gates pattern. Agent sees its own test failures and fixes them. Estimated 1 day on top of quality gates.
- **Job cancel via UI (Area 3)** — Missing for any serious ops platform. Cancel button in `JobStreamViewer`. Server Action calls `removeContainer()`. Estimated 4 hours.
- **Job retry via UI (Area 3)** — Retry button on failed jobs. DB migration for `originalPrompt` column + `retryJob()` Server Action. Estimated 1 day.
- **Repo CRUD in admin panel (Area 3)** — Operators adding repos today need SSH. Form-based editor for `REPOS.json`. Estimated 1-2 days.
- **Superadmin role + instance switcher (Area 2)** — Core of the superadmin feature. New role, session context, instance list page. Estimated 2-3 days.
- **Claude Code chat mode — streaming text + tool calls (Area 1)** — Core of the new chat mode. Agent SDK subprocess, event parser, stream to UI. Estimated 3-4 days.

### Add After Validation (v2.2.x)

- **File edit diff display (Area 1)** — Requires diff rendering component. Valuable but not blocking for initial chat mode release.
- **Interrupt/resume (Area 1)** — Complex session management. Initial release can use cancel + restart.
- **instanceId DB migration (Area 2)** — Required for cross-instance queries. Can ship superadmin with instance-per-URL routing first, add DB migration in a follow-up.
- **Full job log viewer (Area 3)** — Link to GitHub Actions for initial release; embedded viewer in follow-up.
- **Merge policy config (Area 4)** — `auto-merge.yml` already works. Add policy config field in REPOS.json and update the workflow.

### Defer (v2.3+)

- **Tool call approval mode (Area 1)** — Requires switching from CLI to SDK package. Architecture change.
- **Shell mode in chat (Area 1)** — Separate from Claude Code chat mode. Complex dual-mode session handling.
- **Branch protection rule sync (Area 4)** — Manual setup is fine at 2-instance scale.
- **Bulk job operations (Area 3)** — Nice-to-have for high-volume operations; not needed at current scale.
- **Superadmin impersonation (Area 2)** — Security-sensitive, complex. Not needed with 2 instances.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Quality gates in entrypoint | HIGH | LOW | P1 |
| Self-correction feedback loop | HIGH | LOW | P1 |
| Job cancel via UI | HIGH | LOW | P1 |
| Job retry via UI | HIGH | MEDIUM | P1 |
| Repo CRUD in admin panel | HIGH | MEDIUM | P1 |
| Claude Code chat mode (streaming) | HIGH | HIGH | P1 |
| Superadmin role + instance switcher | MEDIUM | MEDIUM | P1 |
| Merge policy per repo | MEDIUM | LOW | P2 |
| File edit diff display | MEDIUM | MEDIUM | P2 |
| Interrupt/resume in chat mode | HIGH | HIGH | P2 |
| Gate result visibility in chat | MEDIUM | LOW | P2 |
| Full job log viewer page | MEDIUM | MEDIUM | P2 |
| Config editing in admin panel | MEDIUM | LOW | P2 |
| Instance management page | LOW | MEDIUM | P2 |
| instanceId DB migration | HIGH | HIGH | P2 (dependency) |
| Branch protection sync | LOW | HIGH | P3 |
| Bulk job operations | LOW | MEDIUM | P3 |
| Tool call approval mode | MEDIUM | HIGH | P3 |
| Shell mode alongside chat mode | MEDIUM | HIGH | P3 |
| Superadmin impersonation | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v2.2 launch
- P2: Should have, add when possible — v2.2 follow-on phases
- P3: Nice to have, defer to v2.3+

---

## Sources

- ClawForge `lib/chat/components/chat.jsx`, `chat-input.jsx`, `job-stream-viewer.jsx` — direct inspection of existing chat mode toggle (`codeMode`), transport config, JobStreamViewer event types; HIGH confidence
- ClawForge `lib/tools/docker.js` — `removeContainer()`, `collectLogs()`, `ensureWorkspaceContainer()` confirmed; HIGH confidence
- ClawForge `lib/db/schema.js` — existing table columns confirmed (no `instanceId`, no `originalPrompt`); HIGH confidence
- ClawForge `lib/auth/middleware.js`, `lib/auth/actions.js` — existing role system (`admin`/`user`); HIGH confidence
- ClawForge `.planning/PROJECT.md` — v2.2 target features, architecture constraints; HIGH confidence
- [Claude Agent SDK streaming docs](https://platform.claude.com/docs/en/agent-sdk/streaming-output) — streaming event types (`content_block_start`, `content_block_delta`, `content_block_stop`, `ResultMessage`), tool call streaming pattern, extended thinking limitation; HIGH confidence (official docs)
- [Claude Code headless docs](https://code.claude.com/docs/en/headless) — `--output-format stream-json`, `--include-partial-messages`, `--resume` session continuity, `--continue` flag; HIGH confidence (official docs)
- WebSearch: multi-tenant superadmin patterns — instance switcher, impersonation, single login; MEDIUM confidence (verified against MakerKit and Microsoft 365 implementations)
- WebSearch: CI/CD quality gates — pre-merge test gates, feedback loops, merge policy patterns; MEDIUM confidence (multiple sources agree on sequential gate model)
- WebSearch: Docker container management UI patterns — cancel/retry/logs in modern dashboards (Dockhand, Portainer, Dozzle); MEDIUM confidence

---

*Feature research for: ClawForge v2.2 — Claude Code chat mode, superadmin portal, UI operations parity, smart execution*
*Researched: 2026-03-16*
*Verified against codebase: 2026-03-16*
