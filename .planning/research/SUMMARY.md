# Project Research Summary

**Project:** ClawForge v1.5 Persistent Workspaces
**Domain:** Interactive browser terminals connected to persistent Docker containers for AI coding agent platform
**Researched:** 2026-03-08
**Confidence:** MEDIUM-HIGH

## Executive Summary

ClawForge v1.5 transforms the platform from fire-and-forget job dispatch (ephemeral containers running `claude -p` that produce PRs) into interactive devboxes where operators open a browser terminal connected to a long-running Docker container with Claude Code in interactive mode. The proven architecture is ttyd (terminal server inside container) + xterm.js (terminal emulator in browser) + ws (WebSocket proxy in event handler) + tmux (session persistence). This stack is battle-tested in the thepopebot reference implementation and aligns with how production browser-terminal systems are built (Gitpod, code-server, etc.).

The recommended approach extends the existing v1.4 Docker Engine foundation rather than replacing it. The same dockerode client, Docker socket, named volumes, and instance networking (noah-net, strategyES-net) are reused. A new workspace container type runs alongside ephemeral job containers with a fundamentally different lifecycle: long-running, health-checked, restart-policy-protected, and accessed via WebSocket proxy rather than fire-and-forget dispatch. The critical new infrastructure piece is the WebSocket proxy -- Next.js does not natively support WebSocket upgrade, so a thin custom server wrapper (~30 lines) is needed to intercept HTTP upgrade events and route them to ttyd inside workspace containers.

The top risks are: (1) WebSocket upgrade failing silently through the Next.js/Traefik stack -- this must be proven working before any UI is built; (2) cross-site WebSocket hijacking exposing terminals to unauthorized users -- ticket-based auth and Origin validation are mandatory from day one; (3) zombie workspace containers accumulating without cleanup -- idle timeout and hard lifetime limits must ship with the first workspace creation; and (4) Docker socket accidentally mounted in workspace containers, which would give interactive shell users full host access. All four are preventable with disciplined implementation, but each becomes expensive to fix retroactively.

## Key Findings

### Recommended Stack

The v1.5 stack is additive -- no existing dependencies change. Four new npm packages for the event handler (`ws`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-attach`) and two system packages in the workspace Dockerfile (`ttyd` binary from GitHub releases, `tmux` via apt). All are mature, high-confidence choices with millions of weekly downloads or thousands of GitHub stars.

**Core technologies:**
- **ttyd 1.7.7**: Terminal server inside workspace containers -- handles PTY allocation, flow control, resize, and WebSocket protocol. Single binary, no native compilation needed.
- **@xterm/xterm 5.5.0**: Browser terminal emulator (not v6.0.0 which has breaking changes). Powers VS Code's integrated terminal.
- **ws 8.19.0**: WebSocket server for proxy layer. Required because Next.js API routes cannot handle WebSocket upgrade.
- **tmux**: Session persistence inside containers. Survives WebSocket disconnects, browser tab closes, and network drops.
- **@xterm/addon-fit + @xterm/addon-attach**: Auto-resize terminal to browser dimensions and bidirectional WebSocket bridge.

**Critical version decision:** Use xterm.js v5.5.0, not v6.0.0. v6 removed canvas renderer, changed EventEmitter, and broke scrollbar behavior. The reference implementation is validated on v5.5. Upgrade to v6 after workspaces are stable.

### Expected Features

**Must have (table stakes):**
- Workspace container lifecycle (create/start/stop/destroy) with auto-recovery
- SQLite persistence for workspace records (code_workspaces table via Drizzle)
- ttyd + tmux terminal serving inside containers
- WebSocket proxy through event handler with JWT auth
- Browser terminal UI (xterm.js page component)
- `start_coding` LangGraph tool for conversational entry
- Chat-to-workspace context bridge (inject conversation into container)
- Workspace-to-chat result bridge (commits injected back into thread)
- Git safety check on workspace close (warn about uncommitted/unpushed work)
- Per-instance workspace isolation (noah-net vs strategyES-net)

**Should have (differentiators):**
- Additional shell tabs (multiple ttyd instances on ports 7682+)
- Feature branch auto-creation on workspace start
- Commit/merge toolbar actions in terminal UI
- Workspace list/management page
- Container resource limits (2GB RAM, 1 CPU)
- Workspace idle timeout (30 min default)

**Defer (v2+):**
- VS Code in browser (code-server) -- wrong abstraction for agent-centric platform
- Collaborative multi-user workspaces -- 2 instances, no demand
- File editor component (Monaco/CodeMirror) -- duplicates Claude Code's own UI
- MCP server integration in workspaces -- v1.6 scope
- Volume sharing between workspace and job containers -- use separate volumes
- Hot-reload of workspace Docker image

### Architecture Approach

The architecture adds a second container lifecycle (persistent workspaces) alongside the existing ephemeral job containers, managed by the same dockerode instance through the same Docker socket. A new WebSocket proxy component (`lib/ws-proxy.js`) bridges browser xterm.js connections to ttyd inside containers via a thin custom server wrapper that intercepts HTTP upgrade events. The key architectural decision is: use a custom server wrapper (`server.js`, <30 lines) instead of trying to hack WebSocket support into Next.js instrumentation -- this is proven, maintainable, and requires only a one-line change in the Dockerfile CMD.

**Major components:**
1. **Workspace Container Image** (`templates/docker/workspace/`) -- Node 22 + Claude Code + ttyd + tmux, long-running with `ttyd -W -p 7681 tmux new -A -s main` as entrypoint
2. **Docker Manager extensions** (`lib/tools/docker.js`) -- `ensureWorkspaceContainer()`, `stopWorkspace()`, `destroyWorkspace()`, `reconcileWorkspaces()` alongside existing job functions
3. **WebSocket Proxy** (`lib/ws-proxy.js`) -- HTTP upgrade interception, JWT auth, bidirectional pipe to container's ttyd port, lazy IP resolution via Docker inspect
4. **Database schema** (`code_workspaces` table) -- workspace tracking with instance scoping, one workspace per repo per instance
5. **LangGraph tool** (`start_coding`) -- conversational entry point following existing `createJobTool` pattern
6. **Context bridges** -- chat-to-workspace (JSON context injected as file) and workspace-to-chat (commits injected as AIMessage)

### Critical Pitfalls

1. **WebSocket upgrade fails silently through Next.js/Traefik** -- Do not route WebSocket through Next.js API routes. Use a separate ws server or custom server wrapper. Configure Traefik timeouts for long-lived connections. Must be proven working BEFORE building any UI.

2. **Cross-site WebSocket hijacking** -- WebSocket connections do not respect CORS. Implement ticket-based auth (short-lived token via authenticated HTTP endpoint, not cookie-based). Validate Origin header. Must be in the first WebSocket handler, not added later.

3. **Zombie workspace containers accumulate** -- No natural lifecycle end. Implement idle timeout (30 min), hard lifetime limit (8 hours), and max concurrent cap (3 per instance). Ship cleanup WITH workspace creation, not after.

4. **Docker socket mounted in workspace containers** -- Never mount Docker socket into workspace containers. Add a defensive check in `createContainer()` that throws if socket mount is present. Non-negotiable.

5. **Traefik idle timeout kills sessions** -- Default 180s idle timeout drops WebSocket connections. Configure `respondingTimeouts.idleTimeout=3600s` and implement 30s ping/pong keepalive via ttyd `--ping-interval`.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Workspace Docker Image + Database Schema
**Rationale:** Zero dependencies on each other -- can be built in parallel. Everything else depends on having a working container image and a place to track workspace state.
**Delivers:** Buildable workspace Docker image (ttyd + tmux + Claude Code), `code_workspaces` Drizzle schema + migration, CRUD functions.
**Addresses:** Table stakes -- workspace container image, database persistence.
**Avoids:** Entrypoint drift (Pitfall 12) -- design shared base script strategy upfront. Volume separation (Pitfall 7) -- use `clawforge-ws-{instance}-{id}` naming from the start.

### Phase 2: WebSocket Proxy + Custom Server Wrapper
**Rationale:** The critical-path bottleneck. Nothing works without WebSocket transport. Must be proven through the full Traefik stack before building UI on top.
**Delivers:** Working WebSocket proxy with JWT auth, custom server wrapper (`server.js`), Traefik timeout configuration, Origin validation, ticket-based auth.
**Addresses:** Table stakes -- WebSocket proxy, per-instance isolation.
**Avoids:** Silent WebSocket failure (Pitfall 1), CSWSH (Pitfall 3), Traefik idle timeout (Pitfall 9). All three must be solved in this phase.

### Phase 3: Container Lifecycle Management
**Rationale:** Depends on Phase 1 (image + schema) being complete. The Docker operations that create, start, stop, recover, and destroy workspace containers.
**Delivers:** `ensureWorkspaceContainer()`, `stopWorkspace()`, `destroyWorkspace()`, `reconcileWorkspaces()`, idle timeout, hard lifetime limit, max concurrent cap.
**Addresses:** Table stakes -- container lifecycle, auto-recovery. Differentiators -- resource limits, idle timeout.
**Avoids:** Zombie containers (Pitfall 2), Docker socket exposure (Pitfall 4), API key billing from idle Claude Code (Pitfall 13).

### Phase 4: Browser Terminal UI
**Rationale:** Depends on Phase 2 (WebSocket proxy working). Relatively simple once the proxy works -- xterm.js + addon-attach + addon-fit.
**Delivers:** `/code/[id]/page.jsx` terminal page, WebSocket connection lifecycle, reconnect logic, resize handling, git safety dialog on close.
**Addresses:** Table stakes -- browser terminal UI, git safety on close. Minor pitfalls -- resize garble (Pitfall 5), multi-tab conflicts (Pitfall 11).
**Avoids:** Terminal resize issues by debouncing resize events and sending dimensions on reconnect.

### Phase 5: LangGraph Tool + Context Bridges
**Rationale:** Depends on Phases 2-4 being solid. These are the conversational integration layer that makes workspaces accessible from Slack/Telegram/Web Chat.
**Delivers:** `start_coding` tool, chat-to-workspace context injection, workspace-to-chat result bridge, two-phase response pattern for async container startup.
**Addresses:** Table stakes -- start_coding tool, context bridges. Differentiators -- feature branch auto-creation.
**Avoids:** Start race condition (Pitfall 10) via readiness probe + UI loading state. Prompt injection (Pitfall 8) via framing context as read-only data. Noisy notifications (Pitfall 14) via batched/user-controlled bridging.

### Phase 6: Polish + Differentiators
**Rationale:** After core workspace flow is stable, add quality-of-life features.
**Delivers:** Additional shell tabs, workspace list/management UI, commit/merge toolbar actions, Slack/Telegram notifications on workspace events.
**Addresses:** Differentiators that enhance but do not block the core experience.

### Phase Ordering Rationale

- Phases 1 and 2 can partially overlap since they have no dependencies on each other, but Phase 2 (WebSocket) is the highest-risk item and should get early attention.
- Phase 3 (container lifecycle) depends on Phase 1 (image exists, schema exists) but NOT on Phase 2 (proxy). However, end-to-end testing requires the proxy.
- Phase 4 (UI) strictly depends on Phase 2 (proxy). Building UI before the proxy works wastes effort.
- Phase 5 (tools + bridges) depends on everything being stable. Context bridges are where prompt injection risk lives -- design carefully.
- Phase 6 (polish) is independent of the critical path and can be trimmed if the milestone runs long.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (WebSocket Proxy):** Highest risk. Custom server wrapper pattern needs validation against ClawForge's PM2 setup. Traefik WebSocket passthrough needs testing. Ticket-based auth design needs specification.
- **Phase 5 (Context Bridges):** Prompt injection prevention strategy needs careful design. The framing of chat context as read-only data versus executable instructions is subtle.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Docker Image + Schema):** Well-documented. ttyd binary download, tmux apt install, Drizzle schema addition. Direct port from thepopebot.
- **Phase 3 (Container Lifecycle):** Extends existing dockerode patterns. `dispatchDockerJob()` is the template; workspace functions are parallel implementations.
- **Phase 4 (Browser Terminal UI):** xterm.js + addon-attach is a documented recipe. thepopebot's `terminal-view.jsx` (~200 lines) is the reference.
- **Phase 6 (Polish):** Standard CRUD UI and incremental feature additions.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies validated against reference implementation and official docs. Version decisions well-reasoned. |
| Features | HIGH | Feature list derived from production thepopebot code (direct GitHub API inspection). Table stakes vs differentiators clearly separated. |
| Architecture | MEDIUM-HIGH | Component boundaries and data flows are clear. The custom server wrapper approach is the main uncertainty -- proven pattern but requires PM2/Dockerfile changes. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls (WebSocket, CSWSH, zombies, socket exposure) are well-documented with clear prevention. Some pitfalls (prompt injection via context bridge) are harder to fully prevent. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Custom server wrapper + PM2 interaction:** The `server.js` wrapper replaces `next start` as the process entry point. Need to verify PM2 process management (restart, monitoring) works correctly with the custom wrapper. Test during Phase 2 planning.
- **Traefik WebSocket passthrough:** Research says Traefik v3 handles WebSocket upgrade automatically, but this has not been tested against ClawForge's specific Traefik configuration. Validate early in Phase 2.
- **Ticket-based WebSocket auth design:** The CSWSH prevention requires issuing short-lived tickets via an authenticated HTTP endpoint. The exact ticket lifecycle (creation, validation, invalidation, expiry) needs specification during Phase 2 planning.
- **Workspace volume naming convention:** FEATURES.md says use separate volumes (`clawforge-ws-{instance}-{id}`), but STACK.md suggests reusing existing volumes. The separation approach from FEATURES.md is correct -- needs to be enforced in implementation.
- **Claude Code idle behavior:** Whether Claude Code consumes API credits when idle in a workspace terminal is unclear. Test during Phase 3 to determine if lazy initialization is needed.

## Sources

### Primary (HIGH confidence)
- thepopebot `lib/code/` -- Production reference implementation (actions.js, ws-proxy.js, terminal-sessions.js, terminal-view.jsx, code-page.jsx)
- thepopebot `templates/docker/claude-code-workspace/` -- Workspace container image definition
- ClawForge codebase -- `lib/tools/docker.js`, `lib/ai/tools.js`, `lib/db/schema.js`, `docker-compose.yml`, `templates/docker/job/`
- [ttyd GitHub](https://github.com/tsl0922/ttyd) -- Terminal server architecture, WebSocket protocol, auth options
- [xterm.js GitHub releases](https://github.com/xtermjs/xterm.js/releases) -- v5.5.0 vs v6.0.0 breaking changes
- [ws npm](https://www.npmjs.com/package/ws) -- WebSocket server, noServer mode, upgrade handling
- [Next.js WebSocket discussions #53780, #58698](https://github.com/vercel/next.js/discussions/53780) -- Confirms no native WebSocket support

### Secondary (MEDIUM confidence)
- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html) -- Origin validation, auth during handshake
- [Cross-Site WebSocket Hijacking in 2025](https://blog.includesecurity.com/2025/04/cross-site-websocket-hijacking-exploitation-in-2025/)
- [Fly.io: WebSockets with Next.js](https://fly.io/javascript-journal/websockets-with-nextjs/) -- Custom server pattern guide
- [Gitpod workspace lifecycle](https://www.gitpod.io/docs/configure/workspaces/workspace-lifecycle) -- Industry patterns for timeout/cleanup
- [Traefik WebSocket forum](https://community.traefik.io/t/v3-w-websockets/22796) -- Automatic upgrade handling
- [xterm.js fit addon issues](https://github.com/xtermjs/xterm.js/issues/3564) -- Resize edge cases

---
*Research completed: 2026-03-08*
*Ready for roadmap: yes*
