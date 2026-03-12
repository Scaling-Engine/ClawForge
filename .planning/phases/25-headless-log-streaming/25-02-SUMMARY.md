---
phase: 25-headless-log-streaming
plan: "02"
subsystem: streaming
tags: [sse, docker, log-streaming, cancel-job, langgraph]
dependency_graph:
  requires: ["25-01"]
  provides: ["streaming-backbone", "cancel-job-tool", "sse-endpoint"]
  affects: ["lib/tools/docker.js", "lib/ai/tools.js", "lib/ai/agent.js"]
tech_stack:
  added: []
  patterns: ["AbortController lifecycle", "Server-Sent Events", "Docker modem.demuxStream", "ReadableStream controller"]
key_files:
  created:
    - lib/jobs/stream-api.js
    - templates/app/api/jobs/stream/[jobId]/route.js
  modified:
    - lib/tools/docker.js
    - lib/ai/tools.js
    - lib/ai/agent.js
decisions:
  - "streamAbort.abort() called in waitAndNotify after container exits to ensure stream cleanup even if 'end' event fires late"
  - "cancelJobTool injects confirmation via addToThread() per CONTEXT.md decision so agent has memory of the cancellation"
  - "getDocker() export added to docker.js to give tools.js access to the dockerode instance without circular imports"
metrics:
  duration: "~30 minutes"
  completed: "2026-03-12"
  tasks_completed: 2
  files_modified: 5
---

# Phase 25 Plan 02: Docker Log Streaming + SSE Endpoint Summary

SSE backbone wired end-to-end: Docker follow-mode log stream parses to semantic events via streamManager, exposed at `/api/jobs/stream/[jobId]` with auth, and cancel_job LangGraph tool added with clean AbortController lifecycle.

## What Was Built

### Task 1: streamContainerLogs + cancelJobTool

**lib/tools/docker.js** — Two new exports:

- `getDocker()` — returns the dockerode client instance so `cancelJobTool` in tools.js can call `docker.getContainer()` without a circular import
- `streamContainerLogs(container, jobId, signal)` — attaches to a running container's follow-mode log stream, demuxes stdout/stderr via `docker.modem.demuxStream()` into two PassThrough streams, buffers stdout for line-by-line processing, passes each complete line through `parseLineToSemanticEvent()`, and emits non-null results via `streamManager.emit()`. The cleanup function destroys all three streams. AbortSignal wires cancellation. On `logStream.on('end')`, flushes remaining buffer then calls `streamManager.complete()`.

**lib/ai/tools.js** — Three changes:

1. Added imports: `streamContainerLogs`, `getDocker` from docker.js; `streamManager` from stream-manager.js; consolidated `getDockerJob` + `markDockerJobNotified` from docker-jobs.js
2. Wired `streamContainerLogs` into `createJobTool`: after `dispatchDockerJob()` returns, creates `AbortController`, calls `streamContainerLogs(container, job_id, signal)` fire-and-forget, passes `streamAbort` to `waitAndNotify()`
3. Modified `waitAndNotify()` to accept `streamAbort` param and call `streamAbort?.abort()` immediately after `waitForContainer()` resolves — ensures stream cleanup even if Docker's `end` event fires with a delay
4. Added `cancelJobTool`: looks up container ID from DB, calls `container.stop({ t: 10 })` (SIGTERM + 10s grace), calls `streamManager.cancel(job_id)` to emit 'cancelled' to SSE subscribers, calls `addToThread()` to inject cancellation confirmation into LangGraph memory

**lib/ai/agent.js** — Added `cancelJobTool` to tools array.

### Task 2: SSE Endpoint

**lib/jobs/stream-api.js** — GET handler:
- Auth check via `auth()` from NextAuth (returns 401 if no session)
- Extracts `jobId` from `await params`
- Creates `ReadableStream` with `start(controller)` that sends `connected` event, guards against inactive jobs, subscribes via `streamManager.subscribe()`, and wires `request.signal` abort to unsubscribe + close controller
- Returns `Response` with `text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`

**templates/app/api/jobs/stream/[jobId]/route.js** — Single-line re-export of `GET` from `lib/jobs/stream-api.js`.

## Cleanup Paths (All Covered)

| Trigger | Path |
|---------|------|
| Container exits normally | `logStream.on('end')` → `streamManager.complete()` |
| Container exits (waitAndNotify) | `streamAbort.abort()` → `streamManager.cancel()` (backup) |
| Operator cancels via tool | `container.stop()` → `streamManager.cancel()` |
| Browser disconnects | `request.signal abort` → `unsub()` + `controller.close()` |
| Stream error | `logStream.on('error')` → `streamManager.complete()` |

## Decisions Made

- `streamAbort.abort()` in `waitAndNotify` is a backup cleanup — the Docker `end` event is the primary path, but container exit can happen before the log stream drains, so the abort ensures no orphaned listeners
- `cancelJobTool` uses `container.stop({ t: 10 })` not `kill()` — gives the Claude Code CLI process 10 seconds to flush buffers and handle SIGTERM gracefully
- `getDocker()` export instead of re-exporting the `docker` variable directly — keeps the same pattern as `isDockerAvailable()` and avoids exporting mutable module state

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files created/modified:
- lib/tools/docker.js — modified (streamContainerLogs, getDocker added)
- lib/ai/tools.js — modified (cancelJobTool, streaming wiring)
- lib/ai/agent.js — modified (cancelJobTool registered)
- lib/jobs/stream-api.js — created
- templates/app/api/jobs/stream/[jobId]/route.js — created
