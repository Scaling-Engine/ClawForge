# Technology Stack

**Project:** ClawForge v1.5 Persistent Workspaces
**Milestone:** v1.5 — Interactive browser terminals connected to persistent Docker containers
**Researched:** 2026-03-08
**Confidence:** HIGH for ttyd + xterm.js (reference implementation proven); HIGH for ws (industry standard); MEDIUM for xterm.js v5 vs v6 (v6 breaking changes need testing)

---

## Scope

This document covers **additions and changes** needed for v1.5 Persistent Workspaces only. The existing stack (LangGraph, SQLite/Drizzle, Next.js API routes, dockerode ^4.0.9, Docker socket mount, named volumes, channel adapters, next-auth) is validated from v1.0-v1.4 and not re-researched here.

Five new capability areas:

1. **Terminal server** inside workspace containers (ttyd)
2. **Terminal emulator** in browser (xterm.js)
3. **WebSocket proxy** in event handler (ws)
4. **Container lifecycle** for long-running workspaces (dockerode extensions)
5. **tmux** for session persistence inside containers

---

## Recommended Stack

### New Runtime Dependencies (Event Handler)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `ws` | `^8.19.0` | WebSocket server for terminal proxy | The de facto Node.js WebSocket library. 90M+ weekly downloads. Needed to proxy browser WebSocket connections to ttyd inside workspace containers. Next.js API routes cannot handle WebSocket upgrade requests natively -- a standalone `ws` server attached to the HTTP upgrade event is required. The reference implementation (thepopebot) uses this exact pattern. |

### New Client-Side Dependencies (Browser Terminal UI)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@xterm/xterm` | `^5.5.0` | Terminal emulator rendered in browser | Industry standard browser terminal. Powers VS Code's integrated terminal. The `@xterm` scoped package replaces the deprecated `xterm` package. Using v5.5.0 (not v6.0.0) because v6 has breaking changes (removed canvas renderer addon, changed scrollbar behavior, replaced EventEmitter) and the reference implementation is validated on v5.5. |
| `@xterm/addon-fit` | `^0.10.0` | Auto-resize terminal to container dimensions | Required for responsive terminal that fills its parent element. Handles resize events and sends updated dimensions. |
| `@xterm/addon-attach` | `^0.11.0` | Connects xterm.js to a WebSocket | Bidirectional bridge between the Terminal instance and a WebSocket connection. Handles binary frame encoding. Eliminates manual `ws.onmessage` / `terminal.write()` wiring. |

### New Packages in Workspace Container Dockerfile

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `ttyd` | `1.7.7` | Terminal server exposing shell via WebSocket | Runs inside workspace container, binds to a port (e.g., 7681), serves a tmux session over WebSocket. The event handler's ws proxy connects to this port. ttyd handles PTY allocation, flow control (pause/resume protocol), and window resize. No need to build custom PTY management. Installed via `apt-get` in workspace Dockerfile. |
| `tmux` | (distro default) | Session multiplexer for persistence | Wraps the Claude Code CLI session so it survives disconnects. `ttyd tmux new -A -s workspace` creates or attaches to a named session. If the browser disconnects and reconnects, the session is intact. Installed via `apt-get` in workspace Dockerfile. |

### No Other New Dependencies Needed

The workspace container extends the existing job container Dockerfile. Node 22, git, gh CLI, Claude Code CLI, and GSD are already present. The event handler already has dockerode for container lifecycle management.

---

## Architecture: Why ttyd-in-Container + ws Proxy

Two viable approaches exist for browser terminal access to Docker containers:

### Approach A: ttyd inside container + ws proxy in event handler (RECOMMENDED)

```
Browser (xterm.js) --WebSocket--> Event Handler (ws proxy) --WebSocket--> Container (ttyd:7681)
```

### Approach B: dockerode exec + custom PTY bridge in event handler

```
Browser (xterm.js) --WebSocket--> Event Handler (dockerode exec + stream pipe) --Docker API--> Container
```

**Why Approach A wins:**

| Criterion | ttyd-in-container | dockerode exec |
|-----------|-------------------|----------------|
| PTY management | ttyd handles it (battle-tested C code) | Must manage PTY via Docker exec API, fragile stream demuxing |
| Flow control | Built-in pause/resume protocol prevents browser overwhelm | Manual implementation required |
| Window resize | ttyd handles SIGWINCH natively | Must intercept resize events and send to exec session |
| Session persistence | `ttyd tmux` -- session survives disconnects | exec sessions die on disconnect, no recovery |
| Proven in reference | thepopebot uses this exact pattern in production | Not used in reference implementation |
| Complexity | One binary, one line in Dockerfile | Custom stream piping, error handling, resize protocol |
| Performance | Native C WebSocket server, minimal overhead | Node.js event handler in the data path for every keystroke |

**Approach B's only advantage** is avoiding an open port on the container. But since workspace containers are on isolated Docker networks (noah-net, strategyES-net) not exposed to the internet, port exposure is internal only. The event handler is the only entity that can reach the container's ttyd port.

---

## WebSocket Proxy Architecture

### Why a Proxy (Not Direct Browser-to-ttyd)

The browser cannot connect directly to ttyd because:
1. ttyd runs inside a Docker container on an internal network -- no external port mapping
2. Authentication must be verified before granting terminal access
3. Traefik handles TLS termination; the proxy upgrades the connection inside the event handler

### Implementation Pattern

```
1. Browser opens wss://archie.clawforge.dev/api/workspace/{id}/terminal
2. Traefik terminates TLS, forwards to event handler port 80
3. Event handler HTTP server receives upgrade request
4. next-auth JWT verified from cookie (same auth as web chat)
5. Lookup workspace container IP + ttyd port from DB
6. Open ws connection to container's ttyd (ws://container-ip:7681/ws)
7. Bidirectional pipe: browser <-> event handler <-> ttyd
```

### Next.js WebSocket Limitation

Next.js API routes do NOT support WebSocket upgrade. The standard pattern is:

```javascript
// Attach to the underlying HTTP server, not Next.js routes
const wss = new WebSocket.Server({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  // Authenticate, then:
  wss.handleUpgrade(req, socket, head, (ws) => {
    // Proxy to ttyd inside container
  });
});
```

This requires access to the raw HTTP server. ClawForge's event handler instances run via PM2 + Next.js custom server (instances/noah/Dockerfile), so the HTTP server object is accessible. This is the same pattern used by the reference implementation.

---

## Container Lifecycle for Long-Running Workspaces

### Key Difference from Job Containers

| Aspect | Job Container (v1.4) | Workspace Container (v1.5) |
|--------|----------------------|---------------------------|
| Lifetime | Minutes (single task) | Hours/days (interactive sessions) |
| Auto-remove | Yes (`AutoRemove: false` but removed after log collection) | No -- persists until explicitly stopped |
| Restart policy | None | `unless-stopped` (survives Docker daemon restart) |
| Health check | None (wait for exit) | `curl http://localhost:7681/` every 30s |
| Entry point | `entrypoint.sh` (clone, run claude -p, commit, exit) | `ttyd tmux new -A -s workspace` (long-running) |
| Port exposure | None | 7681 internal (ttyd) |
| Labels | `clawforge=job` | `clawforge=workspace` |

### dockerode Container Configuration (Workspace)

```javascript
const container = await docker.createContainer({
  name: `clawforge-ws-${instanceName}-${slug}`,
  Image: workspaceImage,
  Env: [...env],
  Labels: {
    'clawforge': 'workspace',
    'clawforge.instance': instanceName,
    'clawforge.repo': slug,
    'clawforge.created_at': new Date().toISOString(),
  },
  ExposedPorts: { '7681/tcp': {} },
  HostConfig: {
    NetworkMode: `${instanceName}-net`,
    RestartPolicy: { Name: 'unless-stopped' },
    Mounts: [{
      Type: 'volume',
      Source: volumeNameFor(instanceName, repoUrl),
      Target: '/workspace',
      ReadOnly: false,
    }],
  },
  Healthcheck: {
    Test: ['CMD', 'curl', '-sf', 'http://localhost:7681/'],
    Interval: 30_000_000_000,  // 30s in nanoseconds
    Timeout: 5_000_000_000,
    Retries: 3,
    StartPeriod: 10_000_000_000,
  },
});
```

### Workspace Container Networking

No port publishing needed. The event handler discovers the container's internal IP via `docker.getContainer(id).inspect()` -> `NetworkSettings.Networks[networkName].IPAddress`. Since both the event handler and workspace container are on the same Docker network (e.g., `noah-net`), the proxy connects via internal DNS/IP.

---

## Workspace Container Dockerfile

The workspace container is a NEW Dockerfile, separate from the job container. It shares the same base (Node 22 + Claude Code CLI + GSD) but adds ttyd + tmux and runs a long-lived process instead of a one-shot script.

```dockerfile
# templates/docker/workspace/Dockerfile
FROM node:22-bookworm-slim

# Same apt packages as job container + ttyd + tmux
RUN apt-get update && apt-get install -y \
    git jq curl procps tmux \
    libnss3 libnspr4 ... \
    && rm -rf /var/lib/apt/lists/*

# Install ttyd from GitHub releases (apt version is outdated)
RUN curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 \
    -o /usr/local/bin/ttyd && chmod +x /usr/local/bin/ttyd

# Same Claude Code + GSD + gh CLI as job container
RUN npm install -g @anthropic-ai/claude-code
RUN npx get-shit-done-cc@latest --claude --global
# ... (same GSD verification, hooks, defaults as job Dockerfile)

WORKDIR /workspace
EXPOSE 7681

# ttyd wraps tmux; -W enables write access; -p sets port
CMD ["ttyd", "-W", "-p", "7681", "tmux", "new", "-A", "-s", "workspace"]
```

**Key decisions:**
- ttyd installed from GitHub releases binary (not apt) because apt repos carry outdated versions
- `-W` flag enables writable terminal (read-only by default)
- `-p 7681` explicit port (matches health check)
- `tmux new -A -s workspace` creates or attaches to session named "workspace"
- No ttyd authentication (`-c` flag omitted) because access is gated by the event handler's JWT-validated WebSocket proxy

---

## Security Considerations

### Terminal Access Authorization

| Layer | Control | Implementation |
|-------|---------|----------------|
| TLS | Traefik terminates HTTPS/WSS | Already configured in docker-compose.yml |
| Authentication | next-auth JWT from cookie | Verified on WebSocket upgrade request before proxying |
| Authorization | Instance-scoped user check | Same `SLACK_ALLOWED_USERS` / NextAuth credential check |
| Network isolation | Docker networks | Workspace containers only reachable from same instance network |
| No direct ttyd exposure | Internal port only | ttyd binds to container-internal 7681, no host port mapping |
| Container isolation | Separate Docker networks per instance | Noah's workspaces unreachable from StrategyES's event handler |

### ttyd Has No Auth (By Design)

ttyd supports basic auth (`-c user:pass`) but we deliberately skip it. Authentication is handled at the proxy layer (next-auth JWT). Adding ttyd auth would create a second credential to manage and would require passing passwords into containers.

### WebSocket Origin Checking

The ws proxy should validate the `Origin` header to prevent cross-site WebSocket hijacking. Only allow origins matching the instance's `APP_HOSTNAME`.

### Container Resource Limits

Long-running workspace containers should have resource constraints to prevent runaway processes:

```javascript
HostConfig: {
  Memory: 2 * 1024 * 1024 * 1024,  // 2GB RAM limit
  CpuPeriod: 100000,
  CpuQuota: 100000,  // 1 CPU core
}
```

---

## Version Decisions

### xterm.js v5.5.0 (Not v6.0.0)

v6.0.0 (released Dec 2024) introduced significant breaking changes:
- Removed canvas renderer addon (WebGL or DOM only)
- Changed scrollbar implementation (integrated VS Code base platform)
- Replaced EventEmitter with VS Code's Emitter
- Removed `windowsMode` and `fastScrollModifier` options
- Changed alt key handling

The reference implementation is validated on v5.5.0. The v6 improvements (synchronized output, new scrollbar) are not needed for this use case. Upgrade to v6 can happen in a future milestone after the workspace feature is stable.

**Package names:** Use the `@xterm` scoped packages (`@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-attach`) even for v5.5. The unscoped `xterm` package is deprecated. The v5.5.0 release is available under both scoped and unscoped names.

### ws v8.19.0 (Latest Stable)

No version risk. ws has been stable for years, follows semver, and v8.x has no upcoming breaking changes. 90M+ weekly downloads.

### ttyd 1.7.7 (Latest Release)

Released March 2024. Minor fix release (version detection in non-git builds). Stable and production-ready. The reference implementation uses this version.

---

## Installation

```bash
# Event handler: WebSocket proxy
npm install ws@^8.19.0

# Event handler: Terminal UI components (client-side)
npm install @xterm/xterm@^5.5.0 @xterm/addon-fit@^0.10.0 @xterm/addon-attach@^0.11.0
```

No new dev dependencies. No peer dependency changes.

### Workspace Dockerfile additions (not npm)

```bash
# ttyd binary (in workspace Dockerfile)
curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 \
  -o /usr/local/bin/ttyd && chmod +x /usr/local/bin/ttyd

# tmux (in workspace Dockerfile)
apt-get install -y tmux
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Terminal server | ttyd 1.7.7 | Custom PTY server (node-pty + ws) | Reinventing ttyd's flow control, resize handling, and PTY management. Adds node-pty native dependency compilation in container. |
| Terminal server | ttyd 1.7.7 | GoTTY | Abandoned (last release 2017). ttyd is its spiritual successor with active maintenance. |
| Terminal server | ttyd 1.7.7 | wetty (Node.js) | SSH-based, adds unnecessary SSH server in container. Heavier than ttyd's single binary. |
| Terminal server | ttyd 1.7.7 | dockerode exec stream | No session persistence. No flow control. Stream demuxing is fragile. Every keystroke routes through Node.js. |
| Terminal emulator | @xterm/xterm 5.5.0 | @xterm/xterm 6.0.0 | Breaking changes (see above). Reference implementation on v5.5. Upgrade later. |
| Terminal emulator | @xterm/xterm 5.5.0 | hterm (Google) | Less ecosystem, fewer addons, no fit/attach equivalents. |
| Terminal emulator | @xterm/xterm 5.5.0 | terminal.js | Abandoned, no WebSocket addon ecosystem. |
| WebSocket library | ws 8.19.0 | socket.io | Overkill -- adds rooms, namespaces, fallback transport. We need raw WebSocket for terminal binary frames. |
| WebSocket library | ws 8.19.0 | Next.js native | Next.js cannot handle WebSocket upgrade in API routes. Not supported. |
| WebSocket library | ws 8.19.0 | uWebSockets.js | Faster but requires native compilation, less compatible. ws is fast enough for terminal traffic. |
| Session persistence | tmux | screen | tmux has better scripting, pane management, and modern defaults. Industry standard. |
| Session persistence | tmux | None (reconnect to new shell) | Losing work-in-progress on disconnect is unacceptable for interactive coding sessions. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `node-pty` | Native compilation hassle; ttyd handles PTY allocation in C | ttyd binary in container |
| `socket.io` | Overhead of fallback transport, rooms, namespaces -- unnecessary for 1:1 terminal streams | `ws` for raw WebSocket |
| `@xterm/addon-webgl` | WebGL renderer is optional performance optimization; DOM renderer works fine initially | Default DOM renderer, add WebGL later if needed |
| `@xterm/addon-serialize` | Terminal serialization for state save/restore -- not needed when tmux handles persistence | tmux session persistence |
| SSH server in container | Adds attack surface, key management, user provisioning complexity | ttyd direct PTY access |
| `express` or `fastify` for WS | Event handler already has Next.js HTTP server; just attach ws upgrade handler | `ws` with `noServer: true` on existing HTTP server |
| `dockerode` (again) | Already installed from v1.4 | Extend existing `lib/tools/docker.js` with workspace lifecycle functions |
| Port mapping/publishing for ttyd | Would expose ttyd directly; proxy handles routing | Internal container networking via Docker network |
| autoheal container | Restart policy `unless-stopped` + health checks sufficient for 2 instances | Built-in Docker restart policy |

---

## Integration Points with Existing Stack

### dockerode (lib/tools/docker.js)

Extend the existing module with workspace-specific functions:
- `createWorkspaceContainer()` -- like `dispatchDockerJob()` but long-running, with health check and restart policy
- `getWorkspaceContainer()` -- lookup by instance + repo labels
- `stopWorkspace()` / `startWorkspace()` -- container.stop() / container.start()
- `destroyWorkspace()` -- container.remove({ force: true })
- `getWorkspaceIP()` -- inspect container for internal IP on instance network

Reuse existing: `volumeNameFor()`, `ensureVolume()`, `reconcileOrphans()` (extend label filter to include `clawforge=workspace`).

### next-auth (lib/auth/)

WebSocket upgrade auth uses the same JWT session verification. Parse the cookie from the upgrade request headers, validate with next-auth's `getToken()`, check user against instance allowed list.

### Drizzle ORM (lib/db/)

New `workspaces` table to track workspace state:
- `id` (UUID), `instance_name`, `repo_slug`, `container_id`, `status` (created/running/stopped/destroyed), `created_at`, `last_accessed_at`

### LangGraph Agent (lib/ai/tools.js)

New `start_coding` tool that creates or connects to a workspace, returns a URL for the browser terminal.

### Named Volumes (existing)

Workspace containers mount the SAME named volumes as job containers (`clawforge-{instance}-{slug}`). This means a job container that cloned a repo creates warm state that the workspace container can immediately use. Shared access is safe because job containers are ephemeral and workspace containers have flock mutex (already implemented in v1.4 entrypoint).

---

## Sources

- [ttyd GitHub repository](https://github.com/tsl0922/ttyd) -- v1.7.7, architecture details, WebSocket protocol, auth options (HIGH confidence -- official source)
- [ttyd releases](https://github.com/tsl0922/ttyd/releases) -- v1.7.7 confirmed as latest, March 2024 (HIGH confidence)
- [xterm.js GitHub releases](https://github.com/xtermjs/xterm.js/releases) -- v5.5.0 (Apr 2024), v6.0.0 (Dec 2024) confirmed (HIGH confidence)
- [xterm.js 6.0.0 release notes](https://github.com/xtermjs/xterm.js/releases/tag/6.0.0) -- breaking changes documented (HIGH confidence)
- [@xterm/xterm npm](https://www.npmjs.com/@xterm/xterm) -- scoped package availability confirmed (HIGH confidence)
- [@xterm/addon-fit npm](https://www.npmjs.com/package/@xterm/addon-fit) -- v0.10.0 confirmed (HIGH confidence)
- [@xterm/addon-attach npm](https://www.npmjs.com/package/@xterm/addon-attach) -- v0.11.0 confirmed (HIGH confidence)
- [ws npm package](https://www.npmjs.com/package/ws) -- v8.19.0 confirmed as latest (HIGH confidence)
- [ws GitHub](https://github.com/websockets/ws) -- WebSocket upgrade handling pattern, noServer mode (HIGH confidence)
- [Next.js WebSocket discussion #53780](https://github.com/vercel/next.js/discussions/53780) -- confirms API routes cannot handle upgrade requests (HIGH confidence)
- [Next.js WebSocket discussion #58698](https://github.com/vercel/next.js/discussions/58698) -- confirms custom server required for WS (HIGH confidence)
- [Docker health checks guide](https://oneuptime.com/blog/post/2026-01-30-docker-health-check-best-practices/view) -- health check configuration patterns (MEDIUM confidence)
- [xtermjs-dockerode example](https://github.com/mkjiau/xtermjs-dockerode-expressjs-socket) -- reference architecture for xterm.js + dockerode + WebSocket (MEDIUM confidence)
- [Presidio blog: Browser-based terminal using Docker and XtermJS](https://www.presidio.com/technical-blog/building-a-browser-based-terminal-using-docker-and-xtermjs/) -- architecture patterns (MEDIUM confidence)
- [ttyd WebSocket protocol / flow control](https://github.com/tsl0922/ttyd/issues/1400) -- custom client connection details (MEDIUM confidence)
- Direct codebase inspection: `lib/tools/docker.js` -- existing dockerode integration, volume naming, container lifecycle (HIGH confidence)
- Direct codebase inspection: `docker-compose.yml` -- Traefik config, network isolation, volume mounts (HIGH confidence)
- Direct codebase inspection: `templates/docker/job/Dockerfile` -- base image pattern for workspace Dockerfile (HIGH confidence)
- Direct codebase inspection: `package.json` -- current dependencies, no ws/xterm present (HIGH confidence)
- Direct codebase inspection: `.planning/VISION.md` -- upstream thepopebot workspace architecture reference (HIGH confidence)

---

*Stack research for: ClawForge v1.5 Persistent Workspaces*
*Researched: 2026-03-08*
