---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Persistent Workspaces
status: executing
stopped_at: Completed 24-01-PLAN.md
last_updated: "2026-03-11T06:04:56.867Z"
last_activity: 2026-03-09 -- Completed Plan 02 (Browser terminal UI)
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 7
  completed_plans: 6
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-08)

**Core value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results
**Current focus:** v1.5 Persistent Workspaces — Phase 23 in progress (WebSocket browser terminal)

## Current Position

Milestone: v1.5 Persistent Workspaces
Phase: 23 of 24 (WebSocket Browser Terminal)
Plan: 2 of 2 in current phase (complete)
Status: Executing
Last activity: 2026-03-09 -- Completed Plan 02 (Browser terminal UI)

Progress: [██████████] 100%

## Accumulated Context

### Decisions

- Workspace volumes use `clawforge-ws-` prefix to avoid collision with job volumes (`clawforge-`)
- No Chrome deps, PostToolUse hooks, or /defaults/ in workspace image -- terminal-only interactive use
- Git auth duplicated from job entrypoint rather than shared module (independent layers)
- Destroy keeps DB record (status=destroyed) for audit trail rather than hard-deleting
- Feature branch verification is best-effort: warns on mismatch but workspace remains usable
- Reconciliation uses dynamic import for listWorkspaces to keep import graph clean
- [Phase 22]: Workspace sub-routes use regex matching in POST default case
- [Phase 22]: DELETE export added as third HTTP method handler alongside GET/POST
- [Phase 22]: Startup reconciliation wrapped in try/catch to be non-fatal
- [Phase 23]: Custom HTTP server wraps Next.js to intercept WebSocket upgrades before handler
- [Phase 23]: Tickets are in-memory Map (not DB) -- ephemeral by design with 30s TTL
- [Phase 23]: Origin check against APP_URL as secondary CSWSH defense
- [Phase 23]: Binary frame relay preserves ttyd protocol without re-encoding
- [Phase 23]: Server Actions for browser-facing Docker operations (shell spawn, git status) instead of API routes
- [Phase 23]: Inactive terminal tabs use display:none to preserve xterm state
- [Phase 24-conversational-integration]: Dynamic import of agent.js inside startCodingTool async body avoids circular module dependency
- [Phase 24-conversational-integration]: Chat context JSON-encoded and capped at 20KB for Docker env var injection (INTG-02)
- [Phase 24-conversational-integration]: detectPlatform exported from tools.js (was module-local) for Plan 02 notification routing

### Pending Todos

1. **Set up OpenAI key for Epic audio transcription** (infra, carried from v1.4)

### Blockers/Concerns

- StrategyES instance REPOS.json content needs operator confirmation (carried from v1.2)
- Fine-grained PAT scope update is an operator action -- must be documented in .env.example before any cross-repo job runs (carried from v1.2)

## Session Continuity

Last session: 2026-03-11T06:04:56.865Z
Stopped at: Completed 24-01-PLAN.md
Resume file: None
