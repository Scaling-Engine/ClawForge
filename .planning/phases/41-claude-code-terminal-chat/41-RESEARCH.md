# Phase 41: Claude Code Terminal Chat — Research

**Researched:** 2026-03-17
**Domain:** @anthropic-ai/claude-agent-sdk, AI SDK v5 UIMessageStream, unified diff rendering, in-process vs container execution
**Confidence:** HIGH (SDK types verified from npm pack; existing codebase verified by direct file reads)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TERM-01 | Operator can start a Claude Code chat session that streams text output in real time from an Agent SDK subprocess | `query()` AsyncGenerator pattern; `includePartialMessages: true` for delta streaming; extend `lib/chat/api.js` writer protocol |
| TERM-02 | Operator sees each tool call visualized live in the chat message stream as it happens | `SDKAssistantMessage` content blocks with `type: 'tool_use'`; new `TerminalToolCall` component extending existing `ToolCall` pattern |
| TERM-03 | Operator sees file edits as unified diffs with syntax highlighting | Detect `Write`/`Edit`/`MultiEdit` tool names in `SDKAssistantMessage`; render diff with `diff2html` or custom component |
| TERM-04 | Operator can send follow-up instructions to a running session | `query.streamInput(AsyncIterable<SDKUserMessage>)` — multi-turn injection into live session |
| TERM-05 | Session targets specific repo working directory via named volumes with warm-start | `Options.cwd` in Agent SDK; reuse `codeWorkspaces.volumeName` pattern from `lib/db/schema.js` |
| TERM-06 | Token usage and estimated cost per turn, stored in DB | `SDKResultMessage.total_cost_usd` + `SDKResultMessage.usage` (NonNullableUsage from BetaUsage); new `terminalSessions` and `terminalCosts` DB tables |
| TERM-07 | Toggle between chat mode and shell mode | Second mode toggle in `ChatInput`; server-side mode flag in terminal route; in shell mode wrap input as bash command for Agent SDK |
| TERM-08 | Collapsible reasoning panel for extended thinking | `Options.thinking: { type: 'enabled', budgetTokens: N }`; detect thinking blocks in `SDKAssistantMessage`; collapsible UI component |
</phase_requirements>

---

## Summary

Phase 41 introduces embedded Claude Code sessions into the existing chat UI by driving the `@anthropic-ai/claude-agent-sdk` (Agent SDK) from a new Next.js API route. The Agent SDK exposes a `query()` function that returns an AsyncGenerator of `SDKMessage` events — no readline/JSONL parsing needed. The central architectural constraint is already locked in STATE.md: extend the existing AI SDK UIMessageStream transport from `lib/chat/api.js`. A new POST route at `/stream/terminal` follows the identical `createUIMessageStream` + `createUIMessageStreamResponse` pattern, translating `SDKMessage` events into the same writer protocol (`text-start`, `text-delta`, `text-end`, `tool-input-start`, `tool-input-available`, `tool-output-available`, `finish`).

The one genuinely unresolved question from STATE.md — in-process vs container execution — is resolvable via evidence. In-process execution means the Agent SDK subprocess runs with cwd set to a mounted Docker volume path (the same warm-start pattern used by `codeWorkspaces`). Container execution would mean spinning a new Docker container. Evidence strongly favors in-process: `node` is already on PATH in any container running the event handler (node:22-bookworm-slim base), `Options.cwd` scopes the subprocess to the volume path, and `settingSources: []` prevents the host settings.json from being overridden. Container mode adds ~9 seconds of cold-start latency with no security benefit given the volume isolation already in place. **Recommendation: in-process with `cwd` scoped to volume mount path.**

The existing `lib/chat/components/message.js` already injects a `JobStreamViewer` for job progress events via a regex check. Terminal mode needs a parallel pattern: a new `TerminalToolCall` component (extends the existing `ToolCall` card pattern) with an additional diff view for `Write`/`Edit`/`MultiEdit` tool names. DB needs two new Drizzle tables: `terminalSessions` (session lifecycle) and `terminalCosts` (per-turn usage from `SDKResultMessage`).

**Primary recommendation:** In-process Agent SDK via `/stream/terminal` route using `createUIMessageStream` writer protocol, `cwd` scoped to named volume, `settingSources: []` for isolation, `includePartialMessages: true` for real-time text streaming.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/claude-agent-sdk` | ^0.2.76 (pin) | Drives Claude Code CLI subprocess; exposes SDKMessage AsyncGenerator | Only official SDK for programmatic Claude Code; provides structured events, no JSONL parsing needed |
| `ai` (Vercel AI SDK) | ^5.0.0 (already installed) | `createUIMessageStream` + `createUIMessageStreamResponse` | Already the transport for existing chat; zero new server infrastructure constraint |
| `drizzle-orm` + `better-sqlite3` | already installed | New `terminalSessions` + `terminalCosts` tables | Already the project ORM; matches existing schema patterns |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `diff2html` | ^3.4.x | Renders unified diffs as HTML with red/green syntax highlighting | TERM-03: display file edit diffs inline in TerminalToolCall component |
| `highlight.js` or Prism | already evaluating | Syntax highlighting in diff view | Only if `diff2html` does not supply its own; check first |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `diff2html` | Custom diff renderer | diff2html handles edge cases (binary, large files, context lines); custom is tempting but hand-rolling diff display is a known pitfall |
| In-process execution | Docker container per session | Container adds ~9s cold start, adds orchestration complexity, provides no additional isolation when `cwd` is already scoped to volume |
| `query.streamInput()` for multi-turn | Killing session and restarting | `streamInput()` is purpose-built for TERM-04; restart loses conversation context |

**Installation:**
```bash
npm install @anthropic-ai/claude-agent-sdk diff2html
```

---

## Architecture Patterns

### Recommended Project Structure

```
api/stream-terminal.js          # New POST route — Agent SDK → UIMessageStream writer
lib/terminal/
├── session-manager.js          # In-memory session registry (sessionId → Query instance)
├── sdk-bridge.js               # Translates SDKMessage events to UIMessageStream writer calls
└── cost-tracker.js             # Extracts SDKResultMessage usage → DB writes
lib/chat/components/
├── terminal-tool-call.js       # TerminalToolCall — extends ToolCall with diff support
├── diff-view.js                # Unified diff renderer (wraps diff2html)
└── thinking-panel.js           # Collapsible reasoning panel (TERM-08)
lib/db/schema.js                # Add terminalSessions + terminalCosts tables
```

### Pattern 1: Agent SDK → UIMessageStream Bridge

**What:** Translate Agent SDK's `SDKMessage` AsyncGenerator events into the exact same writer events that `lib/chat/api.js` already produces, so the frontend `useChat` hook receives identical protocol.

**When to use:** Always — this is the ONLY path for terminal sessions. No WebSocket, no new transport.

```javascript
// Source: verified against /tmp/package/sdk.d.ts + lib/chat/api.js pattern
import { query } from '@anthropic-ai/claude-agent-sdk';

async function terminalStream(sessionId, userText, options, writer) {
  const q = query(userText, {
    cwd: options.volumePath,          // scopes subprocess to named volume mount
    settingSources: [],               // isolated mode — no host settings.json override
    allowedTools: options.allowedTools,
    env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
    includePartialMessages: true,     // enables SDKPartialAssistantMessage for text deltas
    thinking: options.thinkingEnabled
      ? { type: 'enabled', budgetTokens: 8000 }
      : { type: 'disabled' },
    abortController: options.abortController,
  });

  // Register for TERM-04 follow-up injection
  sessionRegistry.set(sessionId, q);

  writer.write({ type: 'start' });
  let textId = null;

  for await (const msg of q) {
    if (msg.type === 'assistant') {
      // SDKAssistantMessage — text and tool_use content blocks
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          textId = textId || crypto.randomUUID();
          if (!textId._started) {
            writer.write({ type: 'text-start', id: textId });
            textId._started = true;  // track in practice with a Map
          }
          writer.write({ type: 'text-delta', id: textId, delta: block.text });
        } else if (block.type === 'tool_use') {
          writer.write({ type: 'tool-input-start', toolCallId: block.id, toolName: block.name });
          writer.write({ type: 'tool-input-available', toolCallId: block.id, toolName: block.name, input: block.input });
        }
      }
    } else if (msg.type === 'result') {
      // SDKResultMessage — extract cost for TERM-06
      await persistCost(sessionId, msg.total_cost_usd, msg.usage, msg.num_turns);
      writer.write({ type: 'text-delta', id: 'cost', delta: '' }); // cost surfaced via separate mechanism
    }
    // SDKPartialAssistantMessage fires with incomplete text blocks when includePartialMessages: true
  }

  writer.write({ type: 'finish' });
  sessionRegistry.delete(sessionId);
}
```

### Pattern 2: Multi-turn Follow-up Injection (TERM-04)

**What:** When operator sends a second message while a session is still running, inject it into the live Query via `streamInput()`.

**When to use:** Any follow-up message to a session whose `Query` instance is in the session registry.

```javascript
// Source: verified from sdk.d.ts — Query.streamInput(stream: AsyncIterable<SDKUserMessage>)
// Session registry maps sessionId → Query instance
async function injectFollowUp(sessionId, text) {
  const q = sessionRegistry.get(sessionId);
  if (!q) throw new Error('Session not found or already complete');

  // Create an AsyncGenerator that yields the follow-up as a SDKUserMessage
  async function* followUpStream() {
    yield { type: 'human', message: { role: 'user', content: text } };
  }
  q.streamInput(followUpStream());
}
```

### Pattern 3: SDKResultMessage Cost Extraction (TERM-06)

**What:** `SDKResultMessage` (both `SDKResultSuccess` and `SDKResultError`) contains `total_cost_usd` and `usage` (NonNullableUsage from BetaUsage). Persist per-turn to DB.

**When to use:** On every `msg.type === 'result'` event in the SDKMessage stream.

```javascript
// Source: sdk.d.ts lines 2120-2155 — SDKResultSuccess/SDKResultError structure
async function persistCost(sessionId, totalCostUsd, usage, numTurns) {
  await db.insert(terminalCosts).values({
    id: crypto.randomUUID(),
    sessionId,
    turnIndex: numTurns,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    estimatedUsd: totalCostUsd,
    createdAt: Date.now(),
  });
}
```

### Pattern 4: Named Volume Warm-Start (TERM-05)

**What:** Reuse the existing `codeWorkspaces.volumeName` from DB to set `Options.cwd` when creating the Agent SDK subprocess. This matches the warm-start pattern established in Phase 20/22.

**When to use:** When operator selects a repo via `selectedRepo` in the terminal chat UI (same selector used by existing chat).

```javascript
// Source: lib/db/schema.js — codeWorkspaces table has volumeName column
// Named volumes mounted at a predictable path in the event handler container
const volumePath = `/mnt/workspaces/${workspace.volumeName}`;
const q = query(userText, { cwd: volumePath, ... });
```

### Pattern 5: TerminalToolCall Diff Display (TERM-03)

**What:** When `toolName` is `Write`, `Edit`, or `MultiEdit`, render a diff view using `diff2html` instead of the generic input/output display in the base `ToolCall` component.

```javascript
// Source: pattern extends existing lib/chat/components/tool-call.js
import { html as diff2html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';

function renderDiff(oldContent, newContent, filename) {
  // Generate unified diff string, then pass to diff2html
  const unifiedDiff = generateUnifiedDiff(oldContent, newContent, filename);
  const diffHtml = diff2html(unifiedDiff, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: 'side-by-side',  // or 'line-by-line' for narrow layout
  });
  return <div dangerouslySetInnerHTML={{ __html: diffHtml }} />;
}
```

### Anti-Patterns to Avoid

- **Adding a WebSocket transport for terminal mode:** STATE.md explicitly forbids new server infrastructure. Use UIMessageStream via HTTP POST like the existing chat route.
- **Sharing a single `query()` call across concurrent users:** Each session must have its own `Query` instance in the session registry. Sessions are not thread-safe to share.
- **Omitting `settingSources: []`:** Without this flag, Agent SDK subprocess will read the host machine's `~/.claude/settings.json` and may override global settings. Always set to `[]` for containerized/server-side use.
- **Parsing JSONL output with readline:** Agent SDK is structured (AsyncGenerator<SDKMessage>). There is no JSONL to parse — the SDK handles internal subprocess communication. Do NOT add a readline wrapper.
- **Running Agent SDK without `ANTHROPIC_API_KEY` in `env`:** The subprocess does not inherit the parent process environment by default. Must explicitly pass `env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }`.
- **Iterating self-correction more than once:** Per STATE.md decision from Phase 39, hard cap is 1 correction. Terminal sessions inherit this constraint.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unified diff display | Custom red/green line renderer | `diff2html` | Handles binary files, large diffs, context lines, line numbers, side-by-side mode — all edge cases |
| JSONL/subprocess communication | readline + process.stdout parsing | Agent SDK AsyncGenerator | SDK handles all IPC internally; structured SDKMessage events provided directly |
| Cost calculation | Token-count × price lookup table | `SDKResultMessage.total_cost_usd` | SDK calculates actual cost including cache pricing; maintaining a price table will drift |
| Multi-turn session state | Custom message history buffer | `query.streamInput()` | SDK owns the session state; injecting via streamInput is the official mechanism |

**Key insight:** The Agent SDK abstracts all subprocess lifecycle management. Treating it as a structured event source (not a process to manage) eliminates an entire class of reliability bugs.

---

## Common Pitfalls

### Pitfall 1: Missing `settingSources: []` — Host Settings Override

**What goes wrong:** Agent SDK subprocess reads `~/.claude/settings.json` from the server host, which may override permission modes, tool allowlists, or other agent settings in unexpected ways.
**Why it happens:** Default behavior inherits host configuration files.
**How to avoid:** Always pass `settingSources: []` in production. This is a locked decision in STATE.md.
**Warning signs:** Agent behaves differently between dev and prod; unexpected tool denials or unexpected approvals.

### Pitfall 2: Session Registry Memory Leak

**What goes wrong:** `Query` instances are stored in memory per session. If sessions are never cleaned up (e.g., browser tab closed mid-session), memory grows unbounded in the event handler process.
**Why it happens:** No automatic TTL on in-memory registry.
**How to avoid:** Set a TTL on session entries (e.g., 30 minutes). On `SDKResultMessage` receipt, immediately remove from registry. Expose an explicit session-close endpoint.
**Warning signs:** Memory usage grows linearly with number of sessions started since last restart.

### Pitfall 3: `ANTHROPIC_API_KEY` Not Passed to Subprocess

**What goes wrong:** Agent SDK subprocess fails with authentication error immediately.
**Why it happens:** Node.js child process does not inherit parent environment when using Agent SDK's `env` option.
**How to avoid:** Always include `env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }` in `Options`. Add this to a checklist.
**Warning signs:** TERM-01 smoke test fails with `authentication_failed` in `SDKResultError.errors`.

### Pitfall 4: `includePartialMessages` Not Set — No Streaming Text

**What goes wrong:** Text only appears in bulk after each complete assistant turn instead of streaming letter by letter. Appears frozen.
**Why it happens:** Without `includePartialMessages: true`, only complete `SDKAssistantMessage` events are emitted.
**How to avoid:** Always set `includePartialMessages: true` in production terminal sessions.
**Warning signs:** TERM-01 demo shows no streaming text, only sudden appearance of full response.

### Pitfall 5: Volume Path Mismatch

**What goes wrong:** Agent SDK subprocess starts but cannot access repo files; all file operations fail.
**Why it happens:** The `cwd` path passed to `Options` does not match the actual Docker volume mount path.
**How to avoid:** Derive `cwd` directly from `codeWorkspaces.volumeName` using a consistent mount path convention (e.g., `/mnt/workspaces/${volumeName}`). Document mount path in `.env.example`.
**Warning signs:** TERM-05 fails; Claude Code immediately errors on any file read/write tool.

### Pitfall 6: diff2html CSS Not Loaded in Next.js

**What goes wrong:** Diff component renders but has no red/green coloring — plain text output.
**Why it happens:** `diff2html` CSS must be explicitly imported. Next.js does not auto-import external component CSS.
**How to avoid:** Add `import 'diff2html/bundles/css/diff2html.min.css'` in the diff component file. Verify it's included in the build.
**Warning signs:** TERM-03 visual test shows no color; inspecting DOM reveals missing CSS classes.

---

## Code Examples

### SDKResultMessage Structure (Cost Tracking)

```typescript
// Source: sdk.d.ts verified 2026-03-17
type SDKResultSuccess = {
  type: 'result';
  subtype: 'success';
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result: string;              // Final text output
  total_cost_usd: number;      // Actual cost in USD — USE THIS for TERM-06
  usage: NonNullableUsage;     // BetaUsage fields, all non-nullable
  modelUsage: Record<string, ModelUsage>; // Per-model breakdown
  uuid: UUID;
  session_id: string;
};

type NonNullableUsage = {      // Mirrors @anthropic-ai/sdk BetaUsage
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  // ... other BetaUsage fields
};
```

### UIMessageStream Writer Protocol (existing pattern from lib/chat/api.js)

```javascript
// Source: lib/chat/api.js — verified 2026-03-17
// Terminal route MUST produce identical protocol:
writer.write({ type: 'start' });
writer.write({ type: 'text-start', id: textId });
writer.write({ type: 'text-delta', id: textId, delta: '...' });
writer.write({ type: 'text-end', id: textId });
writer.write({ type: 'tool-input-start', toolCallId, toolName });
writer.write({ type: 'tool-input-available', toolCallId, toolName, input });
writer.write({ type: 'tool-output-available', toolCallId, output });
writer.write({ type: 'finish' });
```

### New DB Schema Additions

```javascript
// Source: lib/db/schema.js pattern — verified 2026-03-17
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const terminalSessions = sqliteTable('terminal_sessions', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').notNull(),        // links to chats table
  repoSlug: text('repo_slug'),              // nullable — sessions may not target a repo
  volumeName: text('volume_name'),          // nullable — from codeWorkspaces.volumeName
  cwdPath: text('cwd_path'),                // resolved mount path used at session start
  status: text('status').notNull().default('running'), // 'running' | 'complete' | 'error'
  thinkingEnabled: integer('thinking_enabled').notNull().default(0),
  shellMode: integer('shell_mode').notNull().default(0),
  totalCostUsd: real('total_cost_usd').default(0),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
});

export const terminalCosts = sqliteTable('terminal_costs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(), // references terminalSessions.id
  turnIndex: integer('turn_index').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheCreationTokens: integer('cache_creation_tokens').notNull().default(0),
  estimatedUsd: real('estimated_usd').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});
```

### Shell Mode Toggle Pattern (TERM-07)

```javascript
// Shell mode wraps input as a bash invocation directive for Agent SDK
// Source: pattern derived from existing codeMode in lib/chat/components/chat.js
function buildTerminalPrompt(userText, shellMode) {
  if (shellMode && userText.trim()) {
    return `Run this shell command and show me the output:\n\`\`\`bash\n${userText.trim()}\n\`\`\``;
  }
  return userText;
}
```

### Extended Thinking Panel (TERM-08)

```javascript
// Source: sdk.d.ts Options.thinking field
// Detect thinking blocks in SDKAssistantMessage content
function extractThinkingBlocks(sdkAssistantMessage) {
  return sdkAssistantMessage.message.content.filter(b => b.type === 'thinking');
}

// Options usage:
const q = query(prompt, {
  thinking: { type: 'enabled', budgetTokens: 8000 },
  // budgetTokens controls reasoning depth vs cost tradeoff
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spawn `claude` CLI and parse stdout JSONL | Use `@anthropic-ai/claude-agent-sdk` `query()` AsyncGenerator | SDK released ~2026 Q1 | No readline needed; structured SDKMessage events; multi-turn via streamInput |
| WebSocket for bidirectional terminal streaming | UIMessageStream over HTTP POST | Locked in STATE.md | Zero new infrastructure; reuses existing transport; no WS upgrade path needed |
| ttyd for browser terminal | AI SDK chat UI with tool call cards | Locked in STATE.md (ttyd is for Workspaces, not Terminal Chat) | Rich structured display vs raw terminal; diffs, costs, thinking panels possible |

**Deprecated/outdated:**
- `readline`/JSONL parsing: Replaced by Agent SDK structured events — do not implement.
- WebSocket server for terminal: Explicitly forbidden by STATE.md architecture decision.

---

## In-Process vs Container Execution — Decision

**Recommendation: In-process (Option A)**

| Factor | In-Process | Container |
|--------|------------|-----------|
| Cold start | ~0ms (subprocess spawn) | ~9s (Docker image pull + start) |
| Filesystem isolation | `cwd` scoped to volume mount | Full container isolation |
| Security posture | `settingSources: []` + `allowedTools` whitelist | Same controls plus container boundary |
| Implementation complexity | New route + session manager | New route + Docker orchestration + IPC layer |
| Node availability | Already on PATH (node:22-bookworm base) | Requires Claude Code + Agent SDK in image |
| Warm-start compatibility | Direct `cwd` to volume mount path | Requires volume mount config in docker-compose |

The security controls available in-process (`settingSources: []`, `allowedTools`, `cwd` isolation, `env` isolation) provide equivalent protection to a container boundary for this use case. The 9-second start latency for container mode would make TERM-01 feel broken. The `cwd` option in Agent SDK confines the subprocess's file operations to the volume path — it cannot escape to the event handler's root filesystem.

**Resolved:** Build in-process. Document in plan as locked decision.

---

## Open Questions

1. **Volume mount path convention**
   - What we know: `codeWorkspaces.volumeName` stores the Docker volume name; volumes must be mounted in the event handler container to be accessible as a `cwd` path
   - What's unclear: The exact mount path convention (e.g., `/mnt/workspaces/`) — needs to match `docker-compose.yml` volume mounts for the event handler service
   - Recommendation: Check `docker-compose.yml` in plan wave 0; establish `/mnt/workspaces/${volumeName}` as the convention and document in `.env.example`

2. **`diff2html` React integration**
   - What we know: `diff2html` produces HTML strings; React requires `dangerouslySetInnerHTML` for this
   - What's unclear: Whether a lighter React-native diff library exists that avoids `dangerouslySetInnerHTML`
   - Recommendation: Use `diff2html` with `dangerouslySetInnerHTML` — the HTML content is locally generated from Claude's tool calls (not user input), so XSS risk is low and acceptable. Document this decision.

3. **`SDKUserMessage` exact shape for `streamInput`**
   - What we know: `streamInput(stream: AsyncIterable<SDKUserMessage>)` is the API; `SDKUserMessage` is in the type union
   - What's unclear: Exact `SDKUserMessage` fields needed for follow-up injection (verified type definition was large; `{ type: 'human', message: { role: 'user', content: text } }` is the inferred shape from context)
   - Recommendation: Write a TERM-04 unit test that exercises `streamInput` with a simple follow-up message against a real session in dev; verify exact shape against runtime errors before implementation is final

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — `package.json` test script is `echo "No tests yet" && exit 0` |
| Config file | None — Wave 0 must install test framework |
| Quick run command | `npm test` (no-op until Wave 0) |
| Full suite command | `npm test` (no-op until Wave 0) |

**Note:** Project has a `tests/` directory with shell script fixtures for job container testing (`test-job.sh`, `validate-output.sh`) but no JavaScript unit test framework. The terminal chat features are browser-rendered streaming UI — the most valuable validation is a smoke test via the running dev server, not unit tests.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TERM-01 | Agent SDK subprocess streams text to UI | Smoke (manual dev server) | `npm run dev` + manual check | ❌ Wave 0 |
| TERM-02 | Tool call cards appear live | Smoke (manual dev server) | `npm run dev` + manual check | ❌ Wave 0 |
| TERM-03 | File edit diff displayed | Smoke (manual dev server) | `npm run dev` + manual check | ❌ Wave 0 |
| TERM-04 | Follow-up injection mid-session | Smoke (manual dev server) | `npm run dev` + manual check | ❌ Wave 0 |
| TERM-05 | Named volume path in cwd | Integration — requires docker-compose | `docker compose up` + manual session start | ❌ Wave 0 |
| TERM-06 | Cost persisted to DB | Unit — DB write assertion | manual-only until framework installed | ❌ Wave 0 |
| TERM-07 | Shell mode toggle | Smoke (manual dev server) | `npm run dev` + manual check | ❌ Wave 0 |
| TERM-08 | Thinking panel collapsible | Smoke (manual dev server) | `npm run dev` + manual check | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run build` (ensures no compilation errors)
- **Per wave merge:** `npm run build` + smoke test checklist
- **Phase gate:** All TERM-01 through TERM-08 manually verified on running dev server before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] No JavaScript unit test framework exists — if DB cost writing (TERM-06) needs automated coverage, install `vitest` with `npm install -D vitest` and add `"test": "vitest run"` to package.json scripts
- [ ] `tests/terminal/` — integration test directory for Agent SDK smoke tests if framework is added

*(Current project posture: test infrastructure is manual. Wave 0 should establish build-check as the minimum gate.)*

---

## Sources

### Primary (HIGH confidence)
- `/tmp/package/sdk.d.ts` — extracted from `npm pack @anthropic-ai/claude-agent-sdk@latest`; `query()`, `Options`, `SDKResultMessage`, `SDKResultSuccess`, `SDKResultError`, `NonNullableUsage`, `ModelUsage`, `Query.streamInput()` types verified
- `lib/chat/api.js` — direct file read; UIMessageStream writer protocol verified
- `lib/db/schema.js` — direct file read; Drizzle table patterns verified
- `lib/chat/components/chat.js` — direct file read; `codeMode` toggle pattern verified
- `.planning/STATE.md` — direct file read; locked decisions verified
- `.planning/REQUIREMENTS.md` — direct file read; TERM-01 through TERM-08 verified

### Secondary (MEDIUM confidence)
- `.claude/rules/ai-agent.md`, `.claude/rules/jobs.md` — project rules; in-process vs container tradeoff context
- `lib/chat/components/tool-call.js` — direct file read; component pattern for TerminalToolCall extension

### Tertiary (LOW confidence)
- `diff2html` React integration pattern — from prior knowledge; version ^3.4.x noted; should be verified against current npm version during implementation
- `SDKUserMessage` exact shape for `streamInput` — inferred from type context; should be verified with a TERM-04 smoke test

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Agent SDK types verified from npm pack; AI SDK already installed; Drizzle already in use
- Architecture: HIGH — Execution model decision supported by evidence; writer protocol verified from source files
- Pitfalls: HIGH for items with direct code evidence; MEDIUM for diff2html CSS pitfall (informed by common Next.js pattern)
- Open questions: Items flagged LOW are implementation details resolvable in Wave 0, not blockers

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable SDK; Agent SDK is actively developed — re-verify if >30 days pass)
