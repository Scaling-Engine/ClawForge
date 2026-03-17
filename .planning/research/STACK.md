# Stack Research

**Domain:** Commercial SaaS launch additions — observability, billing, onboarding, team monitoring
**Milestone:** v3.0 Customer Launch
**Researched:** 2026-03-17
**Confidence:** HIGH (versions confirmed via npm registry; integration patterns verified against existing codebase)

---

## Scope

This document covers **additions needed for v3.0 only**. The full existing stack (Next.js 15.5.12, NextAuth v5 beta, Drizzle ORM + better-sqlite3, dockerode v4, LangGraph, Zod v4, Tailwind v4, node-cron, stripe SDK not yet installed) is treated as fixed.

Four new capability areas:

1. **Observability** — structured error logging, health checks, error tracking
2. **Billing and access control** — Stripe subscriptions, usage metering, per-customer limits
3. **Self-service onboarding** — multi-step wizard, transactional email
4. **Team monitoring dashboard** — cross-instance container stats, job metrics, real-time updates

---

## New Additions by Feature Area

### 1. Observability

#### Structured Server-Side Logging

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `pino` | `^10.3.1` | Structured JSON logger | Fastest Node.js logger (5x faster than alternatives), zero dependencies, JSON output by default. Stdout-only — PM2/Docker Compose captures to rotating files. No log aggregation service needed at 2-instance scale. |
| `pino-http` | `^11.0.0` | HTTP request/response logging | Mounts on the existing `server.js` custom HTTP server (one `createServer()` call). Logs every request with latency, status code, and structured context without manual instrumentation. |

**Integration point:** `server.js` is the correct mount point — it wraps Next.js and already handles WebSocket upgrade interception. Add `pinoHttp()` before the Next.js handler. pino v10 requires Node.js 20+; the job container Dockerfile uses Node 22, so there is no compatibility issue.

OpenTelemetry is explicitly out of scope per `PROJECT.md` ("hooks + committed logs sufficient for 2 instances"). Pino alone covers the need.

#### Error Tracking

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@sentry/nextjs` | `^10.44.0` | Client + server error capture with source maps | Official Next.js integration with App Router. `onRequestError` hook in `instrumentation.ts` auto-captures all Server Component and API route errors. Sentry reworked the SDK specifically to avoid Turbopack bundler dependency (used in Next.js 15 dev). Cloud free tier: 5,000 errors/month — covers launch volume with no infrastructure to run. |

Self-hosted alternatives (GlitchTip, Bugsink) require PostgreSQL, which contradicts the SQLite-only constraint. At launch scale, Sentry.io free tier is correct. Re-evaluate if error volume exceeds 5K/month after launch.

**Integration point:** Add `instrumentation.ts` + `sentry.client.config.ts` + `sentry.server.config.ts` via the Sentry manual setup path. The `onRequestError` hook captures async errors in Server Components that Next.js's default error boundaries would otherwise silently swallow.

#### Health Check Endpoint

No new library. Add `/app/api/health/route.js` (App Router route handler) that:
1. Checks SQLite with a `SELECT 1` via existing Drizzle instance
2. Checks Docker socket with `docker.listContainers({ limit: 1 })` via existing dockerode instance
3. Returns `{ status: 'ok', db: true, docker: true, uptime: process.uptime(), timestamp: Date.now() }`
4. Returns HTTP 503 if either check fails

The existing superadmin health dashboard already polls each instance's health endpoint via the API proxy pattern (`queryAllInstances`). This endpoint is what it polls. No new library needed.

---

### 2. Billing and Per-Customer Access Control

#### Payment Processing

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `stripe` | `^20.4.1` | Subscriptions, Checkout, Customer Portal, Billing Meters, webhooks | Industry standard for SaaS. Stripe Checkout handles PCI compliance entirely — no card form to build. Stripe Billing Meters aggregate usage events natively — no separate metering service. Stripe Customer Portal handles plan changes and cancellation with one `billingPortal.sessions.create()` call. |

**What to use:**
- **Stripe Checkout** (`mode: 'subscription'`) for initial signup — redirect-based, no card form to build
- **Stripe Customer Portal** for plan changes and cancellation — one API call to generate a session URL
- **Stripe Billing Meters** for metered usage (job runs, terminal turns) — emit events with `stripe.billing.meterEvents.create()`, Stripe aggregates for the billing period
- **Stripe Webhooks** to sync subscription state back to local DB — listen for `customer.subscription.updated`, `invoice.paid`, `invoice.payment_failed`

**Integration point:** Add `/app/api/webhooks/stripe/route.js`. Verify `stripe-signature` header with `stripe.webhooks.constructEvent()`. The webhook handler updates the `billing_accounts` table (see schema below). Existing `api/index.js` catch-all already handles other webhooks — follow the same verification pattern.

**Why not a billing platform (Lago, Flexprice, Metronome):** Those platforms are built for millions of usage events per day and ship their own databases and event pipelines. At 10 customers and 1K job runs/month, they are infrastructure with no payoff. Stripe Billing Meters does metering natively — no separate platform justified.

#### Local Usage Tracking and Access Control

No new library. Two new SQLite tables via Drizzle schema extension:

```javascript
// New table: billing_accounts
// One row per instance — tracks Stripe state and plan limits
export const billingAccounts = sqliteTable('billing_accounts', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull().unique(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: text('plan').notNull().default('free'),       // 'free' | 'pro' | 'team'
  jobLimitMonthly: integer('job_limit_monthly').default(50),
  workspaceLimitConcurrent: integer('workspace_limit_concurrent').default(2),
  status: text('status').notNull().default('active'), // 'active' | 'past_due' | 'canceled'
  currentPeriodEnd: integer('current_period_end'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// New table: usage_events
// Lightweight event log for monthly aggregation and Stripe meter forwarding
export const usageEvents = sqliteTable('usage_events', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),
  eventType: text('event_type').notNull(),  // 'job_run' | 'terminal_turn' | 'workspace_hour'
  quantity: real('quantity').notNull().default(1),
  metadata: text('metadata'),               // JSON, nullable — e.g. { targetRepo, cost }
  createdAt: integer('created_at').notNull(),
});
```

Monthly aggregates via SQL: `SELECT COUNT(*) FROM usage_events WHERE instance_name = ? AND event_type = 'job_run' AND created_at >= ?`. SQLite handles this comfortably at 10K events/month with a simple `(instance_name, event_type, created_at)` index.

**Stripe meter event forwarding:** Add a `node-cron` (already in dependencies) daily job in `lib/billing/meter-sync.js` that aggregates yesterday's `usage_events` and calls `stripe.billing.meterEvents.create()` per customer. This batches Stripe API calls to once per day — clean and within rate limits.

**Access control enforcement:** New `lib/billing/limits.js` module exposes:
- `checkJobLimit(instanceName)` — reads `billing_accounts`, counts this month's `usage_events` for `job_run`, returns `{ allowed: bool, reason: string }`
- `checkWorkspaceLimit(instanceName)` — counts active workspaces in `code_workspaces`

Called from `lib/tools/create-job.js` before dispatch and from workspace creation. Returns early with a channel notification if the limit is exceeded (same pattern as existing error notifications).

---

### 3. Self-Service Onboarding Flow

#### Multi-Step Form

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `react-hook-form` | `^7.71.2` | Multi-step onboarding wizard with per-step validation | Standard for complex React forms. Uncontrolled inputs — no re-renders on every keystroke. Works with existing Zod v4 via `@hookform/resolvers`. Active maintenance: v7.71.2 was published March 2026. |
| `@hookform/resolvers` | `^5.x` | Zod v4 integration for react-hook-form | Required bridge between react-hook-form and Zod v4. `@hookform/resolvers` v5 is the Zod v4 compatible version (v4 resolvers only worked with Zod v3). Zero runtime overhead — schema validation runs at submit/blur only. |

**Onboarding wizard steps:**

1. Account creation (email + password → existing `lib/db/users.js`)
2. Instance name + channel selection (Slack/Telegram/Web Chat)
3. GitHub PAT entry with live validation (via existing `lib/github-api.js` — `GET /user` to verify token scope)
4. Billing plan selection (free/pro/team) → Stripe Checkout redirect on paid plans
5. Success page with operator setup checklist

**No Zustand.** Onboarding state is transient and scoped to one browser session. `useState` in the parent wizard component carries accumulated step data. Zustand adds a dependency and architectural pattern for what is a simple local form.

**Integration point:** New `/app/onboarding/*` page directory. Uses existing Tailwind + shadcn components. No changes to existing pages.

#### Transactional Email

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `resend` | `^6.9.4` | Welcome email, billing alerts | Minimal SDK (5-line integration). 3,000 emails/month free — covers 10-50 customers. HTTP API, no SMTP server to manage. Send call: `resend.emails.send({ from, to, subject, html })`. |

Use cases: (1) welcome email on account creation, (2) payment failure notification when Stripe webhook fires `invoice.payment_failed`. Inline HTML strings are sufficient for 2-3 email types — no template engine needed.

`resend` is optional at launch if the team prefers to start without email. The `stripe` webhook handler is the primary notification path for billing events. Add `resend` when the first external customer onboards.

---

### 4. Team Monitoring Dashboard

No new libraries. All monitoring capabilities extend existing dockerode, Drizzle ORM, and SSE patterns.

**Container stats via dockerode:** `container.stats({ stream: false })` returns a one-shot snapshot of CPU %, memory usage (bytes used / limit), and network I/O per container. The existing dockerode instance in `lib/tools/docker.js` already has socket access. Add `getContainerStats(containerId)` to `lib/tools/docker.js` — no new dependency.

**CPU calculation from raw stats:**

```javascript
function calculateCpuPercent(stats) {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const numCpus = stats.cpu_stats.online_cpus;
  return (cpuDelta / systemDelta) * numCpus * 100;
}
```

This is the standard dockerode stats formula — available in dockerode GitHub issue #389 and confirmed working.

**Job metrics from existing tables:** The `job_origins`, `job_outcomes`, and `usage_events` tables have all needed data. Add `lib/db/metrics.js` with queries:
- `getJobMetrics(instanceName, windowHours)` — success rate, failure rate, avg duration
- `getActiveContainers(instanceName)` — count by type (job/workspace/cluster)
- `getErrorCount(instanceName, windowHours)` — from Sentry webhook events stored in `notifications` table or a new `error_events` table

**SSE for real-time dashboard updates:** The existing `streamManager` pub/sub (already in production for headless job streaming) can be extended with a `monitoringStreamManager` that emits container lifecycle events. The `/api/admin/stream` SSE endpoint follows the exact same `ReadableStream` pattern as `/api/jobs/[id]/stream`. No new WebSocket library needed.

**Cross-instance aggregation:** The existing `queryAllInstances` pattern in the superadmin portal makes HTTP requests to each instance's API via `AGENT_SUPERADMIN_TOKEN` Bearer auth. Extend it to call `/api/health` and `/api/admin/metrics` on each instance. `Promise.allSettled` (already used) handles offline instances gracefully.

---

## Complete New Dependency List

| Library | Version | Feature Area | Status |
|---------|---------|-------------|--------|
| `pino` | `^10.3.1` | Observability | Required |
| `pino-http` | `^11.0.0` | Observability | Required |
| `@sentry/nextjs` | `^10.44.0` | Observability | Required |
| `stripe` | `^20.4.1` | Billing | Required |
| `react-hook-form` | `^7.71.2` | Onboarding | Required |
| `@hookform/resolvers` | `^5.x` | Onboarding | Required |
| `resend` | `^6.9.4` | Onboarding email | Optional at launch |

**Total new production dependencies: 6-7.** Team monitoring and health checks are pure extensions of existing dockerode + Drizzle ORM + SSE patterns — zero new libraries.

---

## Installation

```bash
# Observability
npm install pino pino-http @sentry/nextjs

# Billing
npm install stripe

# Onboarding form
npm install react-hook-form @hookform/resolvers

# Transactional email (add when first customer onboards)
npm install resend
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@sentry/nextjs` cloud free tier | GlitchTip self-hosted | GlitchTip requires PostgreSQL — introduces a second DB engine, contradicts SQLite constraint |
| `@sentry/nextjs` cloud free tier | Bugsink self-hosted | Same PostgreSQL dependency problem |
| `pino` to stdout | OpenTelemetry SDK | Explicitly out of scope in `PROJECT.md`; requires collector sidecar; 5+ packages for what pino does in 1 |
| Stripe direct | Lago / Flexprice / Metronome | Built for 1B+ events/day, ship their own databases; zero justification at 10 customers |
| Stripe direct | Lago / Flexprice + Stripe | Separate metering service is redundant — Stripe Billing Meters does metering natively |
| SQLite `usage_events` | Separate metering DB | 10K events/month fits comfortably in SQLite with a simple index; no separate DB justified at this scale |
| `resend` | SendGrid | Higher complexity, no benefit for 3 email types |
| `resend` | Nodemailer + SMTP | Requires mail server management; `resend` is a pure HTTP API call |
| `react-hook-form` | Formik | Formik is in maintenance mode; react-hook-form has better TypeScript support and active development |
| `useState` for wizard step state | Zustand | Zustand is for cross-component shared state; wizard state is local and ephemeral — `useState` is correct |
| dockerode `stats()` | cAdvisor + Prometheus | Sidecar stack for 2 containers is operational overhead with no payoff; `stats()` gives the same data with zero infrastructure |
| dockerode `stats()` | Express Status Monitor | Application-level metrics only; `stats()` gives container-level resource usage which is what a multi-container platform needs |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| OpenTelemetry SDK | Explicit out-of-scope in `PROJECT.md`; requires collector sidecar; overkill for 2 instances | `pino` for logs, `@sentry/nextjs` for errors |
| Self-hosted Sentry | Requires 58+ services including Redis, Kafka, ClickHouse | Sentry.io free tier (5K errors/month) |
| Prometheus + Grafana | Sidecar stack for 2 containers; operational overhead with no payoff at this scale | dockerode `container.stats()` + SSE to existing dashboard |
| Lago / Metronome / Flexprice | Built for 1B+ events/month; each ships its own database | Stripe Billing Meters + SQLite `usage_events` |
| Zustand for onboarding wizard | Adds a library for what `useState` handles in 5 lines | React `useState` for step + accumulated form data |
| Separate session store (Redis) for onboarding | Onboarding is a single-page multi-step form — ephemeral browser state only | React component state |
| Socket.io for monitoring dashboard | Existing SSE via `ReadableStream` handles unidirectional push; bidirectional not needed for dashboards | Existing SSE pattern from `lib/jobs/stream-api.js` |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@sentry/nextjs@10.44.0` | Next.js 15.x | Verified — `onRequestError` hook requires Next.js 15; Sentry reworked SDK to remove Turbopack bundler dependency in v9+ |
| `pino@10.3.1` | Node.js 20+ | pino v10 drops Node 18; ClawForge Dockerfile uses Node 22 — no conflict |
| `pino-http@11.0.0` | `pino@10.x` | pino-http v11 requires pino v9+; compatible with pino v10 |
| `react-hook-form@7.71.2` | React 18/19, Zod v4 | v7.71.2 current as of March 2026; Zod v4 requires `@hookform/resolvers` v5 (v4 resolvers only worked with Zod v3) |
| `stripe@20.4.1` | Node.js 16+, ESM | Pure HTTP client; compatible with `"type": "module"` (project uses ESM throughout) |
| `resend@6.9.4` | Node.js 18+ | Pure HTTP client; no bundler constraints |

---

## DB Schema Changes Required

```javascript
// lib/db/schema.js additions for v3.0

// billing_accounts — one row per instance
export const billingAccounts = sqliteTable('billing_accounts', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull().unique(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: text('plan').notNull().default('free'),        // 'free' | 'pro' | 'team'
  jobLimitMonthly: integer('job_limit_monthly').default(50),
  workspaceLimitConcurrent: integer('workspace_limit_concurrent').default(2),
  status: text('status').notNull().default('active'),  // 'active' | 'past_due' | 'canceled'
  currentPeriodEnd: integer('current_period_end'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// usage_events — lightweight event log for metering
export const usageEvents = sqliteTable('usage_events', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),
  eventType: text('event_type').notNull(),  // 'job_run' | 'terminal_turn' | 'workspace_hour'
  quantity: real('quantity').notNull().default(1),
  metadata: text('metadata'),               // JSON, nullable
  createdAt: integer('created_at').notNull(),
});
// Index: (instance_name, event_type, created_at) for monthly aggregation queries
```

---

## Integration Points with Existing Stack

| New Capability | Integrates With | How |
|----------------|----------------|-----|
| `pino-http` | `server.js` (custom HTTP server) | Mount before Next.js handler in the existing `createServer()` call |
| `@sentry/nextjs` | `instrumentation.ts` (Next.js built-in) | `onRequestError` hook auto-captures all Server Component and API route errors |
| Stripe webhooks | `api/index.js` (existing catch-all router) | New `/webhooks/stripe` route; verify `stripe-signature`; update `billing_accounts` |
| Billing limits | `lib/tools/create-job.js`, workspace creation | Call `lib/billing/limits.js` before dispatch; return error message to channel if exceeded |
| `react-hook-form` + `@hookform/resolvers` | `/app/onboarding/*` pages | New pages only; no changes to existing pages |
| `resend` | `lib/billing/stripe-webhook.js` | Called on `invoice.paid` (welcome) and `invoice.payment_failed` (alert) |
| Container stats | `lib/tools/docker.js` (existing dockerode) | Add `getContainerStats(id)` function using `container.stats({ stream: false })` |
| Usage events | `lib/tools/create-job.js`, `lib/chat/terminal-api.js` | Emit to `usage_events` table on job dispatch and terminal turn completion |
| Monitoring SSE | Existing `streamManager` pattern | New `monitoringStreamManager` + `/api/admin/stream` endpoint following same `ReadableStream` pattern |

---

## Sources

- [pino npm](https://www.npmjs.com/package/pino) — v10.3.1 confirmed current; v10 drops Node 18
- [pino-http GitHub](https://github.com/pinojs/pino-http) — v11.0.0 confirmed current; requires pino v9+
- [Sentry Next.js docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) — `onRequestError` hook, Next.js 15 compatibility, Turbopack SDK rewrite
- [@sentry/nextjs npm](https://www.npmjs.com/package/@sentry/nextjs) — v10.44.0 confirmed current
- [Sentry self-hosting requirements](https://docs.sentry.io/self-hosted/) — 58+ services confirmed; rules out self-hosting at this scale
- [Stripe usage-based billing docs](https://docs.stripe.com/billing/subscriptions/usage-based) — Billing Meters API confirmed; `meterEvents.create()` endpoint
- [Stripe Node SDK npm](https://www.npmjs.com/package/stripe) — v20.4.1 confirmed current; ESM compatible
- [react-hook-form npm](https://www.npmjs.com/package/react-hook-form) — v7.71.2 confirmed current as of March 2026
- [resend npm](https://www.npmjs.com/package/resend) — v6.9.4 confirmed current
- [dockerode Container.stats](https://github.com/apocas/dockerode/issues/389) — `stream: false` one-shot stats pattern confirmed; CPU calculation formula verified
- [GlitchTip installation docs](https://glitchtip.com/documentation/install/) — PostgreSQL requirement confirmed; rules out for SQLite project
- ClawForge `lib/db/schema.js` — existing tables analyzed to design non-conflicting new tables (HIGH confidence — direct codebase inspection)
- ClawForge `lib/tools/create-job.js` — identified as correct integration point for billing limit checks (HIGH confidence — direct codebase inspection)
- ClawForge `package.json` — full dependency baseline confirmed; `node-cron` already present for meter sync cron job (HIGH confidence — direct codebase inspection)
- ClawForge `PROJECT.md` — "Out of Scope" section confirms OpenTelemetry explicitly excluded (HIGH confidence — direct codebase inspection)

---

*Stack research for: ClawForge v3.0 Customer Launch — observability, billing, onboarding, team monitoring*
*Researched: 2026-03-17*
