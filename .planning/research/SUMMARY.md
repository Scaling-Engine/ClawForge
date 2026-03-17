# Project Research Summary

**Project:** ClawForge v3.0 Customer Launch
**Domain:** Commercial SaaS launch additions to an existing AI agent gateway platform
**Researched:** 2026-03-17
**Confidence:** HIGH (stack + architecture derived from direct codebase inspection; features + pitfalls MEDIUM on external patterns)

## Executive Summary

ClawForge v2.2 is a fully operational two-layer AI agent gateway with Docker isolation, LangGraph orchestration, three-tier RBAC, and a functional superadmin portal. The v3.0 work is not a greenfield build — it is a commercial launch hardening of an existing production system. The four capability areas (observability, billing/access control, self-service onboarding, team monitoring) all integrate as additive extensions to the existing SQLite schema, API route patterns, and superadmin proxy infrastructure. The research consensus is clear: use what exists, extend rather than replace, and resist the pull toward infrastructure over-engineering at a 2-10 instance scale.

The recommended approach is disciplined addition: four new SQLite tables (`error_log`, `usage_events`, `billing_limits`, `onboarding_state`), six new library dependencies (`pino`, `pino-http`, `@sentry/nextjs`, `stripe`, `react-hook-form`, `@hookform/resolvers`), and no changes to any production-critical path that cannot be guarded behind an env var or inserted only before/after the critical operation. The existing superadmin endpoint switch pattern, Drizzle additive migrations, and dockerode stats API cover monitoring without new infrastructure. Billing enforcement reads from local SQLite only — no Stripe calls in the job dispatch critical path.

The top risk is scope creep masquerading as quality: OpenTelemetry instead of pino, Lago instead of Stripe Billing Meters, a comprehensive 8-step onboarding wizard, and hard billing limits that block operators on day one. Each of these is technically defensible and each one would delay the launch or damage the first operator relationships. The research is unambiguous: at this scale, the simpler option is correct in every case.

---

## Key Findings

### Recommended Stack

The existing stack (Next.js 15, NextAuth v5, Drizzle ORM + better-sqlite3, dockerode v4, LangGraph, Zod v4, Tailwind v4, node-cron) is treated as fixed. v3.0 adds exactly 6-7 new production dependencies, all with confirmed version compatibility against the existing stack.

**Core new technologies:**

- `pino@^10.3.1` + `pino-http@^11.0.0`: Structured JSON logging to stdout — fastest Node.js logger, mounts on the existing `server.js` custom HTTP server before the Next.js handler. Replaces ad-hoc `console.log('[prefix]', ...)` convention with structured context fields. pino v10 requires Node 20+; Dockerfile uses Node 22 — no conflict.
- `@sentry/nextjs@^10.44.0`: Client + server error capture with source maps — the only viable error tracking option that does not require PostgreSQL (self-hosted Sentry/GlitchTip both require it, contradicting the SQLite constraint). Free tier covers 5K errors/month. The `onRequestError` hook auto-captures all Server Component and API route errors.
- `stripe@^20.4.1`: Subscriptions, Checkout, Customer Portal, and Billing Meters — used for payment processing and async usage reporting only, never in the job dispatch critical path. Billing Meters handles metering natively so no separate metering platform (Lago, Metronome, Flexprice) is needed or justified at this scale.
- `react-hook-form@^7.71.2` + `@hookform/resolvers@^5.x`: Multi-step onboarding wizard with per-step Zod v4 validation. The v5 resolvers are required for Zod v4 compatibility (v4 resolvers only work with Zod v3).
- `resend@^6.9.4`: Transactional email (welcome, billing alerts) — optional at launch, add when first external customer onboards. 3K emails/month free, 5-line integration, no SMTP server to manage.

Team monitoring and health checks require zero new libraries — dockerode `container.stats({ stream: false })`, existing Drizzle queries, and the existing SSE `ReadableStream` pattern cover all needs.

### Expected Features

Full feature research in `.planning/research/FEATURES.md`.

**Must have for v3.0 launch (P1):**
- Per-instance job and workspace limits — prevents one instance from starving Docker resources on the host
- Graceful limit error messages with current usage, limit, and reset date — operators must understand why a job was rejected
- Onboarding checklist with DB-persisted progress state — without it, new operators are lost across multi-day setup
- Automated step verification (GitHub PAT validity, Docker socket reachability, Slack webhook ping) — prevents "passed wizard but broken in prod" failures
- First-job dispatch widget as the terminal onboarding milestone — value is confirmed only when a PR is created, not when a form is filled
- Error events table with persistence across restarts — post-mortem debugging requires error history that survives container restart
- Contextual tooltips on complex admin panel fields (AGENT_* prefix, mergePolicy, qualityGates) — reduces support burden
- Helpful empty states on repos, MCP servers, and secrets pages — currently show nothing
- External docs: deployment runbook + config reference — minimum bar for any production product
- Job success rate metric on superadmin health cards — single most useful operational health signal
- Usage tracking (tokens, duration) on job_outcomes — all future billing decisions require this data

**Should have, add post-launch (P2):**
- Alert on consecutive job failures (3+ threshold, Slack notification to superadmin)
- Historical job timeline chart (stacked bar, recharts, queries existing job_outcomes)
- Post-first-job guided tour (custom component, 3-5 steps, triggered only after first_job_run)
- Soft billing limits with 80% threshold warnings before hard stops
- Instance health scorecard page (extends onboarding verification into ongoing operations)
- Container resource utilization tracking (CPU/memory captured at job completion via dockerode stats)

**Defer to v3.1+ (P3):**
- Stripe integration for payment processing and subscriptions — build the entitlement layer now, wire Stripe when invoice volume justifies it
- Video walkthrough for first deploy (content, not code)
- Cross-instance failure pattern detection (useful at 5+ instances, overkill at 2-3)
- AI-powered help assistant in admin panel

### Architecture Approach

All four v3.0 capabilities follow the same three integration patterns established by the existing codebase: (1) additive SQLite table extension via `lib/db/schema.js` + Drizzle migration + dedicated `lib/db/[feature].js` query helper; (2) new cases added to the `handleSuperadminEndpoint()` switch in `api/superadmin.js` — the existing `queryAllInstances()` proxy requires zero changes; (3) feature-flagged middleware extensions behind env var guards so existing instances (Noah, StrategyES) see zero behavior change.

Full architecture research in `.planning/research/ARCHITECTURE.md`.

**Four new tables:**
1. `error_log` — structured error persistence keyed by context + severity, written by `lib/observability/errors.js`, read by superadmin health and errors endpoints
2. `usage_events` — append-only billing event log with `periodMonth` text column for cheap monthly GROUP BY, written after job dispatch and terminal session close
3. `billing_limits` — per-instance configurable limits (one row per `(instanceName, limitType)` pair), read by `lib/billing/enforce.js` before every job dispatch
4. `onboarding_state` — single row per instance state machine (`pending` → `in_progress` → `complete`), step completion derived from real data checks against existing tables (not user self-reporting)

**Critical Edge Runtime constraint:** `lib/auth/middleware.js` runs in Edge Runtime where `better-sqlite3` is unavailable. The onboarding redirect must use an unconditional redirect when `ONBOARDING_ENABLED=true` env var is set, with completion check in the page's Server Component — not in middleware.

**Billing enforcement data flow:** limit check (synchronous SQLite read, <1ms) happens before the GitHub API call in `lib/tools/create-job.js`; usage event recording happens after successful dispatch (fire-and-forget). Stripe sync happens asynchronously via the existing `lib/cron.js` daily cron — never in the dispatch path.

**Confirmed do-not-touch list:** `lib/superadmin/client.js`, `verifySuperadminToken()` in `api/superadmin.js`, `lib/db/job-outcomes.js` (additive columns only), the `waitAndNotify` detached async pattern in `lib/tools/create-job.js`, existing role guards in `lib/auth/middleware.js`, `lib/ai/agent.js`, `terminalCosts`/`terminalSessions` tables, `lib/ws/` WebSocket proxy, `lib/db/config.js` settings table.

### Critical Pitfalls

Full pitfall research in `.planning/research/PITFALLS.md`.

1. **SQLite write contention from observability logging** — writing one DB row per job event (40-60 events per job) serializes the SQLite writer against all DB operations. Prevention: write observability data to `logs/jobs/{jobId}.jsonl` filesystem files; write only one summary row to `job_outcomes` per job completion. Never INSERT inside `parseLineToSemanticEvent()` or `streamManager` event handlers.

2. **Billing enforcement blocking the Docker fast path** — adding a Stripe API call to `lib/tools/create-job.js` creates a network-dependent synchronous blocker on the 9-second job dispatch path. Prevention: enforcement reads local SQLite only (`checkUsageLimit()` — synchronous better-sqlite3 query, <1ms); Stripe usage reporting runs in the daily cron job, never in the dispatch path.

3. **Wrong billing unit of consumption** — `jobs_per_month` count misses that a 30-minute cluster run costs 10x a 2-minute single-task job. Prevention: track compute cost (`terminalCosts.estimated_usd` + job duration) as the billing unit. For v3.0 initial, implement usage tracking as read-only visibility first; add soft limits once real usage patterns are understood. Never ship hard limits to initial operators on day one.

4. **Onboarding wizard abandonment at infrastructure steps** — operators complete steps 1-3 (account, API key, config) and abandon at the Docker Compose deploy step because it requires SSH context switch. Prevention: two-phase design — (1) pre-flight artifact generation in browser (Docker Compose snippet, env var list, Slack manifest as copy-pasteable blocks); (2) async verification after operator returns from infrastructure work. No step should require leaving the browser tab.

5. **Slack notification format breaking existing operator workflows** — Noah and StrategyES operators have Slack search queries and automations built against the current notification format. Prevention: treat `notifySlack()` output as a versioned interface; add new fields only as Slack Block Kit `context` blocks appended to existing messages; audit all `notifySlack()` calls before the commercial launch phase; confirm with Noah and Sam explicitly.

6. **Documentation audience mismatch** — existing `docs/ARCHITECTURE.md` and `CLAUDE.md` are developer reference material, not operator docs. Prevention: write a separate task-oriented operator runbook (one task per page); use first-week support questions to drive additional pages.

---

## Implications for Roadmap

The research produces a clear four-phase capability sequence plus a fifth commercial launch hardening phase. The dependency graph is not arbitrary — it reflects real data dependencies between the new tables and the features that read from them.

### Phase 1: Observability Foundation

**Rationale:** No dependencies on other v3.0 work. Immediate production value — errors are currently lost on container restart. Must be in place before billing and onboarding go live because those features introduce new failure modes that will need debugging. Instruments the system before adding new complexity.

**Delivers:** `error_log` table, `lib/observability/errors.js` `captureError()` function, structured JSON logging via pino + pino-http mounted on `server.js`, Sentry.io integration for client/server error capture, health endpoint extension (`errorCount24h`, `lastErrorAt`, `dbStatus`), 30-day log pruning cron.

**Addresses features:** Error events table with persistence, job success rate metric (extended health endpoint), error context for post-mortem debugging.

**Avoids:** SQLite write contention — filesystem JSONL logging for job-level events, one summary row per job to `job_outcomes` only. Alert fatigue — configure only 5 business-outcome alerts (job failure rate, workspace crash, Slack delivery failures, dispatch P95, instance heartbeat).

**Stack:** `pino@^10.3.1`, `pino-http@^11.0.0`, `@sentry/nextjs@^10.44.0`.

**Research flag:** Sentry Next.js 15 App Router integration is fully documented with official guides — skip research. Standard logging patterns.

### Phase 2: Billing and Usage Tracking

**Rationale:** Must exist before Onboarding (Phase 3) because the onboarding `first_job` step check reads from `usage_events`. Establishes the `billing_limits` table that the monitoring dashboard (Phase 4) reads for usage-vs-limit display. Concurrency limit must be in place before any free tier access is opened.

**Delivers:** `usage_events` table (append-only, `periodMonth` text column indexed), `billing_limits` table (per-instance configurable), `lib/billing/enforce.js:checkUsageLimit()` (synchronous SQLite enforcement before job dispatch), `lib/db/usage.js:recordUsageEvent()` (fire-and-forget after dispatch), Stripe integration for payment processing (Checkout, Customer Portal, Billing Meters, webhook handler), daily cron for async Stripe meter sync, admin UI for superadmin to adjust per-instance limits.

**Addresses features:** Per-instance job/workspace limits, graceful limit error messages, usage tracking (tokens + duration on job_outcomes), plan tier stored per instance (superadmin-editable), concurrency limit to prevent burst abuse.

**Avoids:** Stripe in dispatch critical path — local SQLite enforcement only. Hard limits on day one — read-only usage visibility first; soft limits (80% warning threshold) when patterns are confirmed.

**Stack:** `stripe@^20.4.1`. Existing `node-cron` for meter sync cron.

**Research flag:** Workspace-hour usage event implementation (periodic cron vs. on-close event) needs resolution during phase planning — confirm whether workspace billing is in scope for v3.0 or deferred to v3.1.

### Phase 3: Self-Service Onboarding

**Rationale:** Depends on Phase 2 (`usage_events` must exist for `first_job` step verification). Must come before commercial launch (Phase 5). The onboarding flow determines whether external customers can self-serve or require concierge support — this is the primary Phase 5 enabler.

**Delivers:** `onboarding_state` table (single-row-per-instance state machine), `lib/onboarding/steps.js` (step definitions with programmatic completion checks against existing tables), `lib/onboarding/state.js` (state machine with `checkAndAdvance()`), `/app/onboarding/page.js` wizard UI (react-hook-form + Zod v4 + existing shadcn), `ONBOARDING_ENABLED=true` env var gate in middleware, pre-flight artifact generation (Docker Compose snippet, env var list, Slack app manifest as copy-pasteable blocks), contextual tooltips on complex admin fields, helpful empty states on key pages.

**Addresses features:** Onboarding checklist with progress persistence, automated step verification, first-job dispatch widget as terminal milestone, resumable setup across sessions, setup time estimates per step.

**Avoids:** Two-phase design only (artifact generation + async verification) — no infrastructure steps inside the wizard. Onboarding redirect in page Server Component, not middleware (Edge Runtime blocks better-sqlite3). Success = first job dispatched and PR created, not wizard form submitted.

**Stack:** `react-hook-form@^7.71.2`, `@hookform/resolvers@^5.x`. Existing Zod v4, Tailwind, shadcn components.

**Research flag:** Edge Runtime redirect loop risk — unconditional `ONBOARDING_ENABLED` redirect + page-level completion check needs validation that no circular redirect occurs. Flag for phase planning before writing middleware code.

### Phase 4: Team Monitoring Dashboard

**Rationale:** Hard dependency on all three prior phases — aggregates `error_log` (Phase 1), `usage_events` + `billing_limits` (Phase 2), and `onboarding_state` (Phase 3) via new superadmin endpoints. The `queryAllInstances()` proxy client requires zero changes; new endpoint cases are sufficient.

**Delivers:** Three new superadmin endpoint cases (`errors`, `usage`, `onboarding` in `handleSuperadminEndpoint()` switch), `/app/superadmin/monitoring/page.js` (per-instance cards with health, error rate, usage vs. limits, onboarding progress), dockerode `container.stats({ stream: false })` for CPU/memory snapshots at job completion, job success rate per instance (query on existing `job_outcomes`), alert-on-consecutive-failures logic (Slack notification, max once per hour per instance).

**Addresses features:** Cross-instance monitoring in superadmin portal, error tracking visibility, historical job timeline chart, health degradation alerts, container resource utilization tracking.

**Avoids:** Infrastructure-level alerting (CPU/memory thresholds) — business-outcome alerts only. External monitoring services (Datadog, New Relic) — all data stays in existing SQLite. Real-time streaming event feed across all instances — polling at 30-second intervals is correct at this scale.

**Stack:** Zero new libraries. Extends existing dockerode, Drizzle, and SSE ReadableStream patterns.

**Research flag:** Confirm which charting library (recharts vs. chart.js) is already present in the superadmin portal before choosing for the monitoring page — avoid duplicate charting dependency. Otherwise standard patterns — skip additional research.

### Phase 5: Commercial Launch Hardening

**Rationale:** Runs after Phases 1-4 are functional. Protects existing operators (Noah, StrategyES) from regressions introduced by the new features. Provides external operators with the documentation needed to succeed. Verifies demo isolation before external access is opened.

**Delivers:** Task-oriented operator runbook (10 pages covering most common operator actions — not architecture documentation), config reference (every env var, every REPOS.json field, every admin panel setting), deployment runbook (VPS deploy, Docker Compose, DNS, Slack app creation), troubleshooting guide (top 10 errors with fixes), Slack notification format audit (zero breaking changes confirmed with Noah and Sam), demo instance with isolated Docker network, `resend` transactional email (welcome + billing alert), post-first-job guided tour (custom component, 3-5 steps, triggered only after `first_job_run`).

**Addresses features:** External docs, troubleshooting guide, post-first-job guided tour, demo isolation, existing operator regression protection.

**Avoids:** Shipping existing `docs/ARCHITECTURE.md` as operator documentation (audience mismatch). Changing notification format without operator confirmation. Demo instance sharing Docker networks or volumes with production instances.

**Stack:** `resend@^6.9.4` (optional — add when first external customer onboards).

**Research flag:** No technical research needed. Notification format audit and demo instance isolation are coordination and operations tasks.

### Phase Ordering Rationale

- **Observability first** because all subsequent phases introduce new failure modes that need debugging infrastructure; also delivers immediate production value independent of the commercial features.
- **Billing before Onboarding** because the onboarding `first_job` step check reads from `usage_events` — if billing tables don't exist, onboarding step verification fails at the data layer.
- **Onboarding before Monitoring Dashboard** because the monitoring dashboard displays onboarding state from the `onboarding_state` table as one of its three data aggregations.
- **Commercial Hardening last** because it depends on all four capability areas being functional and is primarily a quality, documentation, and coordination phase.
- Phases 1 and 2 have no shared tables and can be built in parallel by separate developers. All other phases are sequentially dependent.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (Billing):** Workspace-hour usage event timing — confirm whether workspace session billing is in scope for v3.0 and whether the periodic cron approach (every 15 minutes) or on-close event approach is appropriate.
- **Phase 3 (Onboarding):** Edge Runtime redirect loop risk — validate that unconditional `ONBOARDING_ENABLED` redirect + page-level completion check does not produce a circular redirect on first load before writing middleware code.

Phases with well-documented patterns (skip research-phase):
- **Phase 1 (Observability):** Sentry Next.js 15 integration has official docs; pino stdout logging is standard.
- **Phase 4 (Monitoring):** Superadmin endpoint extension pattern is already proven in production; dockerode stats CPU formula is confirmed.
- **Phase 5 (Documentation):** No technical research needed — content and coordination work only.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All 7 new dependency versions confirmed via npm registry. All integration points verified against actual codebase files (`server.js`, `instrumentation.ts`, `api/index.js`, `lib/tools/create-job.js`). Node.js version compatibility verified (pino v10 requires Node 20+; Dockerfile uses Node 22). |
| Features | MEDIUM | External SaaS patterns sourced from WebSearch — multiple sources agree on TTV metrics, onboarding completion rates, billing model alignment. ClawForge-specific feature decisions are HIGH confidence — verified against v2.2 shipped capabilities and current `lib/db/schema.js`. |
| Architecture | HIGH | Derived entirely from direct inspection of 13 codebase files including `lib/db/schema.js`, `api/superadmin.js`, `lib/superadmin/client.js`, `lib/auth/middleware.js`, `lib/tools/create-job.js`, and `.planning/codebase/CONCERNS.md`. All integration points confirmed against real code. Edge Runtime constraint confirmed by Next.js documentation. |
| Pitfalls | HIGH (codebase) / MEDIUM (external) | SQLite WAL write contention and Edge Runtime `better-sqlite3` constraint confirmed against codebase. Alert fatigue (edgedelta.com), metric cardinality (Honeycomb), billing model alignment (Stripe/Zenskar), and onboarding abandonment (daily.dev) sourced from multiple external references. |

**Overall confidence:** HIGH for implementation-level decisions. MEDIUM for external product/market judgments (feature priority, operator behavior predictions at scale).

### Gaps to Address

- **Workspace-hour billing scope:** Research is ambiguous on whether workspace session metering belongs in v3.0 or v3.1. The `workspace_hour` event type is defined in the schema design but the periodic cron implementation adds complexity. Decide during Phase 2 planning — if deferred, remove `workspace_hour` from the `usage_events` schema to avoid dead schema columns.

- **Recharts vs. chart.js in existing codebase:** The monitoring dashboard needs a charting library. FEATURES.md notes recharts as "potentially already in use via superadmin portal." Confirm the actual dependency in `package.json` before Phase 4 to avoid adding a duplicate charting library.

- **Demo instance provisioning timing:** PITFALLS.md identifies demo/production isolation as critical but does not specify when the demo instance should be provisioned. Determine during Phase 5 planning whether it is a new VPS or a Docker network on the existing host, and who provisions it.

- **Billing limits admin UI placement:** ARCHITECTURE.md flags `/admin/billing` (per-instance self-service) vs. `/superadmin/billing` (cross-instance from hub) as an open question. For v3.0 with manual operator configuration, per-instance admin is sufficient. Confirm during Phase 2 planning and do not build the cross-instance UI until it is needed.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `lib/db/schema.js` — all existing tables confirmed; new table designs validated for non-conflict
- `api/superadmin.js` — endpoint switch pattern, M2M auth, `handleSuperadminEndpoint()` switch confirmed
- `lib/superadmin/client.js` — `queryAllInstances()` proxy pattern confirmed; zero changes required for new endpoints
- `lib/auth/middleware.js` — Edge Runtime constraint confirmed; three-tier RBAC guards confirmed
- `lib/tools/create-job.js` — dispatch critical path confirmed; correct insertion points for enforcement and usage recording confirmed
- `lib/terminal/cost-tracker.js` — `terminalCosts` + `terminalSessions` accumulation pattern confirmed
- `.planning/PROJECT.md` — v3.0 target features, out-of-scope decisions (OpenTelemetry, Max subscription auth) confirmed
- `.planning/codebase/CONCERNS.md` — silent failure paths in `api/index.js` confirmed as primary observability gap

### Primary (HIGH confidence — official documentation)

- [Sentry Next.js docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) — `onRequestError` hook, Next.js 15 compatibility, Turbopack SDK rewrite
- [Stripe usage-based billing docs](https://docs.stripe.com/billing/subscriptions/usage-based) — Billing Meters API confirmed
- [dockerode Container.stats GitHub issue #389](https://github.com/apocas/dockerode/issues/389) — `stream: false` one-shot stats pattern, CPU calculation formula verified
- npm registry — version confirmations for all 7 new dependencies as of 2026-03-17

### Secondary (MEDIUM confidence — multiple sources agree)

- SaaS onboarding best practices (Design Revision, Everafter.ai, Userpilot) — TTV metric, 3-7 step sweet spot, post-activation tour timing
- Usage-based billing patterns (Stripe SaaS resource, Zenskar) — enforcement-in-application-code pattern, entitlement layer design
- Multi-tenant monitoring patterns (New Relic, AWS SaaS Lens) — tenant-aware metrics, systemic vs. localized issue detection
- SQLite WAL write contention (phiresky blog, oneuptime.com 2026) — writer serialization limits, production setup recommendations
- Alert fatigue research (edgedelta.com) — 38% of teams cite noise as major incident response challenge
- Metric cardinality pitfall (Honeycomb observability best practices) — UUID labels create unbounded time series
- Developer onboarding abandonment (daily.dev) — infrastructure step context switch causes abandonment

---
*Research completed: 2026-03-17*
*Ready for roadmap: yes*
