# Requirements: ClawForge v1.5

**Defined:** 2026-03-08
**Core Value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results without operator intervention.

## v1.5 Requirements

Requirements for Persistent Workspaces milestone. Each maps to roadmap phases.

### Container Infrastructure

- [ ] **CNTR-01**: Workspace Docker image builds with Ubuntu + ttyd + tmux + Claude Code CLI, separate from job container image
- [ ] **CNTR-02**: Workspace container lifecycle supports create, start, stop, destroy, and auto-recover (exited/dead containers)
- [ ] **CNTR-03**: Workspace containers auto-stop after configurable idle timeout (default 30 min)
- [ ] **CNTR-04**: Max concurrent workspace limit enforced per instance
- [ ] **CNTR-05**: Workspace volumes use separate naming convention (`clawforge-ws-{instance}-{id}`) from job volumes
- [ ] **CNTR-06**: Workspace containers join instance Docker network for isolation (noah-net, strategyES-net)

### WebSocket & Terminal

- [ ] **TERM-01**: Custom server wrapper intercepts HTTP upgrade events and proxies WebSocket to ttyd inside container
- [ ] **TERM-02**: WebSocket auth uses ticket-based tokens (short-lived, single-use) to prevent CSWSH
- [ ] **TERM-03**: Browser terminal renders via xterm.js with resize, reconnect, and theme support
- [ ] **TERM-04**: Operator can spawn additional shell tabs (separate ttyd instances on ports 7682+)
- [ ] **TERM-05**: Git safety check warns operator of uncommitted/unpushed changes before workspace close

### Integration

- [ ] **INTG-01**: `start_coding` LangGraph tool creates workspace from conversation (resolves repo, launches container, returns URL)
- [ ] **INTG-02**: Chat context (conversation history) injected into workspace container on start via CHAT_CONTEXT env var
- [ ] **INTG-03**: Commits made during workspace session injected back into chat thread on close
- [ ] **INTG-04**: Workspace list API returns active workspaces with status (running/stopped) for reconnection
- [ ] **INTG-05**: Workspace events (crash, recovery, close) trigger notifications to operator's channel

### Data Persistence

- [ ] **DATA-01**: `code_workspaces` SQLite table tracks workspace state (container, repo, branch, feature branch, last commit)
- [ ] **DATA-02**: Workspace records survive event handler restarts
- [ ] **DATA-03**: Feature branch auto-created on workspace start (e.g., `clawforge/workspace-{shortId}`)

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### MCP Integration (v1.6)

- **MCP-01**: Workspace containers can run MCP servers alongside Claude Code
- **MCP-02**: Per-instance MCP server configuration

### Smart Execution (v1.7)

- **EXEC-01**: Pre-CI quality gates run before workspace PR merge
- **EXEC-02**: Test feedback loops within workspace sessions

### Multi-Agent (v1.8)

- **CLUSTER-01**: Coordinated agent groups sharing workspace context
- **CLUSTER-02**: Headless coding within workspace feature branches

## Out of Scope

| Feature | Reason |
|---------|--------|
| VS Code in browser | Agent-centric platform — terminal-first model; Claude Code provides file viewing/editing |
| Collaborative multi-user workspaces | 2 instances, 1-2 operators each; tmux shared sessions sufficient |
| Persistent Claude Code conversation history | Fragile coupling to CLI internals; context injection is the right model |
| File editor component | Duplicates what Claude Code already provides in terminal |
| Workspace URL sharing | Requires separate auth model; screen-share or tmux attach sufficient |
| Auto-merge from workspaces | Workspace work is exploratory; PR review gate is intentional |
| Volume sharing between workspaces and jobs | State corruption risk; separate naming conventions |
| Hot-reload workspace Docker image | Rebuild + recreate is sufficient at current scale |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CNTR-01 | TBD | Pending |
| CNTR-02 | TBD | Pending |
| CNTR-03 | TBD | Pending |
| CNTR-04 | TBD | Pending |
| CNTR-05 | TBD | Pending |
| CNTR-06 | TBD | Pending |
| TERM-01 | TBD | Pending |
| TERM-02 | TBD | Pending |
| TERM-03 | TBD | Pending |
| TERM-04 | TBD | Pending |
| TERM-05 | TBD | Pending |
| INTG-01 | TBD | Pending |
| INTG-02 | TBD | Pending |
| INTG-03 | TBD | Pending |
| INTG-04 | TBD | Pending |
| INTG-05 | TBD | Pending |
| DATA-01 | TBD | Pending |
| DATA-02 | TBD | Pending |
| DATA-03 | TBD | Pending |

**Coverage:**
- v1.5 requirements: 19 total
- Mapped to phases: 0
- Unmapped: 19 (pending roadmap creation)

---
*Requirements defined: 2026-03-08*
*Last updated: 2026-03-08 after initial definition*
