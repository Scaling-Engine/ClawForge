# Phase 23: WebSocket & Browser Terminal - Research

**Researched:** 2026-03-09
**Domain:** WebSocket proxying, terminal emulation, browser-to-container connectivity
**Confidence:** HIGH

## Summary

Phase 23 connects the browser to ttyd running inside workspace containers via a WebSocket proxy through the event handler. The workspace infrastructure (Phase 22) already provides running containers with ttyd on port 7681 and tmux session persistence. This phase adds the WebSocket plumbing, browser terminal UI, authentication, multi-tab support, and git safety checks.

The core challenge is that Next.js does not handle WebSocket upgrade requests natively. A custom `server.js` wrapper must intercept HTTP upgrade events before they reach Next.js, authenticate the connection via a short-lived ticket, resolve the target container's IP via Docker inspect, and proxy the WebSocket bidirectionally to ttyd. The browser side uses xterm.js to render the terminal with the addon-attach module bridging the WebSocket.

**Primary recommendation:** Use `ws` library in `noServer` mode within a custom `server.js` wrapper, ticket-based auth via an authenticated Server Action, and xterm.js v5 with addon-attach for the browser terminal.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TERM-01 | Custom server wrapper intercepts HTTP upgrade events and proxies WebSocket to ttyd inside container | Custom server.js pattern with ws noServer mode; lazy container IP resolution via dockerode inspect; PM2 config change from `next start` to `node server.js` |
| TERM-02 | WebSocket auth uses ticket-based tokens (short-lived, single-use) to prevent CSWSH | Server Action issues ticket stored in Map with 30s TTL; ticket consumed on upgrade; Origin header validation as secondary defense |
| TERM-03 | Browser terminal renders via xterm.js with resize, reconnect, and theme support | @xterm/xterm v5.5 + addon-fit + addon-attach; FitAddon handles resize; reconnect via new ticket + WebSocket; theme via CSS variables |
| TERM-04 | Operator can spawn additional shell tabs (separate ttyd instances on ports 7682+) | Docker exec to start additional ttyd on sequential ports; proxy routes include port parameter; each tab gets independent WebSocket |
| TERM-05 | Git safety check warns operator of uncommitted/unpushed changes before workspace close | Docker exec runs `git status --porcelain && git log @{u}..HEAD --oneline` inside container; results shown in confirmation dialog |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ws | ^8.19.0 | WebSocket server + proxy | De facto Node.js WebSocket library; supports noServer mode for custom upgrade handling; handles binary frames natively |
| @xterm/xterm | ^5.5.0 | Terminal emulator in browser | Industry standard terminal renderer; v5 is stable, v6 not yet released |
| @xterm/addon-fit | ^0.10.0 | Auto-resize terminal to container | Required for responsive terminal layout |
| @xterm/addon-attach | ^0.11.0 | Bridge xterm.js to WebSocket | Handles bidirectional data flow between terminal and WebSocket |
| dockerode | ^4.0.9 | Container inspect + exec | Already in project; provides IP resolution and exec for multi-tab + git checks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @xterm/addon-web-links | ^0.11.0 | Clickable URLs in terminal | Nice-to-have, can defer |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ws | socket.io | socket.io adds protocol overhead incompatible with ttyd's raw WebSocket; ws is lighter and matches ttyd's expectations |
| addon-attach | Manual WebSocket handling | addon-attach handles text/binary framing correctly; hand-rolling risks frame type bugs |
| Ticket auth | Cookie/session auth on upgrade | Cookies sent automatically on upgrade requests enable CSWSH attacks; tickets are single-use and explicit |

**Installation:**
```bash
npm install ws @xterm/xterm @xterm/addon-fit @xterm/addon-attach
```

Note: xterm.js CSS must be imported in the terminal component (`@xterm/xterm/css/xterm.css`). Since this is a client component, use Next.js CSS import.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── ws/                          # NEW: WebSocket server-side code
│   ├── server.js                # Custom HTTP server wrapper (intercepts upgrade)
│   ├── proxy.js                 # Bidirectional WebSocket proxy to ttyd
│   └── tickets.js               # Ticket issuance, validation, expiry
├── tools/
│   └── docker.js                # EXISTING: add getContainerIp(), execInWorkspace()
└── auth/
    └── config.js                # EXISTING: auth() used by ticket endpoint

app/                             # Instance project (templates/)
└── workspace/
    └── [id]/
        └── page.jsx             # Terminal page with xterm.js (client component)

templates/
└── docker/
    └── event-handler/
        └── ecosystem.config.cjs # CHANGED: next start -> node server.js
```

### Pattern 1: Custom Server Wrapper
**What:** A `server.js` that creates an HTTP server, delegates normal requests to Next.js, and intercepts WebSocket upgrade events.
**When to use:** Any time Next.js needs WebSocket support.
**Example:**
```javascript
// lib/ws/server.js
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { validateTicket } from './tickets.js';
import { proxyToTtyd } from './proxy.js';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const wss = new WebSocketServer({ noServer: true });

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res, parse(req.url, true));
});

server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Only handle /ws/terminal paths
  if (!url.pathname.startsWith('/ws/terminal/')) {
    socket.destroy();
    return;
  }

  // Validate ticket
  const ticket = url.searchParams.get('ticket');
  const ticketData = validateTicket(ticket);
  if (!ticketData) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Origin check (secondary defense)
  const origin = req.headers.origin;
  const allowed = process.env.APP_URL;
  if (origin && allowed && !origin.startsWith(allowed)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, ticketData);
  });
});

wss.on('connection', async (ws, req, ticketData) => {
  await proxyToTtyd(ws, ticketData);
});

const port = parseInt(process.env.PORT || '80', 10);
server.listen(port, () => {
  console.log(`ClawForge server listening on port ${port}`);
});
```

### Pattern 2: Ticket-Based WebSocket Auth
**What:** Short-lived, single-use tokens issued via authenticated HTTP endpoint, consumed during WebSocket upgrade.
**When to use:** Any browser-to-server WebSocket where CSWSH must be prevented.
**Example:**
```javascript
// lib/ws/tickets.js
import crypto from 'crypto';

const tickets = new Map(); // ticket -> { workspaceId, port, userId, expiresAt }
const TICKET_TTL_MS = 30_000; // 30 seconds

export function issueTicket(workspaceId, port, userId) {
  const ticket = crypto.randomBytes(32).toString('hex');
  tickets.set(ticket, {
    workspaceId,
    port: port || 7681,
    userId,
    expiresAt: Date.now() + TICKET_TTL_MS,
  });
  return ticket;
}

export function validateTicket(ticket) {
  if (!ticket) return null;
  const data = tickets.get(ticket);
  if (!data) return null;

  // Single-use: delete immediately
  tickets.delete(ticket);

  // Check expiry
  if (Date.now() > data.expiresAt) return null;

  return data;
}

// Periodic cleanup of expired tickets (every 60s)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of tickets) {
    if (now > val.expiresAt) tickets.delete(key);
  }
}, 60_000);
```

### Pattern 3: WebSocket Proxy to ttyd
**What:** Bidirectional proxy between browser WebSocket and ttyd WebSocket inside container.
**When to use:** Connecting browser terminal to containerized ttyd.
**Example:**
```javascript
// lib/ws/proxy.js
import { WebSocket } from 'ws';
import Docker from 'dockerode';
import { getWorkspace, updateWorkspace } from '../db/workspaces.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export async function proxyToTtyd(clientWs, ticketData) {
  const { workspaceId, port } = ticketData;
  const ws = getWorkspace(workspaceId);
  if (!ws || ws.status !== 'running') {
    clientWs.close(4404, 'Workspace not found or not running');
    return;
  }

  // Lazy IP resolution via docker inspect
  const container = docker.getContainer(ws.containerId);
  const info = await container.inspect();
  const networkName = `${ws.instanceName}-net`;
  const ip = info.NetworkSettings.Networks[networkName]?.IPAddress;
  if (!ip) {
    clientWs.close(4500, 'Cannot resolve container IP');
    return;
  }

  // Connect to ttyd inside container
  const ttydUrl = `ws://${ip}:${port}/ws`;
  const upstream = new WebSocket(ttydUrl);

  upstream.on('open', () => {
    // Touch activity timestamp
    updateWorkspace(workspaceId, { lastActivityAt: Date.now() });
  });

  // Bidirectional proxy (binary-safe)
  upstream.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  clientWs.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    }
  });

  // Close propagation
  upstream.on('close', () => clientWs.close());
  clientWs.on('close', () => upstream.close());

  // Error handling
  upstream.on('error', (err) => {
    console.error(`[ws-proxy] Upstream error for ${workspaceId}: ${err.message}`);
    clientWs.close(4502, 'Upstream connection error');
  });

  clientWs.on('error', (err) => {
    console.error(`[ws-proxy] Client error for ${workspaceId}: ${err.message}`);
    upstream.close();
  });
}
```

### Pattern 4: Container IP Resolution
**What:** Get container IP on the instance network using dockerode inspect.
**When to use:** Every WebSocket connection (lazy, not cached -- IPs change on restart).
**Key detail:** The container joins `{instanceName}-net` (e.g., `noah-net`). The IP is at `info.NetworkSettings.Networks['noah-net'].IPAddress`.

### Pattern 5: Multi-Tab via Docker Exec
**What:** Spawn additional ttyd instances on sequential ports inside the workspace container.
**When to use:** TERM-04, when operator wants additional shell tabs.
**Example:**
```javascript
// Add to lib/tools/docker.js
export async function spawnExtraShell(workspaceId, port) {
  const ws = getWorkspace(workspaceId);
  if (!ws?.containerId) throw new Error('Workspace not found');

  const container = docker.getContainer(ws.containerId);
  const exec = await container.exec({
    Cmd: ['ttyd', '-W', '-p', String(port), '--ping-interval', '30', 'tmux', 'new', '-s', `tab-${port}`],
    Detach: true,
  });
  await exec.start({ Detach: true });
  return { port };
}
```

### Anti-Patterns to Avoid
- **Caching container IPs:** IPs change on container restart. Always resolve at connection time via `container.inspect()`.
- **Using socket.io instead of ws:** ttyd speaks raw WebSocket. socket.io adds its own framing protocol on top, which is incompatible.
- **Cookie-based WebSocket auth:** Browser automatically sends cookies on WebSocket upgrade, enabling CSWSH. Use explicit ticket parameter instead.
- **Running WebSocket server in Next.js API route:** Next.js API routes are request/response, not persistent connections. WebSocket must be handled at the HTTP server level.
- **Sharing a single ttyd process for multiple tabs:** Each tab needs its own tmux session and ttyd instance on a separate port.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal rendering | Canvas-based terminal | @xterm/xterm | Handles escape sequences, cursor positioning, selection, scrollback -- thousands of edge cases |
| WebSocket-to-terminal bridge | Manual data piping | @xterm/addon-attach | Handles binary/text frame negotiation correctly |
| Terminal resize | Manual SIGWINCH | @xterm/addon-fit + ttyd resize protocol | FitAddon calculates cols/rows from pixel dimensions correctly |
| WebSocket server | Raw `http.createServer` upgrade | ws library | Handles WebSocket handshake, framing, ping/pong, masking correctly |
| CSRF for WebSocket | Custom token scheme | Ticket pattern (described above) | Well-established pattern; single-use + TTL prevents replay |

**Key insight:** Terminal emulation has decades of edge cases (Unicode, control sequences, 256-color, true color, mouse reporting). xterm.js handles all of them. Any custom solution will break on non-trivial terminal output.

## Common Pitfalls

### Pitfall 1: WebSocket Upgrade Silently Fails
**What goes wrong:** The upgrade request reaches Next.js instead of the custom server, and gets a 404 or hangs.
**Why it happens:** PM2 config still points to `next start` instead of `node server.js`, or the server.js doesn't call `server.on('upgrade', ...)` before Next.js processes the request.
**How to avoid:** Change `ecosystem.config.cjs` to run `node server.js` with args removed. Verify upgrade handler is registered before `server.listen()`.
**Warning signs:** WebSocket connections return HTTP 404 or time out without error.

### Pitfall 2: ttyd Binary Protocol Mismatch
**What goes wrong:** Terminal shows garbage or doesn't respond to input.
**Why it happens:** ttyd uses a custom binary protocol with message type prefix bytes (e.g., `0` for input, `1` for output, `2` for resize). The proxy must pass these through without modification.
**How to avoid:** Proxy binary frames as-is without text conversion. Use `{ binary: isBinary }` in ws send calls. addon-attach handles the ttyd protocol natively when configured for binary.
**Warning signs:** Terminal renders but keyboard input doesn't work, or output appears garbled.

### Pitfall 3: CSWSH (Cross-Site WebSocket Hijacking)
**What goes wrong:** Malicious page opens WebSocket to your server; browser sends cookies automatically, authenticating the attacker.
**Why it happens:** WebSocket upgrade is a regular HTTP request that includes cookies.
**How to avoid:** Ticket-based auth (ticket is not a cookie, must be explicitly passed as query param). Origin header check as secondary defense.
**Warning signs:** N/A -- this is a design-time prevention, not runtime detection.

### Pitfall 4: Zombie WebSocket Connections After Container Restart
**What goes wrong:** Container restarts, old WebSocket connections hang open, new connections fail because old proxy still holds the stale upstream.
**Why it happens:** Container IP changes on restart; old upstream WebSocket gets no close event (just TCP timeout).
**How to avoid:** Set a reasonable timeout on upstream connections. Handle upstream `close` and `error` events to clean up client connection. The client should auto-reconnect (request new ticket, open new WebSocket).
**Warning signs:** Terminal freezes after container restart, no error shown.

### Pitfall 5: Traefik Drops Long-Lived WebSocket
**What goes wrong:** WebSocket disconnects after ~30s-2min of inactivity.
**Why it happens:** Traefik v3 has default idle timeouts for backend connections. WebSocket ping/pong may not be configured.
**How to avoid:** Add Traefik transport configuration via labels:
```yaml
- traefik.http.services.noah.loadbalancer.server.transport=ws-transport
- traefik.http.serversTransports.ws-transport.forwardingTimeouts.idleConnTimeout=0s
```
Also ensure ttyd's `--ping-interval 30` keeps the connection alive through any intermediate proxies.
**Warning signs:** Terminal works for a while then disconnects during idle periods.

### Pitfall 6: xterm.js Import in SSR Context
**What goes wrong:** `ReferenceError: window is not defined` or `document is not defined`.
**Why it happens:** xterm.js accesses DOM APIs. If imported at module level in a Next.js component, it runs during SSR.
**How to avoid:** Dynamic import xterm.js only on client side using `useEffect` or Next.js `dynamic()` with `ssr: false`. Mark the terminal component as `'use client'`.
**Warning signs:** Server-side rendering errors during build or page load.

### Pitfall 7: FitAddon Resize Not Propagated to ttyd
**What goes wrong:** Terminal visually resizes but shell output still wraps at old column width.
**Why it happens:** FitAddon only updates xterm.js dimensions. The resize must be communicated to ttyd, which propagates it to the shell via SIGWINCH. ttyd uses its protocol byte `2` for resize messages.
**How to avoid:** addon-attach handles this when used with ttyd. Alternatively, listen to xterm's `onResize` event and send the resize message in ttyd's expected format.
**Warning signs:** Text wraps at wrong column, programs like vim render incorrectly after browser resize.

### Pitfall 8: Port Exhaustion on Multi-Tab
**What goes wrong:** Too many ttyd instances running inside a container.
**Why it happens:** Each tab spawns a new ttyd process. No cleanup when tabs close.
**How to avoid:** Track spawned ttyd processes. When a tab's WebSocket closes, kill the corresponding ttyd process. Limit max tabs (e.g., 4 per workspace).
**Warning signs:** Container memory usage grows, port conflicts.

## Code Examples

### Server Action for Ticket Issuance
```javascript
// lib/ws/actions.js (Server Action)
'use server';

import { auth } from '../auth/config.js';
import { issueTicket } from './tickets.js';
import { getWorkspace } from '../db/workspaces.js';

export async function requestTerminalTicket(workspaceId, port = 7681) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const ws = getWorkspace(workspaceId);
  if (!ws || ws.status !== 'running') {
    throw new Error('Workspace not running');
  }

  const ticket = issueTicket(workspaceId, port, session.user.id);
  return { ticket };
}
```

### Browser Terminal Component (Client)
```jsx
// templates/app/workspace/[id]/terminal.jsx
'use client';
import { useEffect, useRef, useCallback } from 'react';

export function Terminal({ workspaceId, ticket, wsUrl }) {
  const termRef = useRef(null);
  const xtermRef = useRef(null);

  useEffect(() => {
    let term, fitAddon, ws;

    async function init() {
      // Dynamic import to avoid SSR
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { AttachAddon } = await import('@xterm/addon-attach');
      await import('@xterm/xterm/css/xterm.css');

      term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e2e',
          foreground: '#cdd6f4',
          cursor: '#f5e0dc',
        },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(termRef.current);
      fitAddon.fit();

      // Connect WebSocket with ticket
      ws = new WebSocket(`${wsUrl}?ticket=${ticket}`);
      ws.binaryType = 'arraybuffer';

      const attachAddon = new AttachAddon(ws);
      term.loadAddon(attachAddon);

      // Resize handling
      const onResize = () => fitAddon.fit();
      window.addEventListener('resize', onResize);

      xtermRef.current = { term, ws, fitAddon, onResize };
    }

    init();

    return () => {
      if (xtermRef.current) {
        window.removeEventListener('resize', xtermRef.current.onResize);
        xtermRef.current.ws?.close();
        xtermRef.current.term?.dispose();
      }
    };
  }, [ticket, wsUrl]);

  return <div ref={termRef} style={{ width: '100%', height: '100%' }} />;
}
```

### Git Safety Check (TERM-05)
```javascript
// Add to lib/tools/docker.js
export async function checkWorkspaceGitStatus(workspaceId) {
  const ws = getWorkspace(workspaceId);
  if (!ws?.containerId) throw new Error('Workspace not found');

  const container = docker.getContainer(ws.containerId);

  // Check for uncommitted changes
  const statusExec = await container.exec({
    Cmd: ['git', '-C', '/workspace', 'status', '--porcelain'],
    AttachStdout: true,
    AttachStderr: true,
  });
  const statusOutput = await _execToString(statusExec);

  // Check for unpushed commits
  const logExec = await container.exec({
    Cmd: ['git', '-C', '/workspace', 'log', '@{u}..HEAD', '--oneline'],
    AttachStdout: true,
    AttachStderr: true,
  });
  const logOutput = await _execToString(logExec);

  return {
    hasUncommitted: statusOutput.trim().length > 0,
    uncommittedFiles: statusOutput.trim().split('\n').filter(Boolean),
    hasUnpushed: logOutput.trim().length > 0,
    unpushedCommits: logOutput.trim().split('\n').filter(Boolean),
    safe: statusOutput.trim().length === 0 && logOutput.trim().length === 0,
  };
}

async function _execToString(exec) {
  return new Promise((resolve, reject) => {
    exec.start((err, stream) => {
      if (err) return reject(err);
      let output = '';
      stream.on('data', (chunk) => { output += chunk.toString(); });
      stream.on('end', () => resolve(output));
      stream.on('error', reject);
    });
  });
}
```

### PM2 Ecosystem Config Change
```javascript
// templates/docker/event-handler/ecosystem.config.cjs
// BEFORE:
// script: 'node_modules/.bin/next', args: 'start -p 80'
// AFTER:
module.exports = {
  apps: [{
    name: 'next',
    script: 'lib/ws/server.js',
    kill_timeout: 120000,
    env: {
      PORT: '80',
    },
  }]
};
```

### Traefik WebSocket Timeout Labels
```yaml
# Add to docker-compose.yml for each instance
labels:
  # ... existing labels ...
  - traefik.http.middlewares.ws-headers.headers.customrequestheaders.Connection=Upgrade
  - traefik.http.routers.noah.middlewares=ws-headers
```
Note: Traefik v3 auto-detects WebSocket upgrades, but explicit timeout configuration may be needed for long-lived idle connections.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| xterm.js v4 (terminal package) | @xterm/xterm v5 (scoped packages) | 2023 | Import paths changed: `xterm` -> `@xterm/xterm`, addons similarly scoped |
| socket.io for terminal | Raw WebSocket (ws) | Ongoing | socket.io overhead unnecessary for direct terminal relay |
| shellinabox | ttyd | ~2020 | ttyd is actively maintained, supports modern WebSocket, lighter |
| wetty | ttyd + xterm.js | ~2021 | Composing ttyd + xterm.js gives more control than monolithic wetty |

**Deprecated/outdated:**
- `xterm` (unscoped npm package): Use `@xterm/xterm` v5 instead
- `xterm-addon-fit` (unscoped): Use `@xterm/addon-fit` instead
- `xterm-addon-attach` (unscoped): Use `@xterm/addon-attach` instead
- xterm.js v6: Not yet released as of research date; stick with v5.5.x

## Open Questions

1. **ttyd binary protocol details**
   - What we know: ttyd uses prefix bytes (0=input, 1=output, 2=resize) on binary WebSocket frames
   - What's unclear: Exact protocol specification is undocumented (wiki page was empty). The proxy must pass binary frames through unmodified.
   - Recommendation: Treat proxy as opaque binary relay. addon-attach handles the protocol. Test with actual ttyd connection to verify.

2. **Traefik idle timeout configuration**
   - What we know: Traefik v3 auto-detects and upgrades WebSocket. ttyd sends ping every 30s.
   - What's unclear: Whether Traefik's default backend idle timeout will interfere with long-idle terminal sessions.
   - Recommendation: Test without explicit timeout config first. If sessions drop, add `serversTransports` configuration. ttyd's 30s ping should keep connections alive.

3. **addon-attach binary mode compatibility with ttyd**
   - What we know: addon-attach supports binary WebSocket mode. ttyd uses binary frames.
   - What's unclear: Whether addon-attach's expected binary format matches ttyd's prefix-byte protocol exactly.
   - Recommendation: Test with `ws.binaryType = 'arraybuffer'` and addon-attach. If incompatible, replace addon-attach with manual onmessage handler that strips/adds prefix bytes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual testing + curl/wscat verification |
| Config file | none -- see Wave 0 |
| Quick run command | `npm test` (currently placeholder) |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TERM-01 | WebSocket upgrade intercepted and proxied to ttyd | integration | Manual: `wscat -c wss://host/ws/terminal/ID?ticket=X` | No - Wave 0 |
| TERM-02 | Ticket auth prevents unauthorized WebSocket connections | unit | `node --test lib/ws/tickets.test.js` | No - Wave 0 |
| TERM-03 | Browser terminal renders and accepts input | e2e | Manual: open workspace page, type commands | No |
| TERM-04 | Additional shell tabs spawn on sequential ports | integration | Manual: open second tab, verify independent session | No |
| TERM-05 | Git safety check returns uncommitted/unpushed status | unit | `node --test lib/tools/docker.test.js` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** Manual verification (connect terminal, type command, see output)
- **Per wave merge:** Full WebSocket flow test (ticket -> upgrade -> proxy -> terminal -> disconnect)
- **Phase gate:** All 5 TERM requirements verified with running workspace

### Wave 0 Gaps
- [ ] `lib/ws/tickets.test.js` -- unit tests for ticket issuance/validation/expiry (covers TERM-02)
- [ ] Test infrastructure: Node.js built-in test runner (`node --test`) is available, no framework install needed
- [ ] Integration test script for WebSocket upgrade flow (requires running workspace container)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `lib/tools/docker.js`, `templates/docker/workspace/entrypoint.sh`, `templates/docker/event-handler/ecosystem.config.cjs`, `docker-compose.yml`, `package.json`, `lib/auth/config.js`
- `.planning/research/ARCHITECTURE.md` -- custom server wrapper pattern (Option A)
- `.planning/research/STACK.md` -- version-pinned library recommendations
- `.planning/research/PITFALLS.md` -- 14 pitfalls catalogued during milestone research

### Secondary (MEDIUM confidence)
- ws library documentation -- noServer mode, binary frame handling
- xterm.js documentation -- v5 API, addon-attach usage, dynamic import pattern
- ttyd GitHub repository -- WebSocket protocol behavior, CLI flags

### Tertiary (LOW confidence)
- ttyd binary protocol details -- wiki page was empty; prefix byte format inferred from source code references and community posts
- Traefik v3 WebSocket timeout behavior -- documented as auto-detect but edge cases for long-idle connections unclear

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- libraries verified in milestone research, versions confirmed against npm
- Architecture: HIGH -- custom server wrapper pattern validated against codebase; PM2/Dockerfile integration points confirmed
- Pitfalls: HIGH -- 8 pitfalls identified from milestone research + codebase analysis
- ttyd protocol: MEDIUM -- binary prefix format widely referenced but official docs missing
- Traefik timeouts: MEDIUM -- auto-detection documented, but idle timeout edge case needs runtime verification

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (30 days -- stable domain, no fast-moving dependencies)
