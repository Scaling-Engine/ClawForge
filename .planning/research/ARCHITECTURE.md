# Architecture Research: v2.2 Smart Operations Integration

**Domain:** Multi-channel AI agent platform — adding Claude Code terminal mode, superadmin instance switching, full UI operations parity, and smart execution policies to ClawForge v2.1
**Researched:** 2026-03-16
**Confidence:** HIGH — derived from direct codebase inspection of all referenced files, confirmed against existing patterns from v2.0 and v2.1 milestones

> **Note:** This document supersedes the v2.0 ARCHITECTURE.md (clusters, headless streaming, MCP tool layer). The prior document's patterns (Server Actions, SSE streaming, dockerode, cluster isolation) remain valid — they are preconditions for v2.2 work, not duplicated here. This document focuses exclusively on how the four v2.2 features integrate with the existing architecture.

---

## System Overview: v2.1 Baseline

```
User
 |
 +-- Slack ---------> SlackAdapter ------+
 +-- Telegram ------> TelegramAdapter ---+
 +-- Web Chat ------> chat-page.jsx -----+  (AI SDK v5 DefaultChatTransport)
                                         |
                                         v
                         Event Handler (Next.js)
                          lib/ai/agent.js (LangGraph ReAct)
                          lib/ai/tools.js (9 tools)
                                         |
               +-------+---------+-------+---------+
               |       |         |       |         |
               v       v         v       v         v
          createJob  startCoding  cluster  web_search  get_project_state
               |       |             |
               v       v             v
          job/{UUID}  Workspace    Cluster Worker
          (GitHub)    Container    Container
                      (ttyd+tmux)  (stream-json)
                          |             |
                          v             v
                     lib/ws/proxy.js  lib/cluster/stream.js (SSE)
                          |
                          v
                     xterm.js (browser)

Auth:
 - NextAuth v5 sessions  → all web pages + Server Actions
 - admin role check       → /admin/* (lib/auth/middleware.js)
 - API key auth           → api/index.js external webhooks
 - Ticket-based WS auth   → /ws/* (custom HTTP server)

Streaming infrastructure (EXISTING — used by headless jobs + clusters):
 - lib/tools/stream-manager.js    → in-memory pub/sub per jobId
 - lib/tools/log-parser.js        → parseLineToSemanticEvent() + scrubSecrets()
 - lib/jobs/stream-api.js         → SSE GET /api/jobs/stream/[jobId]
 - lib/tools/docker.js            → dispatchDockerJob() → waitAndNotify() → PR
```

---

## Question 1: Claude Code Terminal Mode — Streaming Architecture

**The question:** Does Claude Code terminal mode go through the existing SSE path, a new WebSocket, or extend the AI SDK stream?

### Decision: Extend the AI SDK UIMessageStream

**Rationale:** `lib/chat/api.js` already uses `createUIMessageStream` + `createUIMessageStreamResponse` from AI SDK v5. It already has a writer loop that emits `text-start`, `text-delta`, `text-end`, `tool-input-start`, `tool-input-available`, `tool-output-available`. Claude Code terminal mode produces `stream-json` JSONL output — the same format already handled by `lib/tools/log-parser.js` (`parseLineToSemanticEvent()`).

The existing headless infrastructure already has: Docker log stream → `parseLineToSemanticEvent()` → `streamManager.emit()` → SSE subscribers. Terminal mode reuses this parsing but routes events into the AI SDK writer loop instead of SSE. The result renders in the existing `useChat()` / `job-stream-viewer.jsx` without changes to the browser side.

### How It Works

Terminal mode is a new execution branch in `lib/chat/api.js` (alongside the existing `interactiveMode` toggle at line 73-75). When the user sends a message in terminal mode:

1. `lib/chat/api.js` receives `terminalMode: true` in the request body
2. Instead of routing through LangGraph `chatStream()`, it directly:
   - Calls `dispatchTerminalJob()` in `lib/tools/docker.js` — a variant of existing `dispatchDockerJob()` that skips `waitAndNotify` and PR creation
   - Attaches Docker log stream from dockerode (`container.logs({ follow: true, stdout: true, stderr: true })`)
   - Pipes each line through `parseLineToSemanticEvent()` (already handles `stream-json` JSONL output)
   - Writes events into the `createUIMessageStream` writer using the existing event type mapping
3. Browser `useChat()` receives and renders the events exactly as it does today for LangGraph tool calls

**No new WebSocket.** The existing WebSocket path (`lib/ws/proxy.js`) is for workspace terminals (ttyd bidirectional binary protocol). Terminal mode is one-way output streaming — the AI SDK UIMessageStream SSE response is the right transport. Zero custom HTTP server changes needed.

**No separate SSE endpoint.** The cluster SSE path (`lib/jobs/stream-api.js` → `GET /api/jobs/stream/[jobId]`) is a separate endpoint because cluster streaming is autonomous and not tied to a chat session. Terminal mode IS tied to a chat session — it belongs inside the existing `POST /stream/chat` response.

### What Exists vs What to Build

| Component | Status | Location | Role in Terminal Mode |
|-----------|--------|----------|-----------------------|
| `createUIMessageStream` | EXISTING | AI SDK v5 | Writer/transport — reuse unchanged |
| `lib/chat/api.js` | MODIFY | `lib/chat/api.js` | Add `terminalMode` branch: skip LangGraph, call `dispatchTerminalJob()`, pipe log stream into writer |
| `dispatchDockerJob()` | EXISTING | `lib/tools/docker.js` | Base pattern — terminal mode is a variant without `waitAndNotify` |
| `dispatchTerminalJob()` | NEW | `lib/tools/docker.js` | Creates terminal container, returns `{ containerId }`, no PR creation |
| `parseLineToSemanticEvent()` | EXISTING | `lib/tools/log-parser.js` | Already handles `--output-format stream-json` JSONL — reuse unchanged |
| `streamManager` | EXISTING | `lib/tools/stream-manager.js` | Optional: can use for interrupt/resume coordination |
| Terminal container image | NEW | `templates/docker/claude-code-terminal/` | Dockerfile + entrypoint — `claude` with `--output-format stream-json`, no `git push`, no PR |
| `cancelTerminalJob()` | NEW | `lib/tools/docker.js` | `docker.getContainer(id).kill()` — same pattern as workspace stop |
| `lib/chat/components/chat-page.jsx` | MODIFY | `lib/chat/components/chat-page.jsx` | Terminal mode toggle button; pass `terminalMode` in request body |

### Terminal Container vs Job Container

| Concern | Job Container | Terminal Container |
|---------|---------------|--------------------|
| Output format | Plain text + JSONL mixed | `--output-format stream-json` always |
| Git operations | Yes — commit + PR | No — agent works on named volume, no PR |
| `waitAndNotify` | Yes | No — stream is live in chat |
| Image location | `templates/docker/job/` | `templates/docker/claude-code-terminal/` |
| Entrypoint | 5-section FULL_PROMPT → job.md | Task from chat message directly |
| Volume | `clawforge-{instance}-{slug}` | Shared with job container (same repo = same warm state) |

### Interrupt/Resume

Interrupt: browser POSTs to a Server Action `cancelTerminalJob(chatId)` → `docker.getContainer(containerId).kill()`. The `containerId` is stored in-memory keyed by `chatId` (same pattern as `streamManager` keyed by `jobId`).

Resume is a new terminal session. Prior session's git state is preserved in the named volume (same warm-start mechanism as job containers).

---

## Question 2: Superadmin Portal — Auth Architecture

**The question:** Does superadmin need a separate auth layer above instances, or can it use existing NextAuth with instance-scoped sessions?

### Decision: Add `superadmin` Role to the Existing Users Table

**Rationale:** ClawForge already has a `role` column on `users` (`admin` or `user`). `lib/auth/middleware.js` already checks `req.auth.user?.role` for `/admin/*` routes. Adding `superadmin` is a one-column, one-middleware-check change — no separate auth system, no separate session store, no new database.

The architectural insight: each instance is a separate deployed process with its own SQLite DB and user table. "Superadmin" means one user who sees and controls all instances from a single browser session. That session lives on ONE instance (the "hub" — Noah's in current setup). The superadmin portal reads from OTHER instances via their REST APIs, not by logging into them.

### How It Works

```
User logs into noah.scalingengine.com (hub instance)
  → user.role === 'superadmin'
  → Middleware allows /superadmin/* routes
  → Superadmin pages show:
      - Instance health (ping each instance's /api/superadmin/status)
      - Instance switcher (entries from config/instances.json)
      - Cross-instance job list (aggregate from each instance's status API)
      - Cross-instance config editing (via GitHub Secrets/Variables API — lib/github-api.js)
```

The superadmin portal does NOT authenticate into other instances. It uses:
- **Read operations:** Each instance exposes a minimal status API protected by `x-superadmin-token` (new shared secret, stored as `AGENT_SUPERADMIN_TOKEN` in GitHub secrets — visible only to the hub instance)
- **Write operations:** GitHub Secrets/Variables API (`lib/github-api.js` — already implemented in v2.1)

### What Exists vs What to Build

| Component | Status | Location | Change |
|-----------|--------|----------|--------|
| `users.role` column | EXISTING | `lib/db/schema.js` | Add `superadmin` as valid value (documentation only — SQLite TEXT has no enum constraint) |
| `lib/auth/middleware.js` | MODIFY | `lib/auth/middleware.js` | Add `/superadmin/*` check: `role !== 'superadmin'` → `/forbidden`; `/admin/*` remains `admin` only |
| `config/instances.json` | NEW | `config/instances.json` | Static list: `[{ name, url, instanceName }]` — read by superadmin Server Actions |
| `/api/superadmin/status` | NEW | `api/index.js` | Endpoint returning `{ healthy, activeJobs, instanceName, version }` — protected by `x-superadmin-token` |
| `lib/superadmin/` | NEW | `lib/superadmin/` | Server Actions: `getInstanceStatus()`, `getInstanceJobs()`, proxied reads |
| `app/superadmin/` pages | NEW | — | Instance list, instance detail, cross-instance job view |

### Instance Switcher

"Switching" means changing the context of UI operations, not changing which process you authenticate to. When superadmin selects "strategyES", the UI scopes requests to the strategyES instance URL for read data and GitHub API for write operations. This is a client-side context selection. Session tokens never cross instance boundaries — sharing `AUTH_SECRET` would violate per-instance isolation.

---

## Question 3: UI Operations — Server Actions Pattern vs New API Routes

**The question:** Should repo CRUD, job control, config editing, and instance management use Server Actions or new API routes?

### Decision: Server Actions for All Browser-Initiated Operations

This is the established project pattern (PROJECT.md key decisions: "Server Actions for browser-to-Docker operations"). Every v2.0 and v2.1 UI feature used this pattern:
- Workspace lifecycle → Server Actions in `lib/tools/docker.js` wrapping dockerode
- Cluster management → Server Actions in `lib/cluster/actions.js`
- Admin config → Server Actions in `lib/db/config.js`
- GitHub secrets → Server Actions calling `lib/github-api.js`

v2.2 follows the same pattern without exception.

### Operation Breakdown

**Job Control (cancel/retry/view logs):**
- Cancel: `docker.getContainer(containerId).kill()` via dockerode — same pattern as `stopWorkspace()`
- Retry: re-invoke `createJob()` with same parameters from `job_outcomes` DB record, increment `retry_count`
- Log streaming: extend the existing `lib/jobs/stream-api.js` SSE pattern — `dispatchDockerJob` already registers with `streamManager`; logs are already accessible via `GET /api/jobs/stream/[jobId]`
- The SSE streaming for jobs already exists. What's missing is the UI page with cancel/retry buttons.

**Repo CRUD (create/update/delete repos in REPOS.json):**
- `REPOS.json` lives in `instances/{name}/config/` in the filesystem — ephemeral if written directly
- Recommended approach: dispatch a git job that commits updated `REPOS.json` to the repo (same pattern as instance generator in v1.3)
- Creates audit trail, allows rollback, matches existing convention
- Server Action: `lib/repos/actions.js` (new) — validates REPOS.json format, dispatches git job

**Config Editing (LLM provider, model, instance settings):**
- `lib/db/config.js` `getConfig()`/`setConfig()` already fully implemented in v2.1
- `/admin/general` page already exists for this
- New in v2.2: expose persona files (SOUL.md, EVENT_HANDLER.md, AGENT.md) as editable fields
- Editing persona files → Server Action dispatches a git job to commit changes (same rationale as REPOS.json)

**Instance Management:**
- Create: already implemented via instance generator (v1.3) — conversation-driven job dispatch. UI provides a structured form that pre-fills the job description.
- Update/deactivate: Server Action dispatches git job to update `docker-compose.yml` via PR
- No direct filesystem mutation for instance management — always go through git PR

### Complete UI Operations Component Map

| Operation | Module | Pattern | Status |
|-----------|--------|---------|--------|
| Job cancel | `lib/jobs/actions.js` | Server Action → dockerode kill | NEW |
| Job retry | `lib/jobs/actions.js` | Server Action → createJob() with retry_count | NEW |
| Job log streaming endpoint | `lib/jobs/stream-api.js` | SSE → streamManager (via dispatchDockerJob) | EXISTING |
| Job log streaming UI page | chat components | Job detail page with cancel/retry buttons | NEW |
| Repo CRUD | `lib/repos/actions.js` | Server Action → git job dispatch | NEW |
| Config editing | `lib/db/config.js` | Existing setConfig() via /admin/* | EXISTING |
| Persona file editing | `lib/admin/actions.js` | Server Action → git job dispatch | NEW |
| Instance create (form UI) | conversation-driven | Existing instance generator | EXISTING |
| Instance deactivate | `lib/instances/actions.js` | Server Action → git job dispatch | NEW |
| Superadmin status | `api/index.js` + `lib/superadmin/actions.js` | API route (external) + Server Action (browser) | NEW |

---

## Question 4: Smart Execution — Where Quality Gates and Merge Policies Live

**The question:** Do quality gates and merge policies live in Event Handler, Job Container, or GitHub Actions?

### Decision: Split Responsibilities — Gates in GitHub Actions, Feedback in Event Handler

| Concern | Data Needed | Best Layer | Rationale |
|---------|-------------|------------|-----------|
| Pre-CI quality gate | Test results, lint output | GitHub Actions | Actions already runs in repo context; quality checks ARE CI |
| Test feedback to agent | PR check results, test failure details | Event Handler | Already receives GitHub webhooks; re-dispatches corrective jobs |
| Merge policy | PR labels, file paths | GitHub Actions (`auto-merge.yml`) | Already implemented; extend existing ALLOWED_PATHS |
| Merge policy config UI | Operator configuration | Event Handler admin panel | Config stored via GitHub Variables API |

### Pre-CI Quality Gates

Quality gates run in `auto-merge.yml` (GitHub Actions). The extension:
1. Add `status-check` requirement: wait for `test`, `lint`, `typecheck` status checks before merge
2. Add path-based protection: if PR touches `lib/auth/`, `lib/db/schema.js`, require manual approval
3. Run `npm run lint && npm run typecheck` as a workflow step before merge

No Event Handler changes. No Job Container changes. Pure workflow enhancement.

### Test Feedback Loops

When a job's PR fails CI, existing `notify-job-failed.yml` fires. Current behavior: notifies operator. v2.2 enhancement:

1. `notify-job-failed.yml` POSTs to `/api/github/webhook` with `{ event: 'ci_failure', jobId, prUrl, testOutput, retryCount }`
2. `api/index.js` `handleGitHubWebhook()` already processes this webhook
3. New branch: if `failureType === 'ci_failure'` AND `retryCount < MAX_RETRIES` → `createJob()` with test failure output injected into job description
4. Follow-up job is a standard `createJob()` call — agent reads failing test output and fixes it

Runs in Event Handler, uses existing webhook + `createJob()` infrastructure. No new execution layer.

### Merge Policy Configuration

Store merge policy in GitHub Actions Variables (not SQLite config). The admin panel calls `lib/github-api.js` to update Variables directly. `auto-merge.yml` reads them at runtime.

Why GitHub Variables over SQLite: the workflow is the authoritative source for merge decisions; keeping its config with GitHub avoids the Event Handler becoming a runtime dependency for merges.

### Smart Execution Component Map

| Feature | Location | Status | Notes |
|---------|----------|--------|-------|
| Pre-CI quality gate | `templates/.github/workflows/auto-merge.yml` | MODIFY | Add status check requirements + protected paths |
| CI failure payload | `templates/.github/workflows/notify-job-failed.yml` | MODIFY | Include test output in webhook POST |
| CI failure handler | `api/index.js` | MODIFY | Add `ci_failure` event → corrective `createJob()` |
| Retry count tracking | `lib/db/job-outcomes.js` | MODIFY | Add `retry_count` field to `job_outcomes` |
| Retry limit config | `lib/db/config.js` → `settings` table | NEW config key | `ci_retry_max_attempts` (default: 2) |
| Merge policy UI | `lib/admin/actions.js` | MODIFY | Add GitHub Variables CRUD for `ALLOWED_PATHS` etc. |
| Protected path detection | `templates/.github/workflows/auto-merge.yml` | MODIFY | Path-based manual approval requirement |

---

## Complete v2.2 Component Map

### New Components (to build from scratch)

| Component | Path | Feature | Description |
|-----------|------|---------|-------------|
| Terminal container Dockerfile | `templates/docker/claude-code-terminal/Dockerfile` | Terminal mode | Node 22 + Claude Code CLI, `--output-format stream-json`, no GH CLI needed |
| Terminal container entrypoint | `templates/docker/claude-code-terminal/entrypoint.sh` | Terminal mode | Receives task, runs `claude -p`, outputs JSONL, no git push, no PR |
| Job actions | `lib/jobs/actions.js` | UI ops | Server Actions: cancel, retry |
| Repo actions | `lib/repos/actions.js` | UI ops | Server Actions: REPOS.json CRUD via git job dispatch |
| Instance actions | `lib/instances/actions.js` | UI ops + superadmin | Server Actions: deactivation, update via git |
| Instance registry | `config/instances.json` | Superadmin | Static list of all instances with name + URL |
| Superadmin module | `lib/superadmin/` | Superadmin | Cross-instance Server Actions, `getInstanceStatus()`, `getInstanceJobs()` |
| Superadmin pages | `app/superadmin/` | Superadmin | Instance list, instance detail, cross-instance job view |

### Modified Components

| Component | Path | Feature | Change |
|-----------|------|---------|--------|
| Chat API | `lib/chat/api.js` | Terminal mode | Add `terminalMode` branch: skip LangGraph, call `dispatchTerminalJob()`, pipe log stream into writer via `parseLineToSemanticEvent()` |
| Docker tools | `lib/tools/docker.js` | Terminal mode + job control | Add `dispatchTerminalJob()` (no `waitAndNotify`), `cancelTerminalJob()`, `cancelJob()` |
| Auth middleware | `lib/auth/middleware.js` | Superadmin | Add `superadmin` role check for `/superadmin/*` |
| GitHub webhook handler | `api/index.js` | Smart execution + superadmin | CI failure → corrective job dispatch; add `/api/superadmin/status` endpoint |
| Auto-merge workflow | `templates/.github/workflows/auto-merge.yml` | Smart execution | Status check requirements + protected paths |
| Notify-job-failed workflow | `templates/.github/workflows/notify-job-failed.yml` | Smart execution | Include CI test output in webhook payload |
| Job outcomes DB | `lib/db/job-outcomes.js` | Smart execution | Add `retry_count` field |
| Admin actions | `lib/admin/actions.js` | Smart execution | GitHub Variables CRUD for merge policy config |
| Chat page | `lib/chat/components/chat-page.jsx` | Terminal mode | Terminal mode toggle button; `terminalMode` in request body |

---

## Data Flow: Four Features Integrated

### Claude Code Terminal Mode

```
User in Web Chat: "Refactor the auth module" + [terminal mode ON]
  --> POST /stream/chat with { terminalMode: true, messages: [...] }
  --> lib/chat/api.js: terminalMode branch
  --> dispatchTerminalJob({ repo, branch, task }) → { containerId }
      --> docker.createContainer({ image: 'clawforge-terminal', env: [TASK, REPO, ...] })
      --> container.start()
      --> container runs: claude -p "$TASK" --output-format stream-json --allowedTools "..."
  --> container.logs({ follow: true, stdout: true, stderr: true }) → raw Docker log stream
  --> for each line: parseLineToSemanticEvent(line) → { type, data } | null
  --> Writer loop maps events to AI SDK stream parts:
        { type: 'tool_use', name, input }      → tool-input-start + tool-input-available
        { type: 'tool_result', content }        → tool-output-available
        { type: 'text', text }                  → text-start + text-delta + text-end
        { type: 'result', cost_usd }            → finish
  --> browser useChat() renders tool calls live (same rendering as LangGraph tool calls today)
  --> Container exits → writer emits finish → chat session ends

Interrupt:
  --> User clicks interrupt button
  --> POST to Server Action: cancelTerminalJob(chatId)
  --> docker.getContainer(containerId).kill('SIGTERM')
  --> Container exits → log stream closes → writer emits finish
```

### Superadmin Instance Switching

```
Superadmin user at noah.scalingengine.com
  --> Navigates to /superadmin/instances
  --> Server Action: for each entry in config/instances.json:
        GET {instanceUrl}/api/superadmin/status
        Header: x-superadmin-token: {AGENT_SUPERADMIN_TOKEN}
        Returns: { healthy, activeJobs, instanceName, version }
  --> Selects strategyES instance (client-side context switch)
  --> UI scopes job reads to strategyES instance URL
  --> To edit config/secrets: lib/github-api.js → GitHub Variables/Secrets API
  --> To view active jobs: proxied GET to strategyES /api/superadmin/status?include=jobs
```

### Smart Execution — Test Feedback Loop

```
Job completes → PR opens → GitHub Actions runs tests
  → Tests fail → notify-job-failed.yml fires
  --> Webhook POST to /api/github/webhook with {
        event: 'ci_failure',
        jobId,
        prUrl,
        testOutput: "FAIL src/auth.test.js: expected 200 got 401",
        retryCount: 0
      }
  --> api/index.js → handleGitHubWebhook()
  --> if (event === 'ci_failure'):
        getConfig('ci_retry_max_attempts') → 2
        if retryCount < maxAttempts:
          createJob({ task: "Fix CI failure:\n" + testOutput, retryCount: retryCount + 1 })
        else:
          notifyOperator("Max retries reached for job " + jobId)
```

---

## Build Order (Dependency-Driven)

### Phase 1: Claude Code Terminal Mode (no external dependencies)

Dependencies: None. Builds on existing `parseLineToSemanticEvent()` (`lib/tools/log-parser.js`), `dispatchDockerJob()` pattern (`lib/tools/docker.js`), and `createUIMessageStream` (already in `lib/chat/api.js`).

1. `templates/docker/claude-code-terminal/` — Dockerfile + entrypoint.sh
2. `lib/tools/docker.js` — add `dispatchTerminalJob()`, `cancelTerminalJob()`
3. `lib/chat/api.js` — add `terminalMode` branch
4. `lib/chat/components/chat-page.jsx` — terminal mode toggle button

Verification: Send message in terminal mode → watch live Claude Code tool calls render in chat as streaming events.

### Phase 2: UI Operations (depends on terminal mode for cancel pattern; depends on existing SSE)

Dependencies: Phase 1 establishes `cancelJob()` pattern in `docker.js`. Job log SSE endpoint (`lib/jobs/stream-api.js`) already exists from v2.0.

5. `lib/jobs/actions.js` — cancel, retry Server Actions
6. Job detail UI page — cancel/retry buttons consuming existing `/api/jobs/stream/[jobId]` SSE
7. `lib/repos/actions.js` — REPOS.json CRUD via git job dispatch
8. Repo management page in admin panel

Verification: Cancel a running job from UI → container stops. Retry a failed job → new job dispatched. Edit REPOS.json → PR created with updated config.

### Phase 3: Superadmin Portal (depends on existing NextAuth + GitHub API module)

Dependencies: NextAuth role system (v2.1), `lib/github-api.js` (v2.1). Independent of Phases 1-2.

9. `lib/auth/middleware.js` — add `superadmin` role guard for `/superadmin/*`
10. `config/instances.json` — instance registry file
11. `api/index.js` — add `/api/superadmin/status` endpoint with `x-superadmin-token` auth
12. `lib/superadmin/actions.js` — cross-instance Server Actions
13. `app/superadmin/` pages — instance list, detail, cross-instance job view

Verification: Superadmin user sees all instances with health status; can view jobs across instances from hub.

### Phase 4: Smart Execution (depends on Phase 2 job retry, Phase 3 for merge policy UI)

Dependencies: Phase 2 `retry_count` pattern, Phase 3 GitHub Variables access (can be simplified to direct `lib/github-api.js` calls without the full superadmin UI).

14. `templates/.github/workflows/auto-merge.yml` — status check requirements + protected paths
15. `templates/.github/workflows/notify-job-failed.yml` — include test output in webhook payload
16. `lib/db/job-outcomes.js` — add `retry_count` field + migration
17. `api/index.js` — CI failure handler branch + corrective job dispatch
18. `lib/admin/actions.js` — merge policy GitHub Variables CRUD in admin panel

Verification: Deliberately failing tests on a job PR → corrective job auto-dispatched with test failure context → second PR passes tests.

---

## Architectural Patterns to Follow

### Pattern 1: Terminal Mode = Headless Mode Without PR

Terminal mode reuses the entire headless streaming stack from v2.0. The only difference is the container entrypoint: no `git push`, no PR creation. The stream parsing (`parseLineToSemanticEvent`), writer loop, and browser rendering are identical. Build terminal mode as a thin configuration variant of headless mode — not a new streaming system.

**When to use:** Any Claude Code execution the user watches in real time that does NOT require a GitHub PR audit trail.

### Pattern 2: Superadmin as Proxy, Not Federation

The superadmin portal does NOT federate auth. It proxies read requests to other instances using a shared service token (`x-superadmin-token`). Each instance remains independently authenticated. Session tokens never cross instance boundaries.

**When to use:** Any cross-instance operation that can be read-only from the remote instance's perspective.

### Pattern 3: Config Mutations Always Go Through Git

Any mutation to `instances/{name}/config/` files (SOUL.md, AGENT.md, REPOS.json, AGENT_QUICK.md) must produce a git commit and PR, not a direct filesystem write. This preserves the audit trail and allows rollback. The instance generator (v1.3) established this pattern.

**When to use:** Any operation that modifies instance configuration files.

### Pattern 4: Quality Gates Are Actions-Native

Pre-CI quality gates belong in GitHub Actions workflows, not in the Event Handler. The Event Handler reacts to workflow outcomes (success/failure webhooks) and dispatches corrective jobs. Actions decides whether to merge.

**When to use:** Any automated quality check that should block or allow a merge.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: WebSocket for Claude Code Terminal Streaming

**What people do:** Add a new WebSocket endpoint for terminal mode because "terminals use WebSockets."

**Why it's wrong:** The existing workspace terminal (`lib/ws/proxy.js`) uses WebSocket because ttyd requires bidirectional binary protocol. Claude Code streaming is one-way text output. A new WebSocket endpoint requires changes to `server.js`, complicates the upgrade interception logic, and adds unnecessary complexity when the AI SDK UIMessageStream SSE path already works.

**Do this instead:** Extend the existing `POST /stream/chat` response using `createUIMessageStream`. Zero new infrastructure.

### Anti-Pattern 2: Shared AUTH_SECRET for Instance Switching

**What people do:** Share `AUTH_SECRET` across instances so a session token from one instance can be verified on another.

**Why it's wrong:** `AUTH_SECRET` signs and verifies session JWTs. Sharing it means a compromised instance's session token works on all instances. Violates per-instance isolation.

**Do this instead:** Use a dedicated `AGENT_SUPERADMIN_TOKEN` (GitHub secret with `AGENT_` prefix, not LLM-accessible) shared only for the narrow status API between hub and managed instances.

### Anti-Pattern 3: Direct Filesystem Writes for REPOS.json / Persona Files

**What people do:** Write updated `REPOS.json` or `SOUL.md` directly to `instances/{name}/config/` from a Server Action.

**Why it's wrong:** The change lives only in the running container's filesystem. Lost on container restart, not in git history, not rollback-able.

**Do this instead:** Dispatch a git job that commits the updated file as a PR (same pattern as instance generator). Merge the PR to apply the change durably.

### Anti-Pattern 4: Event Handler Running Test Suites

**What people do:** Add test-running capability to the Event Handler to gate jobs before creating PRs.

**Why it's wrong:** Tests require a full checkout, dependencies, and execution environment. Running test suites inside the long-running Next.js server introduces resource contention and security risk (arbitrary code execution in server process).

**Do this instead:** Tests run in GitHub Actions. The Event Handler only reacts to test results via webhooks.

### Anti-Pattern 5: Superadmin Portal Running Its Own LangGraph Instance

**What people do:** Give the superadmin portal its own agent that can orchestrate all instances.

**Why it's wrong:** Creates a new LangGraph instance with its own SQLite checkpoint store, tool loop, and conversation memory — a new system, not an extension. Also a single point of failure affecting all instances.

**Do this instead:** Superadmin is a UI-only aggregate view. Cross-instance write operations go through GitHub API which already has rate limits, audit trails, and access control.

---

## Integration Point Summary

| Integration Point | Existing Code | Extension Required |
|------------------|---------------|--------------------|
| Terminal mode streaming transport | `lib/chat/api.js` + `createUIMessageStream` | Add `terminalMode` branch; route to terminal container instead of LangGraph |
| Terminal mode stream parsing | `lib/tools/log-parser.js` `parseLineToSemanticEvent()` | Reuse unchanged — already handles `stream-json` JSONL |
| Terminal container dispatch | `lib/tools/docker.js` `dispatchDockerJob()` | Add `dispatchTerminalJob()` — same pattern, no `waitAndNotify`, no PR |
| Job cancellation | `lib/tools/docker.js` `stopWorkspace()` pattern | Add `cancelJob()` / `cancelTerminalJob()` using same dockerode kill pattern |
| Session auth + roles | `lib/auth/middleware.js` + `lib/auth/config.js` | Add `superadmin` role; add `/superadmin/*` guard |
| Cross-instance API | `api/index.js` | Add `/api/superadmin/status` endpoint with `x-superadmin-token` auth |
| Admin panel patterns | `lib/admin/`, `lib/db/config.js`, `lib/github-api.js` | Add merge policy GitHub Variables CRUD; persona file editing via git |
| GitHub webhook handler | `api/index.js` `handleGitHubWebhook()` | Add `ci_failure` event branch → corrective `createJob()` dispatch |
| Job dispatch with retry | `lib/tools/create-job.js` + `lib/db/job-outcomes.js` | Add `retry_count` tracking; retry reuses existing `createJob()` |
| Existing job SSE streaming | `lib/jobs/stream-api.js` + `streamManager` | UI page consuming existing endpoint — endpoint unchanged |
| Merge policy | `templates/.github/workflows/auto-merge.yml` | Status check requirements + protected paths + GitHub Variables for config |

---

## Scalability Considerations

| Concern | v2.2 (2 instances) | v2.3 (5 instances) | v3.0 (20+ instances) |
|---------|--------------------|--------------------|----------------------|
| Terminal mode containers | 2-4 concurrent, fine | 10, fine | Consider queue |
| Superadmin cross-instance polling | 2 instances, trivial | 5, fine | Need caching layer |
| CI retry jobs | Low volume, fine | Fine | Need dedup guard (same PR re-triggering) |
| Merge policy GitHub Variables | Per-instance, fine | Fine | Consider centralizing in hub config |
| Job log SSE connections | 2-4, trivial | Fine | Same scale as existing cluster streaming |

For v2.2 scope (2 instances, single Docker host), no scalability changes needed.

---

## Open Questions for Phase-Specific Research

1. **Terminal mode and MCP:** Terminal containers need the same `.mcp.json` available as job containers. Does the terminal container use the same Dockerfile as headless jobs, or a separate image? Recommendation: shared base image; instance-specific Dockerfiles handle MCP injection identically.

2. **CI failure webhook payload size:** `notify-job-failed.yml` currently sends minimal payload. To support feedback loops, it needs to include test output. What is the GitHub Actions webhook payload size limit? If test output is large (e.g., full Jest output), may need to store it in the job branch and reference by URL. Flag for Phase 4 research.

3. **Superadmin token rotation:** The `AGENT_SUPERADMIN_TOKEN` is a new shared secret. Stored as a GitHub secret with `AGENT_` prefix on each instance, rotatable via existing GitHub secrets UI. This is a new secret rotation procedure to document in ops.

4. **Terminal mode hot-reloads in dev:** `dispatchTerminalJob()` stored in-memory `containerId` map will be lost on Next.js module hot-reload in dev. Use `globalThis.__clawforge_terminal_sessions` pattern (same as `globalThis.__clawforge_docker` and `globalThis.__clawforge_streams`) to survive hot-reloads.

---

## Sources

- `lib/chat/api.js` — AI SDK v5 `createUIMessageStream` + `createUIMessageStreamResponse` + existing `interactiveMode` toggle (HIGH confidence — file inspected directly)
- `lib/tools/log-parser.js` — `parseLineToSemanticEvent()` handles both plain-text and `stream-json` JSONL (HIGH confidence — file inspected directly)
- `lib/tools/stream-manager.js` — in-memory pub/sub pattern keyed by jobId (HIGH confidence — file inspected directly)
- `lib/jobs/stream-api.js` — SSE endpoint pattern for job streaming (HIGH confidence — file inspected directly)
- `lib/tools/docker.js` — existing `dispatchDockerJob()`, `stopWorkspace()`, `initDocker()` patterns (HIGH confidence — file inspected directly)
- `lib/auth/middleware.js` — existing role-based route guarding for `/admin/*` (HIGH confidence — directory listing confirmed)
- `lib/ws/proxy.js` — WebSocket proxy with ttyd protocol — confirms why new WebSocket is not the right approach for terminal mode (HIGH confidence — file inspected directly)
- `lib/db/schema.js` — `users.role`, `codeWorkspaces`, `clusterRuns`, `settings` table structure (HIGH confidence — directory listing confirmed)
- `.planning/PROJECT.md` — key decisions: Server Actions for browser ops, per-instance Docker network isolation, git-as-audit-trail, `globalThis` pattern for module reuse (HIGH confidence — file inspected directly)
- `docs/ARCHITECTURE.md` — two-instance topology, Docker network isolation, GitHub Actions workflow integration (HIGH confidence — file inspected directly)

---

*Architecture research for: v2.2 Smart Operations (ClawForge)*
*Researched: 2026-03-16*
