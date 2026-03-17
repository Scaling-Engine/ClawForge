# Pitfalls Research

**Domain:** Adding observability, billing/access control, self-service onboarding, and commercial launch readiness to an existing production Node.js/Next.js/Docker AI agent platform (ClawForge v3.0)
**Researched:** 2026-03-17
**Confidence:** HIGH (codebase inspection + official docs) / MEDIUM (community patterns, verified against codebase architecture) / LOW (flagged where applicable)

---

> **Note:** This file supersedes prior PITFALLS.md files (v2.0, v2.1, v2.2). Prior pitfalls are valid preconditions — do not regress them. This file focuses exclusively on four v3.0 feature areas: observability, billing/access control, self-service onboarding, and commercial launch safety. Pitfalls are grouped by area then ordered by severity within each area.

---

## Critical Pitfalls

### Pitfall 1: Logging Writes to SQLite at Job Frequency — Blocks the Single Writer

**What goes wrong:**
ClawForge runs SQLite in WAL mode (`lib/db/index.js`). WAL allows concurrent readers but only one writer at a time. At current scale (2 instances, ~5-10 jobs/day), write contention is negligible. Adding observability logging that writes a DB row per job event — job start, tool call, error, container exit — at job runtime frequency will serialize those writes against all other DB operations: job dispatch, workspace lifecycle, LangGraph checkpoint saves, and SSE stream notifications.

The specific failure mode: a job container emits 40-60 semantic events during execution (currently filtered by `lib/tools/log-parser.js`). If each event triggers an INSERT into a new `job_logs` table, the SQLite writer lock is acquired 40-60 times per job. Concurrent jobs and workspace operations queue behind those writes. The result is not a crash — it is a latency spike in everything: job dispatch slows, workspace status updates stall, Slack notifications delay. The system appears "slow" with no obvious cause.

**Why it happens:**
Developers instrument first without measuring write rate. "One row per event seems fine" at low scale. The existing `job_outcomes` table is one row per job (acceptable). A `job_logs` table naively adds 40-60x the write rate.

**How to avoid:**
Write observability data to the filesystem (structured JSON files under `logs/jobs/{jobId}.jsonl`), not to SQLite. The Docker job entrypoint already writes `claude-output.jsonl` to the container and surface-reads it for semantic events — extend that pattern. SQLite should track counts and summaries (one row per job), not raw event streams. If DB-backed log search is needed later, load from JSON files on demand, not via continuous inserts during job execution.

Reserve SQLite writes for: job start (one row in `job_origins`), job end (one row in `job_outcomes`), workspace status changes (one row in `code_workspaces`). Everything else goes to files.

**Warning signs:**
- New table with `createdAt` and `jobId` foreign key that is written inside a job event loop
- `db.insert(...).run()` called inside `parseLineToSemanticEvent()` or `streamManager` event handlers
- Latency increase in Slack notification timing during active jobs

**Phase to address:**
Observability phase (stabilization) — must be decided before any logging table is added

---

### Pitfall 2: Alert Fatigue From Infrastructure-Level Metrics on a 2-Instance Platform

**What goes wrong:**
Developers building observability for the first time alert on infrastructure metrics: CPU > 80%, memory > 70%, Docker container restarts, disk space. At 2-instance scale, these thresholds fire constantly during normal operation. A job container at peak Claude Code execution uses 80-90% CPU for 2-8 minutes — expected behavior, not an incident. Alerting on it produces noise that desensitizes the operator, and within two weeks all alerts are ignored.

The more dangerous failure: alert fatigue causes operators to miss the real signals — job containers that fail to start (ENOENT, auth failures), LangGraph agent deadlocks from SQLite checkpoint corruption, and workspace containers that crash silently without notifying the operator's channel.

**Why it happens:**
Infrastructure-level alerting is easy to implement (Docker stats API, system metrics) and looks like observability. Business-level alerting (job failure rate, workspace crash count, failed Slack deliveries) requires understanding what the system does and what "wrong" looks like for this specific application.

**How to avoid:**
Alert only on business outcomes, not infrastructure metrics, at this scale:
- `job_failure_rate` > 20% in the last hour (Claude Code fails, not Docker restarts)
- `workspace_crash_count` > 0 in the last 30 minutes (workspace down without recovery)
- `slack_delivery_failures` > 0 in the last 15 minutes (operator never received their notification)
- `job_dispatch_time_p95` > 30 seconds (Docker Engine degraded, falling back to Actions)
- No heartbeat from instance in 5 minutes (the whole thing is down)

These are 5 alerts. They are all actionable. Skip CPU/memory/disk unless a human has responded to them at least once in the previous month.

**Warning signs:**
- Alert configuration with thresholds like "CPU > 80%" or "memory > 70%"
- More than 10 distinct alerts configured for a 2-instance platform
- Alerts that fire during normal job execution (Claude Code runs are high-CPU by design)
- No runbook attached to any alert

**Phase to address:**
Observability phase — alert design comes before implementation, not after

---

### Pitfall 3: Billing Implementation Tracks the Wrong Unit of Consumption

**What goes wrong:**
ClawForge's value is job execution time and LLM token cost, not seats or API calls. A billing implementation that charges per "job dispatched" misses that a 30-minute multi-step cluster run costs 10x a 2-minute single-task job. A per-seat model misses that one operator can dispatch 100 jobs per day. A simple request count misses that terminal chat sessions have variable token burn.

The concrete failure: implementing a `jobs_per_month` limit that prevents dispatch after N jobs stops operators from batching small tasks while allowing one runaway multi-agent cluster to exhaust 4 hours of compute unchecked.

At v3.0 scale (Scaling Engine team + initial customers = <10 operators), the billing model does not need to be sophisticated. The failure mode is choosing a model that is misaligned with cost drivers, discovering the misalignment at first invoicing, and having to change the model (and the enforcement code) retroactively.

**Why it happens:**
Jobs-per-month is easy to implement (count rows in `job_outcomes`). It looks like a real limit. It is not aligned with cost.

**How to avoid:**
The existing `terminalCosts` table already tracks `estimated_usd` per session turn. The `job_outcomes` table tracks job duration implicitly (timestamps). The right billing unit is **compute-time** expressed as a monthly ceiling, not job count. Implement a soft limit: when estimated LLM cost for the month exceeds the tier's budget, jobs are gated (requiring explicit operator override), not hard-stopped. Hard stops on billing are the single fastest way to break a working operator's workflow.

For v3.0 at <10 operators, implement usage tracking (compute cost, job count, terminal session cost) as read-only visibility first. Add soft limits in v3.1 once the team has seen real usage patterns. Do not ship hard limits on day one to a small set of technical operators who will resent being blocked.

**Warning signs:**
- Billing limit enforced in `lib/tools/create-job.js` as a hard stop before job dispatch
- Billing metric is `COUNT(*)` from `job_outcomes` with no duration or cost weighting
- No way for an operator to override a limit manually (requires code deployment)

**Phase to address:**
Billing/access control phase — model selection before implementation; tracking before limits

---

### Pitfall 4: Usage Limit Enforcement in `create-job.js` Blocks the Docker Fast Path

**What goes wrong:**
`lib/tools/create-job.js` is on the critical path for every job dispatch. Adding a billing check at the top of this function — "query the billing table, check if the operator is within their monthly limit, then continue" — adds a synchronous DB read to the fastest path in the system.

The existing Docker dispatch path achieves ~9 seconds from user message to container running. A billing DB read adds 1-5ms per job, which is acceptable. What is not acceptable: if the billing check is an HTTP call to a third-party billing API (Stripe Usage Records, for example), the call can take 100-500ms and sometimes times out. The job dispatch path now fails intermittently when the billing API is slow.

The v3.0 billing model does not need a third-party billing API. External billing services introduce a remote dependency into the job dispatch critical path.

**Why it happens:**
Developers integrate Stripe for billing because Stripe handles the payment side, and they add usage reporting to Stripe via API calls from the dispatch path. This conflates payment processing (Stripe's domain) with usage enforcement (ClawForge's domain).

**How to avoid:**
Usage enforcement reads from local SQLite only. The `terminalCosts` and `job_outcomes` tables already have everything needed to compute monthly usage. Enforce limits by querying these tables — sub-millisecond, no network dependency. Track billing events to Stripe asynchronously via a background cron job (the `lib/cron.js` pattern already exists). The payment side never touches the dispatch critical path.

**Warning signs:**
- `lib/tools/create-job.js` importing an HTTP client or external SDK in the billing check
- Billing check throwing an error that bubbles up as a job dispatch failure
- Stripe API call inside the synchronous LangGraph tool execution

**Phase to address:**
Billing/access control phase — architecture decision before any billing code is written

---

### Pitfall 5: Self-Service Onboarding Wizard Requires Docker Compose Knowledge to Complete

**What goes wrong:**
ClawForge's self-service onboarding for new instance operators requires deploying a new Docker Compose service, configuring a Slack app, setting GitHub secrets, and pointing DNS. A wizard that surfaces all of these steps simultaneously to a new operator — even a technical one — causes abandonment. The existing instance creation flow (via conversation with Archie) generates the Docker Compose addition as a PR, which is good. But a new external customer does not have an existing ClawForge instance to generate that PR through.

The failure pattern is building a comprehensive 8-step onboarding wizard and finding that operators complete steps 1-3 (account creation, API key entry) and abandon at step 4 (Docker Compose deployment), because step 4 requires SSH access to a VPS that they have not yet provisioned. The wizard treats provisioning as a step in the wizard, but provisioning is a prerequisite that exists outside the wizard.

**Why it happens:**
Product builders understand the full deployment flow and map it linearly into a wizard. Operators encounter blockers at infrastructure steps that require context switches (SSH sessions, DNS panels, Slack admin console) that the wizard cannot facilitate.

**How to avoid:**
Separate the onboarding into two distinct phases with a clear checkpoint between them:
1. **Pre-flight** (can do in browser): generate all config artifacts (Docker Compose snippet, environment variables, Slack app manifest), present as copy-pasteable blocks. Operator does the infrastructure work offline. No wizard step should require leaving a browser tab.
2. **Verification** (returns after infrastructure is up): operator pastes a webhook URL or sends a test message; the system confirms the connection is live.

The existing instance creation PR generator already produces the config artifacts. The gap is the verification step and the clear "go do this now, come back when done" checkpoint.

**Warning signs:**
- Onboarding wizard step that says "deploy this to your server" without a way to confirm completion in-browser
- Steps that require simultaneous access to VPS SSH, Slack admin, and GitHub
- No "resume onboarding" state that persists across browser sessions (operator closes tab mid-flow and loses progress)
- Onboarding success metric is "wizard completed", not "first job dispatched"

**Phase to address:**
Onboarding phase — flow architecture must be designed before any UI is built

---

### Pitfall 6: Documentation Written for Internal Operators Ships as External Customer Docs

**What goes wrong:**
The existing ClawForge documentation (CLAUDE.md, docs/ARCHITECTURE.md, docs/DEPLOYMENT.md) is written for developers who already understand the two-layer architecture, know what LangGraph is, and can read the source code. External customers — including the initial Scaling Engine team members — do not have this context. Shipping the existing docs as "operator documentation" for v3.0 is a support overload trap: every new operator will message asking what `AGENT_LLM_` prefix means, why there are two SOUL.md files, and why their Docker container says `spawn node ENOENT`.

The failure is not that the docs are wrong — they are accurate for developers. The failure is audience mismatch. Technical accuracy does not equal operator usability.

**Why it happens:**
Developers write documentation for themselves. The existing docs are excellent reference material for contributors. Operators need task-oriented documentation ("how do I add a repo my agent can work on?"), not architecture documentation ("here is how the two-layer dispatch works").

**How to avoid:**
Write a separate operator runbook that is task-oriented: add a repo, add a user, add a GitHub secret, reset a password, check why a job failed, cancel a running job, rebuild the Docker image. One task per page. No architecture explanation. Link to the architecture docs for readers who want depth.

The operator runbook does not need to be comprehensive at launch — 10 task pages covering the most common operator actions prevent 80% of support questions. Use first-week support questions as the backlog for additional runbook pages.

**Warning signs:**
- Operator documentation that mentions "LangGraph ReAct agent" or "SQLite checkpointer" without explaining why the operator cares
- Single unified documentation site that mixes developer reference material with operator how-to guides
- No "troubleshooting" page (this is the most-read page for any deployed system)
- Documentation that is only updated when features are built, not when support questions are answered

**Phase to address:**
Documentation phase — write the operator runbook as a separate artifact from architecture docs; use support questions to drive content

---

### Pitfall 7: Metrics Cardinality Explosion From Job ID Labels

**What goes wrong:**
If observability metrics include job IDs, container IDs, or workspace IDs as label dimensions — for example, `job_duration_seconds{job_id="abc-123"}` — each unique job creates a new time series. ClawForge generates a new UUID per job. At 100 jobs/month, this is manageable. At 1,000 jobs/month, a per-job label creates 1,000 unique time series for a single metric. Prometheus and most monitoring backends degrade significantly with high-cardinality labels.

The immediate harm is not performance — it is cost. Services like Grafana Cloud and Datadog charge per active series. 1,000 unique `job_id` labels creates 1,000 billable series from a single metric. At v3.0 scale, the monitoring bill can exceed the infrastructure bill within 6 months.

**Why it happens:**
Job IDs are natural identifiers. Developers add them as labels because they want to be able to filter by specific job. This is what traces are for, not metrics. Metrics have dimensions that aggregate across many events; traces have unique identifiers per event.

**How to avoid:**
Metrics labels must have bounded cardinality. Acceptable labels for ClawForge metrics: `instance_name` (2 values), `dispatch_method` (2 values: docker/actions), `job_status` (3-4 values: success/failed/timeout/cancelled), `repo_slug` (5-10 values). Never use UUIDs, job IDs, container IDs, user IDs, or PR numbers as metric labels.

For per-job visibility, use structured log lines (append to the `logs/jobs/{jobId}.jsonl` file pattern). A trace ID in the log line lets you find a specific job in log search without creating a unique metric series per job.

**Warning signs:**
- Metric definition that includes `job_id`, `container_id`, `chat_id`, or any UUID as a label
- Monitoring bill growing linearly with job count
- Grafana query that filters on `job_id=` (this is a log search query, not a metrics query)

**Phase to address:**
Observability phase — metric schema must be reviewed for cardinality before implementation

---

### Pitfall 8: Commercial Launch Breaks Slack Notification Format for Existing Operators

**What goes wrong:**
Noah and the StrategyES team have been using ClawForge for weeks. Their Slack workflows are tuned to the current notification format. Adding billing status, onboarding state, or instance-tier labels to job completion notifications changes the format these operators see daily. Even additive changes — adding a line to the notification — can break Slack message parsing scripts or Slack workflow automations that existing operators have built against the current format.

The subtler version: adding `[TIER: FREE]` or `[INSTANCE: noah]` prefixes to notification messages causes the operators' Slack search queries to stop matching ("failed job" no longer finds messages that now say "TIER:FREE failed job").

**Why it happens:**
Product improvements almost always modify notification copy. Developers assume existing users can tolerate small notification changes. For internal tools with daily users who have workflows built on top of the notifications, this assumption fails.

**How to avoid:**
Treat Slack notification format as a versioned interface. Do not change the body of existing notifications — add new fields at the end or in a separate threaded message. If billing status must appear in notifications, add it as a Slack attachment (secondary block) that does not alter the primary notification text.

For the v3.0 launch specifically: audit every `notifySlack()` and `notifyTelegram()` call in the codebase before adding any new fields. Confirm with Noah and Sam what Slack workflows or automations they have built on top of the current notification format. Zero surprises.

**Warning signs:**
- Pull request that modifies the text of an existing Slack notification message
- New label or prefix added to all notification messages (changes every existing operator's Slack search)
- Notification format change shipped without checking with existing operators first
- No documented notification format spec (no spec = no way to detect breaking changes)

**Phase to address:**
Commercial launch phase — audit existing notification format before adding any launch-related fields

---

### Pitfall 9: Free Tier Abuse Via Ephemeral Docker Containers With No Rate Limit

**What goes wrong:**
If v3.0 introduces a free tier for onboarding, and the free tier has per-month job limits but no per-hour rate limiting, a single operator (or a script) can dispatch all free-tier jobs in the first hour of the month. Each job spins up a Docker container, clones a repo, runs Claude Code CLI with real API calls to Anthropic, and burns real Anthropic API credits. The job limit is a billing concept; without a rate limiter, the billing limit is enforced only after all the damage is done.

At 2-instance scale this is not a high-probability attack — both instances belong to known operators. But "Scaling Engine team onboarding" means adding operator accounts who are less familiar with the system. One mistyped cluster run with 10 agents can dispatch 10 parallel jobs in 30 seconds.

**Why it happens:**
Billing limits and rate limits are designed independently. The billing limit ("max 50 jobs/month") is a monthly quota check. The rate limiter ("max 3 concurrent jobs per instance") is a per-minute/per-hour check. Implementing only one of them leaves the other gap open.

**How to avoid:**
Rate limiting and billing limits are separate controls and both must exist:
- **Concurrency limit**: max N jobs running simultaneously per instance (already partially enforced via `MAX_CONCURRENT_WORKSPACES` for workspaces — apply the same pattern to job dispatch)
- **Monthly budget ceiling**: soft limit on estimated LLM cost computed from `terminalCosts` + `job_outcomes`

The concurrency limit prevents burst abuse. The monthly ceiling prevents sustained overuse. Neither prevents legitimate use. Implement concurrency limiting first (it's one check in `lib/tools/create-job.js` against `countRunningJobs()`) and ship it before any free tier is opened.

**Warning signs:**
- Free tier with job count limits but no per-instance concurrency cap
- `lib/tools/create-job.js` that dispatches jobs without checking current running job count
- Cluster runs not counted toward the concurrency limit (each agent in a cluster is a real Docker container)

**Phase to address:**
Billing/access control phase — concurrency limit before free tier access is opened

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Log raw event streams to SQLite `job_logs` table | All data in one place, queryable with Drizzle | SQLite single-writer bottleneck; 40-60 writes per job degrades dispatch latency | Never for high-frequency events; acceptable for one-row-per-job summaries |
| Reuse `job_outcomes` table for billing data | No new migration needed | `job_outcomes` has no cost weighting; billing requires different aggregation semantics; mixing concerns causes dual-purpose mutations | Only as a starting point; extract to dedicated billing tables when limits are enforced |
| Copy internal docs (ARCHITECTURE.md, PROJECT.md) as operator docs | No new writing needed | Audience mismatch; internal docs assume codebase familiarity; operators need task orientation | Never as final form; acceptable as raw material to extract from |
| Alert on CPU/memory thresholds | Easy to implement via Docker stats API | Alert fatigue within days; real failures are missed | Only for capacity planning (monthly review), not for incident paging |
| Hard-stop billing limit enforced in `create-job.js` | Prevents overuse definitively | Blocks operators' work mid-month with no override; damages trust immediately | Never on initial launch; soft limit first, hard limit after usage patterns are established |
| Per-job UUID as metric label | Individual job traceability in dashboards | Cardinality explosion; monitoring bill grows with job count | Never as a metric label; use log structured fields instead |
| 8-step onboarding wizard with infrastructure steps | Comprehensive; covers all setup | Abandonment at first infrastructure step; operators never complete | Never as a linear wizard; phase into pre-flight artifact generation + async verification |
| Single CLAUDE.md update as "documentation for external customers" | Zero writing effort | Support overload; every basic question becomes a message to Noah | Never; write task-oriented runbook as a separate document |

---

## Integration Gotchas

Common mistakes when adding v3.0 features to the existing stack.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SQLite + observability logging | INSERT per log event in job hot path | Write to `logs/jobs/{jobId}.jsonl` files; one INSERT to `job_outcomes` on job completion only |
| Docker stats API + alerting | Poll `docker.getContainer().stats()` in a tight loop for all running containers | Sample at 60-second intervals; aggregate at the instance level, not per-container |
| Stripe + job dispatch | HTTP call to Stripe Usage Records API inside `create-job.js` | Write usage to local SQLite; sync to Stripe asynchronously via `lib/cron.js` |
| Slack notifications + billing status | Modify existing notification copy to add billing fields | Add billing fields as Slack Block Kit `context` blocks appended to existing messages; never alter primary notification text |
| SSE streaming + billing check | Billing check inside the SSE stream handler delays first byte | Billing check happens at job dispatch time in `create-job.js`; SSE stream has no billing awareness |
| NextAuth session + operator tier | Store operator tier in JWT session (stale until re-login) | Read tier from DB on each admin page load; session holds identity only, not entitlements |
| GitHub Actions + observability | POST to external observability service from every Actions run | Actions runs are ephemeral; write observability artifacts to the job branch (already exists: `preflight.md`, `claude-output.jsonl`); Event Handler reads on PR webhook |
| Onboarding wizard state + page refresh | Store wizard progress in React state (lost on refresh) | Persist onboarding state in DB keyed to operator email or instance name; survives page reload |

---

## Performance Traps

Patterns that work at 2-instance scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-table scan on `job_outcomes` for monthly billing aggregation | Billing check adds 50-200ms to every job dispatch as table grows | Add composite index on `(created_at, merge_result)` at table creation; scope billing queries to rolling 30-day window | After ~500 jobs (several months of daily use) |
| Synchronous observability flush to disk on every log event | Job containers wait for filesystem write before proceeding to next step | Buffer observability writes in memory; flush every 100 events or on container exit | Immediately on high-frequency cluster runs (10+ sequential agents) |
| Superadmin health dashboard polling all instances every 5 seconds | Each poll is N HTTP requests (one per instance); at 5 instances = 5 req/poll × 60 polls/5min = 360 req/5min | Poll at 30-second intervals; show "last updated X seconds ago" in UI; 2-instance current scale is fine at 30s | With 5+ instances at 5-second polling |
| Loading full `logs/jobs/{jobId}.jsonl` file for job detail view | Log files grow to 50-500KB per job; loading all for display causes slow page renders | Stream log file in chunks; truncate display at 1000 lines with "load more"; never read entire file into memory for display | After 20+ minutes of Claude Code execution per job |
| Onboarding wizard that checks GitHub API on every wizard page load | GitHub API rate limit exhausted if multiple operators onboard simultaneously | Check GitHub config once on wizard start; cache result in session for the wizard duration | With 5+ simultaneous onboarding sessions |

---

## Security Mistakes

Domain-specific security issues for v3.0 additions.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Billing tier stored in JWT session token | Operator can decode and modify JWT to claim higher tier if `AUTH_SECRET` ever leaks | Read tier from DB on each request; session carries identity (user ID) only |
| Free tier bypass by creating multiple operator accounts per email domain | One customer gets unlimited free tier by registering multiple accounts | Enforce limits at instance level, not user level; one instance = one billing entity regardless of user count |
| Operator runbook published publicly before audit | Internal deployment details (VPS provider, network topology, default passwords) exposed | Review runbook for internal-only details before publishing; strip infrastructure-specific information |
| Usage limit check that reads from client-controlled input | Operator passes `job_count: 0` in request body to bypass limit | Usage limit check reads from `job_outcomes` DB table only; never from request input |
| Onboarding flow that echoes back `ANTHROPIC_API_KEY` for confirmation | Key visible in browser history, Slack logs if pasted into chat | Show only first 4 + last 4 characters of any API key for confirmation; never display full key |
| Observability log files written to job branch | Log files in git history are permanent; may contain prompt content, error messages with secrets | Write observability logs to instance-local filesystem only; never commit them to git; the existing `claude-output.jsonl` in job branches contains only structural output, not secrets |

---

## UX Pitfalls

Common user experience mistakes for v3.0 feature areas.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Billing limit reached notification with no context | Operator sees "limit reached" in chat with no indication of what limit, when it resets, or how to request more | Notification must include: current usage (X jobs this month), limit (Y jobs), reset date, and action ("message Noah to increase limit") |
| Onboarding "success" screen before first real job is dispatched | Operator thinks they are done; actually setup is incomplete | Success = first job dispatched + first PR created; show this as the terminal onboarding milestone, not "wizard completed" |
| Demo experience that uses a different Docker image than production | Demo works, production fails; customer sees different behavior than demo | Demo must run the exact same Docker images as production; use a dedicated demo instance, not a special demo mode |
| Health dashboard that shows "all green" when an instance has no recent jobs | Green = no errors, not green = healthy; an idle instance with a broken LangGraph agent looks healthy | Health check must include an active canary: dispatch a trivial test job every 6 hours; flag if it does not complete |
| Operator documentation that requires reading before the first action works | Technical operators expect to try first, read documentation when stuck | First action must work with zero documentation: create an account, send a chat message, see a job dispatched. Documentation is for when things go wrong. |
| Billing visibility buried in admin panel | Operators are surprised at end of month by usage; disputes ensue | Show current month's estimated cost in the main dashboard sidebar alongside job count; not just in admin/billing |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Observability:** Job logs visible in admin UI — verify logs are also written during failures (not just successful jobs); failed containers exit without reaching the log flush step if not handled
- [ ] **Observability:** Alerts configured in monitoring tool — verify each alert has a runbook URL and an on-call contact; an alert with no action guidance is noise
- [ ] **Observability:** Health dashboard shows all instances green — verify the dashboard checks actual job dispatch capability (canary), not just container uptime
- [ ] **Billing:** Usage tracking shows correct numbers — verify cluster runs count correctly (each agent in a cluster = one job; a 10-agent cluster = 10 jobs, not 1 cluster run)
- [ ] **Billing:** Soft limit is enforced — verify limit check fires for Docker dispatch path AND Actions dispatch path (same pitfall as smart execution gates in v2.2)
- [ ] **Billing:** Operator can see their usage — verify usage is visible before they hit the limit, not only after
- [ ] **Onboarding:** Wizard generates all required config artifacts — verify generated Docker Compose snippet works with current ClawForge version; test it, do not just display it
- [ ] **Onboarding:** Verification step confirms connection — verify the test message or webhook URL check actually reaches the newly deployed instance, not just returns 200
- [ ] **Onboarding:** Resumable wizard state — verify closing the browser tab and reopening does not restart from step 1
- [ ] **Documentation:** Operator runbook covers "why did my job fail?" — this is the most common question; a runbook without troubleshooting is not production-ready
- [ ] **Commercial launch:** Existing Noah and StrategyES operators tested the new version — verify no Slack notification format change, no auth flow change, no admin panel layout change that breaks muscle memory
- [ ] **Commercial launch:** Demo instance exists and is isolated from production — verify demo jobs do not share Docker networks or volumes with production instances

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Observability writes to SQLite blocking job dispatch | MEDIUM | Remove observability table migration via `db.run('DROP TABLE IF EXISTS job_logs')` in emergency; migrate to filesystem-based logging; restore job dispatch latency immediately |
| Alert fatigue — team stops responding to alerts | MEDIUM | Mute all alerts for 48 hours; audit which alerts fired without triggering action in the past month; delete those alerts; restart with 5 business-outcome alerts only |
| Hard billing limit blocked an existing operator mid-month | HIGH | Add manual override flag in `settings` table (`billing_override_until` timestamp); restore operator access within 5 minutes; increase limit; apologize |
| Onboarding wizard abandoned by first 3 external customers | MEDIUM | Switch to concierge onboarding (Noah walks through setup via screen share); record the session; use it as basis for runbook rewrite; wizard can wait |
| Slack notification format change broke operator's workflow automation | MEDIUM | Revert notification format change in hotfix; restore previous format; add format as a documented spec before next change |
| Metric cardinality explosion consuming monitoring budget | LOW | Drop the high-cardinality label from the metric definition; restart the metrics collection agent; existing time series will age out based on retention policy |
| Demo instance running production jobs (isolation failure) | HIGH | Take demo instance offline immediately; audit Docker network config; ensure demo runs on a separate Docker network with no shared volumes; redeploy with confirmed isolation |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SQLite write contention from observability logging | Observability phase (stabilization first) | Measure job dispatch latency before and after logging is added; should not increase |
| Alert fatigue from infrastructure metrics | Observability phase | Only 5 business-outcome alerts configured; no CPU/memory/disk alerts |
| Wrong billing unit (jobs not cost) | Billing/access control phase | Billing aggregation uses cost weighting from `terminalCosts`, not raw job count |
| Billing check on dispatch critical path | Billing/access control phase | Billing check reads local SQLite only; no HTTP calls in `create-job.js` |
| Metric cardinality explosion | Observability phase | No UUID or job ID used as metric label in any metric definition |
| Onboarding wizard abandonment | Onboarding phase | Two-phase design: artifact generation + async verification; no infrastructure steps inside wizard |
| Documentation audience mismatch | Documentation phase | Separate operator runbook with task-oriented pages; architecture docs remain developer reference |
| Slack notification format breaks existing operators | Commercial launch phase | Audit all `notifySlack()` calls before any notification copy change; Noah + Sam confirm no automation breakage |
| Free tier burst abuse | Billing/access control phase | Concurrency limit enforced in `create-job.js` before free tier access is opened |
| Demo instance isolation failure | Commercial launch phase | Demo instance on separate Docker network; no shared volumes with production instances |

---

## Sources

- Codebase inspection: `lib/db/schema.js`, `lib/db/job-outcomes.js`, `lib/tools/create-job.js`, `lib/tools/docker.js`, `lib/tools/stream-manager.js`, `lib/tools/log-parser.js`, `lib/cron.js`
- Architecture decisions: `.planning/PROJECT.md` key decisions table (SQLite WAL mode, single-writer constraint, fire-and-forget dispatch)
- SQLite write contention: phiresky's SQLite performance tuning blog — WAL mode infinite growth, writer serialization limits [https://phiresky.github.io/blog/2020/sqlite-performance-tuning/]
- SQLite production observability gaps: oneuptime.com SQLite production setup guide 2026 [https://oneuptime.com/blog/post/2026-02-02-sqlite-production-setup/view]
- Alert fatigue research: edgedelta.com distributed systems observability — 38% of teams cite noise as major incident response challenge [https://edgedelta.com/company/knowledge-center/distributed-systems-observability]
- Metric cardinality: Honeycomb observability best practices — UUIDs as metric labels create unbounded time series [https://www.honeycomb.io/blog/what-is-observability-key-components-best-practices]
- Billing model alignment: Kinde AI token pricing optimization — metering LLM cost per user vs per-request [https://kinde.com/learn/billing/billing-for-ai/ai-token-pricing-optimization-dynamic-cost-management-for-llm-powered-saas/]
- Developer onboarding abandonment: daily.dev — why developers abandon technical product onboarding flows [https://business.daily.dev/resources/why-developers-never-finish-your-onboarding-and-how-to-fix-it/]
- Scope creep pattern: stopscopecreep.com — "just one more feature" accumulation pattern [https://stopscopecreep.com/blog/scope-creep-software-development]
- Webhook format migration: Pipedrive 2025 webhook v2 rollout — 90-day notice, parallel operation, deprecation timeline [https://developers.pipedrive.com/changelog/post/breaking-change-webhooks-v2-will-become-the-new-default-version]
- Free tier abuse patterns: Google AI Studio free tier capacity reallocation (December 2025) — production workloads on free tier exhaust capacity [https://www.aifreeapi.com/en/posts/gemini-api-free-tier-rate-limits]

---
*Pitfalls research for: ClawForge v3.0 Customer Launch (observability, billing/access control, self-service onboarding, commercial launch safety)*
*Researched: 2026-03-17*
