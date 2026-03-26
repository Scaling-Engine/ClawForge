---
status: awaiting_human_verify
trigger: "terminal shows Connecting to terminal... forever — compare with upstream and fix"
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:00Z
---

## Current Focus

hypothesis: proxy.js has two bugs: (1) uses Docker inspect + IP lookup instead of container DNS hostname, (2) fetches HTTP /token endpoint (unnecessary — ttyd has no auth credential set). Both cause connection failure.
test: Fix proxy.js to use container hostname DNS resolution and skip token prefetch (send empty AuthToken immediately on upstream open)
expecting: Terminal connects successfully after fix
next_action: Apply fixes to lib/ws/proxy.js

## Symptoms

expected: Shell tab in /code/{id} shows working xterm.js terminal connected to Docker container
actual: "Connecting to terminal..." forever, no terminal logs in browser console
errors: React #418 hydration crash was crashing the page (fix pushed 359b1d7 but undeployed). WebSocket chain untested.
reproduction: Launch any workspace, go to /code/{id}, click Shell tab
started: Since workspace pages were created (phases 48-51). Terminal has NEVER successfully connected.

## Eliminated

- hypothesis: Ticket system broken (globalThis not shared between Server Action and custom WS server)
  evidence: globalThis._clawforgeTickets pattern is correct; both run in same Node.js process; workaround explicitly designed for this
  timestamp: 2026-03-23

- hypothesis: CSWSH origin check blocking connections
  evidence: APP_URL env var matches what browser sends; would block with 403 not hang forever
  timestamp: 2026-03-23

- hypothesis: Docker socket not mounted in event handler container
  evidence: docker-compose.yml mounts /var/run/docker.sock:ro in noah-event-handler service
  timestamp: 2026-03-23

- hypothesis: Package name resolution broken (clawforge/* imports)
  evidence: package.json name is clawforge with correct exports map; self-referencing works in Node.js 12+
  timestamp: 2026-03-23

## Evidence

- timestamp: 2026-03-23
  checked: upstream lib/code/ws-proxy.js
  found: Upstream connects to ttyd by container DNS name (ws://{containerName}:7681/ws) not by IP. No HTTP /token prefetch. Sends {AuthToken: '', columns, rows} immediately on open.
  implication: Our IP-based approach is more complex and fragile. DNS hostname is simpler and how Docker networks are meant to be used.

- timestamp: 2026-03-23
  checked: docker/workspace/entrypoint.sh
  found: ttyd started with 'exec ttyd -W -p 7681 --ping-interval 30 tmux new -A -s workspace' — no -c credential flag, no auth token set.
  implication: HTTP /token fetch in proxy.js returns empty string anyway. The fetch itself can fail if timing is off (ttyd not ready). This is unnecessary complexity that can cause the connection to hang.

- timestamp: 2026-03-23
  checked: lib/ws/proxy.js
  found: fetchTtydToken makes HTTP GET to http://{ip}:{port}/token. If this request times out or fails after retries (5 attempts x 2s = 10s), the proxy sends 4500 close code. But if ttyd is starting slowly, the 5 retries may exhaust before ttyd is ready.
  implication: HTTP token prefetch is both unnecessary (no auth credential) AND a race-condition risk.

- timestamp: 2026-03-23
  checked: lib/db/schema.js codeWorkspaces
  found: containerName field stores 'clawforge-ws-{instanceName}-{shortId}' — this IS the Docker container name that serves as DNS hostname within the network.
  implication: We have the container name available in the DB; we should use it directly as DNS hostname.

- timestamp: 2026-03-23
  checked: ensureWorkspaceContainer in lib/tools/docker.js
  found: containerName = 'clawforge-ws-{instanceName}-{shortId}', stored in DB. NetworkMode = process.env.DOCKER_NETWORK (e.g. 'clawforge_noah-net'). Event handler container is ALSO on clawforge_noah-net.
  implication: Container name resolves via Docker DNS within the same network. The proxy can connect with ws://{containerName}:7681/ws directly.

## Resolution

root_cause: proxy.js (1) uses Docker API to inspect container IP instead of using the container's DNS hostname, and (2) makes an unnecessary HTTP /token prefetch to ttyd which can fail/timeout since ttyd has no auth credential set. Both create fragile race conditions. Upstream uses direct DNS hostname connection and sends empty AuthToken immediately.
fix: Rewrite proxyToTtyd to use ws.containerName as DNS hostname instead of Docker inspect + IP lookup. Remove fetchTtydToken and fetchTtydTokenWithRetry. Send {AuthToken: ''} immediately on upstream WS open.
verification: Fix applied. proxy.js rewritten to use containerName DNS hostname and send empty AuthToken immediately on open.
files_changed: [lib/ws/proxy.js]
