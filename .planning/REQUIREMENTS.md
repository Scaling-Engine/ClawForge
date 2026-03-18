# Requirements: ClawForge v3.0 Customer Launch

**Defined:** 2026-03-17
**Core Value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results

## v1 Requirements

### Observability

- [x] **OBS-01**: System writes structured JSON logs to stdout via pino on the custom HTTP server
- [x] **OBS-02**: Error events are persisted to `error_log` table and survive process restarts
- [x] **OBS-03**: Sentry captures all server and client errors with source maps
- [ ] **OBS-04**: Health endpoint returns `errorCount24h`, `lastErrorAt`, `dbStatus`, and per-instance job success rate
- [x] **OBS-05**: Job-level observability events are written to filesystem JSONL files (not DB per-event) to avoid write contention

### Billing & Usage

- [ ] **BILL-01**: System records job token usage and duration to `usage_events` table after each dispatch
- [ ] **BILL-02**: Admin can view per-instance usage metrics (job count, tokens, duration) for the current billing period
- [ ] **BILL-03**: System sends Slack warning to operator when instance reaches 80% of configured job limit
- [ ] **BILL-04**: System rejects job dispatch with a clear message (current usage, limit, reset date) when hard limit is exceeded
- [ ] **BILL-05**: Superadmin can configure per-instance billing limits (jobs per month, concurrent jobs)

### Onboarding

- [ ] **ONB-01**: New operator is redirected to onboarding wizard on first login when `ONBOARDING_ENABLED=true`
- [ ] **ONB-02**: Onboarding step progress is persisted in DB and resumes correctly across sessions
- [ ] **ONB-03**: Wizard programmatically verifies: GitHub PAT validity, Docker socket reachability, and Slack webhook connectivity
- [ ] **ONB-04**: Onboarding terminal step dispatches a real job and confirms a PR was created
- [ ] **ONB-05**: Complex admin fields (AGENT_* prefix, mergePolicy, qualityGates) display contextual tooltips
- [ ] **ONB-06**: Repos, secrets, and MCP servers pages display helpful empty states when no items exist

### Monitoring

- [ ] **MON-01**: Superadmin portal displays per-instance monitoring cards with error rate, usage vs limits, and onboarding state
- [ ] **MON-02**: Superadmin receives a Slack alert when an instance logs 3+ consecutive job failures (throttled to once per hour per instance)

### Documentation

- [ ] **DOCS-01**: Operator docs cover deployment (VPS + Docker Compose), config reference (all env vars + REPOS.json fields), and top 10 troubleshooting errors

### Launch Readiness

- [ ] **LAUNCH-01**: Existing operator Slack notification format is audited and confirmed to have zero breaking changes before external customer access is opened

## v2 Requirements

### Billing

- **BILL-06**: Stripe integration for payment processing (Checkout, Customer Portal, Billing Meters)
- **BILL-07**: Stripe webhook handler for payment events (subscription created, payment failed, plan changed)
- **BILL-08**: Billing limits admin UI at `/admin/billing` for per-instance self-service limit adjustment

### Observability

- **OBS-06**: Alert on job failure rate exceeding threshold across instances (cross-instance health degradation detection)

### Onboarding

- **ONB-07**: Post-first-job guided tour (custom component, 3-5 steps, triggered only after `first_job_run`)
- **ONB-08**: Transactional email on operator signup (welcome) and billing alerts (resend)

### Monitoring

- **MON-03**: Historical job timeline chart per instance (stacked bar, queries existing `job_outcomes`)
- **MON-04**: Container CPU and memory utilization captured at job completion via dockerode stats

### Documentation

- **DOCS-02**: Video walkthrough for first-deploy (content, not code)
- **DOCS-03**: Cross-instance failure pattern detection for 5+ instance deployments

## Out of Scope

| Feature | Reason |
|---------|--------|
| OpenTelemetry | Overkill for 2-10 instance scale; pino + Sentry covers all real needs |
| Lago / Metronome / Flexprice | Stripe Billing Meters handles metering natively; separate metering platform not justified |
| AI-powered help assistant in admin panel | High complexity, low priority vs. core stability |
| Demo instance provisioning (v3.0) | Deferred to v3.1 — coordinate when first external customer is ready to onboard |
| Mobile app | Web-first |
| Self-hosted Sentry / GlitchTip | Requires PostgreSQL, contradicts SQLite constraint |
| Automated billing suspension | Too aggressive for early operators; soft limits + manual intervention preferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| OBS-01 | Phase 43 | Complete |
| OBS-02 | Phase 43 | Complete |
| OBS-03 | Phase 43 | Complete |
| OBS-04 | Phase 43 | Pending |
| OBS-05 | Phase 43 | Complete |
| BILL-01 | Phase 44 | Pending |
| BILL-02 | Phase 44 | Pending |
| BILL-03 | Phase 44 | Pending |
| BILL-04 | Phase 44 | Pending |
| BILL-05 | Phase 44 | Pending |
| ONB-01 | Phase 45 | Pending |
| ONB-02 | Phase 45 | Pending |
| ONB-03 | Phase 45 | Pending |
| ONB-04 | Phase 45 | Pending |
| ONB-05 | Phase 45 | Pending |
| ONB-06 | Phase 45 | Pending |
| MON-01 | Phase 46 | Pending |
| MON-02 | Phase 46 | Pending |
| DOCS-01 | Phase 47 | Pending |
| LAUNCH-01 | Phase 47 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20 (Phases 43-47)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 — Phase mappings added by roadmapper*
