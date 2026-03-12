---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Full Platform
status: Ready for Phase 26
stopped_at: Completed 26-02-PLAN.md
last_updated: "2026-03-12T15:52:52.818Z"
last_activity: 2026-03-12 — completed 25-03 UI layer (JobStreamViewer + Slack edit-in-place)
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 6
  completed_plans: 5
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results
**Current focus:** Phase 25 — Headless Log Streaming

## Current Position

Phase: 25 of 28 (Headless Log Streaming) — COMPLETE
Plan: 3 of 3 complete in current phase (phase fully complete)
Status: Ready for Phase 26
Last activity: 2026-03-12 — completed 25-03 UI layer (JobStreamViewer + Slack edit-in-place)

Progress: [██████████] 100% of v2.0 plans

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.5]: Custom HTTP server wraps Next.js for WS upgrade; ticket-based WebSocket auth (30s TTL)
- [v2.0 research]: SSE over WebSocket for log streaming — unidirectional, works through API routes without custom server wrapper
- [v2.0 research]: Node built-in `crypto` (AES-256-GCM) instead of libsodium-wrappers for MCP credential encryption
- [v2.0 research]: Per-cluster-agent volumes mandatory — concurrent cluster agents must never share per-repo named volumes
- [v2.0 research]: Hard cluster safety limits (5/agent, 15/run) must be in first dispatch.js, not retrofittable
- [25-01]: globalThis.__clawforge_streams map persists stream state across Next.js hot-reloads
- [25-01]: Log parser handles both JSONL and plain-text stdout; stream_event/system types suppressed as noise
- [25-01]: Secret scrubbing is double-pass: rawLine before parse + all string fields in emitted events
- [Phase 25-02]: streamAbort.abort() called in waitAndNotify after container exits as backup cleanup for log stream
- [Phase 25-02]: cancelJobTool injects confirmation via addToThread() per CONTEXT.md decision for LangGraph memory
- [Phase 25-03]: JOB_STREAM marker appended to tool response text so agent reply naturally triggers JobStreamViewer in message.jsx
- [Phase 25-03]: Slack interval stores _unsub as a property to ensure subscriber cleanup in all exit paths
- [Phase 26-web-ui-auth-repo-selector]: unauthorized() from next/navigation is the canonical Next.js 15 way to signal 401 from Server Actions — integrates with unauthorized.js boundary vs generic Error throwing
- [Phase 26-02]: Feature flags fetched client-side via useEffect+getFeatureFlags() Server Action; FeaturesProvider outermost; RepoChatProvider inside ChatNavProvider scoped to chat session

### Pending Todos

1. **Set up OpenAI key for Epic audio transcription** (infra, carried from v1.4)

### Blockers/Concerns

- StrategyES instance REPOS.json content needs operator confirmation (carried from v1.2)
- Fine-grained PAT scope update is an operator action -- must be documented in .env.example before cross-repo jobs run (carried from v1.2)
- [Phase 27 pre-check]: Verify exact `--mcp-config` flag name in Claude Code CLI docs before Phase 27 entrypoint code (15-min check)
- [Phase 28 pre-check]: Two sub-decisions before implementation: cluster orchestrator type (Claude Code vs Node.js); Docker label mutation via `container.update()` support (1-hour spike)

## Session Continuity

Last session: 2026-03-12T15:52:52.816Z
Stopped at: Completed 26-02-PLAN.md
Resume file: None
