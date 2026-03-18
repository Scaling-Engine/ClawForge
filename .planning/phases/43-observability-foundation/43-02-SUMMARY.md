---
phase: 43
plan: "02"
subsystem: observability
tags: [sentry, error-capture, jsonl, job-logging, tdd]
dependency_graph:
  requires: []
  provides: [appendJobEvent, Sentry-server-init, Sentry-client-init, onRequestError-hook]
  affects: [config/instrumentation.js, lib/observability/job-logger.js]
tech_stack:
  added: ["@sentry/nextjs@^10.44.0"]
  patterns: [JSONL-file-logging, Sentry-conditional-init, onRequestError-hook, TDD-red-green]
key_files:
  created:
    - lib/observability/job-logger.js
    - test/observability/test-job-logs.js
    - config/sentry.server.config.js
    - config/sentry.client.config.js
  modified:
    - config/instrumentation.js
    - .env.example
    - package.json
decisions:
  - "appendJobEvent accepts optional baseDir parameter for testability (avoids mocking logsDir import)"
  - "No instrumentationHook flag needed — Next.js >=15.3 auto-detects instrumentation.js"
  - "Sentry init is guarded by !!process.env.SENTRY_DSN — zero network calls when DSN absent"
metrics:
  duration: "2 minutes"
  completed: "2026-03-17"
  tasks_completed: 2
  files_created: 4
  files_modified: 3
---

# Phase 43 Plan 02: Sentry Error Capture and JSONL Job Logging Summary

**One-liner:** Sentry server+client error capture (disabled when DSN absent) plus filesystem JSONL job logging that bypasses SQLite WAL contention.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 (RED) | Failing tests for JSONL job logger | 9bf58a5 | test/observability/test-job-logs.js |
| 1 (GREEN) | Implement appendJobEvent with optional baseDir | af9dc1d | lib/observability/job-logger.js |
| 2 | Sentry configs, onRequestError hook, env vars | e6c9512 | config/sentry.*.config.js, config/instrumentation.js, .env.example |

## What Was Built

### JSONL Job Logger (`lib/observability/job-logger.js`)

`appendJobEvent(jobId, event, baseDir?)` writes one JSON line per call to `logs/jobs/{jobId}.jsonl`. Each line is `{"t": <timestamp>, "jobId": "...", ...event}`. The function:
- Creates `logs/jobs/` directory if it doesn't exist
- Uses `fs.appendFileSync` (synchronous, atomic per-call)
- Never throws — job execution is not affected by logging errors
- Accepts optional `baseDir` parameter (default: `logsDir` from `lib/paths.js`) for testability without mocking

Test coverage: 4 passing tests covering file creation, JSON validity, 50-line accumulation, and silent error handling.

### Sentry Integration

**Server config** (`config/sentry.server.config.js`): Calls `Sentry.init()` with `enabled: !!process.env.SENTRY_DSN`. Production uses 10% trace sampling; dev uses 100%.

**Client config** (`config/sentry.client.config.js`): Calls `Sentry.init()` with `enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN`.

**onRequestError hook** (`config/instrumentation.js`): Module-level named export (separate from `register()`) that calls `Sentry.captureRequestError()`. Next.js automatically calls this for unhandled Server Component and API route errors.

**No `instrumentationHook` flag** in `templates/next.config.mjs` — Next.js >= 15.3 auto-detects the instrumentation file.

## Verification Results

- `node --test test/observability/test-job-logs.js` — 4/4 pass
- `npm run build` — exits 0, no regressions
- `grep "onRequestError" config/instrumentation.js` — export present at module level
- `grep "appendJobEvent" lib/observability/job-logger.js` — function exported
- `grep "SENTRY_DSN" .env.example` — both DSN vars documented

## Deviations from Plan

None — plan executed exactly as written. The optional `baseDir` parameter approach was the preferred testability strategy specified in the plan's action section.
