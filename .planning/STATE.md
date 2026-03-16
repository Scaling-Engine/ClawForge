---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Smart Operations
status: active
stopped_at: null
last_updated: "2026-03-16T18:30:00.000Z"
last_activity: 2026-03-16 — Roadmap defined, ready for Phase 39 planning
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-16)

**Core value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results
**Current focus:** v2.2 Smart Operations — Claude Code chat mode, superadmin portal, UI ops parity, smart execution

## Current Position

Phase: 39 — Smart Execution (not started)
Plan: —
Status: Roadmap defined, awaiting Phase 39 planning
Last activity: 2026-03-16 — v2.2 roadmap created (4 phases, 22 requirements mapped)

```
v2.2 Progress: [░░░░░░░░░░░░░░░░░░░░] 0% (0/4 phases)
```

## Roadmap Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 39 — Smart Execution | Quality gates, self-correction, merge policies in job containers | EXEC-01, EXEC-02, EXEC-03, EXEC-04 | Not started |
| 40 — Job Control UI | Cancel and retry jobs from web UI | OPS-01, OPS-02 | Not started |
| 41 — Terminal Chat | Embedded interactive Claude Code sessions | TERM-01 through TERM-08 | Not started |
| 42 — Admin Ops + Superadmin | Repo CRUD, config editing, instance mgmt, cross-instance superadmin | OPS-03, OPS-04, OPS-05, SUPER-01 through SUPER-05 | Not started |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

### v2.2 Key Architecture Notes

- **Terminal chat transport**: Extend existing AI SDK UIMessageStream in `lib/chat/api.js` — do NOT add a new WebSocket or reuse ttyd. Zero new server infrastructure.
- **Agent SDK**: `@anthropic-ai/claude-agent-sdk@^0.2.76` is the one new npm dependency. Always set `settingSources: []` in containers to prevent settings.json override.
- **Superadmin auth**: `AGENT_SUPERADMIN_TOKEN` API key proxy between hub and instances — never share `AUTH_SECRET` across instances.
- **requireAdmin() pattern**: Every destructive Server Action must call `requireAdmin()` as first line. Docker socket is fully writable — one unguarded action = host escape.
- **Quality gate path**: Docker-dispatched jobs need gates inside `lib/ai/tools.js` or entrypoint.sh synchronously — `run-job.yml` gates only cover Actions-dispatched jobs.
- **Self-correction**: Hard max of 1 correction iteration (2 total attempts). Never iterate more.
- **In-process vs container for terminal mode**: Unresolved. Resolve during Phase 41 planning before writing code. Key tradeoff: in-process (~0ms start, Claude Code has filesystem access to server) vs container (~9s start, matches existing security posture).

### Research Flags for Planning

- **Phase 41 (Terminal Chat)**: Resolve in-process vs container execution model before planning. Verify `node` is on PATH inside any container hosting Agent SDK. Confirm readline wrapper needed for JSONL parsing.
- **Phase 42 (instanceId migration)**: Schema touches chats, job_outcomes, cluster_runs, code_workspaces, notifications. Needs backward-compat nullable migration plan.

### Pending Todos

1. **Set up OpenAI key for Epic audio transcription** (infra, carried from v1.4)
2. **StrategyES REPOS.json content confirmation** (carried from v1.2)
3. **Fine-grained PAT scope update** — operator action, document in .env.example (carried from v1.2)
4. **AGENT_SUPERADMIN_TOKEN rotation procedure** — document in ops runbook before shipping Phase 42

### Blockers/Concerns

- StrategyES instance REPOS.json content needs operator confirmation (carried from v1.2)
- Fine-grained PAT scope update is an operator action -- must be documented in .env.example before cross-repo jobs run (carried from v1.2)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2 | Update package.json version from 0.1.0 to 2.1.0 | 2026-03-16 | c7e1ca0 | [2-make-sure-the-version-on-the-web-app-mat](./quick/2-make-sure-the-version-on-the-web-app-mat/) |
| 3 | Display agent name from SOUL.md in sidebar, chat header, greeting, and browser tab | 2026-03-16 | 0c4e473 | [3-make-instance-agent-name-prominently-vis](./quick/3-make-instance-agent-name-prominently-vis/) |

## Session Continuity

Last session: 2026-03-16T18:30:00.000Z
Stopped at: v2.2 roadmap defined — ready to plan Phase 39
Resume file: None
