# Architecture Patterns: Persistent Workspaces Integration

**Domain:** Interactive workspace containers for AI agent platform
**Researched:** 2026-03-08
**Confidence:** MEDIUM-HIGH (patterns verified against existing codebase + reference implementation + official docs)

## Current Architecture (v1.4)

```
User --> Channel (Slack/Telegram/Web) --> Event Handler (Next.js + LangGraph)
                                              |
                                              v
                                    createJob() --> job/{UUID} branch
                                              |
                                              v
                                    dispatchDockerJob() --> ephemeral container
                                              |
                                    waitAndNotify() (fire-and-forget)
                                              |
                                              v
                                    Container exits --> collect logs --> notify channel
```

**Key characteristics of current system:**
- Containers are ephemeral: create, run, wait, collect, remove
- Communication is unidirectional: job.md in, logs + PR out
- No persistent container state (volumes cache repos, but containers die)
- No WebSocket anywhere -- all channels are HTTP webhook-based
- Docker socket mounted read-only in event handler container
- dockerode already initialized at startup via `initDocker()` in instrumentation.js

## Recommended Architecture (v1.5)

### Two Container Types, One Docker Manager

The workspace feature adds a second container lifecycle alongside the existing job containers. Both use the same dockerode instance and Docker socket, but with fundamentally different lifecycles.

```
                        Event Handler (Next.js + LangGraph)
                       /              |                    \
                      /               |                     \
              Channel Adapters    Docker Manager         WebSocket Proxy
             (Slack/Telegram)    (lib/tools/docker.js)  (lib/ws-proxy.js)
                      \               |        |              |
                       \         Job Containers  Workspace    |
                        \        (ephemeral)     Containers   |
                         \           |          (persistent)  |
                          \          |              |          |
                           v         v              v          v
                        LangGraph   create/wait   create/     Browser
                        Agent       /remove       start/stop  (xterm.js)
                                                  /restart
                                                     |
                                                   ttyd:7681 <-- WebSocket proxy target
```

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| `lib/tools/docker.js` | Container lifecycle for BOTH jobs and workspaces | dockerode, Docker socket | **MODIFIED** -- add workspace functions |
| `lib/ws-proxy.js` | WebSocket proxy: browser <-> ttyd in container | Node http server, dockerode (for container IP lookup) | **NEW** |
| `lib/db/schema.js` | SQLite schema including `code_workspaces` table | Drizzle ORM | **MODIFIED** -- add workspace table |
| `lib/db/workspaces.js` | CRUD for workspace records | SQLite via Drizzle | **NEW** |
| `lib/ai/tools.js` | LangGraph tools including `start_coding` | Workspace manager, existing tool set | **MODIFIED** -- add workspace tool |
| `templates/docker/workspace/` | Workspace container Dockerfile + entrypoint | Built image, ttyd, tmux, Claude Code | **NEW** |
| `config/instrumentation.js` | Server startup: init Docker, init WebSocket proxy, reconcile workspaces | docker.js, ws-proxy.js | **MODIFIED** |
| `api/index.js` | HTTP API routes including workspace CRUD | Workspace manager | **MODIFIED** -- add workspace routes |
| Browser UI (xterm.js) | Terminal rendering in browser | WebSocket to ws-proxy | **NEW** (if web channel used) |

### Data Flow: Workspace Lifecycle

#### 1. Create Workspace (via chat or API)

```
User: "Start coding on neurostory"
  --> LangGraph agent --> start_coding tool
  --> resolveTargetRepo("neurostory")
  --> ensureWorkspaceContainer(instanceName, repoSlug, options)
       |
       |--> Check DB: existing workspace for this instance+repo?
       |     YES + running --> return existing container info
       |     YES + exited  --> restart container, update DB
       |     YES + dead    --> remove, recreate
       |     NO            --> create new container
       |
       |--> docker.createContainer({
       |      Image: workspace-image,
       |      Cmd: ["ttyd", "-W", "-p", "7681", "tmux", "new", "-A", "-s", "main"],
       |      ExposedPorts: { "7681/tcp": {} },
       |      HostConfig: {
       |        NetworkMode: instance-net,
       |        Mounts: [named-volume at /workspace],
       |        RestartPolicy: { Name: "unless-stopped" }
       |      },
       |      Labels: { clawforge: "workspace", ... }
       |    })
       |
       |--> Save to code_workspaces table
       |--> Return { workspaceId, containerIp, port, connectUrl }
```

#### 2. Connect Browser to Workspace

```
Browser (xterm.js)
  --> wss://archie.clawforge.dev/ws/workspace/{workspaceId}?token=JWT
  --> Traefik passes WebSocket upgrade through to event handler
  --> ws-proxy.js intercepts upgrade on /ws/workspace/:id path
       |
       |--> Verify JWT token (same auth as web chat)
       |--> Look up workspace in DB --> get containerId
       |--> Inspect container --> get IP on instance network
       |--> Proxy WebSocket to ws://container-ip:7681/ws
```

#### 3. Chat Context Bridge (chat --> workspace)

```
User in Slack: "Focus on the auth module, the tests are failing"
  --> LangGraph agent processes message
  --> Agent decides to push context to active workspace
  --> docker.exec(containerId, ["tmux", "send-keys", "...", "Enter"])
       or
  --> Write to /workspace/.chat-context file inside container via docker.exec
```

#### 4. Workspace Result Bridge (workspace --> chat)

```
Workspace container: user runs Claude Code, makes commits
  --> Git hooks or polling detect new commits
  --> Event handler queries container for recent commits
  --> Injects summary into LangGraph thread
  --> Agent can relay to Slack/Telegram
```

## New Components: Detailed Design

### 1. WebSocket Proxy (`lib/ws-proxy.js`)

**Why a proxy instead of direct ttyd access:**
- Workspace containers are on isolated Docker networks (noah-net, strategyES-net)
- Traefik routes to the event handler, not directly to workspace containers
- Auth must be verified before proxy connection is established
- Container IP is dynamic; proxy resolves it from DB + Docker inspect

**Implementation approach: Hook into Node HTTP server upgrade event.**

Next.js does NOT natively support WebSocket upgrade in route handlers (confirmed via GitHub Discussion #58698). The standard pattern is:

1. In `instrumentation.js`, after Next.js server starts, get a reference to the underlying HTTP server
2. Listen for the `upgrade` event on that server
3. Route `/ws/workspace/:id` paths to the workspace proxy
4. Pass all other upgrade requests through (Next.js HMR needs `/_next/webpack-hmr`)

```
// Conceptual -- not final code
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/ws/workspace/')) {
    wsProxy.handleUpgrade(req, socket, head);
  }
  // else: Next.js HMR or other handlers
});
```

**Critical detail:** The event handler container runs inside Docker (e.g., noah-net). It can reach workspace containers on the same Docker network by container name or IP. Traefik handles the external TLS termination and WebSocket upgrade passthrough -- Traefik v3 does this automatically for HTTP/1.1 Upgrade headers with no special configuration needed.

**Getting the HTTP server reference:** The thepopebot reference implementation hooks into Next.js by using a custom server entry point. For ClawForge, the cleanest approach is to use `instrumentation.js` to access `process` and listen for a "server-ready" signal, or use the `http` module to intercept. The most reliable pattern (used by multiple production Next.js + WebSocket deployments) is a lightweight custom server wrapper:

```javascript
// server.js (custom entry point, wraps Next.js)
import { createServer } from 'http';
import next from 'next';

const app = next({ dev: process.env.NODE_ENV !== 'production' });
const handle = app.getRequestHandler();

await app.prepare();
const server = createServer((req, res) => handle(req, res));

// WebSocket upgrade hook -- this is where ws-proxy.js attaches
server.on('upgrade', (req, socket, head) => {
  // Route to workspace proxy or let Next.js HMR handle it
});

server.listen(process.env.PORT || 80);
```

**Confidence:** MEDIUM -- the custom server pattern is well-established but means changing how the event handler starts (PM2/docker runs `node server.js` instead of `next start`). The instrumentation.js approach would be cleaner but getting the HTTP server handle from inside instrumentation is not well-documented.

### 2. Workspace Container Image (`templates/docker/workspace/`)

**Distinct from job container image because:**
- Job containers: entrypoint.sh runs a single Claude Code invocation and exits
- Workspace containers: ttyd as PID 1, long-running, interactive

**Base contents:**
- Same base as job image (Node 22, Claude Code CLI, GSD, gh CLI)
- Plus: ttyd, tmux
- Entrypoint: `ttyd -W -p 7681 tmux new -A -s main`
- `-W` flag: writable (client can send input)
- Named volume at `/workspace` for repo persistence

**Why ttyd over dockerode exec + raw WebSocket:**
- ttyd handles terminal emulation properly (resize, UTF-8, color codes)
- Built-in xterm.js compatibility (ttyd serves its own xterm.js client, but we proxy the WebSocket to our own UI)
- Battle-tested in production (tsl0922/ttyd has 8k+ GitHub stars)
- tmux integration gives session persistence even if WebSocket disconnects
- Multiple terminal sessions: additional `docker exec` instances can launch more ttyd on ports 7682+

**Confidence:** HIGH -- ttyd + tmux is the standard pattern for browser-accessible Docker terminals.

### 3. Database Schema (`code_workspaces` table)

```sql
CREATE TABLE code_workspaces (
  id TEXT PRIMARY KEY,           -- UUID
  instance_name TEXT NOT NULL,   -- 'noah', 'strategyES'
  repo_slug TEXT NOT NULL,       -- 'neurostory', 'clawforge'
  container_id TEXT,             -- Docker container ID
  container_name TEXT,           -- Human-readable container name
  volume_name TEXT NOT NULL,     -- Named volume (reuse existing convention)
  status TEXT NOT NULL DEFAULT 'creating',  -- creating/running/stopped/error
  port INTEGER DEFAULT 7681,     -- ttyd port inside container
  thread_id TEXT,                -- Originating chat thread
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_connected_at INTEGER,     -- Last WebSocket connection
  UNIQUE(instance_name, repo_slug)  -- One workspace per repo per instance
);
```

**Key design decision: One workspace per repo per instance.** This mirrors the existing named volume convention (`clawforge-{instance}-{slug}`) and prevents resource sprawl. The UNIQUE constraint enforces it at the DB level.

**Confidence:** HIGH -- follows existing schema patterns exactly (SQLite, Drizzle, integer timestamps).

### 4. LangGraph Tool (`start_coding`)

The tool follows the exact pattern of `createJobTool` -- resolve target repo, call workspace manager, return result.

```javascript
// Conceptual
const startCodingTool = tool(
  async ({ repo }, config) => {
    const threadId = config?.configurable?.thread_id;
    const repos = loadAllowedRepos();
    const resolved = resolveTargetRepo(repo, repos);
    if (!resolved) return JSON.stringify({ success: false, error: '...' });

    const workspace = await ensureWorkspaceContainer({
      instanceName: process.env.INSTANCE_NAME,
      repoSlug: resolved.slug,
      repoUrl: `https://github.com/${resolved.owner}/${resolved.slug}.git`,
      networkMode: process.env.DOCKER_NETWORK,
      threadId,
    });

    return JSON.stringify({
      success: true,
      workspace_id: workspace.id,
      status: workspace.status,
      connect_url: `/workspace/${workspace.id}`,
    });
  },
  {
    name: 'start_coding',
    description: 'Start or reconnect to a persistent coding workspace...',
    schema: z.object({ repo: z.string() }),
  }
);
```

**Confidence:** HIGH -- follows exact pattern of existing tools.

## Integration Points with Existing Code

### docker.js: Add Workspace Functions

The existing `docker.js` already has `initDocker()`, `dispatchDockerJob()`, `waitForContainer()`, etc. Add parallel workspace functions:

| Existing (jobs) | New (workspaces) | Notes |
|-----------------|------------------|-------|
| `dispatchDockerJob()` | `ensureWorkspaceContainer()` | Create or recover workspace |
| `waitForContainer()` | (not needed) | Workspaces don't "complete" |
| `removeContainer()` | `stopWorkspace()` / `destroyWorkspace()` | Stop vs permanent delete |
| `reconcileOrphans()` | `reconcileWorkspaces()` | Restart stopped workspaces on event handler restart |
| `inspectJob()` | `inspectWorkspace()` | Get container IP for proxy |
| `volumeNameFor()` | (reuse as-is) | Same naming convention works |

**The existing `volumeNameFor()` function works unchanged** -- workspace containers use the same `clawforge-{instance}-{slug}` volume convention as job containers. The volume is shared: jobs populate it during ephemeral runs, workspaces use it for persistent access.

**Mutex concern:** The existing flock-based mutex in `entrypoint.sh` protects the repo-cache volume during job runs. Workspace containers need a different approach since they hold the volume continuously. **Solution:** Workspace containers mount the volume at `/workspace` (not `/repo-cache`), and job containers continue using their existing `/repo-cache` -> `/job` copy pattern. The volume can safely serve both uses because job containers copy to `/job` before doing work -- they never modify `/repo-cache` directly after the copy step.

### instrumentation.js: Add WebSocket Proxy Init + Workspace Reconciliation

```javascript
// After existing initDocker() call
const { initWsProxy } = await import('../lib/ws-proxy.js');
initWsProxy();  // Hooks into HTTP server upgrade event

// Reconcile workspace containers (restart stopped ones, sync DB with Docker state)
const { reconcileWorkspaces } = await import('../lib/tools/docker.js');
await reconcileWorkspaces();
```

### api/index.js: Add Workspace Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/workspaces` | GET | API key | List workspaces for instance |
| `/api/workspaces` | POST | API key | Create workspace |
| `/api/workspaces/:id/stop` | POST | API key | Stop workspace container |
| `/api/workspaces/:id/start` | POST | API key | Start stopped workspace |
| `/api/workspaces/:id` | DELETE | API key | Destroy workspace + optionally volume |

These follow the existing routing pattern in the `POST`/`GET` switch statements.

### docker-compose.yml: No Changes Required

Workspace containers are created dynamically via the Docker Engine API (same as job containers). They are NOT defined in docker-compose.yml. The event handler container already has:
- Docker socket access (`:ro`)
- Network membership (noah-net, proxy-net)
- Traefik routing configured

**The only potential change:** If workspace containers need to be reachable from the browser, Traefik needs to route WebSocket connections. Since the proxy runs inside the event handler (which Traefik already routes to), no Traefik config changes are needed. Traefik automatically upgrades HTTP/1.1 connections with Upgrade headers.

## Patterns to Follow

### Pattern 1: Container State Machine

Workspace containers have a clear state machine that maps to recovery actions:

```
creating --> running --> stopped --> (start) --> running
                |                         |
                v                         v
              error                   destroyed
```

**Recovery on event handler restart:**
- `running` containers: verify they're actually running via Docker inspect, update DB if not
- `stopped` containers: restart them (RestartPolicy: unless-stopped should handle this, but verify)
- `creating` containers: treat as failed, clean up and allow recreation
- `error` containers: remove and allow recreation

**Why this matters:** Job containers are fire-and-forget. Workspace containers must survive event handler restarts, Docker daemon restarts, and host reboots. The reconciliation function runs at startup (mirrors existing `reconcileOrphans()`).

### Pattern 2: Proxy with Lazy Resolution

The WebSocket proxy should NOT cache container IPs. Containers can restart and get new IPs. Instead:

1. On WebSocket upgrade: look up workspaceId in DB -> get containerId
2. Inspect container via Docker API -> get current IP on instance network
3. Proxy to that IP:port
4. On proxy error: attempt container restart, then retry once

### Pattern 3: Shared Volume, Separate Mount Points

```
Named Volume: clawforge-noah-neurostory
  |
  +--> Job container mounts at /repo-cache (ephemeral, copy to /job)
  +--> Workspace container mounts at /workspace (persistent, work in place)
```

This means a job and a workspace can target the same repo without conflict. The job container's flock + copy pattern isolates it from the workspace's working tree.

### Pattern 4: Workspace Image Extends Job Image

The workspace Dockerfile should use a multi-stage or layered approach that shares the same base as the job image to minimize image pull size and maintenance burden:

```dockerfile
FROM scalingengine/clawforge:job-latest AS base
# Add workspace-specific tools
RUN apt-get update && apt-get install -y tmux
# Install ttyd (binary download or apt)
COPY workspace-entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running ttyd Outside the Container

**What:** Exposing ttyd on the host and connecting it to `docker exec`
**Why bad:** Breaks instance isolation. ttyd would need host-level access to all containers.
**Instead:** ttyd runs INSIDE each workspace container. The proxy routes to the correct container.

### Anti-Pattern 2: Exposing Container Ports to Host

**What:** Publishing ttyd ports (7681, 7682+) on the host via `-p 7681:7681`
**Why bad:** Port conflicts with multiple workspaces. Bypasses Traefik TLS. No auth layer.
**Instead:** Containers are on Docker networks only. The proxy in the event handler is the sole entry point.

### Anti-Pattern 3: Using dockerode exec for Terminal Access

**What:** Using `container.exec()` + raw stream piping for the primary terminal interface
**Why bad:** No proper terminal emulation (resize, SIGWINCH, escape codes). Fragile with WebSocket framing. Every reconnect starts a new shell. No session persistence.
**Instead:** ttyd + tmux handles all terminal concerns. WebSocket proxy is a clean byte pipe.

### Anti-Pattern 4: Storing Container IP in Database

**What:** Saving the container's IP address at creation time for later proxy use
**Why bad:** IPs change on container restart. Stale IPs cause silent proxy failures.
**Instead:** Always resolve IP via `docker.getContainer(id).inspect()` at connection time. Cache for the duration of one WebSocket session only.

### Anti-Pattern 5: Custom Server Replacing Next.js

**What:** Writing a standalone Express/Fastify server that embeds Next.js as middleware
**Why bad:** Loses Next.js optimizations, complicates deployment, diverges from existing architecture
**Instead:** Use a minimal custom server wrapper (`server.js`) that creates the HTTP server, attaches the upgrade handler, then delegates everything else to Next.js. The wrapper is thin (< 30 lines) and additive.

## Scalability Considerations

| Concern | At 2 instances (current) | At 10 instances | At 50 instances |
|---------|--------------------------|-----------------|-----------------|
| WebSocket connections | 2-4 concurrent, trivial | 10-20, still fine | Need connection pooling |
| Container count | 2-4 workspace containers | 10-20 | Docker Compose limits; consider Swarm |
| Volume storage | ~500MB per repo | ~5GB total | Prune old volumes, add monitoring |
| Memory per workspace | ~200-400MB (Node + Claude Code idle) | 2-4GB | Resource limits mandatory |
| Port allocation | Not applicable (no host ports) | Not applicable | Not applicable |

**For the current 2-instance scope, no scalability concerns.** Resource limits on workspace containers (memory: 2GB, CPU: 1.0) are a good practice to add in the container creation config regardless.

## Suggested Build Order (Dependency-Driven)

### Phase 1: Database + Container Foundation (no external dependencies)
1. `code_workspaces` Drizzle schema + migration
2. `lib/db/workspaces.js` CRUD functions
3. Workspace container functions in `docker.js` (ensureWorkspaceContainer, stopWorkspace, destroyWorkspace, inspectWorkspace, reconcileWorkspaces)
4. Workspace Dockerfile + entrypoint (`templates/docker/workspace/`)
5. Build and test workspace image locally

**Why first:** Everything else depends on being able to create and manage workspace containers.

### Phase 2: WebSocket Proxy (depends on Phase 1)
6. `lib/ws-proxy.js` with upgrade handler
7. Custom server wrapper (`server.js`) or instrumentation hook for HTTP upgrade
8. Auth verification in proxy (JWT token validation)
9. Integration in startup flow
10. Traefik passthrough verification (should work without changes)

**Why second:** The proxy is the critical new infrastructure piece. It must work before building tools/UI on top.

### Phase 3: API + LangGraph Tool (depends on Phases 1-2)
11. Workspace API routes in `api/index.js` (CRUD)
12. `start_coding` LangGraph tool in `lib/ai/tools.js`
13. Workspace reconciliation in instrumentation startup
14. Instance isolation enforcement (workspace labels scoped to instance)

**Why third:** These are the consumer interfaces. They need the underlying container management and proxy to be solid.

### Phase 4: Context Bridging + UI (depends on Phases 1-3)
15. Chat-to-workspace context injection (CHAT_CONTEXT env var or file write via docker.exec)
16. Workspace-to-chat result bridge (commit detection, thread injection)
17. Browser terminal UI component (xterm.js + WebSocket connection)

**Why last:** These are enhancement features that make workspaces more useful but aren't required for basic functionality. The core value (persistent container you can connect to) ships in Phases 1-2.

## Key Architectural Decision: Custom Server vs Instrumentation Hook

The biggest architectural decision for this milestone is how to attach the WebSocket upgrade handler.

**Option A: Custom server wrapper (recommended)**
- Create `server.js` that wraps Next.js
- Full control over HTTP server lifecycle
- Proven pattern (Fly.io guide, multiple production deployments)
- Requires changing how Dockerfile starts the app (`node server.js` vs `next start`)
- PM2 process file change in instance Dockerfiles

**Option B: Instrumentation hook hack**
- Access underlying HTTP server from `instrumentation.js`
- No entry point changes
- Fragile -- depends on Next.js internals that could change
- Not well-documented or officially supported

**Recommendation: Option A.** The custom server wrapper is a thin shim (< 30 lines) that provides clean, maintainable access to the HTTP server upgrade event. The Dockerfile change is minimal (one line in CMD/ENTRYPOINT).

## Sources

- [tsl0922/ttyd GitHub](https://github.com/tsl0922/ttyd) -- terminal sharing over web (8k+ stars)
- [Next.js WebSocket upgrade discussion #58698](https://github.com/vercel/next.js/discussions/58698) -- confirms no native support
- [Next.js WebSocket discussion #53780](https://github.com/vercel/next.js/discussions/53780) -- custom server patterns
- [Fly.io: WebSockets with Next.js](https://fly.io/javascript-journal/websockets-with-nextjs/) -- custom server pattern guide
- [dockerode GitHub](https://github.com/apocas/dockerode) -- Docker API for Node.js
- [docker-exec-websocket-server](https://www.npmjs.com/package/docker-exec-websocket-server) -- reference for exec+WebSocket pattern
- [ttyd + tmux persistent setup](https://mrkaran.dev/posts/web-terminal-homelab/) -- ttyd with tmux in Docker
- [http-proxy-middleware WebSocket recipe](https://github.com/chimurai/http-proxy-middleware/blob/master/recipes/websocket.md) -- proxy pattern reference
- [xterm.js](https://xtermjs.org/) -- terminal frontend library
- [Traefik WebSocket forum thread](https://community.traefik.io/t/v3-w-websockets/22796) -- automatic upgrade handling
- ClawForge `lib/tools/docker.js` -- existing dockerode integration
- ClawForge `config/instrumentation.js` -- existing startup flow
- ClawForge `templates/docker/job/entrypoint.sh` -- existing container entry point
