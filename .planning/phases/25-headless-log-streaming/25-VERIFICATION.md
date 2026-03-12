---
phase: 25-headless-log-streaming
verified: 2026-03-12T15:30:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Trigger a job from web chat and observe the streaming viewer"
    expected: "After create_job completes, a JobStreamViewer appears inline in the chat thread. Spinner rotates, elapsed timer increments, semantic events appear (file changes, bash commands, progress lines) as the container executes. On completion, spinner changes to checkmark and final elapsed time is shown."
    why_human: "EventSource connection and real-time DOM updates cannot be verified programmatically without a running Docker container and browser session"
  - test: "Close browser tab mid-job and check for orphaned listeners"
    expected: "After closing the tab, Docker log stream is destroyed. No accumulated memory on repeated job runs. Verify by inspecting process list or running multiple jobs then checking server memory."
    why_human: "AbortSignal propagation and actual resource release requires live browser + server session"
  - test: "Say 'cancel the job' to trigger cancel_job tool during a running job"
    expected: "Container stops (SIGTERM, 10s grace). JobStreamViewer in chat shows 'Cancelled after Xm Ys'. Branch is preserved and inspectable via git. Agent thread receives a confirmation message."
    why_human: "Requires live Docker container and conversational interaction to verify end-to-end"
  - test: "If Slack is configured: trigger a job from Slack and watch the status message"
    expected: "A single status message appears in the Slack thread at job start. It is edited in-place every 10s showing current activity and elapsed time (not new messages per update). On completion, a final result message is posted as a thread reply."
    why_human: "Requires live Slack integration and a real job run to observe chat.update behavior"
---

# Phase 25: Headless Log Streaming — Verification Report

**Phase Goal:** Operators can watch live job progress in chat instead of waiting for a completion notification
**Verified:** 2026-03-12T15:30:00Z
**Status:** human_needed (all automated checks passed; live pipeline requires human confirmation)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator sees log lines appearing in the chat thread in real time as a job container executes — no reload required | ? HUMAN NEEDED | `JobStreamViewer` uses `EventSource` connecting to `/api/jobs/stream/${jobId}`, subscribed via `streamManager.subscribe`. Component and wiring verified. Live runtime needs human confirmation. |
| 2 | Log output shows only semantic events (file saves, bash outputs, key decisions); raw JSONL lines are never surfaced to chat | VERIFIED | `parseLineToSemanticEvent` explicitly suppresses `stream_event` and `system` types, and all unstructured noise via `return null` fallthrough. Only `file-change`, `bash-output`, `decision`, `progress`, `error`, `complete` pass. |
| 3 | A progress indicator with elapsed time is visible in chat for the duration of a running job | ? HUMAN NEEDED | `JobStreamViewer` has `setInterval` timer updating `elapsed` state every 1s, renders as `Xm Ys` in header row with `SpinnerIcon`. Visual confirmation requires running UI. |
| 4 | Operator can say "cancel the job" and the running container stops cleanly; the branch is preserved for inspection | ? HUMAN NEEDED | `cancelJobTool` calls `container.stop({ t: 10 })` then `streamManager.cancel(job_id)` then `addToThread()`. Registered in `agent.js` tools array. Functional wiring verified; actual container stop requires human test. |
| 5 | Closing the browser tab during a job releases the Docker log stream with no orphaned listener; no memory leak observed after multiple job runs | ? HUMAN NEEDED | `request.signal.addEventListener('abort', ...)` in `stream-api.js` calls `unsub()` + `controller.close()`. `streamAbort.abort()` called in `waitAndNotify` after container exits. Wiring verified; actual memory behavior requires human observation. |

**Score:** 5/5 truths have verified code paths. 4/5 require human confirmation for live runtime behavior.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/tools/stream-manager.js` | In-memory stream manager singleton via globalThis | VERIFIED | 151 lines. All 8 methods present: `register`, `subscribe`, `emit`, `complete`, `cancel`, `setSlackStatus`, `getSlackStatus`, `isActive`. `globalThis.__clawforge_streams` guard prevents re-init on hot reload. |
| `lib/tools/log-parser.js` | JSONL/text line to semantic event parser + secret scrubber | VERIFIED | 174 lines. `parseLineToSemanticEvent` and `scrubSecrets` both exported. All 6 secret patterns present (AGENT_*, ghp_, sk-, xoxb-, xoxp-, Bearer). Handles both JSONL and plain-text. Noise suppressed (stream_event, system, blank lines). |
| `lib/tools/docker.js` | `streamContainerLogs()` for follow-mode Docker log streaming | VERIFIED | Both `streamContainerLogs` and `getDocker` present. Imports `streamManager` and `parseLineToSemanticEvent`. Registers stream on startup, emits parsed events, completes on `end` event, handles error path. |
| `lib/ai/tools.js` | `cancel_job` LangGraph tool + streaming wiring in `waitAndNotify` | VERIFIED | `cancelJobTool` defined at line 638 and exported at line 688. `streamContainerLogs` called after `dispatchDockerJob` with `AbortController`. `streamAbort.abort()` called after `waitForContainer` resolves. Slack `chat.update` interval with `_unsub` cleanup. |
| `lib/ai/agent.js` | `cancelJobTool` registered in LangGraph tools array | VERIFIED | `cancelJobTool` imported and added to `tools` array at line 19. |
| `lib/jobs/stream-api.js` | SSE route handler implementation | VERIFIED | 85 lines. Auth check, `connected` event, `isActive` guard, `streamManager.subscribe`, `request.signal` abort cleanup. Correct SSE headers including `X-Accel-Buffering: no`. |
| `templates/app/api/jobs/stream/[jobId]/route.js` | Thin re-export wiring SSE route into Next.js App Router | VERIFIED | Single-line re-export: `export { GET } from '../../../../../../lib/jobs/stream-api.js'`. |
| `lib/chat/components/job-stream-viewer.jsx` | React component that consumes SSE events and renders live job progress | VERIFIED | 303 lines (exceeds 60-line minimum). `'use client'`, `EventSource`, `useState`, `useEffect`, `useRef` all present. Per-type event rendering, elapsed timer, spinner/checkmark/cancel icons. Auto-scroll via `bottomRef.scrollIntoView`. Cleanup: `es.close()` + `clearInterval(timer)` in useEffect return. |
| `lib/chat/components/message.jsx` | Updated to detect `[JOB_STREAM:uuid]` marker and mount JobStreamViewer | VERIFIED | `JOB_STREAM_RE` regex at line 74. `renderTextWithStreamViewer` helper at line 77. `JobStreamViewer` imported at line 7. |
| `lib/chat/components/tool-call.jsx` | Updated with `cancel_job` display name | VERIFIED | `cancel_job: 'Cancel Job'` present at line 11. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/tools/stream-manager.js` | `globalThis.__clawforge_streams` | `globalThis` singleton pattern | WIRED | `globalThis.__clawforge_streams` guard on init confirmed at lines 12-14. |
| `lib/tools/docker.js` | `lib/tools/stream-manager.js` | `streamContainerLogs` calls `streamManager.register` and `.emit` | WIRED | Lines 234, 236, 238, 254, 259, 274, 288, 299, 303 in docker.js. |
| `lib/tools/docker.js` | `lib/tools/log-parser.js` | Each log line through `parseLineToSemanticEvent` before emit | WIRED | `parseLineToSemanticEvent` imported and called at lines 232, 272, 286, 297 in docker.js. |
| `lib/ai/tools.js` | `lib/tools/stream-manager.js` | `streamManager.cancel` in `cancelJobTool`, Slack update loop | WIRED | `streamManager` imported at line 12. Used at lines 181, 185, 193, 213, 312, 660. |
| `lib/ai/tools.js` | `lib/tools/docker.js` | `streamContainerLogs` called after `dispatchDockerJob` | WIRED | `streamContainerLogs` imported at line 11, called at line 107 with `streamAbort.signal`. |
| `lib/ai/tools.js` | `lib/ai/index.js` | `cancelJobTool` calls `addToThread()` for cancellation confirmation | WIRED | `addToThread` imported at line 15. Used in `cancelJobTool` at line 666. |
| `lib/jobs/stream-api.js` | `lib/tools/stream-manager.js` | SSE route subscribes via `streamManager.subscribe` | WIRED | `streamManager` imported at line 18. `streamManager.subscribe(jobId, enqueue)` at line 67. |
| `templates/app/api/jobs/stream/[jobId]/route.js` | `lib/jobs/stream-api.js` | re-export `GET` handler | WIRED | `export { GET } from '../../../../../../lib/jobs/stream-api.js'` confirmed. |
| `lib/chat/components/job-stream-viewer.jsx` | `/api/jobs/stream/[jobId]` | `EventSource` connecting to SSE endpoint | WIRED | `new EventSource(\`/api/jobs/stream/${jobId}\`)` at line 192. |
| `lib/chat/components/message.jsx` | `lib/chat/components/job-stream-viewer.jsx` | `JOB_STREAM` marker regex triggers component mount | WIRED | `JOB_STREAM_RE` regex at line 74, `<JobStreamViewer jobId={jobId} />` at line 100. |
| `lib/ai/tools.js` | `@slack/web-api chat.update` | Slack edit-in-place in `waitAndNotify` | WIRED | `slack.chat.update` at lines 198, 315. `slackUpdateInterval` with 10s interval at line 193. `_unsub` cleanup at lines 230, 354. |

---

## Requirements Coverage

All 8 requirement IDs were claimed across the three plans. Requirements.md confirms all 8 are mapped to Phase 25.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| STRM-01 | 25-02, 25-03 | Operator sees live log output in web chat thread as job executes | VERIFIED (human confirm) | `JobStreamViewer` + `EventSource` + `streamManager.subscribe` wired end-to-end |
| STRM-02 | 25-01, 25-02 | Log filtered to semantic events; raw JSONL suppressed | VERIFIED | `parseLineToSemanticEvent` suppresses `stream_event`, `system`, blank lines; only typed events pass |
| STRM-03 | 25-03 | Progress indicator with elapsed time visible during job | VERIFIED (human confirm) | `setInterval` timer + `formatElapsed` render in `JobStreamViewer` header row |
| STRM-04 | 25-02 | Operator can cancel running job via conversational command | VERIFIED (human confirm) | `cancelJobTool` registered in agent, calls `container.stop({ t: 10 })` + `streamManager.cancel()` |
| STRM-05 | 25-01, 25-02 | Log stream shows changed files with diff highlighting data (path + operation) | VERIFIED | `file-change` events carry `{ path, operation }`. UI renders green/yellow based on operation type. Note: `Write` tool maps to `operation: 'write'` which renders as yellow (edit), not green (create) — minor UI imprecision, not a blocker. |
| STRM-06 | 25-03 | Slack receives single auto-updating message every 10s | VERIFIED (human confirm) | `chat.update` with `setInterval(10_000)` in `waitAndNotify`. Initial `postMessage`, then edits only. |
| STRM-07 | 25-01, 25-02 | Browser disconnect releases resources; no orphaned Docker log streams | VERIFIED (human confirm) | `request.signal abort` → `unsub()` + `controller.close()`. `streamAbort.abort()` after container exit. |
| STRM-08 | 25-01 | Sensitive values never forwarded in log stream output | VERIFIED | `scrubSecrets()` runs on raw line before parsing (defense in depth) and on all emitted string fields. 6 regex patterns cover AGENT_*, ghp_, sk-, xoxb-, xoxp-, Bearer. |

**No orphaned requirements detected.** All 8 STRM IDs from REQUIREMENTS.md are claimed and accounted for.

---

## Anti-Patterns Found

No TODO, FIXME, HACK, or PLACEHOLDER comments found in any of the 7 new/modified files.
No stub return values (`return null`, `return {}`, `return []` as implementations).
No empty handlers or console.log-only implementations.

---

## Human Verification Required

### 1. Live Streaming in Web Chat

**Test:** Open web chat, trigger a job (e.g., "create a README in [repo]"), and watch the chat thread after the create_job tool call resolves.
**Expected:** A `JobStreamViewer` block appears inline. Spinner rotates. Elapsed timer counts up. Semantic events appear in the scrollable list (file changes, bash commands, progress milestones). On job completion, spinner becomes a checkmark and "Completed in Xm Ys" is shown.
**Why human:** Requires a live Docker container running Claude Code CLI and a browser session with an active EventSource connection.

### 2. Browser Tab Close / No Orphaned Listener

**Test:** Start a job, then close the browser tab mid-execution. Wait for the job to finish normally. Repeat 3-4 times.
**Expected:** No memory growth on the Next.js server. No lingering `__clawforge_streams` entries after jobs complete. `docker ps` shows containers exit cleanly.
**Why human:** AbortSignal propagation and actual resource release behavior requires live observation; can't be verified by static analysis.

### 3. Cancel Job via Conversation

**Test:** Start a job, then send "cancel the job" to the agent. Observe the response and the JobStreamViewer.
**Expected:** Agent calls `cancel_job` tool. Container stops (SIGTERM, 10s grace). JobStreamViewer shows "Cancelled after Xm Ys". The job branch still exists in git with any committed work preserved. An agent confirmation message appears in thread.
**Why human:** Requires live container interaction and conversational trigger.

### 4. Slack Edit-in-Place (If Slack Configured)

**Test:** Trigger a job from a Slack channel. Watch the thread for status messages.
**Expected:** Exactly ONE status message appears in the thread at job start. That message is edited in-place every ~10s with current activity and elapsed time — no new messages per update. On completion, the status message shows the final result and a detailed reply is posted.
**Why human:** Requires live Slack bot token, configured instance, and a job with duration > 10s.

---

## Gaps Summary

No gaps found. All artifacts exist, are substantive (not stubs), and are wired end-to-end. All 10 key links verified. All 8 requirements have implementation evidence. No anti-patterns detected. All 9 commits documented in SUMMARYs exist in git history.

The phase goal is architecturally achieved. Live runtime verification is recommended via the human tests above before marking this phase fully shipped.

---

_Verified: 2026-03-12T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
