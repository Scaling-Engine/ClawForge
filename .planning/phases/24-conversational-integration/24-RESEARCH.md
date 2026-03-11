# Phase 24: Conversational Integration - Research

**Researched:** 2026-03-11
**Domain:** LangGraph tool integration, bidirectional context bridging, workspace lifecycle notifications
**Confidence:** HIGH

## Summary

Phase 24 is the final phase of v1.5 Persistent Workspaces. The infrastructure is complete: workspace containers run (Phase 22), the WebSocket proxy and browser terminal work (Phase 23). This phase wires the conversational layer (LangGraph agent + Slack/Telegram channels) to the workspace lifecycle.

The key insight is that almost every building block already exists. `ensureWorkspaceContainer` in `lib/tools/docker.js` handles create/recover. The `codeWorkspaces` schema already has a `threadId` column. Job notifications are routed back to originating threads in `lib/ai/tools.js` via `saveJobOrigin`/`getJobOrigin`. The `listWorkspaces` DB query is ready. All of Phase 24 is wiring, not new infrastructure.

There are five distinct integration points: (1) a new `start_coding` LangGraph tool, (2) chat context injection via `CHAT_CONTEXT` env var on container start, (3) commit surfacing on workspace close, (4) a `list_workspaces` tool, and (5) event notifications (crash, recovery, close) routed through the existing notification/channel infrastructure.

**Primary recommendation:** Follow the job-notification pattern exactly. The `waitAndNotify` function in `tools.js` is the proven template for fire-and-forget async events with thread routing. Apply the same pattern to workspace lifecycle events.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTG-01 | `start_coding` LangGraph tool creates workspace from conversation (resolves repo, launches container, returns URL) | `ensureWorkspaceContainer` + `resolveTargetRepo` + `loadAllowedRepos` already exist; need new tool wrapping them |
| INTG-02 | Chat context (conversation history) injected into workspace container on start via CHAT_CONTEXT env var | LangGraph SqliteSaver checkpointer holds thread messages; need to read and pass them as env var in container env array |
| INTG-03 | Commits made during workspace session injected back into chat thread on close | `checkWorkspaceGitStatus` + `git log` via docker exec; `addToThread` + Slack/Telegram send pattern already proven |
| INTG-04 | Workspace list API returns active workspaces with status (running/stopped) for reconnection | `listWorkspaces(instanceName)` already exists; need `list_workspaces` LangGraph tool + format for operator |
| INTG-05 | Workspace events (crash, recovery, close) trigger notifications to operator's channel | reconcileWorkspaces + idle cron already run; need event hooks to save threadId and route notifications |
</phase_requirements>

## Standard Stack

### Core (already installed, no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@langchain/langgraph` | installed | LangGraph ReAct agent with tool loop | Already used for `createJobTool`, `getJobStatusTool`, etc. |
| `@langchain/core/tools` | installed | `tool()` factory for LangGraph tools | Consistent with existing tool definitions |
| `zod` | installed | Schema validation for tool inputs | All existing tools use Zod schemas |
| `dockerode` | installed | Docker exec for commit history queries | Already used in `checkWorkspaceGitStatus` |
| `@slack/web-api` | installed | Send workspace notifications to Slack threads | Already used in `waitAndNotify` |
| `drizzle-orm` | installed | `codeWorkspaces` schema read/write | Already used throughout |

### No New Dependencies Expected
Phase 24 should require zero new npm packages. All required capabilities are already present:
- Docker exec calls for git log: `checkWorkspaceGitStatus` already shows the pattern
- Thread routing for Slack/Telegram: `waitAndNotify` in `tools.js` already does this
- Chat history extraction: LangGraph SqliteSaver API provides `getState`/`updateState`
- Workspace URL construction: uses `APP_URL` env var (already in `.env.example`)

## Architecture Patterns

### Pattern 1: New LangGraph Tool (INTG-01, INTG-04)
**What:** Add `startCodingTool` and `listWorkspacesTool` to `lib/ai/tools.js`, register them in `lib/ai/agent.js`.
**When to use:** When operator says "start coding on [repo]" or "show my workspaces".

```javascript
// Source: lib/ai/tools.js (existing tool pattern)
const startCodingTool = tool(
  async ({ repo }, config) => {
    const threadId = config?.configurable?.thread_id;
    const repos = loadAllowedRepos();
    const resolved = resolveTargetRepo(repo, repos);
    if (!resolved) {
      return JSON.stringify({ success: false, error: `Repo "${repo}" not recognized. Available: ${repos.map(r => r.name).join(', ')}` });
    }

    // Extract chat context from LangGraph checkpointer
    let chatContext = '';
    if (threadId) {
      try {
        const agent = await getAgent();
        const state = await agent.getState({ configurable: { thread_id: threadId } });
        const messages = state?.values?.messages || [];
        chatContext = formatChatContextForInjection(messages);
      } catch (err) {
        console.error('Failed to extract chat context:', err);
      }
    }

    const repoUrl = `https://github.com/${resolved.owner}/${resolved.slug}.git`;
    const result = await ensureWorkspaceContainer({
      instanceName: process.env.INSTANCE_NAME || 'noah',
      repoUrl,
      repoSlug: resolved.slug,
      secrets: { GH_TOKEN: process.env.GH_TOKEN },
      threadId,
      chatContext,  // NEW: passed through to container env
    });

    const workspaceUrl = `${process.env.APP_URL}/workspace/${result.workspace.id}`;
    return JSON.stringify({
      success: true,
      workspace_id: result.workspace.id,
      repo: resolved.slug,
      branch: result.workspace.featureBranch,
      url: workspaceUrl,
      created: result.created,
    });
  },
  {
    name: 'start_coding',
    description: 'Create or reconnect to a persistent workspace for a repo. Returns a terminal URL the operator can open in their browser.',
    schema: z.object({
      repo: z.string().describe('Repository name or alias to open workspace for (e.g. "clawforge", "cf")'),
    }),
  }
);
```

### Pattern 2: Chat Context Injection (INTG-02)
**What:** Extract LangGraph thread messages and pass as `CHAT_CONTEXT` env var when creating workspace container.
**Where:** In `ensureWorkspaceContainer` in `lib/tools/docker.js`, add `chatContext` to the `env` array.

```javascript
// Source: lib/tools/docker.js (existing env array pattern, lines 382-393)
// Add to env array during container creation:
if (opts.chatContext) {
  // Truncate to stay within container env limits (~32KB safe threshold)
  const truncated = opts.chatContext.slice(0, 20000);
  env.push(`CHAT_CONTEXT=${truncated}`);
}
```

**Context formatting:** Messages from LangGraph state are `HumanMessage`/`AIMessage` objects. Format as plain text:
```javascript
function formatChatContextForInjection(messages) {
  return messages
    .filter(m => m._getType?.() === 'human' || m._getType?.() === 'ai')
    .slice(-20)  // Last 20 messages to avoid huge env var
    .map(m => `${m._getType() === 'human' ? 'Operator' : 'Assistant'}: ${
      typeof m.content === 'string' ? m.content : m.content.filter(b => b.type === 'text').map(b => b.text).join('')
    }`)
    .join('\n');
}
```

**CRITICAL NOTE:** Environment variables are visible in `docker inspect` output. Do not inject sensitive data. Conversation text about feature development is acceptable. Secrets/credentials are not.

### Pattern 3: Workspace Close Context (INTG-03)
**What:** When operator closes a workspace (via browser UI or explicit command), collect recent commits and inject into the originating thread.
**Where:** Two entry points — the "Close" button in `workspace-terminal-page.jsx` triggers navigation to `/workspaces`; a new Server Action `closeWorkspace` should handle this.

```javascript
// Source: lib/tools/docker.js (existing execCollect pattern from checkWorkspaceGitStatus)
// New function: getRecentWorkspaceCommits
async function getRecentWorkspaceCommits(workspaceId, limit = 5) {
  const container = docker.getContainer(ws.containerId);
  const log = await execCollect(container, [
    'git', '-C', '/workspace', 'log',
    '--oneline', `--max-count=${limit}`,
    // Scope to feature branch only (since workspace branch start)
    'main..HEAD',
  ]);
  return log ? log.split('\n').filter(Boolean) : [];
}
```

Notification routing reuses the `addToThread` + Slack/Telegram send pattern from `waitAndNotify`:
```javascript
// Source: lib/ai/index.js and lib/ai/tools.js (existing pattern)
await addToThread(ws.threadId, message);
if (platform === 'slack') { /* send via WebClient */ }
if (platform === 'telegram') { /* send via sendMessage */ }
```

### Pattern 4: Workspace Event Notifications (INTG-05)
**What:** Crash (container exits unexpectedly), recovery (reconcileWorkspaces restarts), and close events notify the originating thread.
**Where:**
- Close: new `closeWorkspace` function/Server Action
- Crash/recovery: inside `reconcileWorkspaces` in `lib/tools/docker.js`

The `threadId` column is already on `codeWorkspaces` schema. After `reconcileWorkspaces` detects a state change, look up `ws.threadId` and dispatch notification.

**Platform detection from threadId:** The existing `detectPlatform(threadId)` function in `tools.js` handles Slack vs Telegram vs Web format. Import and reuse it — do not duplicate.

### Pattern 5: List Workspaces Tool (INTG-04)
**What:** Agent tool that returns active workspaces formatted for operator consumption.

```javascript
const listWorkspacesTool = tool(
  async () => {
    const instanceName = process.env.INSTANCE_NAME || 'noah';
    const workspaces = listWorkspaces(instanceName);
    if (workspaces.length === 0) {
      return 'No active workspaces.';
    }
    const lines = workspaces.map(ws => {
      const url = ws.status === 'running'
        ? `${process.env.APP_URL}/workspace/${ws.id}`
        : '(stopped — reconnect to get URL)';
      return `- **${ws.repoSlug}** (${ws.status}) — ${ws.featureBranch || 'no branch'} — ${url}`;
    });
    return `Active workspaces:\n${lines.join('\n')}`;
  },
  {
    name: 'list_workspaces',
    description: 'List all active workspaces with their status and reconnect URLs.',
    schema: z.object({}),
  }
);
```

### Recommended File Structure (changes only)
```
lib/
├── ai/
│   ├── tools.js          # ADD: startCodingTool, listWorkspacesTool; export them
│   └── agent.js          # ADD: import and register new tools in tools array
├── tools/
│   └── docker.js         # ADD: chatContext to ensureWorkspaceContainer opts
│                         # ADD: getRecentWorkspaceCommits()
│                         # ADD: closeWorkspace() (stop + notify + surface commits)
│                         # MODIFY: reconcileWorkspaces() to notify on crash/recovery
├── ws/
│   └── actions.js        # ADD: closeWorkspaceAction() Server Action
templates/app/
└── workspace/[id]/
    └── workspace-terminal-page.jsx  # MODIFY: "Close" calls closeWorkspaceAction before nav
```

### Anti-Patterns to Avoid
- **Duplicating detectPlatform logic:** It already exists in `tools.js`. Import it, don't copy it.
- **Giant env vars:** Truncate chat context to 20KB max. Env vars have OS-level limits (~256KB total, but keeping individual ones small is safer).
- **Synchronous close:** The close flow (git log, thread notification) should be fire-and-forget. Don't block the UI waiting for Slack/Telegram confirmation.
- **Accessing LangGraph internals directly from docker.js:** The `getAgent()` and chat history extraction belongs in `tools.js` (the AI layer), not in `docker.js`. Pass `chatContext` as a pre-extracted string to `ensureWorkspaceContainer`.
- **New workspace-events table:** Not needed. The `threadId` on `codeWorkspaces` plus `addToThread`/Slack/Telegram send is the notification mechanism. Don't over-engineer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Repo name resolution from conversation | Custom NLP | `resolveTargetRepo` + `loadAllowedRepos` | Already handles slug/name/alias matching |
| Thread-to-channel routing | Custom platform detection | `detectPlatform(threadId)` in tools.js | Already handles Slack format (C...:ts.ts), Telegram (numeric), Web (UUID) |
| Notification delivery | New notification service | `addToThread` + existing Slack/Telegram send blocks from `waitAndNotify` | Proven pattern, handles errors gracefully |
| Chat history extraction | Custom SQLite query | `agent.getState({ configurable: { thread_id } })` — LangGraph checkpointer API | Source of truth for conversation state |
| Workspace URL construction | Custom URL builder | `${process.env.APP_URL}/workspace/${id}` | Consistent with existing browser navigation in workspace-terminal-page.jsx |

**Key insight:** Every "hard" part of Phase 24 is already solved in the job notification pipeline. The pattern is: fire-and-forget async function, Docker state check, route to originating thread using `threadId`+`detectPlatform`, send via channel adapter.

## Common Pitfalls

### Pitfall 1: CHAT_CONTEXT env var breaks container start
**What goes wrong:** `CHAT_CONTEXT` contains newlines, special shell characters, or is too large, causing Docker container creation to fail or the env var to be malformed inside the container.
**Why it happens:** Docker env vars passed as strings in the `Env` array are technically free-form but OS-level process limits and Docker's JSON encoding can trip on large/multi-line values.
**How to avoid:** JSON-encode the chat context as a single line: `env.push('CHAT_CONTEXT=' + JSON.stringify(chatContext))`. The workspace entrypoint reads `process.env.CHAT_CONTEXT` and parses it with `JSON.parse`. Cap at 20KB.
**Warning signs:** Container creation returns a 500 error from dockerode, or `docker inspect` shows malformed env.

### Pitfall 2: getAgent() circular dependency in tools.js
**What goes wrong:** `startCodingTool` in `tools.js` calls `getAgent()` from `agent.js`, which imports `tools.js` — circular import.
**Why it happens:** `agent.js` imports from `tools.js` to get the tool list. If `tools.js` also imports from `agent.js` for `getAgent()`, Node.js circular module resolution produces undefined values.
**How to avoid:** Extract chat history reading into a separate helper that uses the SqliteSaver directly (bypassing the agent singleton), OR pass `chatContext` into `startCodingTool` via a different mechanism, OR lazy-import `getAgent` with a dynamic `import()` inside the tool's async function body (same pattern used for `@slack/web-api` in `waitAndNotify`).
**Warning signs:** `getAgent` is undefined at call time despite being imported.

### Pitfall 3: reconcileWorkspaces notification spam
**What goes wrong:** reconcileWorkspaces runs on startup and periodically, and sends crash/recovery notifications every run — even when the workspace was already known to be stopped.
**Why it happens:** Without tracking "already notified", every reconcile pass that finds a stopped container fires a notification.
**How to avoid:** Only fire crash notifications when transitioning FROM `running` TO `error`/stopped unexpectedly. Track last-notified state. The simplest approach: add a `notifiedAt` integer column to `codeWorkspaces` or use an in-memory Set of workspace IDs that have been crash-notified this process lifetime.
**Warning signs:** Operator receives duplicate "workspace crashed" messages on every poll interval.

### Pitfall 4: Workspace URL sent before container is healthy
**What goes wrong:** `start_coding` returns the workspace URL immediately, but the container is still in the 30-second `_waitForWorkspaceReady` polling loop. Operator clicks the URL and gets a connection error.
**Why it happens:** `ensureWorkspaceContainer` calls `_waitForWorkspaceReady` which waits for `/tmp/.workspace-ready` but there is still startup lag before ttyd is available.
**How to avoid:** The URL can be returned immediately with a note: "Your workspace is starting. The terminal will be ready in ~15 seconds." Since ttyd's healthcheck is configured with a 10s StartPeriod, adding a brief human-readable "loading" state to the workspace page is better than blocking the agent response.
**Warning signs:** "Connection refused" or 502 errors when operator opens workspace URL within the first 15 seconds.

### Pitfall 5: Agent tool registered but not exported
**What goes wrong:** New tools are defined in `tools.js` but not added to the `tools` array in `agent.js`, so they never appear in the agent's tool loop.
**Why it happens:** `agent.js` has a hardcoded import list and tools array.
**How to avoid:** Update both the export in `tools.js` and the import+array in `agent.js`. Verify by asking the agent "what tools do you have?" in a test conversation.

## Code Examples

### LangGraph getState for chat history
```javascript
// Source: LangGraph documentation pattern — SqliteSaver provides getState
// Used in startCodingTool to extract conversation context
const agent = await getAgent();
const state = await agent.getState({ configurable: { thread_id: threadId } });
const messages = state?.values?.messages || [];
// messages is Array<BaseMessage> (HumanMessage, AIMessage, ToolMessage, SystemMessage)
```

### Existing docker exec pattern (from checkWorkspaceGitStatus)
```javascript
// Source: lib/tools/docker.js lines 826-841
async function execCollect(container, cmd) {
  const exec = await container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true });
  const stream = await exec.start({ Detach: false });
  const chunks = [];
  await new Promise((resolve) => {
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', resolve);
  });
  const raw = Buffer.concat(chunks).toString('utf8');
  // Strip dockerode mux header bytes (first 8 bytes per frame)
  return raw.replace(/^[\x00-\x08].{0,7}/gm, '').trim();
}
```

### Thread routing pattern (from waitAndNotify)
```javascript
// Source: lib/ai/tools.js lines 196-246 — proven pattern to copy for workspace events
const origin = threadId ? getJobOrigin(jobId) : null;
if (origin) {
  addToThread(origin.threadId, message).catch(() => {});
  if (origin.platform === 'slack') {
    const [channel, threadTs] = origin.threadId.split(':');
    const slack = new WebClient(SLACK_BOT_TOKEN);
    await slack.chat.postMessage({ channel, thread_ts: threadTs, text: message });
  }
  if (origin.platform === 'telegram') {
    const { sendMessage } = await import('../tools/telegram.js');
    await sendMessage(TELEGRAM_BOT_TOKEN, origin.threadId, message);
  }
}
```

Note: For workspaces, `threadId` comes from `ws.threadId` (stored on workspace creation) rather than from `job_origins` table. The routing logic is identical.

### Close workspace flow
```javascript
// Proposed pattern for closeWorkspace() in lib/tools/docker.js
export async function closeWorkspace(workspaceId) {
  const ws = getWorkspace(workspaceId);
  if (!ws) return { ok: false, reason: 'not found' };

  // 1. Collect commits made during this session (best-effort)
  let commits = [];
  if (ws.containerId && ws.featureBranch) {
    try {
      commits = await getRecentWorkspaceCommits(workspaceId);
    } catch { /* non-fatal */ }
  }

  // 2. Stop the container
  await stopWorkspace(workspaceId);

  // 3. Notify originating thread (fire-and-forget)
  if (ws.threadId) {
    notifyWorkspaceClosed(ws, commits).catch(err =>
      console.error('Failed to notify workspace close:', err)
    );
  }

  return { ok: true };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global subscription table for notifications | Thread-origin routing via `job_origins` | Phase 11 | Notifications go to the specific thread that created the job, not broadcast |
| Server Actions for all workspace ops | Mix: Server Actions for browser-facing, API routes for external callers | Phase 23 (CLAUDE.md in api/) | New workspace Server Actions belong in `lib/ws/actions.js`, not `lib/chat/actions.js` |
| No workspace-to-chat bridge | threadId stored on workspace at creation | Phase 22 (schema decision) | Foundation for INTG-02 and INTG-05 is already in place |

## Open Questions

1. **How to handle workspace threadId for Telegram vs Slack platform detection**
   - What we know: `detectPlatform(threadId)` already works for both. Workspace `threadId` is stored at creation time.
   - What's unclear: When a workspace is created via the web UI (not via Slack/Telegram), `threadId` will be null or a Web UUID. Web platform has no async notification mechanism (no webhook to push to).
   - Recommendation: For web-originated workspaces, notifications go only to `addToThread` (in-memory LangGraph state update) — the operator sees them when they next chat. Skip Slack/Telegram for web-origin workspaces.

2. **chat context env var vs file injection**
   - What we know: Docker env vars work and the pattern is proven for secrets injection. The workspace entrypoint currently doesn't read `CHAT_CONTEXT`.
   - What's unclear: Should the workspace entrypoint write `CHAT_CONTEXT` to a file (e.g., `/workspace/.chat-context.md`) so Claude Code can read it as a file rather than an env var?
   - Recommendation: Env var is sufficient for Phase 24. The workspace entrypoint (in the Docker image) should write `CHAT_CONTEXT` to `/workspace/CONTEXT.md` on startup so Claude Code sees it as a file. This avoids env var size limits and is more readable. This requires a small entrypoint change in the workspace Dockerfile.

3. **Workspace close trigger: explicit button vs session end**
   - What we know: The browser "Close" button in `workspace-terminal-page.jsx` navigates to `/workspaces`. Container stays running (idle timeout handles eventual stop).
   - What's unclear: When should "commit surfacing" fire? On explicit close? On idle timeout stop? On destroy?
   - Recommendation: Fire on both explicit close (new `closeWorkspace` Server Action) AND on idle timeout stop (inside `checkIdleWorkspaces`). Both paths have the workspace record with `threadId`. Skip on destroy (operator is tearing down the workspace, not ending a session).

## Validation Architecture

Config has `workflow.nyquist_validation` absent — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (based on existing `tickets.test.js`) |
| Config file | None — run directly with `node --test` |
| Quick run command | `node --test lib/ws/tickets.test.js` |
| Full suite command | `node --test lib/ws/*.test.js` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTG-01 | `start_coding` tool returns workspace URL for valid repo | unit | `node --test lib/ai/tools.test.js` | No — Wave 0 |
| INTG-01 | `start_coding` tool returns error for unrecognized repo | unit | `node --test lib/ai/tools.test.js` | No — Wave 0 |
| INTG-02 | chatContext is passed to ensureWorkspaceContainer and included in env | unit (mock Docker) | `node --test lib/tools/docker.test.js` | No — Wave 0 |
| INTG-03 | getRecentWorkspaceCommits returns commits via docker exec | unit (mock Docker) | `node --test lib/tools/docker.test.js` | No — Wave 0 |
| INTG-04 | `list_workspaces` tool returns formatted workspace list | unit (mock DB) | `node --test lib/ai/tools.test.js` | No — Wave 0 |
| INTG-05 | workspace event notification routes to Slack thread correctly | unit (mock Slack) | `node --test lib/ai/tools.test.js` | No — Wave 0 |

**Note:** All Docker-dependent tests should mock `dockerode`. The existing `tickets.test.js` shows the project uses Node's built-in `node:test` and `assert` — match this pattern.

### Sampling Rate
- **Per task commit:** `node --test lib/ws/tickets.test.js` (existing, smoke test server is up)
- **Per wave merge:** `node --test lib/ws/*.test.js lib/ai/*.test.js lib/tools/*.test.js`
- **Phase gate:** All test files green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `lib/ai/tools.test.js` — covers INTG-01, INTG-04, INTG-05 tool behavior
- [ ] `lib/tools/docker.test.js` — covers INTG-02, INTG-03 with mocked dockerode
- These are lightweight unit tests with mocked DB/Docker, not integration tests

## Sources

### Primary (HIGH confidence)
- Codebase: `lib/ai/tools.js` — `createJobTool`, `waitAndNotify`, `detectPlatform` (direct source read)
- Codebase: `lib/tools/docker.js` — `ensureWorkspaceContainer`, `checkWorkspaceGitStatus`, `reconcileWorkspaces` (direct source read)
- Codebase: `lib/db/schema.js` — `codeWorkspaces` with `threadId` column (direct source read)
- Codebase: `lib/ai/agent.js` — tool registration pattern (direct source read)
- Codebase: `lib/ai/index.js` — `addToThread` pattern (direct source read)
- Codebase: `lib/ws/actions.js` — Server Action auth pattern for workspace ops (direct source read)

### Secondary (MEDIUM confidence)
- LangGraph docs pattern: `agent.getState({ configurable: { thread_id } })` returns `{ values: { messages } }` — consistent with `SqliteSaver` checkpointer behavior observed in codebase

### Tertiary (LOW confidence)
- Docker env var size limits: OS-level limit ~256KB total env block. Individual var safe threshold ~32KB is a conservative estimate from community sources — verify if injecting large contexts.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — patterns are proven in existing job notification pipeline
- Pitfalls: HIGH — circular import and env var risks are well-understood

**Research date:** 2026-03-11
**Valid until:** Stable — no fast-moving dependencies; valid until codebase changes
