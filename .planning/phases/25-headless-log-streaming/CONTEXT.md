# Phase 25 Context: Headless Log Streaming

**Created:** 2026-03-12
**Phase Goal:** Operators can watch live job progress in chat instead of waiting for a completion notification
**Requirements:** STRM-01, STRM-02, STRM-03, STRM-04, STRM-05, STRM-06, STRM-07, STRM-08

## Decisions

### Stream Transport: SSE via Next.js API Route
- **Decision:** SSE (Server-Sent Events) over ReadableStream, not WebSocket
- **Why:** Unidirectional (server→client only), works through standard API routes without custom server wrapper. WebSocket infrastructure exists for terminal (v1.5) but SSE is simpler for log streaming.
- **Integration point:** New `/api/jobs/stream/[jobId]` route returning `ReadableStream` with `text/event-stream` content type

### Log Source: Docker container.logs({follow: true})
- **Decision:** Attach to running container via `container.logs({follow: true})` with `docker.modem.demuxStream()` for stdout/stderr separation
- **Where:** Extend `lib/tools/docker.js` — current `collectLogs()` (line 158) uses `follow: false` (post-hoc). New streaming function runs concurrently with `waitForContainer()`
- **Lifecycle:** Stream listener created after `container.start()` in `dispatchDockerJob()`, cleaned up on container exit or consumer disconnect

### Semantic Event Filtering
- **Decision:** Parse raw Claude Code JSONL output server-side before forwarding to SSE consumers
- **Semantic events to surface:** File modifications (create/edit/delete), bash command outputs, tool calls with results, key decisions/reasoning, errors
- **Suppress:** Raw assistant message chunks, system prompt content, MCP handshake noise, duplicate content
- **Format:** Structured SSE events: `{type: 'file-change'|'bash-output'|'tool-result'|'decision'|'progress'|'error', ...}`

### Progress Indicator
- **Decision:** Elapsed time counter + current activity type (e.g., "editing files", "running commands")
- **Rendering:** Inline in chat thread, updates via SSE — single message that gets replaced/updated, not new messages per update
- **Derived from:** Semantic event types — last event type determines activity label

### Cancel Job
- **Decision:** LangGraph tool `cancel_job` sends `container.stop()` (SIGTERM → 10s grace → SIGKILL)
- **Branch preservation:** Container's git state is already committed by Claude Code's auto-commit behavior; branch remains for inspection
- **Chat feedback:** Cancellation confirmation message injected via `addToThread()` with final log summary

### Slack Streaming (STRM-06)
- **Decision:** Single Slack message posted at job start, edited every 10s with latest status via `chat.update` API
- **Why:** Avoids message spam. Thread replies only for completion/failure/cancellation.
- **Pattern:** Reuse `notifyWorkspaceEvent()` routing but with an "update existing message" mode

### Memory Safety (STRM-07)
- **Decision:** AbortController per SSE connection; container event listener removed on abort signal
- **Cleanup triggers:** Client disconnect (request abort), container exit, job timeout
- **No orphaned streams:** Docker log stream `.destroy()` called in all cleanup paths

### Sensitive Value Filtering (STRM-08)
- **Decision:** Regex-based scrubbing of tokens/keys/secrets before SSE emission
- **Patterns:** `AGENT_*` env var values, GitHub tokens, API keys matching common patterns (sk-*, ghp_*, xoxb-*, etc.)
- **Defense in depth:** Claude Code CLI already filters `AGENT_` prefixed secrets; this is a second pass on the streaming layer

## Code Context

### Reusable Patterns
- `chatStream()` in `lib/ai/index.js:108` — async generator yielding `{type, ...}` structured events. Pattern for SSE event shape.
- `addToThread()` in `lib/ai/index.js:288` — inject messages into LangGraph memory. Used for streaming status persistence.
- `notifyWorkspaceEvent()` in `lib/tools/docker.js:924` — routes events to Slack/Telegram/web. Extend for streaming updates.
- `collectLogs()` in `lib/tools/docker.js:158` — existing Docker log demux. Adapt to `follow: true` mode.
- `dispatchDockerJob()` in `lib/tools/docker.js:94` — container lifecycle. Streaming attaches after `container.start()`.

### New Infrastructure Needed
- SSE endpoint (`/api/jobs/stream/[jobId]`)
- Log parser/filter (JSONL → semantic events)
- Stream manager (tracks active streams, handles cleanup)
- Chat stream viewer component (renders SSE events inline in web chat)
- Slack message updater (edit-in-place pattern)

## Deferred Ideas
None captured — user chose to proceed directly to planning.
