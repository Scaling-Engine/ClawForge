---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Smart Operations
status: verifying
stopped_at: Completed 41-claude-code-terminal-chat/41-02-PLAN.md
last_updated: "2026-03-17T02:35:05.518Z"
last_activity: 2026-03-17 — Phase 40 Job Control UI complete (1 plan, 3 commits)
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 6
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-16)

**Core value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results
**Current focus:** v2.2 Smart Operations — Claude Code chat mode, superadmin portal, UI ops parity, smart execution

## Current Position

Phase: 40 — Job Control UI (complete)
Plan: 40-01 complete
Status: Phase 40 verified, ready for Phase 41
Last activity: 2026-03-17 — Phase 40 Job Control UI complete (1 plan, 3 commits)

```
v2.2 Progress: [██████████░░░░░░░░░░] 50% (2/4 phases)
```

## Roadmap Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 39 — Smart Execution | Quality gates, self-correction, merge policies in job containers | EXEC-01, EXEC-02, EXEC-03, EXEC-04 | Complete |
| 40 — Job Control UI | Cancel and retry jobs from web UI | OPS-01, OPS-02 | Complete |
| 41 — Terminal Chat | Embedded interactive Claude Code sessions | TERM-01 through TERM-08 | Not started |
| 42 — Admin Ops + Superadmin | Repo CRUD, config editing, instance mgmt, cross-instance superadmin | OPS-03, OPS-04, OPS-05, SUPER-01 through SUPER-05 | Not started |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
- [Phase 39-01]: Gate state stored in /tmp/gate_pass file to avoid bash subshell scope loss
- [Phase 39-01]: Gate execution runs after main git commit (after HAS_NEW_COMMIT detection) not immediately after claude -p
- [Phase 39-01]: GATE_ATTEMPT counter hard-limits self-correction to exactly 1 retry (EXEC-02)
- [Phase 39-02]: JOB_ID passed to node script via env var to avoid shell quoting issues in inline GitHub Actions script
- [Phase 39-02]: Merge policy reads first non-auto policy from REPOS.json — acceptable since jobs target one repo per instance
- [Phase 39-02]: Docker path uses stdout scanning ([GATE] FAILED marker) for gate failure detection since container filesystem not accessible post-exit
- [Phase 40-01]: requireAdmin() uses forbidden() for role failures, retryJob calls saveJobOrigin explicitly (not via dispatchDockerJob), getDockerJobs() only requires requireAuth() for read-only access
- [Phase 41-claude-code-terminal-chat]: ESM top-level import for diff2html instead of require() — project uses type:module
- [Phase 41-claude-code-terminal-chat]: Write tool calls construct pseudo-diff showing new file content (no before/after available)

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

Last session: 2026-03-17T02:35:00.858Z
Stopped at: Completed 41-claude-code-terminal-chat/41-02-PLAN.md
Resume file: None
