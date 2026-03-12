# Phase 25: Headless Log Streaming - Research

**Researched:** 2026-03-12
**Domain:** Server-Sent Events, Docker log streaming, Claude Code JSONL parsing, Slack message editing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Stream Transport:** SSE via Next.js API Route — ReadableStream with `text/event-stream`. Not WebSocket.
- **New route:** `/api/jobs/stream/[jobId]` — returns `ReadableStream` with `text/event-stream` content type.
- **Log Source:** `container.logs({follow: true})` + `docker.modem.demuxStream()` for stdout/stderr separation.
- **Where to extend:** `lib/tools/docker.js` — new streaming function alongside existing `collectLogs()` (line 158).
- **Lifecycle:** Stream listener created after `container.start()` in `dispatchDockerJob()`, cleaned up on container exit or consumer disconnect.
- **Semantic Event Filtering:** Parse raw Claude Code JSONL output server-side before forwarding. Never forward raw JSONL to SSE consumers.
- **Semantic events to surface:** File modifications (create/edit/delete), bash command outputs, tool calls with results, key decisions/reasoning, errors.
- **Suppress:** Raw assistant message chunks, system prompt content, MCP handshake noise, duplicate content.
- **SSE Event format:** `{type: 'file-change'|'bash-output'|'tool-result'|'decision'|'progress'|'error', ...}`
- **Progress indicator:** Elapsed time counter + current activity type. Single chat message that gets replaced/updated, not new messages per update. Derived from SSE semantic event types.
- **Cancel job:** LangGraph tool `cancel_job` → `container.stop()` (SIGTERM → 10s grace → SIGKILL). Branch preserved (Claude Code auto-commits). Confirmation via `addToThread()` with final log summary.
- **Slack streaming (STRM-06):** Single message posted at job start, edited every 10s via `chat.update`. Thread replies only for completion/failure/cancellation. Reuse `notifyWorkspaceEvent()` routing with "update existing message" mode.
- **Memory safety (STRM-07):** AbortController per SSE connection. Container event listener removed on abort signal. Docker log stream `.destroy()` called in all cleanup paths.
- **Sensitive value filtering (STRM-08):** Regex-based scrubbing before SSE emission. Patterns: `AGENT_*` env var values, GitHub tokens, API keys matching `sk-*`, `ghp_*`, `xoxb-*`.

### Claude's Discretion

None specified.

### Deferred Ideas (OUT OF SCOPE)

None captured — user chose to proceed directly to planning.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STRM-01 | Operator sees live log output from a running job container in the web chat thread as it executes | SSE endpoint + in-memory stream manager + React SSE consumer component |
| STRM-02 | Log output filtered to semantic events — raw JSONL suppressed | Claude Code stream-json event type parsing; filter map in Standard Stack section |
| STRM-03 | Operator sees progress indicator with elapsed time while job is running | SSE `progress` event type; single-message update pattern in chat component |
| STRM-04 | Operator can cancel running job via conversational command; container stops cleanly and branch preserved | `cancel_job` LangGraph tool → `container.stop()`; Docker SIGTERM → SIGKILL grace period |
| STRM-05 | Log stream shows only changed files since last update (diff highlighting) instead of raw log lines | `file-change` semantic events carry path + operation; diff comparison via tracked file-change state |
| STRM-06 | Slack receives single auto-updating message with latest status every 10s | Slack `chat.update` API; message-ts tracking in stream manager |
| STRM-07 | Browser tab close releases resources; no memory leak from orphaned Docker log streams | AbortController on SSE request signal; `.destroy()` on Docker log stream in all cleanup paths |
| STRM-08 | Sensitive values never forwarded in log stream output | Regex scrubbing layer before SSE emission; AGENT_*, sk-*, ghp_*, xoxb-* patterns |
</phase_requirements>

---

## Summary

Phase 25 adds live job visibility by piping Docker container stdout/stderr into SSE streams, filtering Claude Code's JSONL to semantic events, and rendering them in the web chat and Slack. The codebase already has 90% of the infrastructure needed: `collectLogs()` in `docker.js` (line 158) uses `docker.modem.demuxStream()` with PassThrough streams; `waitAndNotify()` in `tools.js` (line 147) is the fire-and-forget container lifecycle hook where streaming attaches; and the web chat uses `EventSource`-compatible SSE already via the chat stream at `/stream/chat`. The primary new work is (1) a streaming variant of `collectLogs()` with `follow: true`, (2) a JSONL parser that maps Claude Code's stream-json events to semantic types, (3) an in-memory stream manager with `AbortController` lifecycle, (4) a Next.js SSE route that bridges container logs to browser clients, and (5) a React component that consumes SSE events and renders them inline in the chat thread.

The Claude Code CLI emits `--output-format stream-json` JSONL with well-documented event types: `system` (init), `assistant` (complete turn), `result` (final), and `stream_event` (partial tokens with nested `content_block_start/delta/stop`). The semantic filter reads these events and emits only the planner-visible subset. Importantly, the container does NOT run with `--output-format stream-json` by default (the entrypoint uses `claude -p` with default text output). The streaming layer reads raw container stdout, which means the JSONL filter needs to handle both structured GSD hook output and unstructured text lines.

Memory safety is the most critical cross-cutting concern. Dockerode streams are not auto-closed — `container.logs({follow: true})` returns a Node.js `Readable` that remains open until `.destroy()` is called. Every cleanup code path (client disconnect, container exit, job timeout) must call `.destroy()` on the log stream.

**Primary recommendation:** Build the stream manager as an in-memory singleton (Map of jobId → {logStream, controllers}) stored in `globalThis` to survive Next.js module reloads, exactly like the existing `globalThis.__clawforge_docker` pattern in `docker.js`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dockerode | ^4.0.9 (already installed) | `container.logs({follow: true})` + `docker.modem.demuxStream()` | Already used in codebase; `follow: true` mode is the streaming variant of existing `collectLogs()` |
| Node.js ReadableStream / PassThrough | built-in | Demux stdout/stderr from Docker multiplexed stream | Used in existing `collectLogs()` — same pattern, now wired to push events instead of collect |
| AbortController | built-in (Node 16+) | Per-SSE-connection lifecycle; triggers Docker stream cleanup on disconnect | Standard Web API; `request.signal` in Next.js route handlers is already an AbortSignal |
| @slack/web-api | ^7.8.0 (already installed) | `chat.postMessage` + `chat.update` for Slack status message edit-in-place | Already used in `notifyWorkspaceEvent()` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| globalThis map (no library) | — | In-memory stream manager — tracks active log streams by jobId | Needed to survive Next.js module reloads; same pattern as `globalThis.__clawforge_docker` |
| EventSource (browser built-in) | — | SSE client in React component | No library needed; native browser API |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SSE (chosen) | WebSocket | WebSocket infra exists (v1.5) but is heavier; SSE is simpler for unidirectional log push |
| In-memory stream manager | Redis pub/sub | Overkill for 2-instance scale; no cross-process requirements |
| Polling `/api/jobs/status` | SSE | Polling adds 5-30s latency; SSE gives real-time delivery |

**Installation:** No new packages needed. All dependencies are already in `package.json`.

---

## Architecture Patterns

### Recommended Structure

```
lib/
├── tools/
│   ├── docker.js              # ADD: streamContainerLogs(), cancelDockerJob()
│   └── stream-manager.js      # NEW: in-memory map of active streams + lifecycle
├── ai/
│   └── tools.js               # ADD: cancel_job LangGraph tool
lib/chat/
│   ├── components/
│   │   └── job-stream-viewer.jsx  # NEW: SSE consumer React component
│   └── api.js                 # unchanged

templates/app/
└── api/
    └── jobs/
        └── stream/
            └── [jobId]/
                └── route.js   # NEW: SSE endpoint (thin export from lib/)
```

All implementation goes in `lib/` (per `templates/CLAUDE.md` — templates are thin wiring only).

### Pattern 1: Follow-Mode Docker Log Stream with Cleanup

**What:** `container.logs({follow: true})` returns a Node.js Readable. Demux stdout/stderr with `docker.modem.demuxStream()`. Push lines to a PassThrough, parse JSONL line-by-line.

**When to use:** Immediately after `container.start()` in `dispatchDockerJob()`. Concurrent with `waitForContainer()`.

```javascript
// Source: existing collectLogs() in lib/tools/docker.js:158 + dockerode follow:true mode
export async function streamContainerLogs(container, onLine, signal) {
  const logStream = await container.logs({
    stdout: true,
    stderr: true,
    follow: true,
    timestamps: false,
  });

  const stdoutPassThrough = new PassThrough();
  const stderrPassThrough = new PassThrough();

  docker.modem.demuxStream(logStream, stdoutPassThrough, stderrPassThrough);

  // Cleanup on abort signal (client disconnect or job cancel)
  const cleanup = () => {
    logStream.destroy();
    stdoutPassThrough.destroy();
    stderrPassThrough.destroy();
  };

  signal?.addEventListener('abort', cleanup);

  let buffer = '';
  stdoutPassThrough.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete final line
    for (const line of lines) {
      if (line.trim()) onLine(line.trim());
    }
  });

  stderrPassThrough.on('data', (chunk) => {
    // stderr lines also passed to onLine (errors are semantic events)
    const lines = chunk.toString('utf8').split('\n');
    for (const line of lines) {
      if (line.trim()) onLine(`[stderr] ${line.trim()}`);
    }
  });

  // Container exit: drain buffer, cleanup
  logStream.on('end', () => {
    if (buffer.trim()) onLine(buffer.trim());
    cleanup();
  });

  logStream.on('error', (err) => {
    console.warn('Container log stream error:', err.message);
    cleanup();
  });

  return cleanup;
}
```

### Pattern 2: SSE Route Handler with AbortController Cleanup

**What:** Next.js App Router Route Handler returns a `ReadableStream` with `text/event-stream`. Uses `request.signal` (already an AbortSignal) to detect client disconnect.

**When to use:** `/api/jobs/stream/[jobId]/route.js` — GET endpoint, session-auth required.

```javascript
// Source: Next.js App Router + Web Streams API
export async function GET(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function sendEvent(type, data) {
        // SSE format: "data: {json}\n\n"
        const payload = `data: ${JSON.stringify({ type, ...data })}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      // Wire up stream manager
      const unsubscribe = streamManager.subscribe(jobId, sendEvent);

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
```

### Pattern 3: In-Memory Stream Manager (globalThis singleton)

**What:** Central map of `jobId → {logStream, subscribers, startedAt}`. Lives in `globalThis` to survive Next.js hot-reload module churn — same pattern as `globalThis.__clawforge_docker`.

**When to use:** Attach when `dispatchDockerJob()` starts a container. Detach when container exits.

```javascript
// lib/tools/stream-manager.js
if (!globalThis.__clawforge_streams) {
  globalThis.__clawforge_streams = new Map();
}

export const streamManager = {
  register(jobId, logStream) {
    globalThis.__clawforge_streams.set(jobId, {
      logStream,
      subscribers: new Set(),
      startedAt: Date.now(),
    });
  },

  subscribe(jobId, callback) {
    const entry = globalThis.__clawforge_streams.get(jobId);
    if (!entry) return () => {};
    entry.subscribers.add(callback);
    return () => entry.subscribers.delete(callback);
  },

  emit(jobId, type, data) {
    const entry = globalThis.__clawforge_streams.get(jobId);
    if (!entry) return;
    for (const cb of entry.subscribers) {
      try { cb(type, data); } catch {}
    }
  },

  complete(jobId) {
    const entry = globalThis.__clawforge_streams.get(jobId);
    if (!entry) return;
    entry.logStream?.destroy?.();
    // Notify subscribers of completion before removing
    for (const cb of entry.subscribers) {
      try { cb('complete', { elapsedMs: Date.now() - entry.startedAt }); } catch {}
    }
    globalThis.__clawforge_streams.delete(jobId);
  },
};
```

### Pattern 4: Claude Code JSONL → Semantic Event Filter

**What:** Claude Code running inside the container writes to stdout. When the container runs `claude -p` (the entrypoint default), stdout is a mix of text lines and structured lines. The filter handles both.

**IMPORTANT:** The current `entrypoint.sh` runs `claude -p "..."` without `--output-format`. The container stdout is therefore raw text (Claude's print-mode text output), NOT stream-json JSONL. However, GSD hooks in the container (`hooks/gsd-invocations.js`) may emit structured JSON lines. The filter must handle BOTH formats.

**Claude Code stream-json event shape (if the future entrypoint adds `--output-format stream-json`):**

```
Top-level types:
  { "type": "system", "subtype": "init", "session_id": "...", "tools": [...] }
  { "type": "assistant", "message": { "role": "assistant", "content": [...] } }
  { "type": "result", "subtype": "success", "result": "...", "session_id": "..." }
  { "type": "stream_event", "event": { "type": "content_block_start|delta|stop", ... } }
    └── content_block_start: { "content_block": { "type": "tool_use", "name": "Bash", "id": "..." } }
    └── content_block_delta: { "delta": { "type": "text_delta", "text": "..." } }
    └── content_block_delta: { "delta": { "type": "input_json_delta", "partial_json": "..." } }

Tool use pattern (inside assistant.message.content[]):
  { "type": "tool_use", "id": "...", "name": "Write|Edit|Bash|Read|Glob|Grep", "input": {...} }
```

**Semantic event mapping:**

```javascript
// lib/tools/log-parser.js
export function parseLineToSemanticEvent(rawLine) {
  // Try JSON parse first
  let parsed;
  try { parsed = JSON.parse(rawLine); } catch { parsed = null; }

  if (parsed) {
    // Claude Code stream-json: assistant message with tool_use content
    if (parsed.type === 'assistant') {
      const toolCalls = parsed.message?.content?.filter(c => c.type === 'tool_use') || [];
      for (const tc of toolCalls) {
        if (['Write', 'Edit', 'MultiEdit'].includes(tc.name)) {
          return { type: 'file-change', operation: tc.name.toLowerCase(), path: tc.input?.path || tc.input?.file_path };
        }
        if (tc.name === 'Bash') {
          return { type: 'bash-output', command: tc.input?.command?.slice(0, 120) };
        }
        if (tc.name === 'TodoWrite') {
          return { type: 'progress', label: 'Updating task list' };
        }
      }
      // Text blocks = Claude reasoning/decision
      const textBlocks = parsed.message?.content?.filter(c => c.type === 'text') || [];
      const text = textBlocks.map(b => b.text).join('').trim();
      if (text.length > 20) {
        return { type: 'decision', text: text.slice(0, 200) };
      }
    }

    if (parsed.type === 'result') {
      return { type: 'complete', subtype: parsed.subtype, result: parsed.result?.slice(0, 300) };
    }

    // GSD hook structured output (e.g., wave/task progress)
    if (parsed.event === 'gsd:wave-start' || parsed.event === 'gsd:task-start') {
      return { type: 'progress', label: parsed.label || parsed.event };
    }
  }

  // Unstructured text: surface stderr markers and git operations
  if (rawLine.startsWith('[stderr]')) {
    return { type: 'error', message: rawLine.replace('[stderr] ', '').slice(0, 200) };
  }
  if (/^\[git\]/.test(rawLine) || /git commit|git push/.test(rawLine)) {
    return { type: 'progress', label: rawLine.slice(0, 100) };
  }

  // Default: suppress (raw noise)
  return null;
}
```

**Events to suppress (return null):**
- `stream_event` with `content_block_delta` (partial token noise)
- `system` init events
- Lines matching `AGENT_*`, `sk-*`, `ghp_*`, `xoxb-*` patterns (secrets scrub)
- Blank lines, single-character lines

### Pattern 5: Slack Edit-in-Place

**What:** Post a status message at job start, capture its `ts`. Edit every 10s with `chat.update`. Thread reply only on completion/cancellation.

```javascript
// Source: @slack/web-api docs, chat.update method
// Store: streamManager entry gets slackStatusTs: string

async function postJobStartSlackStatus(channel, threadTs, jobId) {
  const { WebClient } = await import('@slack/web-api');
  const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
  const result = await slack.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `Job \`${jobId.slice(0, 8)}\` started — warming up...`,
  });
  return result.ts; // capture for chat.update
}

async function updateSlackJobStatus(channel, statusTs, text) {
  const { WebClient } = await import('@slack/web-api');
  const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
  await slack.chat.update({ channel, ts: statusTs, text });
}
```

### Pattern 6: cancel_job LangGraph Tool

**What:** New tool alongside `create_job` in `lib/ai/tools.js`. Calls `container.stop()` which sends SIGTERM, waits 10s grace period, then SIGKILL.

```javascript
// Extend lib/ai/tools.js
const cancelJobTool = tool(
  async ({ job_id }) => {
    const row = getDockerJob(job_id);
    if (!row?.containerId) return JSON.stringify({ success: false, error: 'Job not found or not a Docker job' });

    const container = docker.getContainer(row.containerId);
    try {
      await container.stop({ t: 10 }); // 10s SIGTERM grace, then SIGKILL
    } catch (err) {
      if (!err.message.includes('not running')) throw err;
    }

    // Stream manager cleanup
    streamManager.complete(job_id);

    return JSON.stringify({ success: true, job_id, message: 'Container stopped. Branch preserved for inspection.' });
  },
  {
    name: 'cancel_job',
    description: 'Cancel a running Docker job container. The branch and any committed work are preserved.',
    schema: z.object({ job_id: z.string().describe('UUID of the job to cancel') }),
  }
);
```

### Anti-Patterns to Avoid

- **Storing Docker log stream reference outside globalThis:** Next.js hot-reload creates new module instances; the stream reference will be lost. Always use `globalThis.__clawforge_streams`.
- **Not calling `.destroy()` on the log stream:** Dockerode does NOT auto-close streams. Failure to call `.destroy()` is a confirmed memory leak per dockerode issue #166.
- **Forwarding `stream_event` deltas (partial token chunks) to SSE clients:** These are 5-50 byte fragments. At ~50 events/second during generation, this would flood the chat. Filter to complete tool calls and text blocks only.
- **Creating a new Slack WebClient per update tick:** Instantiate once per job start, close after completion. Or use the lazy import pattern already in `notifyWorkspaceEvent()`.
- **Assuming the container runs `--output-format stream-json`:** Current entrypoint does NOT add this flag. The JSONL parser must fall back to text-line heuristics.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Docker log multiplexing | Custom byte-header parser | `docker.modem.demuxStream()` | Docker uses 8-byte frame headers for stdout/stderr muxing; already handled by dockerode |
| SSE keepalive / reconnect | Custom heartbeat | Browser `EventSource` auto-reconnects | EventSource reconnects automatically on disconnect; heartbeat adds complexity for no gain |
| Secret detection | Entropy scanner | Regex allowlist patterns (`AGENT_*`, `sk-*`, `ghp_*`, `xoxb-*`) | Full entropy scanning has high false-positive rate; known-prefix patterns cover actual secrets in use |
| Stream backpressure management | Ring buffer / flow control | PassThrough with default Node.js highWaterMark | Container log output is low-volume (text lines); Node.js stream buffering is sufficient |

**Key insight:** The Docker stream infrastructure is already in `collectLogs()`. This phase is an adaptation (follow mode + push instead of collect), not a rewrite.

---

## Common Pitfalls

### Pitfall 1: Orphaned Docker Log Stream After Module Reload

**What goes wrong:** Next.js hot-reload instantiates a new module. The old `Map` holding the log stream reference is garbage-collected, but the underlying socket connection to Docker remains open. Memory grows with each reload.

**Why it happens:** Module-level `Map` variables are re-initialized on every `import`. The Docker socket stream is held by Node.js internals, not the JS variable.

**How to avoid:** Store all active streams in `globalThis.__clawforge_streams`, identical to the existing `globalThis.__clawforge_docker` pattern in `docker.js:20-21`.

**Warning signs:** Docker daemon showing open log-follow connections for stopped containers.

### Pitfall 2: SSE Route Timeout from Next.js/Vercel

**What goes wrong:** Long-running SSE connections (jobs take 2-30 minutes) may be cut by the hosting platform's function timeout (Vercel defaults: 60s Edge, 300s Serverless).

**Why it happens:** SSE holds the HTTP connection open for the job duration.

**How to avoid:** This is a self-hosted Docker deployment (not Vercel serverless). The custom HTTP server wrapping Next.js (v1.5 decision) removes the Vercel timeout constraint. No workaround needed. Document this assumption in the SSE route.

**Warning signs:** SSE connections terminating after exactly 60 or 300 seconds.

### Pitfall 3: `container.logs()` Returns Buffer Instead of Stream

**What goes wrong:** Existing `collectLogs()` handles both Buffer and Stream return types (see the `Buffer.isBuffer(logStream)` branch at line 166). With `follow: true`, dockerode always returns a stream. But the type-check should still be present.

**Why it happens:** Documented in dockerode issue #751 — return type changed across versions. Current version (4.0.9) returns stream for follow:true, buffer for follow:false.

**How to avoid:** Add a guard in `streamContainerLogs()`: if `Buffer.isBuffer(result)`, emit as a single complete event and return (can't follow a buffer).

**Warning signs:** `logStream.on` throwing "cannot read property 'on' of Buffer".

### Pitfall 4: Parsing JSONL Lines That Span Container Stdout Chunks

**What goes wrong:** A JSON line may be split across two `data` events from the PassThrough stream, causing `JSON.parse()` to throw on an incomplete line.

**Why it happens:** TCP/stream chunking doesn't respect line boundaries.

**How to avoid:** Accumulate a `buffer` string. Split on `\n`. Keep the last element (may be incomplete) back in the buffer. Process only complete lines. This is already shown in `streamContainerLogs()` pattern above.

**Warning signs:** Intermittent JSON parse errors in log parser.

### Pitfall 5: Slack `chat.update` Rate Limit

**What goes wrong:** Slack tier 3 rate limit allows ~50 updates/minute per method. Updating every 10 seconds = 6/minute. Safe. But if multiple jobs run concurrently, cumulative updates could approach limits.

**Why it happens:** Each job has its own update timer.

**How to avoid:** 10-second interval (CONTEXT.md decision) is well within limits. Add exponential backoff on `ratelimited` errors as a defensive measure.

**Warning signs:** Slack API returning `ratelimited` in `chat.update` responses.

### Pitfall 6: Missing `X-Accel-Buffering: no` Header

**What goes wrong:** Nginx (or any reverse proxy in the container stack) buffers SSE responses, causing the client to see no events until the buffer fills or the connection closes.

**Why it happens:** Nginx buffers by default for `text/event-stream` unless told otherwise.

**How to avoid:** Add `'X-Accel-Buffering': 'no'` to the SSE response headers. Also add `'Cache-Control': 'no-cache, no-transform'`.

**Warning signs:** EventSource fires all events at once after job completes rather than as they arrive.

---

## Code Examples

### SSE Route Handler (Next.js App Router)

```javascript
// templates/app/api/jobs/stream/[jobId]/route.js
// Source: Next.js App Router + existing /stream/chat/route.js pattern (lib/chat/api.js)
export { GET } from '../../../../../../lib/jobs/stream-api.js';
```

```javascript
// lib/jobs/stream-api.js — implementation in package
import { auth } from '../auth/index.js';
import { streamManager } from '../tools/stream-manager.js';

export async function GET(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (type, data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
        } catch {}
      };

      const unsub = streamManager.subscribe(jobId, enqueue);

      // Send initial connection event
      enqueue('connected', { jobId, ts: Date.now() });

      request.signal.addEventListener('abort', () => {
        unsub();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

### React SSE Consumer Component

```jsx
// lib/chat/components/job-stream-viewer.jsx
// Source: Browser EventSource API + existing message.jsx component patterns
'use client';

import { useEffect, useRef, useState } from 'react';
import { SpinnerIcon } from './icons.js';

export function JobStreamViewer({ jobId }) {
  const [events, setEvents] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [activity, setActivity] = useState('starting');
  const startRef = useRef(Date.now());
  const esRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/stream/${jobId}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === 'complete') {
        es.close();
        return;
      }
      setActivity(activityLabel(event.type));
      setEvents(prev => [...prev.slice(-20), event]); // keep last 20 events
    };

    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    return () => {
      es.close();
      clearInterval(timer);
    };
  }, [jobId]);

  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs font-mono">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">
        <SpinnerIcon size={12} />
        <span>{activity} — {elapsed}s elapsed</span>
      </div>
      {events.map((ev, i) => <EventLine key={i} event={ev} />)}
    </div>
  );
}
```

### Sensitive Value Scrubber

```javascript
// lib/tools/log-parser.js — applied before any SSE emit
const SECRET_PATTERNS = [
  /\bAGENT_\w+=[^\s]+/g,         // AGENT_GH_TOKEN=abc123
  /\bghp_[A-Za-z0-9]{36,}\b/g,  // GitHub PAT
  /\bsk-[A-Za-z0-9]{40,}\b/g,   // OpenAI keys
  /\bxoxb-[A-Za-z0-9-]+\b/g,    // Slack bot tokens
  /\bxoxp-[A-Za-z0-9-]+\b/g,    // Slack user tokens
  /\bBearer\s+[A-Za-z0-9._-]{20,}/g, // Bearer tokens
];

export function scrubSecrets(text) {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling `/api/jobs/status` for completion | SSE for live progress | Phase 25 | Operators see progress in real time; no 30-60s polling delay |
| Single completion notification | Live semantic events + progress indicator | Phase 25 | Operator can react (cancel) before job completes |
| `collectLogs({follow: false})` — post-hoc | `streamContainerLogs({follow: true})` — concurrent | Phase 25 | Logs available during execution, not just after |

**Deprecated/outdated:**

- `container.logs({follow: false})` in `collectLogs()`: still needed for `waitAndNotify()` fallback and orphan reconciliation. Do not replace — add the streaming variant alongside.

---

## Open Questions

1. **Does current entrypoint emit `--output-format stream-json` JSONL?**
   - What we know: `entrypoint.sh` runs `claude -p "..."` (plain text mode). Container stdout is unstructured text.
   - What's unclear: Should Phase 25 add `--output-format stream-json` to the entrypoint? This would give structured events but change existing behavior.
   - Recommendation: Build the semantic filter to handle BOTH text lines (current) and stream-json JSONL (opt-in via entrypoint env var `CLAUDE_OUTPUT_FORMAT=stream-json`). This avoids a breaking entrypoint change while enabling richer event detection when opted in.

2. **Does `dispatchDockerJob()` need to return the log stream handle, or should the stream manager wire itself?**
   - What we know: `dispatchDockerJob()` currently returns `{container, containerId, dispatchMs}`. The stream wiring could happen there or be called separately by `waitAndNotify()`.
   - What's unclear: Whether to extend `dispatchDockerJob()`'s signature or have `create_job` tool call `streamManager.attach(jobId, container)` separately.
   - Recommendation: Call `streamManager.attach()` from within `waitAndNotify()`, after `container.start()` returns, to keep `dispatchDockerJob()` clean and narrowly scoped.

3. **Where does the React `JobStreamViewer` component get mounted in the chat thread?**
   - What we know: `create_job` tool currently returns JSON with `job_id`. The LangGraph agent responds with a text message containing this.
   - What's unclear: Does the agent inject a special sentinel in its reply text to trigger the viewer, or does the chat component detect `job_id` in tool results and mount automatically?
   - Recommendation: The `create_job` tool response text includes a standardized marker (e.g., `[JOB_STREAM:job-uuid]`). The `message.jsx` renderer detects this marker and renders `<JobStreamViewer jobId={...} />` inline. This keeps the React component out of the LangGraph agent's concerns.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None configured — `"test": "echo \"No tests yet\" && exit 0"` in package.json |
| Config file | None |
| Quick run command | `npm test` (exits 0, no-op) |
| Full suite command | `npm test` (exits 0, no-op) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STRM-01 | SSE endpoint returns text/event-stream | manual-only | Manual: `curl -N /api/jobs/stream/{id}` | ❌ Wave 0 |
| STRM-02 | JSONL parser emits correct semantic types | unit | `node -e "import('./lib/tools/log-parser.js')"` — no test runner | ❌ Wave 0 |
| STRM-03 | Progress event carries elapsed time | manual-only | Browser inspect during live job | ❌ Wave 0 |
| STRM-04 | cancel_job stops container and preserves branch | manual-only | Trigger via conversational command | ❌ Wave 0 |
| STRM-05 | file-change events carry path and operation | unit | Requires test runner | ❌ Wave 0 |
| STRM-06 | Slack message edited in-place (not spammed) | manual-only | Observe Slack during live job | ❌ Wave 0 |
| STRM-07 | No memory leak on tab close | manual-only | Docker socket monitor: `ss -p | grep docker` | ❌ Wave 0 |
| STRM-08 | Secrets scrubbed from stream output | unit | `node -e "..."` inline test for scrubRegex | ❌ Wave 0 |

**Note:** With `"test": "echo No tests yet && exit 0"`, no test infrastructure exists. All STRM requirements are best validated manually during job execution. Unit tests for the log parser and secret scrubber can be run as inline `node -e` scripts without a test framework.

### Sampling Rate

- **Per task commit:** `npm test` (no-op; manual smoke test instead)
- **Per wave merge:** Manual: trigger a real job, verify SSE events appear in browser
- **Phase gate:** STRM-01, STRM-07, STRM-08 smoke-passed manually before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] No test runner installed — consider `node:test` (Node.js built-in, zero deps) for STRM-02, STRM-05, STRM-08 unit tests
- [ ] `tests/log-parser.test.js` — STRM-02, STRM-05
- [ ] `tests/scrub-secrets.test.js` — STRM-08

If test infrastructure is not added, mark STRM-02, STRM-05, STRM-08 as "validated via manual `node -e` inline script" in verification.

---

## Sources

### Primary (HIGH confidence)

- Dockerode `container.logs()` — observed in `lib/tools/docker.js:158-194` (follow:false variant, same API)
- `docker.modem.demuxStream()` — used in `lib/tools/docker.js:183`
- `globalThis.__clawforge_docker` singleton pattern — `lib/tools/docker.js:20-21`
- `waitAndNotify()` fire-and-forget structure — `lib/ai/tools.js:147-199`
- `notifyWorkspaceEvent()` Slack routing — `lib/tools/docker.js:924-983`
- Next.js App Router ReadableStream SSE — https://www.pedroalonso.net/blog/sse-nextjs-real-time-notifications/
- Claude Code CLI stream-json event types — https://platform.claude.com/docs/en/agent-sdk/streaming-output (fetched 2026-03-12)
- Claude Code CLI reference — https://code.claude.com/docs/en/cli-reference (fetched 2026-03-12)

### Secondary (MEDIUM confidence)

- Slack `chat.update` API — https://docs.slack.dev/reference/methods/chat.update/ (verified against @slack/web-api already in use)
- Dockerode follow:true behavior + memory leak — https://github.com/apocas/dockerode/issues/166 (WebSearch, consistent with codebase usage)
- Next.js SSE abort handling — https://github.com/vercel/next.js/discussions/61972 (WebSearch, verified against App Router request.signal pattern)

### Tertiary (LOW confidence)

- Claude Code stream-json event type enumeration — partially verified via https://github.com/anthropics/claude-code/issues/24596 (issue closed NOT_PLANNED; event types confirmed by Agent SDK docs but CLI-specific JSONL format not exhaustively documented)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all dependencies already installed; patterns copied from existing codebase
- Architecture: HIGH — stream manager globalThis pattern mirrors existing docker.js pattern exactly
- Claude Code JSONL event types: MEDIUM — documented via Agent SDK (official), but CLI container stdout format depends on entrypoint configuration (unverified)
- Pitfalls: HIGH — dockerode memory leak and nginx buffering are well-documented issues verified against codebase

**Research date:** 2026-03-12
**Valid until:** 2026-06-12 (dockerode and Next.js APIs are stable; Claude Code CLI output format could change)
