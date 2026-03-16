# Pitfalls Research

**Domain:** Adding Claude Code terminal chat mode, superadmin instance switcher, full UI operations parity, and smart execution policies to existing ClawForge v2.1 platform
**Researched:** 2026-03-16
**Confidence:** HIGH (codebase inspection + official SDK docs) / MEDIUM (community patterns, verified against codebase) / LOW (flagged where applicable)

---

> **Note:** This file supersedes prior PITFALLS.md files (v2.0 and v2.1). Prior pitfalls remain valid preconditions. This file focuses exclusively on the four v2.2 feature areas and their integration risks with the existing architecture.

---

## Critical Pitfalls

### Pitfall 1: Terminal Mode Creates a Third Transport Alongside SSE and AI SDK — Conflicts Are Non-Obvious

**What goes wrong:**
ClawForge currently has two live data transports active in the browser simultaneously:
- **WebSocket** at `/ws/terminal/{workspaceId}?ticket=...` — proxied by `lib/ws/server.js` to ttyd containers
- **SSE** at `/api/jobs/stream/{jobId}` — `lib/jobs/stream-api.js` for headless job log streaming
- **AI SDK streaming** at `/stream/chat` — `useChat()` from `@ai-sdk/react` using `DefaultChatTransport`

Adding a "Claude Code terminal chat mode" means embedding a fourth data path: `claude -p` output streamed back through the chat. The immediate failure mode is attempting to reuse the existing WebSocket server for this, which breaks because `lib/ws/server.js` only handles paths starting with `/ws/terminal/` and proxies directly to ttyd. A new Claude Code chat session is not a ttyd session — it does not speak the ttyd binary frame protocol.

The subtler failure is attempting to route Claude Code chat output through the existing SSE job stream endpoint. That endpoint is designed for headless Docker jobs registered in `stream-manager.js`. Claude Code chat mode runs interactively and bidirectionally — it needs stdin to interrupt and resume, not just log playback. Treating it as a headless job drops the interrupt/resume capability entirely.

**Why it happens:**
Reusing existing infrastructure is appealing. The workspace terminal "works" for interactive use, so developers assume it can be adapted for Claude Code chat mode. The headless SSE endpoint "works" for streaming output, so developers assume it can be adapted too. Neither assumption holds because the communication semantics are different: ttyd speaks a multiplexed binary protocol, SSE is one-directional, and Claude Code interactive mode is a bidirectional REPL.

**How to avoid:**
Treat Claude Code terminal chat mode as a net-new transport. The correct design is a dedicated WebSocket endpoint (e.g. `/ws/claude/{chatId}`) registered in `lib/ws/server.js` alongside the existing `/ws/terminal/` handler — not replacing it. The new handler spawns a `claude -p --output-format=stream-json` subprocess inside a workspace container and bridges stdin/stdout through the WebSocket. The `lib/ws/server.js` upgrade handler already has the right pattern; extend the `if (!pathname.startsWith('/ws/terminal/'))` branch to also handle `/ws/claude/`.

Ticket-based auth from `lib/ws/tickets.js` already works for this — issue a ticket from the chat page Server Action and validate it in the upgrade handler. No new auth mechanism required.

**Warning signs:**
- Attempting to open a ttyd URL to drive Claude Code chat mode (wrong protocol, binary framing mismatch)
- SSE stream for Claude Code chat mode with no mechanism to send keystrokes or interrupt signals
- Claude Code subprocess running on the Next.js server process instead of inside a container (security violation — no isolation)

**Phase to address:**
Claude Code terminal chat mode phase (first v2.2 phase)

---

### Pitfall 2: Claude Agent SDK Spawns a Node Process — Fails in Docker with ENOENT and Hangs in Test Environments

**What goes wrong:**
The `@anthropic-ai/claude-agent-sdk` (TypeScript) does not call `claude` as a binary — it spawns a Node child process running the bundled `cli.js` file. In Docker containers, this fails with `spawn node ENOENT` unless Node.js is on `PATH` inside the container. The job container image (`templates/docker/job/Dockerfile`) installs Node 22 correctly, but the workspace container image may not — it was designed as a terminal-only image with ttyd and is leaner than the job image.

A second failure: the SDK hangs when spawned from within certain Node.js test environments (confirmed GitHub issue #6775). If ClawForge ever runs integration tests that exercise the Claude terminal chat mode by spawning the SDK, the test runner deadlocks.

A third failure specific to this codebase: if `settingSources` includes `'user'` (the SDK default), the SDK loads `~/.claude/settings.json` from the container, which may contain a hardcoded `ANTHROPIC_API_KEY`. This overrides the `AGENT_LLM_SECRETS` environment variables that are the correct secret injection path in ClawForge's architecture.

**Why it happens:**
The SDK documentation says "install Claude Code before installing the SDK" but the SDK actually bundles `cli.js` internally. Developers see the claude binary on PATH in the job container and assume the SDK will use it — it does not. The SDK spawns its own bundled Node process, which requires Node to be available in the container PATH independently of whether `claude` is available.

**How to avoid:**
In any container that hosts the Claude Agent SDK (workspace containers for terminal chat mode), verify `node --version` is accessible from the process that spawns the SDK. The job container already has this (Node 22 base image). If workspace containers switch to a leaner base, ensure `node` remains on PATH.

Use `settingSources: []` (or exclude `'user'`) in SDK options to prevent global `~/.claude/settings.json` from overriding container-injected credentials. This also prevents loading global Skills in the chat session — which is the correct behavior for isolated sessions.

Do not run SDK-spawning code in test environments without a known-good test isolation pattern. Test the terminal chat mode integration against a real Docker container, not a mocked subprocess.

**Warning signs:**
- `spawn node ENOENT` in container logs when SDK is first called
- SDK uses wrong API key despite correct environment variables set (global settings.json override)
- Integration test suite hangs indefinitely when terminal chat mode code path is reached

**Phase to address:**
Claude Code terminal chat mode phase — verify container environment before wiring up the SDK

---

### Pitfall 3: xterm.js + Chat Bubble Rendering Creates Layout and State Conflicts

**What goes wrong:**
`chat.jsx` renders a vertical message list with `Messages` → `Message` components, each styled as chat bubbles. xterm.js renders an absolutely-positioned canvas grid — it does not participate in the CSS flow. When both are rendered inside the same flex column, xterm.js either overlaps the message list, collapses to zero height, or fails to measure its container for the `fit` addon because the container size is computed before React finishes layout.

The specific failure on the existing codebase: xterm.js tabs in Workspaces V2 use `display:none` to hide inactive tabs (`activeTabId` pattern in `lib/chat/components/`). This works for workspaces because each tab is a persistent terminal session. In a chat context, a "terminal message" embedded in the message stream would be unmounted and remounted as the user scrolls, destroying the xterm instance and losing all rendered output. xterm.js has no serializable history by default — once the DOM node is gone, the terminal is blank.

**Why it happens:**
Developers embed `<XTerm />` directly inside a message bubble, treating it like a code block. This works in demos (the terminal is visible at the time of embedding) but fails in production once the message scrolls out of the virtual list viewport.

**How to avoid:**
Never unmount xterm.js instances. Keep all Claude Code terminal sessions alive in a fixed-position overlay or in a `display:none` container exactly like the existing workspace tab pattern. The message bubble in the chat stream should be a lightweight "terminal session" indicator with a link or expand button — not the xterm canvas itself. On expand, reveal the fixed overlay. This matches how IDEs handle integrated terminals: the terminal panel lives outside the editor scroll area.

The `addon-serialize` addon (already installed via Workspaces V2 — `@xterm/addon-serialize`) can capture a snapshot for reconnect if the session dies, but it cannot reconstruct a live session from zero.

**Warning signs:**
- xterm.js rendered inside a `<div>` that is inside the Messages scroll container
- `fit` addon complaining about zero-width containers on mount
- Terminal output disappearing when the user scrolls up in chat history
- Resize events not propagating to xterm because the container is hidden

**Phase to address:**
Claude Code terminal chat mode phase (UI architecture decision must be made before any code is written)

---

### Pitfall 4: `--output-format=stream-json` + WebSocket Produces Partial-Line JSON Parse Failures

**What goes wrong:**
When Claude Code runs with `--output-format=stream-json --include-partial-messages`, it writes JSONL (newline-delimited JSON) to stdout. Each line is a complete JSON object. Node.js `child_process.spawn` delivers stdout in chunks that may split across newline boundaries — a single chunk from `stdout.on('data')` can contain a partial line at the end, or two complete lines concatenated. If the WebSocket handler forwards raw `data` chunks to the browser and the browser calls `JSON.parse()` on each chunk, it gets a SyntaxError on any partial line.

This is distinct from the binary framing issue with ttyd. This is a text protocol issue with how Node streams work.

**Why it happens:**
Developers write `process.stdout.on('data', (chunk) => ws.send(chunk.toString()))` in the WebSocket handler and test it with short prompts that happen to produce one-line-per-chunk output. Longer Claude Code sessions with multi-step tool calls produce chunks that straddle line boundaries.

**How to avoid:**
Use Node's `readline` interface on the subprocess stdout stream. `readline.createInterface({ input: child.stdout })` emits one complete line per `'line'` event. Forward one complete JSON line per WebSocket text frame. The browser receives complete JSON objects and parses them reliably.

```javascript
import { createInterface } from 'readline';

const rl = createInterface({ input: child.stdout });
rl.on('line', (line) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(line);
});
```

**Warning signs:**
- `SyntaxError: Unexpected end of JSON input` in browser console during long Claude Code sessions
- Works fine with short prompts, fails with complex multi-step operations
- `data` event handler forwarding raw buffers to WebSocket

**Phase to address:**
Claude Code terminal chat mode phase — the readline wrapper is a one-line fix but must be in place before integration testing

---

### Pitfall 5: Streaming and Extended Thinking Are Mutually Exclusive in the Agent SDK

**What goes wrong:**
The Claude Agent SDK has an undocumented-in-the-UI constraint: if `maxThinkingTokens` (TypeScript) is set, `StreamEvent` messages are NOT emitted. The caller only receives complete `AssistantMessage` objects after each full turn. This means if terminal chat mode is configured to use extended thinking for complex coding tasks, the streaming UI will receive no incremental updates — the user sees a blank terminal for the entire duration of the thinking phase, then all output arrives at once.

For a terminal chat mode that is meant to show live tool calls and file edits as they happen (the core UX goal), this makes extended thinking unusable as a default configuration.

**Why it happens:**
Extended thinking is a natural thing to enable for coding agents. The SDK docs mention this limitation in the streaming section but it is easy to miss when configuring options separately.

**How to avoid:**
Do not set `maxThinkingTokens` in the terminal chat mode SDK configuration. Keep thinking disabled (the SDK default) to preserve streaming. If extended thinking is needed for specific operations, design it as a separate non-streaming "deep analysis" mode with a progress indicator that is not xterm-based.

**Warning signs:**
- No `StreamEvent` messages arriving at the WebSocket handler despite `includePartialMessages: true` being set
- UI appears frozen during long Claude Code sessions even though the subprocess is running
- All output arriving at once at the end of a turn

**Phase to address:**
Claude Code terminal chat mode phase — SDK configuration must be locked before UI is built around streaming behavior

---

### Pitfall 6: Superadmin Instance Switcher Breaks the Single-Instance Auth Model

**What goes wrong:**
Every ClawForge instance is a separate Docker container with its own `.env`, own `INSTANCE_NAME`, own SQLite database, and own NextAuth session. The existing middleware in `lib/auth/middleware.js` reads `req.auth.user.role` from the session — role is stored in the local SQLite `users` table for that specific instance.

A superadmin portal that "switches between instances" requires a user who exists in multiple instances' databases. If Noah has an account in `noah` instance SQLite but not in `strategyES` instance SQLite, the session cookie from `noah` is encrypted with `noah`'s `AUTH_SECRET` — it cannot be decrypted by `strategyES`'s Next.js middleware. The user appears unauthenticated in `strategyES` even though they just authenticated in `noah`.

The broader failure: if the superadmin portal runs as a unified app that proxies to multiple instances, it must handle cross-instance auth. If it runs as one of the instance apps with a special view, it cannot access the other instance's SQLite (separate container filesystem). Neither naive approach works.

**Why it happens:**
The per-instance isolation that makes ClawForge secure (separate networks, separate DBs, separate secrets) becomes a barrier when you want a unified view. Developers typically reach for JWT-based shared sessions as the obvious fix, but this requires all instances to share `AUTH_SECRET`, which defeats the isolation goal.

**How to avoid:**
Do not attempt cross-instance session sharing via cookie. Instead, build the superadmin portal as a read-only aggregation layer that calls each instance's existing API routes with API key auth — not session auth. The portal holds API keys for each instance (stored in its own config, not in each instance) and proxies admin reads through those keys.

The existing API routes in each instance already support `X-API-Key` header authentication (the `checkAuth` pattern in `api/index.js` for Slack/Telegram/GitHub webhooks). Extend that pattern to admin-read endpoints specifically for superadmin aggregation. The superadmin UI never writes to instances directly — it dispatches commands back through the conversational agent.

Alternatively: the superadmin portal can be a static Next.js page that holds iframe panels per instance, each authenticated independently. The user logs in separately per instance (acceptable for 2 instances). This is ugly but requires zero changes to instance auth.

**Warning signs:**
- Attempting to share `AUTH_SECRET` across instances (breaks instance isolation)
- Storing cross-instance session state in any shared database (creates a new single point of failure)
- Admin API routes that accept session cookies without also accepting API keys (blocks superadmin proxy)

**Phase to address:**
Superadmin portal phase — auth model must be decided before any superadmin UI is built

---

### Pitfall 7: Browser-Driven Docker Operations Surface the Full Docker Socket to the Web Tier

**What goes wrong:**
The existing `lib/tools/docker.js` calls dockerode through the LangGraph agent (Server Action → `sendMessage` → LangGraph tool → dockerode). The Docker socket is mounted read-write: `docker.sock:/var/run/docker.sock` (currently `:ro` per the key decisions in PROJECT.md — but "read-only" only applies to the socket file itself, not what you can do via it). Dockerode issues commands to the Docker daemon via the socket regardless of the mount mode note in PROJECT.MD — `dispatchDockerJob`, `stopWorkspace`, `removeContainer` all write to the daemon.

Adding "full UI operations parity" means adding Server Actions that let the browser directly cancel jobs, destroy workspaces, rebuild images, or delete volumes. The danger is that these Server Actions — if not properly guarded — can be called by any authenticated user (role `user`, not just `admin`). The existing admin middleware guards `/admin/*` pages but does not guard individual Server Actions by role.

The worst case: a Server Action that calls `docker.removeContainer()` is callable by anyone with a session cookie. A user-role account (which exists in the schema: `role` defaults to `'admin'` but can be changed) can destroy running job containers.

**Why it happens:**
Server Actions inherit the page's session check (`auth()` in `lib/jobs/stream-api.js` checks `session?.user?.id`) but not the page's role check. The middleware only checks role for page routes, not for POST requests to Server Action endpoints. The role check for admin pages is in `middleware.js` at the route level — Server Actions are POST requests to the same route, and the matcher config excludes API routes but Server Actions are `/app/` routes, so the matcher does apply. However, inside the Server Action function body, you must call `auth()` again and check `user.role` explicitly. Developers forget this second check.

**How to avoid:**
Every Server Action that calls dockerode must contain a role check:
```javascript
const session = await auth();
if (session?.user?.role !== 'admin') throw new Error('Forbidden');
```
This is in addition to the middleware check. Treat it as defense in depth. Establish a `requireAdmin()` helper that throws if the session is missing or non-admin, and require it as the first line of every destructive Server Action.

Separately: Docker operations that originate from the browser should go through the LangGraph agent (existing pattern) rather than calling dockerode directly from Server Actions. The agent has natural audit logging (LangGraph checkpointer, job_origins table). Direct dockerode calls from Server Actions do not. Use the `cancel_job` LangGraph tool pattern as the template.

**Warning signs:**
- Server Actions that import from `lib/tools/docker.js` without a role check at the top
- No audit log for container stop/destroy operations (only `job_outcomes` table tracks job-level events, not admin actions)
- `docker.removeVolume()` called from a Server Action (volume deletion is irreversible)

**Phase to address:**
UI operations parity phase — establish the `requireAdmin()` helper before building any destructive UI operations

---

### Pitfall 8: Smart Execution Pre-CI Gates Block the Docker-First Path Without Recovery

**What goes wrong:**
The current job dispatch flow is: create branch → push `job.md` → (Docker path) dispatch container immediately, OR (Actions path) `run-job.yml` triggers on branch create. Adding pre-CI quality gates that run before the container starts means something has to stop the container dispatch and wait for gate results.

For the Actions path, this is natural: add a required status check before `run-job.yml`. The problem is the Docker path bypasses GitHub Actions entirely. `dispatchDockerJob()` runs immediately after `createJob()` in `lib/ai/tools.js` — it does not wait for any GitHub status checks because there are no status checks in the Docker path. Pre-CI gates added to `run-job.yml` are invisible to Docker dispatch.

The recovery scenario: a pre-CI gate fails (e.g. lint fails, tests fail), but the Docker container has already been dispatched and is running. There is no mechanism to stop an already-dispatched container based on a gate result that arrives later. The job runs to completion and creates a PR, then the gate fails on the PR — but the work is already done and the PR is open.

**Why it happens:**
Pre-CI gates are designed for the Actions workflow model where the gate is a required check before the job step runs. The Docker path intentionally removes Actions from the critical path for speed. Adding gates to the Docker path requires a new coordination layer that does not exist.

**How to avoid:**
Pre-CI gates for the Docker path must be implemented as a synchronous check inside `lib/ai/tools.js` before `dispatchDockerJob()` is called — not as a separate GitHub Actions workflow. The gate runs as a Docker container itself (lightweight, fast) or as a local script, returns pass/fail synchronously, and only then does `dispatchDockerJob()` proceed. This keeps the Docker path self-contained.

For the Actions path, required status checks added to branch protection work correctly and do not require changes.

Do not add branch protection rules that block `job/` branches — the `on:create` trigger fires before branch protection rules are evaluated, so the workflow starts correctly, but if the gate is a required status check and it fails, the auto-merge step in `auto-merge.yml` will not merge (it already checks `MERGEABLE` state, which respects required checks). This is safe but means the job ran for nothing.

**Warning signs:**
- Pre-CI gates implemented only in `run-job.yml` but Docker dispatch is the default path
- Gate failures producing no notification to the operator (the gate ran but nobody was told)
- `auto-merge.yml` merging PRs despite failed required checks (check the `mergeable` polling loop — it only checks `MERGEABLE` state, not specific check names; if required checks fail, GitHub sets `CONFLICTING` or `BLOCKED`, not `MERGEABLE`, so the gate does work — but verify this)

**Phase to address:**
Smart execution phase — gates must be designed with both dispatch paths in mind from the start

---

### Pitfall 9: Merge Policy Additions Conflict with the Existing ALLOWED_PATHS Auto-Merge

**What goes wrong:**
`auto-merge.yml` has a four-step decision chain: wait for mergeable → check `AUTO_MERGE` var → check blocked paths → check `ALLOWED_PATHS`. A "smart merge policy" addition (e.g. "only auto-merge if tests pass", "require 1 human approval for changes to `lib/`") adds a fifth condition to this chain.

The failure mode: the new condition is added as a step that runs after `check-paths`, but the `Merge PR` step condition only references the four original steps. The new gate step runs and outputs `allowed=false`, but the `Merge PR` step does not reference it in its `if:` condition. The PR merges anyway. This is a silent bypass.

The deeper problem: `auto-merge.yml` uses the `--squash` merge strategy, which GitHub requires to be enabled on the repo via settings. If smart merge policy introduces "rebase" or "merge commit" strategies conditionally, the `gh pr merge` command will fail unless the repo allows those strategies. The failure is not surfaced to the operator — the Actions run fails silently and the PR stays open indefinitely.

**Why it happens:**
GitHub Actions `if:` conditions only evaluate to the exact expressions written — there is no automatic "and" chaining for new steps. Each step that adds a condition must update the downstream step's `if:` to include the new output reference. This is easy to miss when adding a step.

**How to avoid:**
Structure `auto-merge.yml` with a single "compute final decision" step that aggregates all gate outputs into one boolean, and the `Merge PR` step only checks that one boolean. When adding a new gate, only the aggregation step changes. This makes the chain easier to reason about and audit.

Do not add new merge strategies to `auto-merge.yml` unless the GitHub repo settings already allow them. Check `gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed` before implementing any merge strategy variation.

**Warning signs:**
- A new step in `auto-merge.yml` whose output is never referenced by `Merge PR`'s `if:` condition
- PRs from `job/` branches merging despite failing a new policy check
- `gh pr merge` failing with "merge strategy not allowed" in Actions logs

**Phase to address:**
Smart execution phase — review auto-merge.yml as part of any merge policy work

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Run Claude Code subprocess on Next.js server process for terminal chat mode | Avoids new container infrastructure | No isolation — Claude Code has filesystem access to the ClawForge server; security violation | Never |
| Store superadmin session state in the existing SQLite DB | Simpler than a new auth model | SQLite single-writer constraint means superadmin aggregation queries contend with job dispatch writes | Never for production; acceptable for local-only superadmin view |
| Reuse the existing `codeMode` flag in `chat.jsx` as the "terminal chat mode" toggle | No new UI component needed | `codeMode` wraps text in backticks — it is not a terminal session; naming confusion will accumulate | Never — add a distinct `terminalMode` state |
| Pass Docker socket to new superadmin container with full write access | Fastest way to add instance management | One compromised superadmin session controls all Docker networks | Never — use API-key-proxied operations |
| Add pre-CI gates as GitHub Actions required checks without updating Docker dispatch | Gates work for Actions path | Docker path bypasses gates entirely; false confidence in gate coverage | Only if Docker dispatch is disabled for the affected repos |
| Hard-code 2-instance list in superadmin UI | Works today | Breaks when a third instance is added; requires code change not config change | Only as temporary scaffold during development |
| Use `settingSources: ['user']` (SDK default) in terminal chat mode | Gets global Skills from `~/.claude/settings.json` | Overrides `AGENT_LLM_*` container-injected credentials with any key in `~/.claude/settings.json` | Never in containerized deployment |
| Enable `maxThinkingTokens` for terminal chat mode to improve code quality | More thorough analysis | Disables `StreamEvent` emission — UI receives no incremental output, appears frozen | Never as default; only in an explicit non-streaming "deep mode" |

---

## Integration Gotchas

Common mistakes when connecting components in the v2.2 feature areas.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| xterm.js + AI SDK `useChat` | Updating `messages` state triggers re-render of the Messages list, which unmounts the xterm canvas | Keep xterm in a fixed overlay outside the Messages component tree; update a ref, not state |
| Claude Code `--output-format=stream-json` + WebSocket | Sending raw `data` event chunks as WebSocket text frames; client-side JSON.parse fails on partial lines buffered by Node | Use Node `readline` interface on stdout; emit one complete JSON line per WebSocket text frame |
| `lib/ws/server.js` ticket auth + new Claude endpoint | Issuing tickets with the existing workspace ticket type; `validateTicket` checks the ticket's embedded workspaceId | Add a `type` field to tickets (`type: 'terminal'` vs `type: 'claude'`); validate type in the upgrade handler |
| Superadmin API key proxy + rate limits | Proxying every superadmin page load as a real-time API call to each instance | Cache instance status with a short TTL (30-60s); superadmin is a dashboard, not a live feed |
| SQLite + concurrent admin writes | Browser-triggered Server Actions write to SQLite while job dispatch also writes; WAL mode reduces contention but does not eliminate writer serialization | All destructive admin operations should go through the LangGraph agent (serialized by the agent's SQLite checkpointer) rather than direct DB writes from Server Actions |
| `auto-merge.yml` + required status checks | Adding a branch protection rule that requires a check named "pre-ci-gate" but the check is never registered by name in GitHub; `mergeable` stays `UNKNOWN` forever | Use `gh api` to verify the exact check name registered before adding it as a required check |
| Claude Agent SDK + Docker spawn | SDK spawns `node cli.js` internally — if `node` is not on PATH in the container, it fails with ENOENT even if `claude` binary is on PATH | Verify `node --version` is accessible inside workspace containers; do not assume it's present in non-job images |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Streaming Claude Code output through the LangGraph agent memory (adding it to thread messages) | Every tool call output saved to SQLite checkpointer; after 10 Claude Code sessions the checkpoint is MBs | Do NOT add Claude Code terminal output to LangGraph thread state; only add summary on session close | After ~5 long Claude Code sessions in one thread |
| xterm addon-serialize snapshots saved to SQLite on every keypress | `codeWorkspaces` DB row grows to 100KB+; every workspace list query is slow | Serialize only on session close or explicit save; never on keypress | After 20+ minutes of terminal activity |
| Superadmin polling all instances every 5 seconds via API key proxy | Each poll is a real HTTP request to each instance; at 2 instances this is fine, at 10 it fans out to 20 req/poll | Implement SSE push from instances to superadmin, or increase poll interval to 30s minimum | With 5+ instances and a 5s poll |
| Docker socket operations in the request/response path of Server Actions | Container start/stop takes 2-10 seconds; Next.js streaming helps but browser shows spinner the whole time | All long Docker operations go through fire-and-forget + SSE notification pattern (existing pattern for job dispatch) | Any Docker operation that takes >2 seconds |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Claude Code terminal chat mode without `--allowedTools` whitelist | Interactive Claude Code session has unrestricted tool access including Bash on the container filesystem | Always pass `--allowedTools` to the claude subprocess in terminal chat mode; same whitelist as job containers |
| Superadmin portal that can write GitHub secrets across all instances | Compromise of one superadmin account rotates secrets for all instances simultaneously | Superadmin reads secrets masked (last 4 chars only, same as existing secrets UI); writes go through per-instance admin panel, not superadmin |
| Terminal chat WebSocket endpoint without CSWSH defense | Browser extension or cross-site script opens a WebSocket to `/ws/claude/` from a malicious page | The existing origin check in `lib/ws/server.js` (`origin !== appUrl`) covers new WebSocket endpoints if they are added inside the same upgrade handler — do not add a new HTTP server for Claude terminal mode |
| Pre-CI gate that reads `AGENT_*` secrets to run tests | Secret values exposed in gate container environment; gate logs captured by GitHub Actions, visible in UI | Gates run with minimal secrets; do not pass `AGENT_LLM_*` secrets to pre-CI gates unless the gate specifically requires LLM calls |
| Job cancel Server Action that accepts `containerId` directly from the browser | Client supplies arbitrary container ID; can stop non-job containers on the Docker host | Always look up `containerId` from the `job_origins` or `docker_jobs` DB table by `jobId`; never accept `containerId` from client input |
| Claude Agent SDK `settingSources` defaulting to include user settings | `~/.claude/settings.json` may contain a personal API key that overrides the container-injected `ANTHROPIC_API_KEY`, billing charges appear on the wrong account | Explicitly set `settingSources: []` in all SDK invocations inside containers |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Interrupt/resume in Claude Code terminal chat mode uses a button that sends SIGINT to the subprocess | Button press races with the subprocess writing output; user sees partial output frozen on screen | Use the existing `stop()` function from `useChat` as the model; show a "stopping" state while waiting for the subprocess to acknowledge the interrupt |
| Superadmin instance switcher that drops the user to the homepage of the new instance | Loses context; user was on the Runners page of instance A, switches to instance B and has to navigate again | Preserve the route path on switch; navigate to the same sub-path in the new instance |
| Pre-CI gate failures surfaced only in GitHub Actions logs | Operator does not see why their job was blocked; checks GitHub to find out | Surface gate failure reason in the chat response: "Job blocked — lint failed: 3 errors in lib/ai/tools.js" |
| UI job cancel that removes the branch | Developer can no longer inspect what the job had done | `cancel_job` tool already preserves the branch ("Branch preserved for inspection"); UI cancel must not add `--delete-branch` to the merge command |
| Workspace terminal embedded in chat showing an idle cursor when Claude Code is thinking | User assumes the terminal is frozen | Stream a progress indicator in the xterm canvas while Claude Code has not produced output for >3 seconds; the existing `VoiceBars` visual pattern is a model |
| Config edit UI that takes effect immediately on save | Operator makes a mistake in a config field; running jobs inherit the broken config mid-execution | Config changes take effect on next job dispatch (existing behavior per PROJECT.md); make this explicit in the UI with a "takes effect on next job" note |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Claude Code terminal chat mode:** Terminal renders and accepts input — verify interrupt (Ctrl+C) actually stops the subprocess and the stop is confirmed back to the UI before the next input is accepted
- [ ] **Claude Code terminal chat mode:** Session appears to work — verify the subprocess runs inside a container with `--allowedTools` whitelist, not on the Next.js server process
- [ ] **Claude Code terminal chat mode:** Output streams correctly on short prompts — verify output also streams correctly on long multi-step operations (partial-line JSON parsing issue only manifests on long sessions)
- [ ] **Claude Code terminal chat mode:** SDK invoked successfully in dev — verify it also works inside the workspace Docker container (Node PATH, ENOENT failure only appears in containers)
- [ ] **Superadmin portal:** Instance list shows all instances — verify each instance entry is driven by config, not hard-coded; adding a third instance requires only config change
- [ ] **Superadmin portal:** Switching instances shows the correct data — verify the API key used for proxying is instance-specific and rotates correctly when the instance `AUTH_SECRET` changes
- [ ] **UI operations parity:** Job cancel button visible and working — verify the cancel only calls `container.stop()`, not `container.remove()`, so the branch and partial work are preserved
- [ ] **UI operations parity:** Config editing UI saves changes — verify changes written via `setConfig()` are encrypted with AES-256-GCM and do not appear in plaintext in the SQLite DB
- [ ] **UI operations parity:** Destructive actions available in UI — verify each is guarded by `requireAdmin()` and returns 403 to a `user`-role account
- [ ] **Smart execution gates:** Gate appears to run — verify the gate runs for BOTH Docker dispatch path and Actions dispatch path, not just one
- [ ] **Smart execution gates:** Gate failure blocks the job — verify the notification to the operator includes the specific failure reason, not just "gate failed"
- [ ] **Merge policies:** New policy condition added to `auto-merge.yml` — verify the `Merge PR` step's `if:` condition references the new gate output; run a test PR that should be blocked and confirm it stays open

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Claude Code subprocess running on Next.js server process (no isolation) | HIGH | Stop the event handler, audit what the subprocess accessed/wrote, restart with fixed implementation that spawns subprocess in container |
| Shared AUTH_SECRET across instances breaks isolation | HIGH | Rotate all instance AUTH_SECRETs independently; invalidate all active sessions; update each instance .env separately |
| Docker socket fully exposed via new admin endpoint | HIGH | Remove endpoint immediately; audit Docker daemon logs for unauthorized container operations; rotate GitHub tokens used by containers |
| Auto-merge fires despite failed gate (bypass due to missing if condition) | MEDIUM | Revert the squash-merged commit; add the missing `if:` condition; re-run the job |
| xterm instance destroyed by React unmount (output lost) | LOW | Reconnect workspace (workspace container is still running); use `addon-serialize` snapshot if implemented; otherwise operator re-runs the command |
| Pre-CI gate blocks all jobs due to flaky test | MEDIUM | Set `AUTO_MERGE=false` as immediate circuit breaker; fix the flaky test; re-enable; for Docker path, add `SKIP_GATES=true` environment variable escape hatch |
| SDK `settingSources` override uses wrong API key | LOW | Add `settingSources: []` to SDK invocation; rebuild workspace container image if key is baked in |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Third transport conflict (WebSocket vs SSE vs AI SDK) | Claude Code terminal chat mode phase | Verify existing workspace WebSocket and headless SSE both still work after new endpoint added |
| SDK ENOENT / Docker spawn failure | Claude Code terminal chat mode phase | Run `node --version` inside workspace container; test SDK invocation inside container before building UI |
| Partial-line JSON parse failure | Claude Code terminal chat mode phase | Verify with a multi-step Claude Code session that produces 50+ lines of JSONL; check for parse errors |
| Streaming + extended thinking incompatibility | Claude Code terminal chat mode phase | Do not set `maxThinkingTokens`; document the constraint in the SDK config |
| xterm.js + chat bubble layout conflicts | Claude Code terminal chat mode phase | Scroll chat history 50+ messages; verify terminal session renders correctly and is not blank after scroll |
| Superadmin breaks per-instance auth model | Superadmin portal phase | Verify Noah's session cookie does not authenticate against strategyES instance API |
| Docker socket exposure via browser operations | UI operations parity phase | Attempt to call a destructive Server Action as a `user`-role account; verify 403 |
| Pre-CI gates bypass Docker dispatch path | Smart execution phase | Run a job via Docker dispatch with a failing gate condition; verify job is blocked |
| Merge policy condition not wired in auto-merge | Smart execution phase | Create a test PR from a `job/` branch that should be blocked by new policy; verify it stays open |

---

## Sources

- Codebase inspection: `lib/ws/server.js`, `lib/auth/middleware.js`, `lib/jobs/stream-api.js`, `lib/ai/tools.js`, `lib/tools/docker.js`, `lib/db/schema.js`, `.github/workflows/auto-merge.yml`, `.github/workflows/run-job.yml`
- Architecture decisions: `.planning/PROJECT.md` key decisions table
- xterm.js rendering lifecycle: `lib/chat/components/` (workspace tab `display:none` pattern)
- AI SDK transport: `lib/chat/components/chat.jsx` (`DefaultChatTransport` + `useChat`)
- SQLite single-writer constraint: `lib/db/index.js` (WAL mode, single `getDb()` singleton)
- GitHub Actions merge check behavior: `auto-merge.yml` mergeable polling loop
- Claude Agent SDK streaming docs: [Stream responses in real-time](https://platform.claude.com/docs/en/agent-sdk/streaming-output) — `maxThinkingTokens` + streaming incompatibility, partial message event structure
- Claude Agent SDK headless docs: [Run Claude Code programmatically](https://code.claude.com/docs/en/headless) — `--output-format=stream-json`, `--include-partial-messages`, `--resume` session continuity
- Common SDK pitfalls (community): [Common Pitfalls with the Claude Agent SDK](https://liruifengv.com/posts/claude-agent-sdk-pitfalls-en/) — ENOENT spawn failure, `settingSources` override, Electron packaging path issues
- GitHub issues: [spawn node ENOENT in Docker #4383](https://github.com/anthropics/claude-code/issues/4383), [Claude Code hangs in Node.js test environments #6775](https://github.com/anthropics/claude-code/issues/6775)

---
*Pitfalls research for: ClawForge v2.2 Smart Operations (Claude Code terminal chat, superadmin portal, UI operations parity, smart execution)*
*Researched: 2026-03-16*
