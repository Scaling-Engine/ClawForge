# Architecture Research: v3.0 Customer Launch Integration

**Domain:** Commercial launch capabilities for existing AI agent gateway platform
**Researched:** 2026-03-17
**Confidence:** HIGH — derived from direct inspection of all referenced files

> **Scope of this document:** ClawForge v2.2 is already shipped. This document covers only the four new v3.0 capability areas and their integration points with the existing architecture: (1) observability layer, (2) billing/usage tracking, (3) onboarding state machine, (4) team monitoring dashboard extension. Prior architecture decisions (two-layer Docker dispatch, LangGraph agent, superadmin API proxy, three-tier RBAC) are treated as preconditions — not duplicated here.

---

## System Overview: v2.2 Baseline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser UI (Next.js)                             │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐  ┌────────────────────┐ │
│  │ Chat UI  │  │ Admin UI │  │ Superadmin UI  │  │ Workspace Terminal │ │
│  │ /chat/*  │  │ /admin/* │  │ /superadmin/*  │  │  /ws/* (xterm.js)  │ │
│  └────┬─────┘  └────┬─────┘  └───────┬────────┘  └────────┬───────────┘ │
│       │ Server      │ Server          │ SA Client           │ WS ticket   │
│       │ Actions     │ Actions         │ queryAllInstances() │ auth        │
├───────┴─────────────┴─────────────────┴─────────────────────┴────────────┤
│                         Event Handler (Next.js)                           │
│  ┌──────────────────┐  ┌───────────────────┐  ┌─────────────────────┐    │
│  │ LangGraph ReAct  │  │  Channel Adapters │  │ Superadmin API      │    │
│  │ lib/ai/agent.js  │  │  Slack/TG/Web     │  │ api/superadmin.js   │    │
│  └────────┬─────────┘  └───────────────────┘  │ health/stats/jobs   │    │
│           │ tool calls                          └─────────────────────┘    │
│  ┌────────▼──────────────────────────────────────────────────────────┐    │
│  │ Tool Layer: createJob, startCoding, getJobStatus, web_search, ... │    │
│  └────────┬──────────────────────────────────────────────────────────┘    │
├───────────┴───────────────────────────────────────────────────────────────┤
│                          SQLite Database Layer                             │
│  users │ chats │ messages │ job_origins │ job_outcomes │ settings          │
│  code_workspaces │ cluster_runs │ terminal_sessions │ terminal_costs       │
└──────────────────────┬────────────────────────────────────────────────────┘
                       │ dockerode Engine API
┌──────────────────────▼───────────────────────────────────────────────────┐
│                      Docker Containers                                    │
│  Job containers: clawforge-{instance}-{slug} (9s start via Engine API)   │
│  Workspace containers: clawforge-ws-{instance}-{id} (ttyd + tmux)        │
└──────────────────────────────────────────────────────────────────────────┘
```

**Key constraints that define integration approach:**
- Single SQLite file at `data/clawforge.sqlite` — additive migrations only
- `settings` table already used for config/secret/llm_provider types — new types can be added without schema changes
- Superadmin M2M auth (`AGENT_SUPERADMIN_TOKEN`) + `verifySuperadminToken()` is working and must not be touched
- `lib/auth/middleware.js` guards three tiers (`user`, `admin`, `superadmin`) — extend with env-var-gated guards only
- All browser-initiated operations use Server Actions, never direct API route calls

---

## Capability 1: Observability Layer

### Integration Question

Where does observability instrumentation live — error boundaries, health check endpoints, structured logging?

### Answer: Thin wrapper over existing patterns, not a new framework

The codebase already has informal observability: `console.log('[slack]', ...)` prefix conventions, `failure_stage` detection in Docker dispatch, structured `summarizeJob()` LLM summaries, and the superadmin health endpoint (`getHealth()` in `api/superadmin.js`). v3.0 formalizes these without introducing a logging framework dependency.

### New Components

| File | Purpose | New or Modify |
|------|---------|--------------|
| `lib/observability/logger.js` | Structured log emitter — JSON-to-stdout wrapper over `console.log` with level + context fields | NEW |
| `lib/observability/errors.js` | `captureError(context, err, meta)` — writes to `error_log` table; callable from any module | NEW |
| `lib/db/error-log.js` | Query helpers: `writeError()`, `getRecentErrors(hours)`, `pruneOldErrors(days)` | NEW |

### Modified Components

| File | Change | Why This File |
|------|--------|--------------|
| `lib/db/schema.js` | Add `errorLog` table | All tables live here; Drizzle migration auto-generated |
| `api/index.js` | Replace silent `.catch()` on `processChannelMessage()` (line ~162) with `captureError('channel', err)` | CONCERNS.md identifies this as the primary silent failure path |
| `api/superadmin.js` | Extend `getHealth()` to include `errorCount24h`, `lastErrorAt`, `dbStatus` fields | Only place health data is served to hub |
| `config/instrumentation.js` | Register pruning cron for `error_log` (30-day retention) via existing `node-cron` scheduler | Server startup already initializes cron here |

### Do NOT Modify

The LangGraph agent error handling (tool errors caught by framework), Docker dispatch failure-stage detection (already surfaces via `failure_stage` in notifications), and GitHub webhook handler (already has try/catch).

### Data Model: error_log Table

```javascript
// Add to lib/db/schema.js
export const errorLog = sqliteTable('error_log', {
  id: text('id').primaryKey(),
  context: text('context').notNull(),      // 'channel', 'webhook', 'startup', 'db', 'cron'
  severity: text('severity').notNull(),    // 'error', 'warn', 'info'
  message: text('message').notNull(),
  stack: text('stack'),                    // nullable — JS error stacks
  metadata: text('metadata'),             // nullable JSON string for request context, jobId, etc.
  instanceName: text('instance_name'),     // from INSTANCE_NAME env var
  createdAt: integer('created_at').notNull(),
});
```

### Health Endpoint Extension

`api/superadmin.js:getHealth()` currently returns `{ instance, status, uptime }`. Extend with DB query:

```
{
  instance: INSTANCE_NAME,
  status: 'online',
  uptime: process.uptime(),
  errorCount24h: <count from error_log WHERE createdAt > now-24h>,
  lastErrorAt: <max(createdAt) from error_log, or null>,
  dbStatus: 'ok' | 'degraded'   // result of SELECT 1 probe
}
```

This feeds the team monitoring dashboard (Capability 4) without any additional HTTP calls.

### Structured Logging Pattern

Follow the existing `[prefix]` convention — do not diverge into a separate log format:

```javascript
// lib/observability/logger.js
export function log(level, context, message, meta = {}) {
  const entry = { level, context, t: Date.now(), msg: message, ...meta };
  console.log(JSON.stringify(entry));  // Docker captures stdout
}
```

No external logging library. The Docker container runtime captures stdout and it is queryable via `docker logs`.

---

## Capability 2: Billing and Usage Tracking

### Integration Question

How should per-customer billing/usage limits be tracked in SQLite alongside the existing `job_outcomes` table?

### Answer: Two new tables — append-only `usage_events` plus configurable `billing_limits`

The existing `terminal_costs` and `terminal_sessions` tables already capture terminal token costs. Billing aggregates from those plus adds job dispatch events. The key insight: the instance name (from `INSTANCE_NAME` env var) is the customer identifier — one instance per customer, one row in `billing_limits` per limit type per instance.

### New Components

| File | Purpose | New or Modify |
|------|---------|--------------|
| `lib/db/usage.js` | `recordUsageEvent()`, `getUsageSummary(instanceName, period)`, `getMonthTotal(instanceName, eventType)` | NEW |
| `lib/billing/enforce.js` | `checkUsageLimit(instanceName, eventType)` — queries limits + current month total, returns `{ allowed, remaining }` | NEW |

### Modified Components

| File | Change | Why This File |
|------|--------|--------------|
| `lib/db/schema.js` | Add `usageEvents` and `billingLimits` table definitions | All tables live here |
| `lib/tools/create-job.js` | After Docker dispatch confirmed: `recordUsageEvent('job_dispatch', instanceName, { refId: jobId })` | All job dispatch flows through this file regardless of Docker vs Actions routing |
| `lib/terminal/session-manager.js` | On session completion: copy `terminalSessions.totalCostUsd` → `recordUsageEvent('terminal_session', instanceName, { costUsd, refId: sessionId })` | Session lifecycle events originate here |
| `api/superadmin.js` | Add `usage` case to `handleSuperadminEndpoint()` switch — returns current month rollup | Only place instance data is served to hub |

### Do NOT Modify

`terminalCosts` and `terminalSessions` tables — live and queryable. Aggregate from them into `usage_events` on session close; never rewrite them.

### Data Model: Usage Tables

```javascript
// Add to lib/db/schema.js

// Append-only event log — never modified after insert
export const usageEvents = sqliteTable('usage_events', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),   // customer = instance
  eventType: text('event_type').notNull(),          // 'job_dispatch', 'terminal_session', 'workspace_hour'
  quantity: real('quantity').notNull().default(1),  // count for jobs; minutes for terminal; hours for workspace
  costUsd: real('cost_usd'),                        // nullable — only populated for LLM events
  refId: text('ref_id'),                            // nullable — jobId, sessionId for tracing
  periodMonth: text('period_month').notNull(),       // 'YYYY-MM' — cheap monthly GROUP BY
  createdAt: integer('created_at').notNull(),
});

// Per-instance limits — one row per (instanceName, limitType)
export const billingLimits = sqliteTable('billing_limits', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),
  limitType: text('limit_type').notNull(),          // 'jobs_per_month', 'terminal_minutes_per_month'
  limitValue: real('limit_value').notNull(),        // 50 jobs, 600 minutes, etc.
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

**Why `periodMonth` as text:** SQLite has no native date functions for monthly grouping. Storing `'2026-03'` means `WHERE period_month = '2026-03'` is a simple indexed string match without date arithmetic. The Event Handler writes the current month at event recording time.

**Why not use the `settings` table for limits:** Billing limits need indexed queries (`WHERE instanceName = X AND limitType = Y`) and aggregation joins. The `settings` table's key-value structure makes these queries awkward. A dedicated table is cleaner.

### Enforcement Data Flow

```
Job dispatch request
    ↓
lib/tools/create-job.js
    ↓ (BEFORE GitHub API call — fast synchronous SQLite read)
lib/billing/enforce.js:checkUsageLimit(INSTANCE_NAME, 'jobs_per_month')
    → SELECT SUM(quantity) FROM usage_events WHERE instanceName=? AND eventType=? AND periodMonth=?
    → SELECT limitValue FROM billing_limits WHERE instanceName=? AND limitType=?
    → if over limit: throw new Error('Monthly job limit reached')
    ↓ (if allowed)
GitHub API: create branch + push job.md
    ↓
dockerode: start container
    ↓ (AFTER successful dispatch — fire and forget, doesn't block)
lib/db/usage.js:recordUsageEvent(...)
```

The enforcement check is synchronous SQLite (sub-millisecond) — acceptable in the dispatch hot path. Usage recording happens after dispatch to avoid blocking the job.

### Integration with Existing Cost Tracking

`terminalCosts` already accumulates token costs per-turn. `terminalSessions.totalCostUsd` is the session total. When a terminal session ends in `lib/terminal/session-manager.js`, copy the final total into `usage_events` with `eventType='terminal_session'`. This provides the aggregate billing view without touching the granular cost tracking tables.

---

## Capability 3: Onboarding State Machine

### Integration Question

What is the right data model for onboarding progress state?

### Answer: Single-row-per-instance state machine in a new `onboarding_state` table, with completion checks derived from existing data

Onboarding tracks a new operator's progress through deployment steps. The critical design choice: completion of each step is verified against real data (job_outcomes, channel config) — not just user button clicks. This prevents operators from marking steps complete without actually doing them.

### New Components

| File | Purpose | New or Modify |
|------|---------|--------------|
| `lib/onboarding/steps.js` | Step definitions array: `{ id, label, description, check() }` — each `check()` queries existing tables to verify completion | NEW |
| `lib/onboarding/state.js` | `initOnboarding(instanceName)`, `getOnboardingState(instanceName)`, `advanceOnboarding(instanceName, step)`, `checkAndAdvance(instanceName)` | NEW |
| `app/onboarding/page.js` | Onboarding wizard page | NEW |
| `lib/chat/components/onboarding-wizard.js` | Step-by-step React component with progress indicators | NEW |

### Modified Components

| File | Change | Why This File |
|------|--------|--------------|
| `lib/db/schema.js` | Add `onboardingState` table | All tables live here |
| `config/instrumentation.js` | On startup, if `ONBOARDING_ENABLED=true` env var is set: call `initOnboarding(INSTANCE_NAME)` to create initial row if none exists | Server startup is the only place to detect fresh instances |
| `lib/auth/middleware.js` | If `ONBOARDING_ENABLED=true` AND user is admin AND onboarding status is not 'complete': redirect `/` → `/onboarding` (exempt: `/onboarding`, `/admin`, `/login`, `/api`) | Only place to intercept navigation |
| `api/superadmin.js` | Add `onboarding` case to `handleSuperadminEndpoint()` switch — returns current step and completion percentage | Hub needs this for monitoring dashboard |

### Do NOT Modify

Existing instance behavior (Noah/StrategyES). The `ONBOARDING_ENABLED=true` env var is opt-in — existing instances do not set it, so the redirect and initialization never trigger for them.

### Data Model: onboarding_state Table

```javascript
// Add to lib/db/schema.js
export const onboardingState = sqliteTable('onboarding_state', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull().unique(), // one row per instance
  currentStep: text('current_step').notNull().default('github_connect'),
  completedSteps: text('completed_steps').notNull().default('[]'), // JSON array of step IDs
  status: text('status').notNull().default('pending'), // 'pending', 'in_progress', 'complete'
  metadata: text('metadata'),  // nullable JSON — e.g. { connectedRepo: 'owner/repo' }
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

### Step Sequence and Completion Checks

Each step's `check()` function queries existing tables — completion is verified, not self-reported:

| Step ID | Label | Completion Check |
|---------|-------|-----------------|
| `github_connect` | Connect GitHub | `GH_TOKEN` env present + test GitHub API call succeeds |
| `instance_configure` | Configure instance | `settings` table has `llm_provider` entry OR LLM env var present |
| `channel_connect` | Connect messaging channel | `subscriptions` table has at least one row OR Slack/TG env vars present |
| `first_job` | Dispatch first job | `job_outcomes` table has at least one row with this `INSTANCE_NAME` |
| `complete` | Complete | All prior steps verified |

The `checkAndAdvance()` function in `lib/onboarding/state.js` runs all checks in sequence and advances `currentStep` to the first incomplete step. Called on page load and after each wizard action.

### Middleware Redirect Guard

The redirect in `lib/auth/middleware.js` must be guarded to avoid breaking existing instances:

```javascript
// Only intercept if ALL conditions are true:
// 1. ONBOARDING_ENABLED env var is set to 'true'
// 2. User role is 'admin' (superadmin skips onboarding)
// 3. Path is not already /onboarding, /admin, /login, /api
// The check queries onboarding_state synchronously via better-sqlite3
```

**Important:** `lib/auth/middleware.js` runs in the Edge Runtime (Next.js middleware). `better-sqlite3` is a native module that does NOT work in Edge Runtime. The onboarding redirect cannot query the database from middleware. Instead, use an approach that doesn't require a DB read at the middleware layer: store onboarding completion as a `settings` key (`onboarding_complete = 'true'`) that is loaded into the server process at startup and cached in memory.

Alternative: redirect to `/onboarding` unconditionally when `ONBOARDING_ENABLED=true` and let the onboarding page itself check if onboarding is complete and redirect to `/` if so. This avoids the Edge Runtime constraint entirely.

**Recommended approach:** Unconditional redirect in middleware when `ONBOARDING_ENABLED=true` — check completion in the onboarding page's Server Component via a Server Action (not middleware). This is architecturally simpler and avoids the Edge Runtime native module limitation.

---

## Capability 4: Team Monitoring Dashboard Extension

### Integration Question

How should the team monitoring dashboard extend the existing superadmin API proxy pattern?

### Answer: Three new endpoints in `api/superadmin.js`, one new page in `/superadmin/monitoring/`, zero changes to `lib/superadmin/client.js`

The existing `queryAllInstances()` in `lib/superadmin/client.js` already handles any endpoint name — it does HTTP proxy for remote instances and direct import for the local instance. Adding new endpoints to `api/superadmin.js` automatically makes them available via the proxy without any changes to the client.

### New Components

| File | Purpose | New or Modify |
|------|---------|--------------|
| `app/superadmin/monitoring/page.js` | Team monitoring page — separate from existing job search | NEW |
| `lib/chat/components/superadmin-monitoring.js` | Dashboard React component with per-instance cards: health, errors, usage, onboarding | NEW |

### Modified Components

| File | Change | Why This File |
|------|--------|--------------|
| `api/superadmin.js` | Add `errors`, `usage`, `onboarding` cases to `handleSuperadminEndpoint()` switch | All superadmin endpoints route through this switch |
| `lib/chat/components/app-sidebar.js` | Add Monitoring link under Superadmin section | Navigation entry point |

### Do NOT Modify

`lib/superadmin/client.js` — `queryInstance()` and `queryAllInstances()` work correctly for any endpoint name. `verifySuperadminToken()` in `api/superadmin.js` — M2M auth is working, not a blocker.

### New Superadmin Endpoints

Add three cases to the switch in `api/superadmin.js:handleSuperadminEndpoint()`:

**`errors` endpoint:**
```javascript
// Returns error counts and recent errors for dashboard display
{
  instance: INSTANCE_NAME,
  errorCount24h: <count from error_log WHERE createdAt > now-24h>,
  errorCount7d: <count from error_log WHERE createdAt > now-7d>,
  recentErrors: [{ context, severity, message, createdAt }]  // last 5 errors
}
```

**`usage` endpoint:**
```javascript
// Returns current month usage rollup
{
  instance: INSTANCE_NAME,
  period: '2026-03',
  jobsDispatched: <sum from usage_events WHERE eventType='job_dispatch' AND periodMonth=current>,
  terminalMinutes: <sum(quantity) from usage_events WHERE eventType='terminal_session' AND periodMonth=current>,
  totalCostUsd: <sum(costUsd) from usage_events WHERE periodMonth=current>,
  limits: {
    jobsPerMonth: <from billing_limits>,
    terminalMinutesPerMonth: <from billing_limits>
  }
}
```

**`onboarding` endpoint:**
```javascript
// Returns onboarding completion state for this instance
{
  instance: INSTANCE_NAME,
  status: 'pending' | 'in_progress' | 'complete',
  currentStep: 'github_connect' | ...,
  completedSteps: ['github_connect', 'instance_configure'],
  completionPercent: 40
}
```

### Dashboard Data Flow

```
Browser: GET /superadmin/monitoring
    ↓ Server Component (or Server Action)
lib/superadmin/client.js:queryAllInstances('health')      // already exists
lib/superadmin/client.js:queryAllInstances('stats')       // already exists
lib/superadmin/client.js:queryAllInstances('errors')      // new
lib/superadmin/client.js:queryAllInstances('usage')       // new
lib/superadmin/client.js:queryAllInstances('onboarding')  // new
    ↓ Promise.allSettled — partial results if instances offline
Aggregate: one entry per instance, error-tolerant
    ↓
Render per-instance cards with:
  - Health indicator (online/offline, uptime, DB status)
  - Error rate (24h count, last error timestamp)
  - Usage vs limits (job count bar, cost this month)
  - Onboarding progress (if not complete: show current step)
```

**Auto-refresh:** Existing health dashboard already does 30-second auto-refresh. Monitoring page inherits same pattern — no new polling infrastructure.

**Fan-out latency:** Each `queryAllInstances()` call adds one fan-out cycle (5s timeout per remote instance, all in parallel). Calling 5 endpoints means 5 parallel fan-outs, each completing in ~100ms locally or up to 5s for slow remote instances. At 2-5 instances this is acceptable. Consider a single `summary` endpoint (batching all five) if the instance count grows to 20+.

---

## Integration Map: Complete View

```
New Table         │ Written By                           │ Read By
──────────────────┼──────────────────────────────────────┼──────────────────────────────
error_log         │ lib/observability/errors.js          │ api/superadmin.js (health+errors)
                  │  ← called from api/index.js          │ admin errors UI page
                  │     config/instrumentation.js        │
──────────────────┼──────────────────────────────────────┼──────────────────────────────
usage_events      │ lib/db/usage.js:recordUsageEvent()   │ api/superadmin.js (usage)
                  │  ← called from create-job.js         │ lib/billing/enforce.js
                  │     terminal/session-manager.js      │ admin usage UI page
──────────────────┼──────────────────────────────────────┼──────────────────────────────
billing_limits    │ admin UI → Server Action             │ lib/billing/enforce.js
                  │  (operator manually sets limits)     │ api/superadmin.js (usage)
──────────────────┼──────────────────────────────────────┼──────────────────────────────
onboarding_state  │ lib/onboarding/state.js              │ api/superadmin.js (onboarding)
                  │  ← called from instrumentation.js    │ onboarding wizard UI
                  │     onboarding page Server Action    │
```

---

## Architectural Patterns

### Pattern 1: Additive Table Extension (HIGH confidence, use for all four capabilities)

**What:** New SQLite tables via `lib/db/schema.js` + Drizzle migration + dedicated `lib/db/[feature].js` query helper file.

**When to use:** All v3.0 features follow this pattern. Every existing feature (codeWorkspaces, clusterRuns, terminalSessions, terminalCosts) established this as the canonical approach.

**Trade-offs:** Drizzle migrations are additive and safe to apply against a running production DB. Old code never sees new tables. Run `npm run db:generate` after schema changes.

### Pattern 2: Superadmin Endpoint Extension (HIGH confidence, use for all dashboard data)

**What:** Add new case to the switch in `api/superadmin.js:handleSuperadminEndpoint()`. The proxy client requires zero changes.

**When to use:** Any data the superadmin hub needs to aggregate across instances. The existing `queryAllInstances()` handles the new endpoint name automatically.

**Trade-offs:** Each new endpoint adds one HTTP fan-out cycle to the monitoring page load. At 2-5 instances this is fast. Consider a batched `summary` endpoint if instance count grows.

### Pattern 3: Feature-Flagged Middleware Extension (HIGH confidence, mandatory for onboarding redirect)

**What:** Guard new `lib/auth/middleware.js` behavior behind an env var check (`ONBOARDING_ENABLED=true`). Existing instances without the env var see zero behavior change.

**When to use:** Any middleware behavior that existing operators must not encounter. Middleware runs on every request — accidental changes break all existing users immediately.

**Trade-offs:** Env var flags are checked synchronously at request time (fast). Avoid DB reads in middleware — runs in Edge Runtime where `better-sqlite3` is unavailable.

### Pattern 4: Write-After-Dispatch for Usage Recording (HIGH confidence)

**What:** Record usage events AFTER the dispatch succeeds, not before. Non-blocking: use fire-and-forget or a simple synchronous SQLite insert after the async dispatch confirms.

**When to use:** All usage recording in the dispatch path. Never make usage recording block the job start.

**Trade-offs:** If the server crashes between dispatch and recording, the event is lost. Acceptable for billing (occasional missed events, recoverable from `job_outcomes` audit trail) — not acceptable for hard enforcement. For enforcement, read the limit BEFORE dispatch (fast synchronous query), record AFTER.

---

## Data Flow: Job Dispatch with Billing Enforcement

```
LangGraph agent calls createJob tool
    ↓
lib/tools/create-job.js
    ↓
[1] lib/billing/enforce.js:checkUsageLimit(INSTANCE_NAME, 'jobs_per_month')
      → SQLite: SUM(quantity) FROM usage_events WHERE instance=? AND type='job_dispatch' AND period=?
      → SQLite: SELECT limitValue FROM billing_limits WHERE instance=? AND limitType='jobs_per_month'
      → if SUM >= limitValue: throw Error('Monthly job limit reached for this instance')
    ↓ (limit check passed)
[2] GitHub API: create job/{uuid} branch + push job.md
    ↓
[3] dockerode: pull image + start container (9s path)
    ↓
[4] lib/db/usage.js:recordUsageEvent({
      instanceName: INSTANCE_NAME,
      eventType: 'job_dispatch',
      quantity: 1,
      periodMonth: '2026-03',
      refId: jobId,
      createdAt: Date.now()
    })
    ↓
[5] Return job ID to agent (existing behavior unchanged)
```

Steps [1] is synchronous SQLite (sub-millisecond). Step [4] is also synchronous SQLite (better-sqlite3 is always synchronous). The enforcement path adds <1ms to job dispatch overhead.

---

## Build Order

The four capabilities have the following dependency graph:

```
Observability (error_log + captureError + health extension)
  └── No dependencies — build first. Immediate production value.

Billing/Usage (usage_events + billing_limits + enforce.js)
  └── No hard dependencies on observability.
  └── Build second. Must exist before onboarding can check "first job dispatched".

Onboarding State Machine (onboarding_state + wizard UI + middleware)
  └── Soft dependency on billing: the "first_job" step check reads usage_events.
  └── Build third. Step checks query real data.

Team Monitoring Dashboard (/superadmin/monitoring + new endpoints)
  └── Hard dependency on all three above: needs errors/, usage/, onboarding/ endpoints to exist on instances.
  └── Build last.
```

**Recommended phase sequence:**

| Phase | Feature | Key Deliverable |
|-------|---------|----------------|
| 1 | Observability | `error_log` table, `captureError()`, health endpoint + `errorCount24h` |
| 2 | Billing | `usage_events` + `billing_limits` tables, recording in create-job.js, enforcement in enforce.js |
| 3 | Onboarding | `onboarding_state` table, step definitions, wizard UI, env-var-gated redirect |
| 4 | Monitoring Dashboard | New superadmin endpoints, `/superadmin/monitoring` page |

Billing (Phase 2) can be built in parallel with Observability (Phase 1) since they are table-independent. Onboarding (Phase 3) must come after Billing because the `first_job` step check needs `usage_events` data. Dashboard (Phase 4) must come after all three since it aggregates from all three new endpoint types.

---

## What NOT to Change

These systems are working in production. Modifications risk regression with immediate user impact:

| System | Rule | Reason |
|--------|------|--------|
| `lib/superadmin/client.js` | Read-only — no code changes | `queryAllInstances()` + M2M auth works. Only add endpoints in `api/superadmin.js`. |
| `verifySuperadminToken()` in `api/superadmin.js` | Read-only | M2M auth is correct. Adding endpoints never changes the auth path. |
| `lib/db/job-outcomes.js` + `jobOutcomes` schema | Additive only | Used for prior-context injection and status lookups. Add new columns only if genuinely needed; prefer new tables. |
| `lib/tools/create-job.js` Docker dispatch path | Prepend checks, append recording only | 9-second Docker dispatch is the core feature. The `waitAndNotify` detached async pattern is fragile — don't insert synchronous awaits in that path. |
| `lib/auth/middleware.js` existing role guards | Never change existing conditions | `/admin/*` admin check and `/superadmin/*` superadmin check are working. Only add new guards behind env var flags. |
| `lib/ai/agent.js` | No modifications | SQLite checkpointing + compiled LangGraph graph is fragile. Add tools in `lib/ai/tools.js` if needed; never touch agent compilation. |
| `terminalCosts` + `terminalSessions` tables | Read-only aggregate | Live cost tracking. Aggregate from them into `usage_events` on session close; never modify their schema. |
| `lib/ws/` WebSocket proxy | No modifications | Custom HTTP server upgrade interception is the most fragile part of the codebase. Only touch if a WS bug requires it. |
| `lib/db/config.js` `settings` table | Read-only for new features | Config system works. New features get dedicated tables rather than overloading `settings` with new types. |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 2-5 instances (v3.0 target) | Current approach is correct — SQLite, API proxy fan-out, per-request enforcement |
| 5-20 instances | `queryAllInstances()` fan-out to 5 endpoints × 20 instances = 100 HTTP calls per monitoring page load; batch into single `summary` endpoint |
| 20+ instances | SQLite `usage_events` write frequency becomes bottleneck (one write per job dispatch); consider periodic rollup table to reduce row count; WAL mode supports ~1,000 writes/sec |
| 100+ instances | API proxy pull model doesn't scale; shift to push model (instances POST metrics to hub on job completion rather than hub polling) |

For v3.0, SQLite + API proxy is the right fit. Document the 20-instance inflection point but do not build for it.

---

## Open Questions for Phase-Specific Research

1. **Onboarding middleware in Edge Runtime:** The `lib/auth/middleware.js` runs in Edge Runtime — `better-sqlite3` is unavailable. The recommended approach (unconditional redirect + completion check in the page) avoids this, but needs validation that the page-level redirect doesn't create a redirect loop. Flag for Phase 3 research.

2. **billing_limits admin UI location:** Should billing limit configuration live in `/admin/billing` (per-instance) or `/superadmin/billing` (cross-instance from hub)? For v3.0 with manual operator configuration, `/admin/billing` is sufficient. Cross-instance billing management can be added in v3.1 if needed.

3. **Usage event for workspace hours:** Workspace containers run for up to 30 minutes idle. Recording `workspace_hour` usage events requires a periodic measurement, not just an on-close event. Implementation: cron job every 15 minutes queries `codeWorkspaces` for running containers and records partial `workspace_hour` events. Flag for Phase 2 research if workspace billing is in scope for v3.0.

4. **Error log and PII:** Error metadata may contain user messages or job descriptions. The `metadata` JSON field should be sanitized before storing — strip message content, keep only structural context (jobId, threadId, route). Flag for Phase 1 research.

---

## Sources

Direct codebase analysis (all HIGH confidence — files inspected, not assumed):

- `lib/db/schema.js` — all existing tables: users, chats, messages, notifications, jobOrigins, jobOutcomes, settings, codeWorkspaces, clusterRuns, terminalSessions, terminalCosts
- `api/superadmin.js` — health/stats/jobs endpoints, `verifySuperadminToken()`, `handleSuperadminEndpoint()` switch
- `lib/superadmin/client.js` — `queryInstance()`, `queryAllInstances()`, M2M proxy pattern
- `lib/superadmin/config.js` — `getInstanceRegistry()`, `isSuperadminHub()`, `INSTANCE_NAME` env var
- `lib/db/config.js` — `getConfigValue()`/`setConfigValue()`, `settings` table type discrimination
- `lib/db/job-outcomes.js` — `saveJobOutcome()`, `getLastMergedJobOutcome()` patterns
- `lib/db/docker-jobs.js` — `getPendingDockerJobs()`, `saveDockerJob()` patterns
- `lib/terminal/cost-tracker.js` — `persistCost()`, `terminalCosts` + `terminalSessions` accumulation
- `lib/auth/middleware.js` — three-tier RBAC, Edge Runtime constraints, `req.auth.user.role` checks
- `.planning/codebase/ARCHITECTURE.md` — layer responsibilities, data flow, error handling strategy
- `.planning/codebase/CONCERNS.md` — silent failure paths in `api/index.js`, DB singleton, rate limiter
- `.planning/codebase/STRUCTURE.md` — file location conventions, where new code goes
- `.planning/PROJECT.md` — v3.0 target features, existing key decisions, out-of-scope items

---

*Architecture research for: ClawForge v3.0 Customer Launch — observability, billing, onboarding, team monitoring*
*Researched: 2026-03-17*
