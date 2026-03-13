---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Upstream Feature Sync
status: Phase 32 shipped — RBAC enforcement with middleware guard, forbidden page, and admin sidebar link
stopped_at: Completed 32-01-PLAN.md
last_updated: "2026-03-13T06:10:00.000Z"
last_activity: 2026-03-13 — Phase 32 executed and verified
progress:
  total_phases: 10
  completed_phases: 4
  total_plans: 6
  completed_plans: 6
  percent: 30
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results
**Current focus:** v2.1 Upstream Feature Sync — cherry-pick missing upstream features from thepopebot

## Current Position

Phase: 32 of 38 (Auth Roles) — COMPLETE
Plan: 1/1 plans executed and verified
Status: Phase 32 shipped — RBAC enforcement with middleware guard, forbidden page, and admin sidebar link
Last activity: 2026-03-13 — Phase 32 executed and verified

Progress: [████░░░░░░] 40% of v2.1 phases (4/10)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.1 strategy]: Cherry-pick in 3 waves — Wave 1 (UI additions), Wave 2 (auth/admin), Wave 3 (advanced features)
- [v2.1 strategy]: Keep dockerode (ClawForge) not raw http (upstream) for Docker API
- [v2.1 strategy]: Use Node crypto (AES-256-GCM) not libsodium-wrappers for encryption
- [v2.1 strategy]: Convert all `thepopebot/*` package imports to relative imports
- [v2.1 strategy]: Keep ClawForge xterm v6, not upstream xterm v5
- [v2.1 strategy]: Keep ClawForge cluster backend — cherry-pick only upstream cluster UI components
- [v2.1 strategy]: AssemblyAI for voice (not OpenAI Whisper as upstream uses)
- [Phase 29-foundation-config]: crypto.js reads AUTH_SECRET directly from process.env to avoid circular dependency with getConfig
- [Phase 29-foundation-config]: setConfig wrapper added to lib/config.js (not in upstream) to satisfy CONFIG-01 requirement
- [Phase 30-new-pages]: updatePassword imports auth() via dynamic import to avoid circular dependency
- [Phase 30-new-pages]: Runners empty state message specifically calls out admin:org scope requirement to explain 403 gracefully
- [Phase 30-new-pages]: PR badge uses identical pattern to Notifications badge (collapsed absolute + expanded inline)
- [Phase 31-chat-enhancements]: @streamdown/code exports a pre-built code instance (not a factory) — imported directly, no code() call needed
- [Phase 31-chat-enhancements]: interactiveMode hint injected after repo context so [INTERACTIVE_MODE: true] is first token agent sees in prompt
- [Phase 31-chat-enhancements]: controls prop set to false during streaming to prevent copy/collapse button jitter mid-stream
- [Phase 32-auth-roles]: ForbiddenPage is bare page (no sidebar) matching unauthorized.js precedent
- [Phase 32-auth-roles]: Admin middleware check placed AFTER auth check so unauthenticated users hit /login first

### Pending Todos

1. **Set up OpenAI key for Epic audio transcription** (infra, carried from v1.4)

### Blockers/Concerns

- StrategyES instance REPOS.json content needs operator confirmation (carried from v1.2)
- Fine-grained PAT scope update is an operator action -- must be documented in .env.example before cross-repo jobs run (carried from v1.2)

## Session Continuity

Last session: 2026-03-13T06:10:00.000Z
Stopped at: Completed 32-01-PLAN.md
Resume file: None
