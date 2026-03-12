---
phase: 25-headless-log-streaming
plan: 01
subsystem: infra
tags: [streaming, sse, log-parsing, docker, security, globalThis]

# Dependency graph
requires: []
provides:
  - "lib/tools/stream-manager.js — globalThis singleton tracking active Docker log streams per job"
  - "lib/tools/log-parser.js — Claude Code JSONL/text line to typed semantic event mapper with secret scrubbing"
affects: [25-02, 25-03, 25-04, 25-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "globalThis singleton for Next.js hot-reload resilience (globalThis.__clawforge_streams)"
    - "Subscriber isolation: per-subscriber try/catch in emit() prevents one broken consumer halting others"
    - "Defense-in-depth secret scrubbing: rawLine scrubbed before parsing, all emitted event string fields scrubbed again"
    - "Null-return suppression: parseLineToSemanticEvent returns null for noise (stream_event, system, blank lines)"

key-files:
  created:
    - lib/tools/stream-manager.js
    - lib/tools/log-parser.js
  modified: []

key-decisions:
  - "globalThis.__clawforge_streams map persists across Next.js module hot-reloads (same pattern as __clawforge_docker)"
  - "Log parser handles both structured JSONL and plain-text stdout — current entrypoint uses plain-text, future --output-format stream-json is also supported"
  - "stream_event and system JSONL types suppressed server-side to prevent SSE consumer noise"
  - "Secret scrubbing runs on rawLine first (pre-parse), then on all string fields in emitted events (post-parse)"

patterns-established:
  - "Stream manager register/subscribe/emit/complete/cancel lifecycle: all callers must call register() before emit(), complete()/cancel() auto-cleanup"
  - "logCleanup callback: callers pass a function that calls .destroy() on the Docker log stream; stream-manager calls it on complete/cancel"

requirements-completed: [STRM-07, STRM-08, STRM-02, STRM-05]

# Metrics
duration: 2min
completed: 2026-03-12
---

# Phase 25 Plan 01: Stream Infrastructure Summary

**In-memory Docker log stream manager with globalThis hot-reload resilience and a dual-format (JSONL + plain-text) Claude Code log parser with regex-based secret scrubbing**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-12T14:39:28Z
- **Completed:** 2026-03-12T14:41:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Stream manager singleton (`globalThis.__clawforge_streams`) with full register/subscribe/emit/complete/cancel lifecycle
- Log parser handles both Claude Code JSONL and plain-text stdout without crashing on either
- Secret scrubber regex patterns cover GitHub PATs (ghp_), OpenAI keys (sk-), Slack tokens (xoxb-/xoxp-), Bearer tokens, and AGENT_* env var assignments
- All emitted event string fields double-scrubbed for defense in depth

## Task Commits

1. **Task 1: Create stream manager singleton** - `07f8855` (feat)
2. **Task 2: Create log parser with semantic event filtering and secret scrubbing** - `71d50e3` (feat)

## Files Created/Modified

- `lib/tools/stream-manager.js` — In-memory singleton (globalThis) tracking active Docker log streams; 8 exported methods covering stream lifecycle and Slack edit-in-place metadata
- `lib/tools/log-parser.js` — Maps raw container stdout to typed semantic events (`file-change`, `bash-output`, `decision`, `progress`, `error`, `complete`); suppresses noise (`stream_event`, `system`); scrubs secrets via 6 regex patterns

## Decisions Made

- globalThis singleton pattern reused from docker.js lines 18-21 — ensures stream map survives Next.js hot-reloads without re-initialization
- Parser handles both JSONL and plain-text stdout: current `claude -p` produces plain-text, future `--output-format stream-json` produces JSONL — both paths covered
- `stream_event` and `system` JSONL types explicitly suppressed: these are high-frequency noise fragments that would flood SSE consumers

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Shell `!` escaping in `node -e` one-liner verification commands — resolved by writing test scripts as `.mjs` files instead. Both test files removed after verification.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `streamManager` and `parseLineToSemanticEvent` are ready for consumption by plan 25-02 (SSE endpoint) and plan 25-03 (Docker streaming integration)
- Slack edit-in-place metadata hooks (`setSlackStatus`/`getSlackStatus`) are ready for plan 25-03 Slack streaming
- No blockers

---
*Phase: 25-headless-log-streaming*
*Completed: 2026-03-12*
