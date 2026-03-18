---
phase: 43-observability-foundation
plan: 01
subsystem: observability
tags: [pino, error-persistence, drizzle, sqlite, tdd]
dependency_graph:
  requires: []
  provides: [lib/observability/logger.js, lib/observability/errors.js, lib/db/error-log.js, errorLog-table]
  affects: [api/index.js, config/instrumentation.js]
tech_stack:
  added: [pino@^10.3.1, pino-http]
  patterns: [structured-JSON-logging, captureError-pattern, drizzle-sqlite-table]
key_files:
  created:
    - lib/observability/logger.js
    - lib/observability/errors.js
    - lib/db/error-log.js
    - drizzle/0008_worried_puma.sql
    - test/observability/test-logger.js
    - test/observability/test-errors.js
  modified:
    - lib/db/schema.js
    - api/index.js
    - config/instrumentation.js
    - package.json
decisions:
  - "pruneOldErrors(days=0) uses unconditional DELETE (no WHERE clause) to handle same-millisecond insertions reliably"
  - "sanitizeMeta allowlist: route, jobId, threadId, platform, statusCode, code — never message text or keys"
  - "captureError wraps DB write in try/catch — stdout log always fires even when DB is down"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-17"
  tasks_completed: 2
  files_created: 6
  files_modified: 4
---

# Phase 43 Plan 01: Observability Foundation Summary

**One-liner:** Pino structured logging + SQLite error_log table with captureError() wired into Telegram/Slack handlers and 30-day daily pruning cron.

## What Was Built

### Task 1: Error persistence schema, DB helpers, captureError, pino logger (TDD)

- **`lib/db/schema.js`** — Added `errorLog` Drizzle table with 8 columns: id, context, severity, message, stack, metadata (JSON string), instance_name, created_at
- **`lib/db/error-log.js`** — Four exports: `writeError()`, `getRecentErrorCount(hours)`, `getLastErrorAt()`, `pruneOldErrors(days)`
- **`lib/observability/logger.js`** — Pino singleton (default export) + `log(level, context, message, meta)` named export. Development mode uses pino-pretty; production emits raw JSON to stdout
- **`lib/observability/errors.js`** — `captureError(context, err, meta)`: emits to stdout via pino then persists sanitized row to DB. `sanitizeMeta()` enforces allowlist of 6 safe keys
- **`drizzle/0008_worried_puma.sql`** — Migration adding error_log table

### Task 2: Wire captureError and pruning cron

- **`api/index.js`** — Replaced two silent `console.error()` handlers with `captureError('channel', err, { platform, threadId })` for both Telegram and Slack message handlers
- **`config/instrumentation.js`** — Added daily `0 3 * * *` cron to `pruneOldErrors(30)`. Replaced `console.log('ClawForge initialized')` with structured `log('info', 'startup', 'ClawForge initialized')`

## Tests

12 tests, all passing via `node --test test/observability/test-logger.js test/observability/test-errors.js`:

- logger: imports, log() does not throw, accepts metadata
- writeError: inserts row, accepts optional fields
- getLastErrorAt: returns max timestamp, returns null when empty
- pruneOldErrors: prune(0) deletes all, prune(30) keeps recent rows
- captureError: inserts row, never throws
- sanitizeMeta: strips non-allowlisted keys (messageText, apiKey stripped; platform, route, jobId kept)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pruneOldErrors(0) didn't delete rows inserted at the same millisecond**

- **Found during:** Task 1, TDD GREEN phase
- **Issue:** `DELETE WHERE created_at < Date.now() - 0` leaves rows inserted at `Date.now()` because the row's timestamp equals (not less than) the cutoff
- **Fix:** When `days <= 0`, use unconditional `DELETE FROM error_log` (no WHERE clause). For `days > 0`, keep `lte` comparison
- **Files modified:** `lib/db/error-log.js`
- **Commit:** included in `983b2e5`

## Self-Check: PASSED
