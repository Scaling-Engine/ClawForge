---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Full Platform
status: completed
stopped_at: Completed 28-04-PLAN.md
last_updated: "2026-03-12T18:30:33.333Z"
last_activity: 2026-03-12 — completed 27-03 MCP settings page (Server Action + UI + route)
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 14
  completed_plans: 12
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results
**Current focus:** Phase 27 — MCP Tool Layer

## Current Position

Phase: 27 of 28 (MCP Tool Layer) — IN PROGRESS
Plan: 3 of 3 complete in current phase
Status: Phase 27 complete
Last activity: 2026-03-12 — completed 27-03 MCP settings page (Server Action + UI + route)

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
- [Phase 26-03]: codeMode state lives in chat.jsx so it can influence transport and other consumers without prop-drilling
- [Phase 26-03]: Branch fetch race guard uses useRef (not useState) to avoid re-renders during fast repo switching
- [Phase 27-01]: loadMcpServers reads fresh every call (no cache) since env vars may change between dispatches
- [Phase 27-01]: Template vars use {{AGENT_LLM_*}} pattern matching GitHub secrets convention for LLM-accessible credentials
- [Phase 27-01]: buildMcpConfig outputs Claude Code object map format, not ClawForge array format
- [Phase 27-02]: Health check failure clears MCP flags and continues job without MCP (graceful degradation per MCP-06)
- [Phase 27-02]: Hydration output capped at 10KB via head to prevent prompt bloat
- [Phase 27-02]: Both job and workspace containers get identical MCP config (MCP-04 parity via env vars)
- [Phase 27-03]: Env values omitted from getMcpServers() response — credentials never sent to client (MCP-09)
- [Phase 27-03]: Route page follows existing barrel import pattern (no separate requireAuth in page)
- [Phase 28-multi-agent-clusters]: label.txt default 'complete' written by entrypoint if agent doesn't write it — coordinator never needs null-check
- [Phase 28-multi-agent-clusters]: ALLOWED_TOOLS env var required in cluster entrypoint (no default) — forces explicit whitelist, blocks accidental dangerously-skip-permissions usage
- [Phase 28-01]: loadClusterConfig accepts optional filePath override so tests can point to fixtures without process.cwd() hacks
- [Phase 28-01]: clusterVolumeNameFor uses clawforge-cluster-{runId}-{agentIndex} — the cluster segment prevents collision with job and workspace volumes
- [Phase 28-01]: Migration file 0006_cluster_tables.sql required — plan said no migration needed but initDatabase() uses explicit Drizzle migrations
- [Phase 28-04]: Non-awaiting dynamic import (import().then()) used for fire-and-forget cluster dispatch in both tools.js and actions.js
- [Phase 28-04]: import().then().catch() pattern ensures function returns runId immediately even if cluster/index.js doesn't exist yet

### Pending Todos

1. **Set up OpenAI key for Epic audio transcription** (infra, carried from v1.4)

### Blockers/Concerns

- StrategyES instance REPOS.json content needs operator confirmation (carried from v1.2)
- Fine-grained PAT scope update is an operator action -- must be documented in .env.example before cross-repo jobs run (carried from v1.2)
- [Phase 27 pre-check]: Verify exact `--mcp-config` flag name in Claude Code CLI docs before Phase 27 entrypoint code (15-min check)
- [Phase 28 pre-check]: Two sub-decisions before implementation: cluster orchestrator type (Claude Code vs Node.js); Docker label mutation via `container.update()` support (1-hour spike)

## Session Continuity

Last session: 2026-03-12T18:30:33.331Z
Stopped at: Completed 28-04-PLAN.md
Resume file: None
