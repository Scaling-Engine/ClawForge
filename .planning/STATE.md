---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 51-01-PLAN.md
last_updated: "2026-03-20T04:27:58.589Z"
progress:
  total_phases: 9
  completed_phases: 9
  total_plans: 18
  completed_plans: 18
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-17)

**Core value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results
**Current focus:** Phase 51 — code-mode-bug-fixes

## Current Position

Phase: 51 (code-mode-bug-fixes) — EXECUTING
Plan: 1 of 1

## Performance Metrics

| Metric | v2.2 | v3.0 Target |
|--------|------|-------------|
| Phases | 42 complete | 5 planned (43-47) |
| Requirements | 81 plans shipped | 20 v1 requirements to satisfy |
| Milestone cadence | 1-2 days per milestone | TBD |
| Phase 43 P02 duration | 2 min | 2 tasks, 7 files |
| Phase 43 P01 | 5 | 2 tasks | 10 files |
| Phase 43 P03 | 8 | 1 tasks | 3 files |
| Phase 44 P01 | 8 | 1 tasks | 7 files |
| Phase 44-billing-and-usage-tracking P02 | 2 | 2 tasks | 2 files |
| Phase 44-billing-and-usage-tracking P03 | ~25 | 2 tasks | 7 files |
| Phase 45-self-service-onboarding P03 | 8 | 2 tasks | 3 files |
| Phase 45-self-service-onboarding P01 | 8 | 2 tasks | 6 files |
| Phase 45-self-service-onboarding P02 | 6 | 2 tasks | 9 files |
| Phase 46-team-monitoring-dashboard P01 | 8 | 2 tasks | 4 files |
| Phase 46 P02 | 2 | 2 tasks | 3 files |
| Phase 47-commercial-launch-hardening P01 | 8 | 1 tasks | 1 files |
| Phase 47-commercial-launch-hardening P02 | 3 | 2 tasks | 2 files |
| Phase 48-code-mode-unification P01 | 8 | 2 tasks | 3 files |
| Phase 49-interactive-code-ide P01 | 8 | 2 tasks | 7 files |
| Phase 49-interactive-code-ide P02 | 4 | 3 tasks | 6 files |

**Phase 49-02 decisions:**

- **IDE display-toggle pattern:** `display: block/none` for tab panels (not unmount) to preserve xterm.js Terminal instance across tab switches
- **TerminalView self-contained:** Not imported from workspace/[id]/terminal.jsx — templates/ and lib/ cannot cross-import
- **Interactive button guard:** `codeActive && onToggleCode` — same guard as sub-mode dropdown; only admins with Code mode on see it
- **Inline close warning:** Unsafe workspace close shows inline panel in top bar (not modal) per UI-SPEC single-confirmation contract

| Phase 50-code-mode-polish P01 | 8 | 2 tasks | 4 files |
| Phase 51 P01 | 8 | 2 tasks | 2 files |

## Accumulated Context

### Decisions Made (v3.0)

- **Observability stack:** pino@^10.3.1 + pino-http + @sentry/nextjs@^10.44.0. No OpenTelemetry (overkill at 2-10 instances).
- **Billing approach:** Local SQLite enforcement only in dispatch path. Stripe sync via daily cron, never blocking job creation. Read-only usage visibility first — soft limits when patterns confirmed.
- **Onboarding redirect:** Unconditional `ONBOARDING_ENABLED` env var redirect + page-level Server Component completion check. NOT in middleware (Edge Runtime blocks better-sqlite3).
- **Four new tables:** `error_log`, `usage_events`, `billing_limits`, `onboarding_state` — all additive, no changes to existing tables (only additive columns if needed on `job_outcomes`).
- **Monitoring:** Zero new libraries. Extends existing dockerode stats, Drizzle queries, superadmin endpoint switch pattern.
- **Docs:** Task-oriented operator runbook (not architecture docs). Top 10 troubleshooting errors + deployment runbook + config reference.
- **JSONL logger testability:** appendJobEvent accepts optional baseDir parameter — avoids mocking logsDir import, keeps test isolation clean.
- **Sentry conditional init:** `enabled: !!process.env.SENTRY_DSN` guards — zero network calls when DSN absent. No instrumentationHook flag (Next.js >=15.3 auto-detects).
- **getHealth() dynamic imports:** Uses `await import(...)` inside the function to avoid circular dependency at module load time — consistent with getStats/getJobs pattern.
- **getJobSuccessRate null rate:** Returns `rate: null` (not `0`) when `total === 0` — distinguishes no-data from all-failed, important for Phase 46 monitoring display logic.
- **Billing functions synchronous:** All usage.js and enforce.js functions use better-sqlite3 .run()/.get()/.all() — consistent with existing Drizzle patterns (no async needed for SQLite).
- **Unlimited-by-default enforcement:** checkUsageLimit returns allowed:true with limit:null when no billing_limits row exists — avoids accidental lockout on new instances.
- **Billing upsert pattern:** select-then-update/insert (not INSERT OR REPLACE) — preserves warningSentPeriod field on limit value updates.
- **Billing page user prop:** AdminBillingPage accepts user prop from async server component (templates/app/admin/billing/page.js calls auth() and passes session.user) — role check stays in client component.
- **Billing page path:** Plan specified pages/admin/billing.js but ClawForge scaffolds at templates/app/admin/{page}/page.js — corrected to templates/app/admin/billing/page.js.
- **SLACK_OPERATOR_CHANNEL:** New env var for billing 80% warnings. Non-fatal if unset — job always proceeds silently. Document in .env.example.
- **usageRecorded flag:** In waitAndNotify — prevents double-counting across origin/no-origin Docker completion paths.
- **Actions path usage recording:** Inside if(origin) block only — avoids webhook replay double-counts. durationSeconds=null (timing unavailable at webhook layer).
- **MCP empty state CTA:** Toggles setup instructions panel (not a form) — MCP servers are file-based config (instances/[name]/config/MCP_SERVERS.json), no UI add form exists.
- **AGENT_* badges on secrets list:** Blue "Container" badge for AGENT_*, purple "Container+LLM" badge for AGENT_LLM_* — visual indicator of container access level for existing secrets.
- **Onboarding singleton row:** id='singleton' — only one onboarding state per instance. select-then-update/insert pattern mirrors billing upsert.
- **Wizard component file extension:** onboarding-wizard.jsx (not .js) — lib/chat/components/*.js is gitignored as esbuild output; source must be .jsx, exported via index.js.
- **dispatchOnboardingFirstJob returns job_id+branch not prUrl:** createJob() returns {job_id, branch} only; PR is created asynchronously by GitHub Actions. Job dispatch success (job_id returned) is the pipeline verification signal.
- **onboarding-steps/ subdir compiled by esbuild glob:** lib/chat/components/**/*.jsx glob in build script picks up step subcomponents automatically — no extra build config needed.
- **Alert throttle via config table:** Consecutive failure alert cooldown stored as plain config value with namespaced key `alert:consecutive_failure:{instanceName}` — no new table needed.
- **Alert in both waitAndNotify paths:** checkAndAlertConsecutiveFailures fires in both origin-thread and no-origin paths — all jobs contribute to consecutive failure counting regardless of channel source.
- **Dynamic import for monitoring/alerts.js:** Consistent with getHealth() pattern, avoids circular dependency risk at module load time.
- **MonitoringDashboard UI patterns:** getHealthColor returns muted color for null rate (no-data vs zero-rate distinction); UsageBar shows plain text when limit is null (unlimited); OnboardingBadge uses three states: Complete (green), in-progress with currentStep (yellow), N/A (gray).

### Roadmap Evolution

- Phase 48 added: Code Mode Unification — collapse three chat toggles into one unified Code toggle routing to /stream/terminal SDK bridge
- Phase 49 added: Interactive Code IDE — cherry-pick upstream /code/{id} tabbed IDE page with Code+Shell+Editor tabs
- Phase 50 added: Code Mode Polish — feature flags, mobile session continuity, Claude subscription auth

### Research Flags for Phase Planning

- **Phase 44 (Billing):** Confirm whether workspace-hour billing is in v3.0 or deferred. If deferred, omit `workspace_hour` from `usage_events` schema to avoid dead columns.
- **Phase 45 (Onboarding):** Validate Edge Runtime redirect loop risk before writing middleware code. Confirm unconditional env var redirect + page-level check does not produce circular redirect on first load.
- **Phase 46 (Monitoring):** Confirm charting library in `package.json` before choosing recharts vs. chart.js for monitoring page.

### Do-Not-Touch List

The following files must not be modified structurally — additive changes only:

- `lib/superadmin/client.js`
- `verifySuperadminToken()` in `api/superadmin.js`
- `lib/db/job-outcomes.js` (additive columns only)
- The `waitAndNotify` pattern in `lib/tools/create-job.js`
- Existing role guards in `lib/auth/middleware.js`
- `lib/ai/agent.js`
- `terminalCosts`/`terminalSessions` tables
- `lib/ws/` WebSocket proxy
- `lib/db/config.js` settings table

### Pending Todos

1. **Set up OpenAI key for Epic audio transcription** (infra, carried from v1.4)
2. **StrategyES REPOS.json content confirmation** (carried from v1.2)
3. **Fine-grained PAT scope update** — operator action, document in .env.example (carried from v1.2)
4. **AGENT_SUPERADMIN_TOKEN rotation procedure** — document in ops runbook (carried from v2.2)

### Blockers/Concerns

- StrategyES instance REPOS.json content needs operator confirmation (carried from v1.2)
- Fine-grained PAT scope update is an operator action -- must be documented in .env.example before cross-repo jobs run (carried from v1.2)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2 | Update package.json version from 0.1.0 to 2.1.0 | 2026-03-16 | c7e1ca0 | [2-make-sure-the-version-on-the-web-app-mat](./quick/2-make-sure-the-version-on-the-web-app-mat/) |
| 3 | Display agent name from SOUL.md in sidebar, chat header, greeting, and browser tab | 2026-03-16 | 0c4e473 | [3-make-instance-agent-name-prominently-vis](./quick/3-make-instance-agent-name-prominently-vis/) |
| 260318-cot | Fix sidebar menu scroll cutoff and name toggle spacing | 2026-03-18 | 37a09fa | [260318-cot-fix-sidebar-menu-scroll-cutoff-and-name-](./quick/260318-cot-fix-sidebar-menu-scroll-cutoff-and-name-/) |

## Session Continuity

Last session: 2026-03-20T04:27:58.586Z
Stopped at: Completed 51-01-PLAN.md
Resume file: None
Next action: `/gsd:plan-phase 45`
