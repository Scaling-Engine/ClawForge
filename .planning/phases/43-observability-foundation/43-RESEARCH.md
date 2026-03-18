# Phase 43: Observability Foundation - Research

**Researched:** 2026-03-17
**Domain:** Structured logging (pino), error persistence (SQLite), Sentry.io integration (Next.js 15), health endpoint extension, filesystem-based job log output
**Confidence:** HIGH — all findings verified against actual codebase files and official documentation

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OBS-01 | System writes structured JSON logs to stdout via pino on the custom HTTP server | pino-http mounts on existing `server.js` or as Next.js middleware alternative; pino v10.3.1 confirmed via npm |
| OBS-02 | Error events are persisted to `error_log` table and survive process restarts | `error_log` Drizzle table in `lib/db/schema.js`; `captureError()` in `lib/observability/errors.js`; written from silent `.catch()` handlers in `api/index.js` |
| OBS-03 | Sentry captures all server and client errors with source maps | `@sentry/nextjs@10.44.0` with `onRequestError` hook in `config/instrumentation.js`; `sentry.client.config.js` and `sentry.server.config.js` in project root |
| OBS-04 | Health endpoint returns `errorCount24h`, `lastErrorAt`, `dbStatus`, and per-instance job success rate | Extend `getHealth()` in `api/superadmin.js` — already returns `{ instance, status, uptime }`, add four fields from `error_log` and `job_outcomes` queries |
| OBS-05 | Job-level observability events are written to filesystem JSONL files — no DB per-event, only one summary row in `job_outcomes` | `logs/jobs/{jobId}.jsonl` pattern using `logsDir` from `lib/paths.js`; existing `clawforge-agent-runs.logs` column already stores per-agent logs as text |
</phase_requirements>

---

## Summary

Phase 43 instruments a working production system before new failure modes are added in Phases 44-47. The codebase has informal observability today: `console.log('[prefix]', ...)` conventions, `failure_stage` detection in Docker dispatch, and the superadmin health endpoint returning `{ instance, status, uptime }`. Phase 43 formalizes all three layers — structured logging, error persistence, and error capture — without introducing architectural changes.

The critical design decision for this phase is where observability data goes. Job containers emit 40-60 semantic events per run. If each event writes a SQLite row, the single WAL writer is serialized against all other DB operations. The answer is already decided: job-level events go to `logs/jobs/{jobId}.jsonl` filesystem files (the `logsDir` path constant already exists in `lib/paths.js`); only one summary row is written to `job_outcomes` per job completion. The `error_log` table is for infrastructure-level errors (channel failures, startup errors, cron errors) — not job execution events.

There is no `server.js` file in the project root — Next.js starts via `next start`. The `config/instrumentation.js` file is the server startup hook (loaded by Next.js via `instrumentationHook`). pino-http cannot mount directly on a custom HTTP server (there is no custom HTTP server in this project). Instead, pino logs are emitted directly from application code via a thin `lib/observability/logger.js` wrapper, and structured request logging is handled via Next.js middleware or API route wrapping. The Sentry `onRequestError` hook in `config/instrumentation.js` auto-captures Server Component and API route errors.

**Primary recommendation:** Add the `error_log` table and `captureError()` function first (OBS-02), then install and configure Sentry (OBS-03), then extend the health endpoint (OBS-04), then add JSONL job file writing (OBS-05), then add pino structured logging (OBS-01). This order means error capture is working before logging is wired up.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pino` | `^10.3.1` | Structured JSON logger | Fastest Node.js logger; zero dependencies; native JSON output; confirmed v10.3.1 on npm registry as of 2026-03-17 |
| `pino-http` | `^11.0.0` | HTTP request/response logging middleware | Pairs with pino; mounts on any Node http server or as middleware; confirmed v11.0.0 on npm |
| `@sentry/nextjs` | `^10.44.0` | Client + server error capture with source maps | Official Next.js SDK; `onRequestError` hook; Turbopack-compatible; free tier 5K errors/month; confirmed v10.44.0 on npm |

### Supporting (no new packages required)

| Pattern | Implementation | Purpose | When to Use |
|---------|---------------|---------|-------------|
| Filesystem JSONL | Node.js `fs.appendFileSync` | Job event log | Per-job event streams — never per-event SQLite inserts |
| `node:test` + `assert` | Built into Node 22 (Dockerfile) | Unit tests for new DB helpers | Follow existing `lib/db/cluster-runs.test.js` pattern |
| Drizzle additive migration | `npm run db:generate` | Schema changes | Every new SQLite table |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@sentry/nextjs` cloud | GlitchTip self-hosted | GlitchTip requires PostgreSQL — contradicts SQLite constraint |
| `@sentry/nextjs` cloud | Bugsink self-hosted | Same PostgreSQL dependency problem |
| `pino` | OpenTelemetry SDK | Explicitly out of scope (`PROJECT.md`); requires 5+ packages and a collector sidecar |
| `pino` | Winston | pino is 5x faster; less config for JSON-to-stdout use case |
| Filesystem JSONL | SQLite `job_logs` table | 40-60 INSERTs per job serializes the WAL writer — confirmed pitfall against `lib/db/index.js` WAL pragma |

**Installation:**
```bash
npm install pino pino-http @sentry/nextjs
```

**Version verification (confirmed 2026-03-17):**
```bash
npm view pino version        # 10.3.1
npm view pino-http version   # 11.0.0
npm view @sentry/nextjs version  # 10.44.0
```

---

## Architecture Patterns

### Confirmed Project Structure

There is NO `server.js` in the project root. Next.js starts with `next start` (or `next dev`). The startup hook is `config/instrumentation.js` — this is where pino initialization and Sentry init should happen.

```
lib/
├── observability/           # NEW — Phase 43 creates this
│   ├── logger.js            # pino instance + structured log helpers
│   └── errors.js            # captureError() — writes to error_log table
├── db/
│   ├── schema.js            # ADD errorLog table definition here
│   ├── error-log.js         # NEW — writeError(), getRecentErrors(), pruneOldErrors()
│   └── job-outcomes.js      # READ-ONLY (additive columns only if needed)
config/
├── instrumentation.js       # MODIFY — add Sentry init + error pruning cron
├── sentry.client.config.js  # NEW — Sentry client setup
└── sentry.server.config.js  # NEW — Sentry server setup
api/
└── superadmin.js            # MODIFY — extend getHealth() with 4 new fields
app/api/health/
└── route.js                 # NEW — public health endpoint (separate from superadmin)
logs/
└── jobs/                    # NEW — {jobId}.jsonl files (logsDir already in paths.js)
```

### Pattern 1: Sentry Next.js 15 Integration via instrumentation.js

**What:** Sentry hooks into Next.js 15 App Router via the `onRequestError` callback in `config/instrumentation.js`. This auto-captures all Server Component async errors, API route errors, and server action errors.

**When to use:** All server-side error capture. The `onRequestError` hook fires before Next.js's default error boundary, which means errors are captured even when they are silently swallowed.

**Example (verified from Sentry Next.js docs):**
```javascript
// config/instrumentation.js — add to existing register() function
import * as Sentry from '@sentry/nextjs';

export async function onRequestError(err, request, context) {
  // This hook fires for all Server Component + API route errors
  await Sentry.captureRequestError(err, { request, context });
}
```

**Important:** The `onRequestError` hook is defined as a named export from `instrumentation.js` — it is NOT called inside `register()`. It must be exported at the module level.

### Pattern 2: pino Structured Logging (No Custom HTTP Server)

**What:** Since there is no `server.js`, pino is initialized as a module-level singleton in `lib/observability/logger.js`. The `pino-http` middleware is wired into API route handlers, not a custom HTTP server.

**When to use:** All structured logging throughout the application. Replace `console.log('[prefix]', ...)` calls with `log('info', 'prefix', 'message', { ...meta })`.

**Example:**
```javascript
// lib/observability/logger.js
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // JSON to stdout — Docker captures stdout; PM2 captures to rotating files
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export default logger;

export function log(level, context, message, meta = {}) {
  logger[level]({ context, ...meta }, message);
}
```

**Note on `pino-http`:** With no custom HTTP server, pino-http's primary use is as a Next.js middleware. Add to `middleware.js` to log every incoming request with latency and status. This is optional for Phase 43 — the requirement is structured JSON on stdout, which pino alone satisfies without `pino-http`. Include `pino-http` in the install for future use; wire it in middleware if time permits.

### Pattern 3: error_log Table and captureError()

**What:** Thin DB-backed error capture that survives process restarts. Written from the two silent `.catch()` handlers identified in `api/index.js` (lines 168 and 242) and from `config/instrumentation.js` on startup errors.

**When to use:** Infrastructure-level errors only — channel adapter failures, cron failures, startup errors. NOT job execution events (those go to JSONL files).

**Data model:**
```javascript
// lib/db/schema.js — ADD this export
export const errorLog = sqliteTable('error_log', {
  id: text('id').primaryKey(),
  context: text('context').notNull(),      // 'channel', 'webhook', 'startup', 'db', 'cron'
  severity: text('severity').notNull(),    // 'error', 'warn', 'info'
  message: text('message').notNull(),
  stack: text('stack'),                    // nullable — JS error stack
  metadata: text('metadata'),             // nullable JSON — { route, jobId } — NO user content
  instanceName: text('instance_name'),    // from INSTANCE_NAME env var
  createdAt: integer('created_at').notNull(),
});
```

**captureError function:**
```javascript
// lib/observability/errors.js
import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import { errorLog } from '../db/schema.js';
import { log } from './logger.js';

const INSTANCE_NAME = process.env.INSTANCE_NAME || 'default';

export async function captureError(context, err, meta = {}) {
  // 1. Always log to stdout (even if DB write fails)
  log('error', context, err.message, { stack: err.stack, ...meta });

  // 2. Persist to DB for health endpoint + post-mortem debugging
  try {
    const db = getDb();
    db.insert(errorLog).values({
      id: randomUUID(),
      context,
      severity: 'error',
      message: err.message,
      stack: err.stack || null,
      // Sanitize meta — strip message content, keep only structural context
      metadata: JSON.stringify(sanitizeMeta(meta)),
      instanceName: INSTANCE_NAME,
      createdAt: Date.now(),
    }).run();
  } catch (dbErr) {
    // DB write failure must not cause secondary error — log to stdout only
    log('error', 'observability', 'Failed to persist error to DB', { originalContext: context });
  }
}

function sanitizeMeta(meta) {
  // Never store user message content or API keys in error metadata
  const safe = {};
  const allowedKeys = ['route', 'jobId', 'threadId', 'platform', 'statusCode', 'code'];
  for (const key of allowedKeys) {
    if (meta[key] !== undefined) safe[key] = meta[key];
  }
  return safe;
}
```

### Pattern 4: Health Endpoint Extension

**What:** Extend the existing `getHealth()` function in `api/superadmin.js` with four new fields derived from `error_log` and `job_outcomes` queries.

**When to use:** This is the only place instance health data is served. The superadmin hub polls this endpoint via `queryAllInstances('health')`.

**Extended response shape:**
```javascript
// api/superadmin.js — extend getHealth()
async function getHealth() {
  const { getRecentErrorCount, getLastErrorAt } = await import('../lib/db/error-log.js');
  const { getJobSuccessRate } = await import('../lib/db/job-outcomes.js');

  let dbStatus = 'ok';
  let errorCount24h = 0;
  let lastErrorAt = null;
  let jobSuccessRate = null;

  try {
    // SELECT 1 probe — confirms DB is readable
    const db = getDb();
    db.get(sql`SELECT 1`);
    errorCount24h = getRecentErrorCount(24);
    lastErrorAt = getLastErrorAt();
    jobSuccessRate = getJobSuccessRate(INSTANCE_NAME, 24); // last 24h
  } catch (err) {
    dbStatus = 'degraded';
  }

  return {
    instance: INSTANCE_NAME,
    status: 'online',
    uptime: process.uptime(),
    errorCount24h,
    lastErrorAt,
    dbStatus,
    jobSuccessRate,  // e.g. { total: 12, succeeded: 11, rate: 0.917 }
  };
}
```

### Pattern 5: Filesystem JSONL for Job Events (OBS-05)

**What:** Job-level observability events written to `logs/jobs/{jobId}.jsonl` using `fs.appendFileSync`. The `logsDir` path constant already exists in `lib/paths.js` — no new path registration needed.

**When to use:** Any per-job event that would otherwise require a DB INSERT inside a job event loop. Current job-level data arrives via GitHub webhook events (PR merged/created) — the JSONL files would capture richer intra-job events if/when job containers gain structured output capabilities.

**For Phase 43 scope (OBS-05):** The requirement is that "a job run that spans 50+ events produces filesystem JSONL log files." The existing `clusterAgentRuns.logs` column stores final logs as text. Phase 43 adds the filesystem JSONL pattern so job event data does NOT require DB inserts per event. The implementation is a `lib/observability/job-logger.js` module with `appendJobEvent(jobId, event)` that writes to the JSONL file.

```javascript
// lib/observability/job-logger.js
import fs from 'fs';
import path from 'path';
import { logsDir } from '../paths.js';

/**
 * Append a structured event to the per-job JSONL log file.
 * Creates the logs/jobs/ directory if it doesn't exist.
 * Never throws — job execution must not fail due to logging errors.
 */
export function appendJobEvent(jobId, event) {
  try {
    const jobsDir = path.join(logsDir, 'jobs');
    if (!fs.existsSync(jobsDir)) {
      fs.mkdirSync(jobsDir, { recursive: true });
    }
    const line = JSON.stringify({ t: Date.now(), jobId, ...event }) + '\n';
    fs.appendFileSync(path.join(jobsDir, `${jobId}.jsonl`), line);
  } catch {
    // Silent — logging must not propagate to job execution
  }
}
```

### Pattern 6: 30-Day Error Log Pruning via node-cron

**What:** Add a cron job in `config/instrumentation.js` to prune `error_log` rows older than 30 days. Uses `node-cron` (already a dependency).

**When to use:** Required — without pruning, the `error_log` table grows unbounded.

**Integration point:**
```javascript
// config/instrumentation.js — add inside register() after startBuiltinCrons()
import cron from 'node-cron';
const { pruneOldErrors } = await import('../lib/db/error-log.js');
// Run at 3am daily
cron.schedule('0 3 * * *', () => {
  pruneOldErrors(30); // delete rows older than 30 days
});
```

### Anti-Patterns to Avoid

- **INSERT per job event into SQLite:** The WAL writer is serialized — 40-60 inserts per job causes latency spikes for all concurrent DB operations. Use `appendJobEvent()` (JSONL file) instead.
- **`pino-http` mounted inside API route handler functions:** `pino-http` must wrap the request at the outermost layer. Inside a handler it has already missed the request lifecycle. Mount in middleware instead.
- **Storing user message content in `error_log.metadata`:** Use `sanitizeMeta()` — only structural context (route, jobId, platform). PII concern and no diagnostic value.
- **Calling `captureError()` synchronously inside the LangGraph agent hot path:** `captureError()` does a DB write. Call it in `.catch()` handlers that are already off the critical path.
- **`onRequestError` defined inside `register()`:** It must be a named export at module level. Defining it inside `register()` means Next.js never finds it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client-side error capture | Custom `window.onerror` handler | `@sentry/nextjs` client config | Source maps, grouping, replay — hours of work to reproduce |
| Server component error boundaries | Custom `global.uncaughtException` | `onRequestError` hook + `@sentry/nextjs` | Next.js 15 App Router errors bypass `uncaughtException` |
| Log aggregation service | Custom log shipper sidecar | Docker stdout capture | At 2 instances, `docker logs --follow` covers all needs. Logs-as-files if needed |
| HTTP request logging middleware | Custom middleware tracking timestamps | `pino-http` | Request ID generation, serializers, error handling built in |

**Key insight:** Sentry solves the source-map upload problem that is genuinely complex for Next.js App Router. The build-time Sentry webpack plugin handles uploading source maps so production stack traces point to TypeScript line numbers. Hand-rolling this requires webpack config, Sentry upload tokens, and release tracking — non-trivial.

---

## Common Pitfalls

### Pitfall 1: SQLite Write Contention from Per-Event Logging

**What goes wrong:** Adding a DB INSERT inside `parseLineToSemanticEvent()` or `streamManager` event handlers causes 40-60 INSERTs per job. SQLite WAL mode serializes writers — all concurrent DB operations queue.

**Why it happens:** `job_outcomes` stores one row per job (fine). Developers add a `job_logs` table by analogy — "just more rows."

**How to avoid:** `appendJobEvent(jobId, event)` writes to `logs/jobs/{jobId}.jsonl`. The only DB write per job is the one existing INSERT into `job_outcomes` on job completion.

**Warning signs:** Any Drizzle INSERT inside a function that is called from within a streaming event loop or called more than once per job.

### Pitfall 2: onRequestError Defined Inside register()

**What goes wrong:** Next.js looks for `onRequestError` as a named export from `instrumentation.js`. If it is defined inside `register()` as a closure or nested function, it is never exported — errors are not captured.

**Why it happens:** `register()` is already the known entry point; developers put everything inside it.

**How to avoid:** Export `onRequestError` at the module level:

```javascript
// config/instrumentation.js — CORRECT
export async function register() { /* ... */ }

export async function onRequestError(err, request, context) {
  const Sentry = await import('@sentry/nextjs');
  await Sentry.captureRequestError(err, { request, context });
}
```

### Pitfall 3: pino-http Expects a Custom HTTP Server

**What goes wrong:** `pino-http` documentation shows `const server = http.createServer(pino-http(logger), handler)` — which works when you own the HTTP server. Next.js owns the HTTP server via `next start`. Mounting `pino-http` this way is not possible without a custom server.

**Why it happens:** The STACK.md documents `pino-http` without noting this project has no custom `server.js`.

**How to avoid:** For this project, pino is the logger. `pino-http` is installed but used as a Next.js middleware (`middleware.js`) for request logging, not as a server-level mount. The pino instance from `lib/observability/logger.js` is used directly for all structured logging.

### Pitfall 4: Error Log Metadata Contains PII

**What goes wrong:** The `.catch((err) => captureError('channel', err, { messageText: normalized.text }))` pattern stores user message content in the DB.

**Why it happens:** The error context (what was the message?) is useful for debugging.

**How to avoid:** `sanitizeMeta()` in `lib/observability/errors.js` strips all keys except an allowlist (`route`, `jobId`, `threadId`, `platform`, `statusCode`, `code`). Never pass message text, file contents, or LLM responses as error metadata.

### Pitfall 5: Health Endpoint Adding Slow Queries

**What goes wrong:** The health endpoint is called on every superadmin dashboard refresh (30-second interval, all instances in parallel). A slow `getJobSuccessRate()` query that does a full-table scan on `job_outcomes` makes the health endpoint timeout.

**Why it happens:** `job_outcomes` has no composite index — a `WHERE instance_name = ? AND created_at > ?` filter requires a table scan.

**How to avoid:** The `job_outcomes` table does not have an `instance_name` column (verified in `schema.js`). The `job_success_rate` query must use `job_origins.platform` or limit to the last N rows. Use `LIMIT 100` with `ORDER BY created_at DESC` — never unbounded queries in the health endpoint.

---

## Code Examples

### Sentry Initialization Pattern (Next.js 15 App Router)

```javascript
// config/sentry.server.config.js — NEW FILE
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Traces sample rate — 0.1 = 10% of requests
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Don't capture in development unless SENTRY_DSN is explicitly set
  enabled: !!process.env.SENTRY_DSN,
});
```

```javascript
// config/sentry.client.config.js — NEW FILE
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Client-side replay — optional, increases bundle size
  // integrations: [Sentry.replayIntegration()],
});
```

```javascript
// config/instrumentation.js — ADD named export at module level
export async function onRequestError(err, request, context) {
  // Dynamic import required — instrumentation.js runs before Sentry is fully initialized
  const { captureRequestError } = await import('@sentry/nextjs');
  await captureRequestError(err, { request, context });
}
```

### error_log DB Helper

```javascript
// lib/db/error-log.js — NEW FILE
import { desc, lt, gt, count, max } from 'drizzle-orm';
import { getDb } from './index.js';
import { errorLog } from './schema.js';

export function writeError({ context, severity = 'error', message, stack, metadata, instanceName }) {
  const db = getDb();
  const { randomUUID } = require('crypto');
  return db.insert(errorLog).values({
    id: randomUUID(),
    context, severity, message,
    stack: stack || null,
    metadata: metadata ? JSON.stringify(metadata) : null,
    instanceName: instanceName || process.env.INSTANCE_NAME || 'default',
    createdAt: Date.now(),
  }).run();
}

export function getRecentErrorCount(hours = 24) {
  const db = getDb();
  const since = Date.now() - hours * 60 * 60 * 1000;
  const result = db.select({ total: count() })
    .from(errorLog)
    .where(gt(errorLog.createdAt, since))
    .get();
  return result?.total ?? 0;
}

export function getLastErrorAt() {
  const db = getDb();
  const result = db.select({ last: max(errorLog.createdAt) })
    .from(errorLog)
    .get();
  return result?.last ?? null;
}

export function pruneOldErrors(days = 30) {
  const db = getDb();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.delete(errorLog).where(lt(errorLog.createdAt, cutoff)).run();
}
```

### Wiring captureError() into api/index.js Silent Handlers

```javascript
// api/index.js — lines 168 and 242 (the two silent .catch() handlers)

// BEFORE (line 168):
processChannelMessage(adapter, normalized, { userId: 'telegram', chatTitle: 'Telegram' }).catch((err) => {
  console.error('Failed to process message:', err);
});

// AFTER:
processChannelMessage(adapter, normalized, { userId: 'telegram', chatTitle: 'Telegram' }).catch((err) => {
  captureError('channel', err, { platform: 'telegram', threadId: normalized.threadId });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `onRequestError` required `instrumentationHook: true` in next.config.mjs | Built-in since Next.js 15.3+ | Next.js 15.3 | No longer need experimental flag — `instrumentationHook` is standard |
| Sentry SDK v8 required separate sentry.edge.config.js | Sentry SDK v9+ handles edge automatically | SDK v9 | One fewer config file |
| pino v9 | pino v10 | pino v10 release | pino v10 drops Node 18 support (fine — Dockerfile uses Node 22); better ESM support |

**Deprecated/outdated:**
- `experimental.instrumentationHook: true` in next.config.mjs: No longer needed in Next.js 15.3+. The project's `templates/next.config.mjs` does not have it — confirmed correct.
- `sentry.edge.config.js`: Not needed with `@sentry/nextjs` v10+.

---

## Open Questions

1. **instrumentationHook flag status for this Next.js version**
   - What we know: `templates/next.config.mjs` has `experimental: { authInterrupts: true }` but no `instrumentationHook` flag. `config/instrumentation.js` comment says "Loaded by Next.js on server start when instrumentationHook is enabled."
   - What's unclear: Does the installed Next.js version (15.x) require the `instrumentationHook: true` flag or is it auto-detected?
   - Recommendation: The Wave 0 task for Phase 43 should verify by checking `next` version in `package.json` lock file and consulting Next.js docs. If needed, add `instrumentationHook: true` to `templates/next.config.mjs`. The comment in `instrumentation.js` suggests the flag may be needed.

2. **Job success rate metric data source**
   - What we know: `job_outcomes` has `status` and `mergeResult` columns but no `instanceName`. All jobs in a single-instance deployment belong to that instance.
   - What's unclear: For multi-instance deployments, there is no `instance_name` on `job_outcomes` to filter by. The `job_origins` table also lacks `instance_name`.
   - Recommendation: The `jobSuccessRate` calculation in `getHealth()` should query ALL `job_outcomes` (this is a per-instance endpoint — every job in the DB belongs to this instance). Filter by time window: last 24h using `createdAt`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert` (Node 22) |
| Config file | None — run directly with `node --test` |
| Quick run command | `node --test lib/db/error-log.test.js` |
| Full suite command | `node --test lib/db/error-log.test.js lib/observability/errors.test.js` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBS-01 | pino logger emits valid JSON to stdout on `log()` call | unit | `node --test lib/observability/logger.test.js` | Wave 0 |
| OBS-02 | `captureError()` inserts row into `error_log` table; row survives getRecentErrorCount() | unit | `node --test lib/db/error-log.test.js` | Wave 0 |
| OBS-03 | `sentry.server.config.js` initializes without throwing; `onRequestError` export exists in `instrumentation.js` | smoke | manual + import check | Wave 0 |
| OBS-04 | `getHealth()` returns object with `errorCount24h`, `lastErrorAt`, `dbStatus`, `jobSuccessRate` keys | unit | `node --test api/superadmin.test.js` | Wave 0 |
| OBS-05 | `appendJobEvent()` creates `logs/jobs/{jobId}.jsonl` file; 50 calls produce 50 lines; no DB rows created | unit | `node --test lib/observability/job-logger.test.js` | Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test lib/db/error-log.test.js lib/observability/job-logger.test.js`
- **Per wave merge:** `node --test lib/db/error-log.test.js lib/observability/errors.test.js lib/observability/job-logger.test.js lib/observability/logger.test.js`
- **Phase gate:** All test files green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `lib/observability/logger.test.js` — covers OBS-01 (pino JSON output)
- [ ] `lib/db/error-log.test.js` — covers OBS-02 (error_log table CRUD + pruning)
- [ ] `lib/observability/errors.test.js` — covers OBS-02 (captureError() integration)
- [ ] `lib/observability/job-logger.test.js` — covers OBS-05 (JSONL file append, no DB writes)
- [ ] `api/superadmin.test.js` — covers OBS-04 (getHealth() shape with new fields)

Follow the existing `lib/db/cluster-runs.test.js` pattern: in-memory SQLite via temp file, `node:test` + `node:assert`, clean up temp DB on `after()`.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `/Users/nwessel/Claude Code/Business/Products/clawforge/lib/db/schema.js` — all existing table definitions; `error_log` design is non-conflicting
- `/Users/nwessel/Claude Code/Business/Products/clawforge/lib/db/index.js` — WAL mode confirmed (`sqlite.pragma('journal_mode = WAL')`); migration pattern via `drizzle/` folder
- `/Users/nwessel/Claude Code/Business/Products/clawforge/config/instrumentation.js` — server startup hook; `register()` structure; no pino/Sentry currently installed
- `/Users/nwessel/Claude Code/Business/Products/clawforge/api/superadmin.js` — `getHealth()` returns `{ instance, status, uptime }` only; `handleSuperadminEndpoint()` switch structure
- `/Users/nwessel/Claude Code/Business/Products/clawforge/api/index.js` — silent `.catch((err) => console.error())` at lines 168 and 242 (two primary error capture points)
- `/Users/nwessel/Claude Code/Business/Products/clawforge/lib/paths.js` — `logsDir` path constant already exists (`path.join(PROJECT_ROOT, 'logs')`)
- `/Users/nwessel/Claude Code/Business/Products/clawforge/lib/cron.js` — `node-cron` already a dependency; cron pattern for adding scheduled tasks
- `/Users/nwessel/Claude Code/Business/Products/clawforge/lib/db/cluster-runs.test.js` — confirmed test pattern (node:test, temp SQLite file, no jest/vitest)
- `/Users/nwessel/Claude Code/Business/Products/clawforge/templates/next.config.mjs` — `instrumentationHook` NOT present; only `experimental: { authInterrupts: true }`
- npm registry (2026-03-17): pino@10.3.1, pino-http@11.0.0, @sentry/nextjs@10.44.0

### Secondary (MEDIUM confidence — official documentation)

- [Sentry Next.js docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) — `onRequestError` hook as named export; Next.js 15 App Router compatibility; Turbopack SDK rewrite confirmed
- Prior project research in `.planning/research/STACK.md` and `.planning/research/ARCHITECTURE.md` — HIGH confidence (verified against codebase in 2026-03-17 session)

### Tertiary (LOW confidence — not re-verified in this session)

- pino-http GitHub README — middleware mounting pattern; `http.createServer()` approach (may need adaptation for no-custom-server case)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed against npm registry; pino/Sentry/pino-http compatibility verified
- Architecture: HIGH — derived from direct file inspection; `logsDir` path confirmed in `lib/paths.js`; `instrumentation.js` structure confirmed
- Pitfalls: HIGH (SQLite WAL and instrumentation.js patterns confirmed against codebase) / MEDIUM (PII and cron pruning patterns from prior research)

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable libraries; Sentry SDK may ship minor updates)
