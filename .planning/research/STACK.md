# Technology Stack

**Project:** ClawForge v2.2 Smart Operations
**Milestone:** v2.2 — Claude Code terminal chat mode, superadmin portal with instance switching, full UI operational control, smart execution policies
**Researched:** 2026-03-16
**Confidence:** HIGH for Agent SDK (official docs verified); HIGH for auth patterns (codebase analysis); MEDIUM for smart execution (patterns research, no upstream reference)

---

## Scope

This document covers **additions and changes needed for v2.2 only**.

**Already in the stack — do NOT re-add or change:**
- Next.js 15 + React 19 (peer deps)
- LangGraph ReAct agent, SqliteSaver checkpointing
- Drizzle ORM + better-sqlite3
- dockerode ^4.0.9 (Docker Engine API)
- ws ^8.19.0 (WebSocket proxy for ttyd)
- @xterm/xterm ^6.0.0 + addon-fit + addon-attach + addon-search + addon-serialize + addon-web-links
- @dnd-kit/core ^6.3.1 + @dnd-kit/sortable ^10.0.0
- next-auth ^5.0.0-beta.30 (NextAuth v5, Credentials provider, admin/user RBAC)
- @ai-sdk/react ^2.0.0 + ai ^5.0.0 (Vercel AI SDK v5 — useChat, createUIMessageStream)
- Node.js built-in `crypto` (AES-256-GCM for secrets)
- tweetnacl + tweetnacl-sealedbox-js (GitHub sealed-box encryption)
- bcrypt-ts (password hashing)
- chokidar ^5.0.0 (cluster file-watch triggers)
- node-cron ^3.0.3 (scheduled triggers)
- streamdown ^2.2.0 + @streamdown/code ^1.1.0 (Shiki markdown rendering)
- AssemblyAI v3 WebSocket (voice input — already integrated)
- All lucide-react, tailwindcss v4, clsx, tailwind-merge, class-variance-authority UI primitives
- SSE via native ReadableStream (headless job log streaming already working)
- streamManager pub/sub (lib/tools/stream-manager.js — already in production)

Four new capability areas for v2.2:

1. **Claude Code terminal mode in chat** — embedded Claude Agent SDK session, streaming tool calls / file edits / thinking steps, interrupt/cancel
2. **Superadmin portal with instance switching** — single login across all instances, `superadmin` role, instance context in session
3. **Full UI operations parity** — repo CRUD, job cancel/retry/logs, config editing, instance management from browser
4. **Smart execution policies** — pre-CI quality gates, test feedback loops, merge policy enforcement

---

## Critical Rename: @anthropic-ai/claude-code SDK → @anthropic-ai/claude-agent-sdk

The programmatic SDK previously known as `@anthropic-ai/claude-code` (the importable library, NOT the CLI tool) has been renamed to `@anthropic-ai/claude-agent-sdk`. The CLI tool (`claude` binary, `@anthropic-ai/claude-code` CLI package) is unaffected.

**Current versions (verified 2026-03-16 via npm registry):**
- `@anthropic-ai/claude-code` (CLI) — `2.1.76`
- `@anthropic-ai/claude-agent-sdk` (programmatic SDK) — `0.2.76`

The two packages serve different purposes:
- `@anthropic-ai/claude-code` — the `claude` CLI binary, installed globally, used by job containers
- `@anthropic-ai/claude-agent-sdk` — TypeScript/JS library, imported in Node.js code, exposes `query()` async generator

ClawForge currently uses the CLI (`claude -p`) inside Docker job containers. For v2.2 terminal chat mode, we need the **SDK** (`@anthropic-ai/claude-agent-sdk`) running in the Event Handler Node.js process, not inside Docker.

---

## Recommended Stack — New Additions Only

### Feature 1: Claude Code Terminal Chat Mode

#### The Core Library

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@anthropic-ai/claude-agent-sdk` | `^0.2.76` | Programmatic Claude Code execution with streaming | The official Anthropic SDK for running Claude Code as an async generator. Exposes `query()` which yields `SDKMessage` objects: assistant messages, tool calls, tool results, system init, result. Supports `interrupt()`, `close()`, `AbortController` cancellation. This is the only correct way to embed Claude Code execution in a Node.js server process — the CLI (-p) produces unstructured stdout unsuitable for real-time UI. | ADD (new) |

#### What query() Streams (SDKMessage union type, HIGH confidence — official docs)

The `query()` function returns a `Query` object (AsyncGenerator) that yields these message types relevant to the terminal chat UI:

| Message Type | When emitted | UI rendering |
|-------------|--------------|--------------|
| `SDKSystemMessage` (subtype: `init`) | Session start | Shows model, tools available, session ID |
| `SDKAssistantMessage` | Each assistant turn | Text content + any tool_use blocks |
| `SDKPartialAssistantMessage` | When `includePartialMessages: true` | Token-by-token streaming (opt-in) |
| `SDKUserMessage` | Tool results fed back | Tool result display |
| `SDKResultMessage` | Final answer | Shows cost, duration, num_turns |
| `SDKToolProgressMessage` | Mid-tool progress | Shows what Claude is doing inside a tool |
| `SDKStatusMessage` | Status updates | Thinking/working indicators |

The `SDKAssistantMessage.message` field is a `BetaMessage` from the Anthropic SDK — its `.content` array contains `TextBlock` and `ToolUseBlock` items. Tool calls include the tool name and full input JSON. This is far richer than the JSONL parsing done by `lib/tools/log-parser.js` for headless jobs.

#### Interrupt / Cancel Pattern

```javascript
// Query object has interrupt() and close() methods:
const q = query({ prompt, options: { abortController: ac } });
// ...
await q.interrupt();  // soft interrupt (streaming input mode)
q.close();            // hard close + process termination
ac.abort();           // AbortController cancellation
```

Use `close()` for operator-initiated "stop" (terminates underlying process immediately). Use `abortController.abort()` when the browser disconnects (SSE connection abort signal).

#### Session Continuity

The SDK has first-class session support:
- `options.resume: sessionId` — continues an existing session with full context
- `options.sessionId: uuid` — pins a session to a specific UUID (useful for thread-scoped chat)
- `options.persistSession: true` (default) — sessions saved to disk, resumable

Map ClawForge `chatId` → Claude Agent SDK `sessionId` for thread continuity. This means a chat thread in ClawForge maps 1:1 to a Claude agent session, so the operator can continue where they left off across browser refreshes.

#### Working Directory Isolation

The SDK's `options.cwd` sets the working directory for the Claude Code process. For terminal chat mode:
- Use the workspace volume mount path (`/workspace`) if a workspace is active
- Fall back to a per-instance scratch directory (e.g., `/tmp/clawforge-{instanceName}-chat`) for stateless sessions

This is different from job containers (which clone target repos). Terminal chat mode operates on whatever directory is set in `cwd`.

#### Key Options for Production Use

```javascript
import { query } from '@anthropic-ai/claude-agent-sdk';

const ac = new AbortController();
const q = query({
  prompt: userMessage,
  options: {
    sessionId: chatId,                            // maps ClawForge chatId to SDK session
    resume: existingSessionId || undefined,       // resume if continuing thread
    cwd: workspacePath || scratchDir,
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    permissionMode: 'acceptEdits',                // auto-accept file edits (operator-trusted)
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: instanceAgentMd,                    // inject AGENT.md content
    },
    settingSources: [],                           // no filesystem settings (controlled env)
    abortController: ac,
    includePartialMessages: false,                // full messages only (reduces noise)
    maxTurns: 50,                                 // safety cap
    env: { ANTHROPIC_API_KEY: instanceApiKey },
  },
});

for await (const msg of q) {
  // stream msg to browser via SSE
}
```

**No new server infrastructure needed.** The SDK runs in the existing Event Handler Node.js process. SSE to the browser uses the existing `ReadableStream` pattern already used by `lib/jobs/stream-api.js`.

#### What NOT to Build for Terminal Chat Mode

- Do NOT spawn a Docker container — the SDK runs in-process
- Do NOT use xterm.js for terminal chat mode — it's a text/tool-call display, not a PTY terminal. Use the existing `Messages` component with added tool-call visualization. (xterm.js stays for workspace containers where ttyd provides PTY sessions.)
- Do NOT use the old `lib/tools/log-parser.js` JSONL parser — the SDK yields structured message objects directly

### Feature 2: Superadmin Portal with Instance Switching

#### No New Libraries Required

The superadmin pattern is implemented entirely within existing NextAuth v5 + Drizzle ORM infrastructure. This is a schema + middleware change, not a library addition.

**Pattern:** Add `superadmin` role to the `users` table. Extend the NextAuth session JWT to carry `instanceName` (which instance the user is currently "viewing"). The superadmin can switch instance context via a Server Action that updates a session variable or cookie, not by re-authenticating.

**Implementation approach:**

```
users.role: 'user' | 'admin' | 'superadmin'
session.user.role: 'superadmin'
session.user.instanceName: 'noah' | 'strategyES'  ← new field in JWT/session
```

The middleware already guards `/admin/*` by role. Extend it:
- `superadmin` can access `/admin/*` on all instances
- A `/superadmin/*` route shows the cross-instance dashboard
- Instance switching updates `session.user.instanceName` via NextAuth `update()` (v5 supports session mutation)

**NextAuth v5 session update** (HIGH confidence — official NextAuth v5 docs pattern):

```javascript
// Server Action — switch instance context
'use server';
import { auth, update } from '../auth/index.js';

export async function switchInstance(instanceName) {
  const session = await auth();
  if (session?.user?.role !== 'superadmin') throw new Error('Forbidden');
  await update({ user: { ...session.user, instanceName } });
}
```

NextAuth v5's `update()` function mutates the live session JWT without requiring re-login. This is the correct pattern — no need for a separate session store or cookie.

**No new npm packages needed for superadmin.** The entire implementation uses:
- Drizzle ORM migration (add `superadmin` to role enum in schema)
- NextAuth v5 `update()` (already in installed next-auth ^5.0.0-beta.30)
- New `/superadmin` Next.js pages (UI only)

#### DB Schema Change Required

```javascript
// users table: role column already allows any text value
// No schema migration needed for the column itself — SQLite text columns accept any string
// BUT: update createFirstUser, updateUserRole, and middleware role checks
// to handle the new 'superadmin' value
```

The `role` column is `text('role').notNull().default('admin')` — it already accepts arbitrary strings. No Drizzle migration needed; only application-layer changes (role check logic, UI).

### Feature 3: Full UI Operations Parity

#### No New Libraries Required

All UI operations parity features use existing stack:

| Operation | Mechanism | Existing Stack Used |
|-----------|-----------|---------------------|
| Repo CRUD (add/edit/remove) | Server Action → writes REPOS.json file via `fs.writeFile` | Node.js `fs`, existing `lib/tools/repos.js` patterns |
| Job cancel | Server Action → `docker.getContainer(id).stop()` | Existing dockerode (`lib/tools/docker.js`) |
| Job retry | Server Action → calls `dispatchDockerJob()` with same params | Existing `lib/tools/docker.js` |
| Job logs (historical) | Server Action → reads from `clusterAgentRuns.logs` or log files | Existing Drizzle ORM |
| Config editing (UI) | Server Action → `setConfigValue()` / `setConfigSecret()` | Existing `lib/db/config.js` |
| Instance management | Server Action → writes instance config files | Node.js `fs`, existing file structure |
| PR approve/reject | Already implemented (`pull-requests-page.jsx`) | Existing `lib/github-api.js` |
| MCP server config UI | Already implemented (`settings-mcp-page.jsx`) | Existing `lib/tools/mcp-servers.js` |

**The gap is UI surface, not infrastructure.** Every operation has a working backend path. What's missing is the admin page that exposes it.

**Exception — job stream replay:** Displaying historical logs for completed jobs requires storing structured log data. Currently `clusterAgentRuns.logs` stores raw text. For completed Agent SDK terminal sessions, store the serialized message array (JSON) in a new `terminal_sessions` table.

#### New DB Table: terminal_sessions

```javascript
export const terminalSessions = sqliteTable('terminal_sessions', {
  id: text('id').primaryKey(),          // = chatId / sessionId
  instanceName: text('instance_name').notNull(),
  chatId: text('chat_id').notNull(),
  sdkSessionId: text('sdk_session_id'), // Claude Agent SDK session UUID for resume
  cwd: text('cwd'),
  status: text('status').notNull().default('active'), // 'active' | 'completed' | 'interrupted'
  messages: text('messages').notNull().default('[]'), // JSON array of SDKMessage snapshots
  totalCostUsd: real('total_cost_usd'),
  numTurns: integer('num_turns').default(0),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
});
```

This enables:
1. Resuming a terminal session after browser refresh (via `sdkSessionId`)
2. Showing historical terminal session logs in the UI
3. Cost tracking per session

### Feature 4: Smart Execution Policies

#### No New Libraries Required

Smart execution policies operate on existing infrastructure:

| Policy | Implementation | Stack Used |
|--------|---------------|------------|
| Pre-CI quality gates | Run `npm test` / `npm run lint` / `npx tsc --noEmit` inside job container before PR creation | Existing job container (bash commands in entrypoint.sh) |
| Test feedback loops | Parse test output → feed back to Claude Agent SDK session via `streamInput()` | `@anthropic-ai/claude-agent-sdk` (already adding for terminal chat) |
| Merge policies | Check CI status via GitHub API before auto-merge; configurable per repo in REPOS.json | Existing `lib/tools/github.js` + GitHub Checks API |
| Cost budgets | `options.maxBudgetUsd` in Agent SDK query options | `@anthropic-ai/claude-agent-sdk` |

**Pre-CI gates in job containers:** The existing entrypoint.sh runs `claude -p`. Extend it with a validation step after Claude's work but before PR creation:

```bash
# In entrypoint.sh (after claude -p completes):
if [ "$RUN_QUALITY_GATE" = "true" ]; then
  npm test --silent 2>&1 | tail -20 > /tmp/gate-result.txt
  if [ $? -ne 0 ]; then
    # Feed failure back to claude for fix attempt
    cat /tmp/gate-result.txt | claude -p --continue "Tests failed. Fix them." --allowedTools "Read,Edit,Bash"
  fi
fi
```

This is a shell script change to existing files, not a library addition.

**REPOS.json merge policy extension:**

```json
{
  "repos": [
    {
      "slug": "clawforge",
      "mergePolicy": {
        "requireCiPass": true,
        "requireReview": false,
        "allowedPaths": ["src/**", "lib/**"],
        "blockedPaths": ["instances/**"]
      }
    }
  ]
}
```

Extend `lib/tools/repos.js` to read `mergePolicy` from REPOS.json. The auto-merge workflow checks these policies before merging.

**Test feedback loops for terminal chat mode:** The Claude Agent SDK's `streamInput()` method allows multi-turn input streaming. This enables:

```javascript
const q = query({ prompt: initialPrompt, options: { ... } });
// ... stream messages ...
// If tests fail after a session completes:
await q.streamInput(asyncIterableOf([{
  type: 'user',
  message: { role: 'user', content: 'Tests failed:\n' + testOutput }
}]));
```

This is the "test feedback loop" pattern — the operator or automation feeds CI results back into an active session.

---

## Installation

```bash
# Claude Agent SDK — programmatic Claude Code execution for terminal chat mode
npm install @anthropic-ai/claude-agent-sdk@^0.2.76
```

That is the **only new npm dependency for v2.2.**

Everything else — superadmin, UI operations, smart execution — is implemented using existing installed packages.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Claude Code execution in chat | `@anthropic-ai/claude-agent-sdk` (SDK) | Spawn `claude -p` process + parse stdout | Stdout parsing is unreliable (ANSI codes, interleaving). SDK yields structured `SDKMessage` objects. Much cleaner. |
| Claude Code execution in chat | `@anthropic-ai/claude-agent-sdk` (SDK) | Docker container per chat turn | Containers add 9s startup latency and require volume mounts. Chat mode needs sub-second response starts. SDK runs in-process. |
| Terminal rendering for chat | Existing Messages component + tool-call renderer | xterm.js | xterm.js is a PTY terminal emulator — correct for ttyd workspaces but wrong for chat-style tool-call rendering. Text with expandable tool blocks is the right UX. |
| Superadmin instance switching | NextAuth v5 `update()` (JWT mutation) | Separate auth per instance | Re-authenticating to switch instances is terrible UX. Session mutation is the correct NextAuth v5 pattern. |
| Superadmin instance switching | NextAuth v5 `update()` | Server-side in-memory instance state | Stateless (JWT carries instance) is more reliable across container restarts. |
| Pre-CI quality gates | Shell script in entrypoint.sh | Separate quality gate service | No new infrastructure needed. The job container already runs Node.js and has the repo. Shell gates are zero-overhead. |
| Test feedback loops | Agent SDK `streamInput()` | New LangGraph tool for retrying | `streamInput()` is the correct SDK primitive for multi-turn feedback. No new tool definition needed. |
| Session continuity | Map `chatId` → SDK `sessionId` | Separate session store | SDK handles its own session persistence. Reusing `chatId` as `sessionId` eliminates a synchronization problem. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `socket.io` or `ws` for terminal chat mode | Already have SSE via ReadableStream for unidirectional streaming. Bidirectional (interrupt) handled by Server Actions. | Existing SSE + Server Action for interrupt |
| `node-pty` | PTY needed for interactive terminals (workspaces), not for agent SDK sessions. SDK manages its own process. | Already have ttyd for workspace PTY sessions |
| `xterm.js` for chat mode display | PTY terminal UX is wrong for agent-style chat. Tool calls should be collapsible rich UI, not raw terminal output. | Extend existing `tool-call.jsx` renderer |
| Any session management library (redis, express-session) | NextAuth v5 JWT handles instance context natively via `update()` | NextAuth v5 built-in session mutation |
| `@anthropic-ai/claude-code` (the SDK import) | This package has been renamed. The new name is `@anthropic-ai/claude-agent-sdk`. | `@anthropic-ai/claude-agent-sdk` |
| New Docker container for each chat turn | 9s startup vs milliseconds. SDK runs in-process. | `@anthropic-ai/claude-agent-sdk` in-process |
| Kubernetes or cloud job runners | Two-instance deployment doesn't need k8s. Docker Compose is sufficient. | Existing Docker Engine API dispatch |

---

## Architecture Integration Points

### Agent SDK + Existing SSE (lib/jobs/stream-api.js pattern)

The terminal chat mode SSE endpoint follows the exact same pattern as `/api/jobs/stream/[jobId]`:

```
Browser EventSource → GET /api/terminal/stream/[chatId]
  → ReadableStream SSE
  → subscribed to terminalStreamManager (new, mirrors streamManager)
  → fed by async for await (const msg of query(...))
```

The `streamManager` pattern (pub/sub with `subscribe(id, handler)`) already works. Create a parallel `terminalStreamManager` for terminal sessions.

### Agent SDK + Existing Auth (lib/auth/index.js)

The terminal chat endpoint checks `auth()` exactly like `lib/chat/api.js` and `lib/jobs/stream-api.js`. No new auth mechanism.

### Agent SDK + Existing Chat (lib/chat/api.js)

When terminal mode is enabled in the chat (`terminalMode: true` flag in request body), `lib/chat/api.js` routes to the Agent SDK path instead of the LangGraph agent path. The `useChat` hook on the frontend is unchanged — it still posts to `/stream/chat` and receives AI SDK v5 UIMessage stream format. The server-side API translates SDK messages into AI SDK v5 writer events.

### Superadmin + Existing Middleware (lib/auth/middleware.js)

Minimal change: add `'superadmin'` to the admin role check:

```javascript
if (pathname.startsWith('/admin')) {
  const role = req.auth.user?.role;
  if (role !== 'admin' && role !== 'superadmin') {
    return NextResponse.redirect(new URL('/forbidden', req.url));
  }
}
// New superadmin-only routes:
if (pathname.startsWith('/superadmin')) {
  if (req.auth.user?.role !== 'superadmin') {
    return NextResponse.redirect(new URL('/forbidden', req.url));
  }
}
```

### Repo CRUD + Existing REPOS.json (lib/tools/repos.js)

REPOS.json is a static file today. Repo CRUD from the UI requires:
1. A Server Action that reads/writes REPOS.json via `fs.readFile` / `fs.writeFile`
2. A cache-bust mechanism after write (the existing `loadAllowedRepos()` must re-read from disk)
3. Validation that the new repo is accessible (GitHub API ping before saving)

No new dependencies. The file is JSON — native `JSON.parse` / `JSON.stringify` plus atomic write (write to temp → rename) is sufficient.

---

## DB Schema Changes Required

```javascript
// New table: terminal_sessions
// Tracks Claude Agent SDK sessions for terminal chat mode
export const terminalSessions = sqliteTable('terminal_sessions', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),
  chatId: text('chat_id').notNull(),
  sdkSessionId: text('sdk_session_id'),   // SDK-assigned UUID for resume
  cwd: text('cwd'),
  status: text('status').notNull().default('active'),
  messages: text('messages').notNull().default('[]'),  // JSON[]
  totalCostUsd: real('total_cost_usd'),
  numTurns: integer('num_turns').default(0),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
});

// users table: no column change needed (role is free-form text)
// Application layer must handle 'superadmin' in role checks

// settings table: no change needed
// REPOS.json: extended in-place (mergePolicy field added, no DB migration)
```

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|----------------|-------|
| `@anthropic-ai/claude-agent-sdk@^0.2.76` | Node >=18, ESM | Uses ESM exports. Compatible with our `"type": "module"` package. Verified 2026-03-16. |
| `@anthropic-ai/claude-agent-sdk@^0.2.76` | `@anthropic-ai/claude-code` CLI (2.1.76) | SDK and CLI are independent packages. SDK spawns the `claude` CLI binary internally via `pathToClaudeCodeExecutable`. Both can coexist. |
| NextAuth v5 `update()` | next-auth ^5.0.0-beta.30 | `update()` is available in NextAuth v5 beta — confirmed in NextAuth v5 docs. JWT session mutation is a v5 feature. |

---

## Sources

- `@anthropic-ai/claude-agent-sdk` npm registry — version 0.2.76, confirmed 2026-03-16 (HIGH confidence)
- `@anthropic-ai/claude-code` npm registry — version 2.1.76, CLI tool, confirmed 2026-03-16 (HIGH confidence)
- Anthropic Agent SDK TypeScript reference — `query()`, `Query` interface, `Options`, `SDKMessage` union type (HIGH confidence — official docs)
- Anthropic Agent SDK migration guide — package rename, breaking changes in v0.1.0, `settingSources` default change (HIGH confidence — official docs)
- Anthropic Agent SDK overview — capabilities, installation, session management patterns (HIGH confidence — official docs)
- code.claude.com/docs/en/headless — CLI headless mode vs SDK distinction confirmed (HIGH confidence — official docs)
- ClawForge `lib/jobs/stream-api.js` — existing SSE pattern analysis (HIGH confidence — direct codebase inspection)
- ClawForge `lib/chat/api.js` — AI SDK v5 createUIMessageStream pattern (HIGH confidence — direct codebase inspection)
- ClawForge `lib/auth/middleware.js` — existing role-based middleware (HIGH confidence — direct codebase inspection)
- ClawForge `lib/auth/config.js` — NextAuth v5 Credentials provider (HIGH confidence — direct codebase inspection)
- ClawForge `lib/db/schema.js` — full schema including `users`, `settings`, `codeWorkspaces`, `clusterAgentRuns` (HIGH confidence — direct codebase inspection)
- ClawForge `lib/db/config.js` — `getConfigValue`/`setConfigValue`/`getConfigSecret` patterns (HIGH confidence — direct codebase inspection)
- ClawForge `lib/db/users.js` — role handling, `updateUserRole` (HIGH confidence — direct codebase inspection)
- ClawForge `package.json` — full dependency baseline v2.1.0 (HIGH confidence — direct codebase inspection)
- ClawForge `instances/noah/config/REPOS.json` — REPOS.json structure for repo CRUD design (HIGH confidence — direct codebase inspection)
- WebSearch: NextAuth v5 `update()` session mutation pattern — multiple sources confirm this is the v5 approach for session mutation without re-auth (MEDIUM confidence — WebSearch verified with NextAuth v5 docs pattern)

---

*Stack research for: ClawForge v2.2 Smart Operations*
*Researched: 2026-03-16*
