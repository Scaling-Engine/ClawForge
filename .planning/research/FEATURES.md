# Feature Landscape: v1.5 Persistent Workspaces

**Domain:** Interactive code workspaces for AI coding agent platform (ClawForge)
**Researched:** 2026-03-08
**Scope:** NEW workspace features only. Existing pipeline (Docker Engine dispatch, named volumes, LangGraph agent, multi-channel messaging, cross-repo targeting) is shipped in v1.0-v1.4 and not re-researched here.

---

## Context: What Is Being Built

v1.5 adds persistent interactive workspaces where operators open a browser terminal connected to a long-running Docker container with their repo and Claude Code. The operator sees a live tmux session with Claude Code running, can observe/intervene, and the event handler's chat context flows into the workspace and workspace results flow back into the chat.

This is the shift from **fire-and-forget jobs** (ephemeral containers that run `claude -p` and produce a PR) to **interactive devboxes** (persistent containers with `claude` in interactive mode, served via ttyd over WebSocket).

**User journey:**
1. Operator says "let's work on feature X in repo Y" in Slack/Web Chat
2. LangGraph agent calls `start_coding` tool, which creates a workspace record and launches a Docker container
3. Agent responds with a workspace URL (`/code/{workspaceId}`)
4. Operator opens URL in browser -- sees xterm.js terminal connected to tmux session with Claude Code running
5. Operator works interactively: watches Claude Code, types commands, opens additional shell tabs
6. When done, operator clicks "Close" -- event handler checks for uncommitted/unpushed work, warns if dirty
7. Commits from the workspace session are injected back into the chat thread for continuity
8. Workspace container is destroyed, volume preserved for next session

**Reference implementation:** thepopebot `lib/code/` (7 files: `actions.js`, `terminal-sessions.js`, `ws-proxy.js`, `code-page.jsx`, `terminal-view.jsx`, `index.js`, `CLAUDE.md`) plus `templates/docker/claude-code-workspace/` (Dockerfile, entrypoint.sh, .tmux.conf, commands/).

---

## Table Stakes

Features users expect. Missing any of these means the workspace capability is incomplete or unusable.

| Feature | Why Expected | Complexity | Dependencies on Existing ClawForge |
|---------|--------------|------------|-------------------------------------|
| **Workspace container lifecycle (create/start/stop/destroy)** | Without container management, there is no workspace. Must create a long-running container (unlike ephemeral job containers that exit after `claude -p`), start ttyd + tmux + Claude Code inside it, handle restart/recovery of stopped containers, and destroy on close. | Medium | Builds on `lib/tools/docker.js` (v1.4) -- same `dockerode` client, same Docker socket mount. New container type with different lifecycle: `AutoRemove: false`, persistent process (ttyd as PID 1), named volume for repo state. Workspace containers join instance network (`noah-net`, `strategyES-net`) for isolation. |
| **Workspace CRUD with SQLite persistence** | Workspaces must survive event handler restarts. The database tracks which container belongs to which workspace, what repo/branch it targets, and the last interactive commit hash (for context injection). Without persistence, a container restart orphans all workspaces. | Low | Extends existing Drizzle ORM schema (`lib/db/schema.js`). New `code_workspaces` table with columns: `id`, `userId`, `containerName`, `repo`, `branch`, `featureBranch`, `title`, `codingAgent`, `lastInteractiveCommit`, `starred`, `createdAt`, `updatedAt`. Pattern identical to existing `jobOrigins` and `jobOutcomes` tables. |
| **ttyd + tmux terminal serving** | The mechanism for exposing the container's terminal to the browser. ttyd serves a tmux session (which has Claude Code running) over WebSocket on port 7681. tmux provides session persistence -- if the WebSocket disconnects, the tmux session keeps running and the operator can reconnect. | Low | ttyd binary and tmux installed in workspace Dockerfile (separate from job Dockerfile). Claude Code CLI already installed in job image -- same `npm install -g @anthropic-ai/claude-code` pattern. Entrypoint: `tmux new-session -d -s claude 'claude --dangerously-skip-permissions'` then `exec ttyd --writable -p 7681 tmux attach -t claude`. |
| **WebSocket proxy through event handler** | The browser cannot connect directly to the workspace container (it is on an internal Docker network). The event handler must proxy WebSocket connections from the browser to the container's ttyd port. URL pattern: `/code/{workspaceId}/ws` maps to `ws://{containerName}:7681/ws`. | Medium | Requires WebSocket upgrade handling in Next.js server. thepopebot uses `ws` npm package with `noServer: true` mode, intercepting HTTP upgrade events. Authentication via NextAuth session cookie (decode JWT from cookie, verify `sub` field). ClawForge already has NextAuth v5 (`lib/auth/`) and the same cookie-based auth pattern. Traefik must forward WebSocket upgrades -- needs `traefik.http.services.*.loadbalancer.server.scheme=http` and WebSocket-aware routing. |
| **Browser terminal UI (xterm.js)** | The frontend component that renders the terminal in the browser. Uses xterm.js with the `xterm-addon-attach` addon to connect to the WebSocket proxy. Must handle connection, disconnection, and reconnection gracefully. | Medium | New React page component at `/code/[id]/page.jsx`. Uses `@xterm/xterm` and `@xterm/addon-attach` npm packages. thepopebot's `terminal-view.jsx` is ~200 lines of React handling terminal initialization, WebSocket lifecycle, and reconnect logic. ClawForge already has web chat UI components (`lib/chat/components/`) -- workspace UI follows same pattern. |
| **`start_coding` LangGraph tool** | The conversational entry point. When an operator says "let's code on repo X," the agent calls this tool to create a workspace record, launch the container, and return the workspace URL. Without this, operators must manually create workspaces through a UI. | Low | New tool in `lib/ai/tools.js` alongside existing `createJobTool`. Uses same `resolveTargetRepo()` for repo resolution. Creates workspace DB record, calls new `runCodeWorkspaceContainer()` in `lib/tools/docker.js`. Returns `{ workspaceId, workspaceUrl }`. thepopebot's implementation is ~30 lines. |
| **Chat-to-workspace context bridge** | The conversation that led to "let's start coding" should be available inside the workspace. Operators should not need to re-explain the task. thepopebot builds a JSON context from the chat thread (first message + recent messages up to 12K char budget) and injects it as `.claude/chat-context.txt` via a SessionStart hook in the container. | Medium | Reads from existing `chats` and `messages` tables (`lib/db/chats.js`). Builds context JSON, passes as `CHAT_CONTEXT` env var to container. Entrypoint writes to `.claude/chat-context.txt` and configures a SessionStart hook in `~/.claude/settings.json` to `cat` it on Claude Code startup. The interactive Claude Code instance reads this context on first launch. |
| **Workspace-to-chat result bridge** | When a workspace closes, commits made during the session should be injected back into the chat thread. This gives the conversational agent awareness of what happened in the workspace, enabling follow-up discussion or job dispatch based on workspace results. | Medium | On `closeInteractiveMode()`: exec `git log` inside container to capture commits since `lastInteractiveCommit`, inject as an `AIMessage` into the LangGraph thread via `agent.updateState()`. thepopebot does this in `actions.js:closeInteractiveMode()` (~40 lines). ClawForge's `addToThread()` in `lib/ai/index.js` provides a simpler injection point. |
| **Git safety on workspace close** | Before destroying a workspace container, check for uncommitted changes and unpushed commits. Warn the operator if there is unsaved work. Without this, operators lose work silently. | Low | Exec `git status --short` and `git log @{u}..HEAD` inside the container before removal. Return `hasUnsavedWork` boolean to the UI. Client shows confirmation dialog if dirty. thepopebot's `getContainerGitStatus()` handles this in ~30 lines. |
| **Container auto-recovery** | If a workspace container crashes or is stopped (Docker restart, host reboot), the event handler must detect this and restart it when the operator tries to reconnect. Without auto-recovery, workspaces become single-use. | Low | `ensureCodeWorkspaceContainer()` inspects container state via `docker.getContainer().inspect()`. If exited/created/paused: try `container.start()`. If dead or start fails: remove and recreate from scratch. Volume preserves repo state so recreation is fast. thepopebot implements this with a `RECOVERABLE_STATES` set. |
| **Per-instance workspace isolation** | Workspaces must be isolated per instance. Noah's workspaces run on `noah-net`; StrategyES workspaces run on `strategyES-net`. Cross-instance workspace access must be impossible. | Low | Same pattern as job container isolation. Container created with `NetworkMode: '{instance}-net'`. Workspace DB records are user-scoped (userId from NextAuth session). WebSocket proxy verifies workspace ownership before establishing connection. |

## Differentiators

Features that go beyond basic functionality. Not strictly required for v1.5 MVP but provide meaningful improvement.

| Feature | Value Proposition | Complexity | Dependencies on Existing ClawForge |
|---------|-------------------|------------|-------------------------------------|
| **Additional shell tabs** | Operators may want a second terminal to run tests, grep code, or check git status while Claude Code works in the main tab. thepopebot supports spawning additional ttyd instances on different ports within the same container, each proxied through a separate WebSocket path (`/code/{id}/term/{sessionId}/ws`). | Medium | In-memory terminal session registry (`terminal-sessions.js`) tracks port-to-session mappings per workspace. Each new shell runs `ttyd --writable -p {nextPort} bash` inside the container. WebSocket proxy routes based on URL path. Port allocation starts at 7682 (7681 reserved for main Claude Code session). |
| **Feature branch auto-creation** | When a workspace starts, automatically create and push a feature branch (e.g., `clawforge/workspace-{shortId}`) so all work happens on a branch, not directly on main. This aligns with ClawForge's git-as-audit-trail model where every change is a branch. | Low | Entrypoint checks for `FEATURE_BRANCH` env var. If set: create branch, push with tracking. If branch already exists (container restart): checkout existing. thepopebot does this in ~15 lines of entrypoint bash. The `code_workspaces` table stores `featureBranch` for tracking. |
| **Commit/merge toolbar actions** | UI buttons for "Commit All," "Push," and "Create PR" in the terminal page, so operators don't need to type git commands. Executes git operations via `execInContainer()`. | Medium | Requires `execInContainer()` function in `lib/tools/docker.js` (Docker `exec` API: `POST /containers/{id}/exec` then `POST /exec/{id}/start`). thepopebot has this for git status checks. UI components call server actions that exec git commands inside the running container. |
| **`start_headless_coding` tool** | A hybrid mode: the agent launches a container that runs `claude -p` (headless) with a task prompt, commits, and auto-merges -- but within the workspace's feature branch rather than a separate job branch. Useful for "implement this part while I work on that part." | Medium | Creates a separate container (`code-headless-{shortId}`) targeting the workspace's feature branch. Uses the same entrypoint as job containers but with the workspace's branch. Results stream back to the chat. Different from `create_job` because it operates on the workspace's branch, not a new `job/` branch. |
| **Workspace list/management UI** | A page showing all workspaces with status indicators (running/stopped), star/unstar, rename, and delete actions. Operators can manage multiple workspaces across repos. | Medium | New page at `/code/page.jsx` listing workspace records from DB. Each entry shows repo, branch, status (live-checked via Docker inspect), and actions. thepopebot has `code-page.jsx` (~150 lines) for this. |
| **Container resource limits** | CPU and memory limits on workspace containers to prevent a runaway Claude Code process from consuming all host resources. | Low | `HostConfig.Memory` and `HostConfig.CpuShares` in `docker.createContainer()`. Not needed at 2-instance scale but becomes important if multiple workspaces run concurrently. |
| **Workspace idle timeout** | Auto-stop workspace containers after N minutes of no terminal activity. Prevents forgotten workspaces from consuming resources indefinitely. | Medium | Timer in event handler that checks container last-activity timestamp. Reset on each WebSocket message. Stop container (not destroy -- volume preserved) after timeout. Cloud dev environments (Gitpod, Codespaces) all have this: Gitpod defaults to 30 minutes. |
| **Slack/Telegram notification on workspace events** | Send a message to the operator's channel when a workspace container crashes, auto-recovers, or completes a headless task. Extends the existing job notification pattern. | Low | Same notification infrastructure as job completions (`createNotification()`, Slack `chat.postMessage`, Telegram `sendMessage`). Triggered from `ensureCodeWorkspaceContainer()` on recovery or from headless task completion. |

## Anti-Features

Features to explicitly NOT build in v1.5. These are scope expansions that should be deferred or avoided entirely.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **VS Code in browser (code-server, OpenVSX)** | Massive complexity increase. ttyd + tmux + Claude Code is the right abstraction for an agent-centric platform. The operator is not writing code -- they are supervising an AI that writes code. A full IDE adds 500MB+ to the image, introduces its own auth/extension/settings management, and shifts the product toward "cloud IDE" rather than "agent workspace." | Keep the terminal-first model. Claude Code's own UI (in the terminal) provides file viewing, diffs, and editing. If operators need a file browser, add a simple tree view component alongside the terminal -- not a full IDE. |
| **Collaborative multi-user workspaces** | ClawForge has 2 instances with 1-2 operators each. Multi-user collaboration (shared cursor, presence indicators) is engineering overhead for no current demand. tmux already supports multiple attach -- if needed, two people can view the same session. | ttyd's built-in multi-client support (via tmux shared sessions) is sufficient. No custom collaboration layer needed. |
| **Persistent Claude Code conversation history** | Claude Code's interactive mode maintains its own context window. Trying to persist and restore this across container restarts would require intercepting Claude Code's internal state (SQLite checkpoints, conversation history) -- fragile and tightly coupled to Claude Code internals that can change. | Use the chat-context injection pattern: previous conversation context is injected via SessionStart hook on container creation. The workspace starts with context, not with restored history. This is the same model Codespaces uses -- "context injection, not state restoration." |
| **File editor component in web UI** | Building a code editor (Monaco, CodeMirror) alongside the terminal duplicates what Claude Code already provides in the terminal. The operator can read files via Claude Code's Read tool output. | Keep the terminal as the single pane of glass. If file viewing is needed, Claude Code's own output shows file contents. A "view diff" action that execs `git diff` inside the container and displays it in the UI is simpler and more useful. |
| **Workspace sharing via URL** | Generating shareable URLs for workspaces (like Codespaces share links) requires a separate auth model (tokens, expiry, permissions). Current auth is NextAuth session cookies scoped to the instance. | Workspaces are private to the authenticated user. If sharing is needed, the operator can screen-share or invite others to the same tmux session via `tmux attach`. |
| **Auto-merge from workspaces** | Job containers auto-merge via `auto-merge.yml` with ALLOWED_PATHS restrictions. Workspace work is more exploratory and should go through human PR review. Auto-merging workspace branches bypasses the review gate that makes workspaces safer than jobs. | Workspace branches create PRs. Merging is manual or uses the target repo's own merge policies. The "Create PR" toolbar action opens a PR, then the operator merges through GitHub's UI. |
| **MCP server integration in workspaces** | v1.6 scope. MCP servers in workspace containers require lifecycle management (start before Claude Code, health checks, port mapping). Adding this before the basic workspace flow is stable adds a failure mode category. | Build workspaces without MCP first. v1.6 adds MCP to both job containers and workspace containers as a unified capability. |
| **Volume sharing between workspaces and jobs** | A workspace's named volume should not be reused by ephemeral job containers (or vice versa). Jobs operate on `job/` branches with specific entrypoint assumptions. Workspaces operate on feature branches with interactive tmux sessions. Mixing creates state corruption. | Separate volume naming convention: job volumes use `clawforge-{instance}-{slug}` (existing v1.4 pattern); workspace volumes use `clawforge-ws-{instance}-{workspaceId}`. Complete isolation. |
| **Hot-reload of workspace Docker image** | Updating the workspace Docker image while containers are running (e.g., to get a newer Claude Code version). This requires image pull, container migration, and state preservation -- complex with minimal value at current scale. | Rebuild image, destroy workspace, create new one. Volume preserves repo state. Operator re-enters the workspace with the updated image. Document this as an operator procedure. |

---

## Feature Dependencies

```
Workspace Docker Image (Phase 1)
  |
  +---> New Dockerfile: templates/docker/claude-code-workspace/
  |       (Ubuntu + tmux + ttyd + Node.js + Claude Code + non-root user)
  |
  +---> Entrypoint: clone/checkout, feature branch, chat context injection,
  |       tmux + Claude Code session, ttyd as PID 1
  |
  +---> .tmux.conf for terminal usability

Database Schema (Phase 2) -- NO dependency on Docker image
  |
  +---> code_workspaces table in lib/db/schema.js
  +---> CRUD operations in lib/db/code-workspaces.js

Workspace Container Lifecycle (Phase 3) -- depends on Phases 1 + 2
  |
  +---> runCodeWorkspaceContainer() in lib/tools/docker.js
  |       (create container, mount volume, set env vars, start)
  |
  +---> ensureCodeWorkspaceContainer() for auto-recovery
  |
  +---> execInContainer() for git status checks
  |
  +---> Workspace CRUD server actions in lib/code/actions.js

WebSocket Proxy (Phase 4) -- depends on Phase 3
  |
  +---> ws-proxy.js: HTTP upgrade interception, auth check, proxy to container
  |
  +---> Traefik WebSocket routing config in docker-compose.yml
  |
  +---> Terminal session registry for multi-tab support

start_coding Tool + Context Bridges (Phase 5) -- depends on Phases 3 + 4
  |
  +---> start_coding LangGraph tool in lib/ai/tools.js
  |
  +---> Chat-to-workspace context builder (chat messages -> CHAT_CONTEXT env var)
  |
  +---> Workspace-to-chat result bridge (commits -> AIMessage in thread)

Browser Terminal UI (Phase 6) -- depends on Phase 4
  |
  +---> /code/[id]/page.jsx with xterm.js + WebSocket
  +---> /code/page.jsx workspace list (optional, can be Phase 7)
  +---> Git safety dialog on close
```

**Key insight:** The Docker image and database schema have zero dependencies on each other and can be built in parallel. The WebSocket proxy is the critical-path bottleneck -- nothing works without it, and it requires careful Traefik configuration plus auth integration.

---

## MVP Recommendation

### Prioritize

1. **Workspace Docker image** -- Foundation. Cannot test anything without a container that runs ttyd + tmux + Claude Code. Small, self-contained deliverable with clear verification (build image, run container, connect browser to `localhost:7681`).

2. **Database schema + CRUD** -- Small schema addition. Parallel with image build. Unblocks all subsequent phases.

3. **Container lifecycle management** -- `runCodeWorkspaceContainer()`, `ensureCodeWorkspaceContainer()`, `execInContainer()`. The core Docker operations. Verify by creating/starting/stopping containers programmatically.

4. **WebSocket proxy** -- The hardest piece. Requires `ws` npm package, HTTP upgrade interception in Next.js, NextAuth cookie verification, and Traefik WebSocket forwarding. Test by connecting xterm.js to the proxy in a browser.

5. **Browser terminal UI** -- xterm.js page component. Cannot test without WebSocket proxy working. Relatively simple once the proxy works.

6. **`start_coding` tool + context bridges** -- The conversational integration. Makes workspaces accessible from Slack/Telegram/Web Chat instead of requiring direct URL access. Chat context injection and workspace result bridging.

### Defer

- **Additional shell tabs** -- Nice-to-have. Single Claude Code terminal is sufficient for MVP. Add when operators request it.
- **Workspace list/management UI** -- Operators can access workspaces via the URL returned by `start_coding`. A management page is additive.
- **`start_headless_coding` tool** -- Hybrid mode is a differentiator but not table stakes. Existing `create_job` serves the headless use case.
- **Commit/merge toolbar actions** -- Operators can type git commands in the terminal. Toolbar buttons are convenience.
- **Idle timeout** -- Not needed at 2-instance scale. Add when forgotten workspaces become a resource problem.
- **Container resource limits** -- Same rationale as for job containers: not blocking at current volume.

---

## thepopebot Feature Mapping

How each thepopebot `lib/code/` feature maps to ClawForge's needs:

| thepopebot Feature | File | ClawForge Category | Notes |
|---------------------|------|-------------------|-------|
| Workspace CRUD (create, rename, star, delete) | `actions.js` | Table Stakes | Direct port. User ownership via NextAuth session. |
| Container auto-recovery (ensure running) | `actions.js` | Table Stakes | Handles exited/created/paused/dead states. Recreates with chat context. |
| Git status check before close | `actions.js` | Table Stakes | `getContainerGitStatus()` execs git commands in container. |
| Close with context injection | `actions.js` | Table Stakes | Captures commits, injects as AIMessage, updates `lastInteractiveCommit`. |
| Start interactive mode | `actions.js` | Table Stakes | Generates container name, calls `runCodeWorkspaceContainer()`, updates DB. |
| Shell tab creation/close/list | `actions.js` | Differentiator | Spawns additional ttyd instances on higher ports. Prunes dead sessions. |
| Terminal session registry | `terminal-sessions.js` | Differentiator | In-memory Map on globalThis. Port allocation starting at 7682. |
| WebSocket proxy with auth | `ws-proxy.js` | Table Stakes | NextAuth cookie decode, workspace ownership verify, bidirectional proxy. Routes main terminal (port 7681) and shell tabs (dynamic ports). |
| Terminal React component | `terminal-view.jsx` | Table Stakes | xterm.js initialization, WebSocket lifecycle, reconnect handling. |
| Workspace list page | `code-page.jsx` | Differentiator | List view with status, actions. |
| `start_coding` LangGraph tool | `tools.js` | Table Stakes | Conversational entry point. ~30 lines. |
| `start_headless_coding` tool | `tools.js` | Differentiator | Hybrid mode within workspace feature branch. |
| Chat context builder | `actions.js` | Table Stakes | First message + recent messages up to 12K char budget. |
| Workspace Docker image | `templates/docker/claude-code-workspace/` | Table Stakes | Ubuntu + tmux + ttyd + Node.js + Claude Code + non-root user. |

---

## Sources

- thepopebot `lib/code/actions.js` -- Workspace CRUD, container lifecycle, git safety, context injection (~519 lines, production code) (HIGH confidence -- direct source inspection via GitHub API)
- thepopebot `lib/code/ws-proxy.js` -- WebSocket proxy with NextAuth authentication, bidirectional message forwarding (~90 lines) (HIGH confidence)
- thepopebot `lib/code/terminal-sessions.js` -- In-memory session registry, port allocation (~55 lines) (HIGH confidence)
- thepopebot `lib/ai/tools.js` -- `start_coding` and `start_headless_coding` tool implementations (HIGH confidence)
- thepopebot `lib/db/code-workspaces.js` -- SQLite CRUD for workspace records (HIGH confidence)
- thepopebot `lib/db/schema.js` -- `code_workspaces` table schema with Drizzle ORM (HIGH confidence)
- thepopebot `templates/docker/claude-code-workspace/Dockerfile` -- Workspace container image definition (HIGH confidence)
- thepopebot `templates/docker/claude-code-workspace/entrypoint.sh` -- Container startup: git setup, clone, feature branch, chat context, tmux + ttyd (HIGH confidence)
- [ttyd GitHub wiki: Nginx reverse proxy](https://github.com/tsl0922/ttyd/wiki/Nginx-reverse-proxy) -- WebSocket upgrade configuration for reverse proxies (MEDIUM confidence -- nginx-specific, Traefik equivalent needed)
- [ttyd documentation](https://tsl0922.github.io/ttyd/) -- Authentication, base-path, writable mode, tmux integration (HIGH confidence -- official docs)
- [Gitpod workspace lifecycle](https://www.gitpod.io/docs/configure/workspaces/workspace-lifecycle) -- Industry patterns for workspace timeout, persistence, cleanup (MEDIUM confidence -- different product but established patterns)
- [Presidio: Building a Browser-based Terminal using Docker and XtermJS](https://www.presidio.com/technical-blog/building-a-browser-based-terminal-using-docker-and-xtermjs/) -- xterm.js + Docker + WebSocket architecture patterns (MEDIUM confidence -- tutorial)
- [xterm.js reconnection issue #677](https://github.com/xtermjs/xterm.js/issues/677) -- Terminal state preservation across reconnects; tmux solves this server-side (MEDIUM confidence -- community discussion)
- [Git Worktrees for AI Coding](https://dev.to/mashrulhaque/git-worktrees-for-ai-coding-run-multiple-agents-in-parallel-3pgb) -- Isolation patterns for AI agents working on same repo (MEDIUM confidence)
- ClawForge `lib/tools/docker.js` -- Existing Docker Engine API client with dockerode, container lifecycle, volume management (HIGH confidence -- internal codebase)
- ClawForge `lib/ai/tools.js` -- Existing LangGraph tools for job creation, status, project state (HIGH confidence -- internal codebase)
- ClawForge `lib/db/schema.js` -- Existing Drizzle ORM schema for users, chats, messages, jobs (HIGH confidence -- internal codebase)
- ClawForge `docker-compose.yml` -- Traefik proxy, instance networking, volume definitions (HIGH confidence -- internal codebase)

---

*Feature research for: ClawForge v1.5 -- Persistent Workspaces*
*Researched: 2026-03-08*
