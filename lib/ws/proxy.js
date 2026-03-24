import WebSocket from 'ws';
import { getWorkspace, updateWorkspace } from '../db/workspaces.js';

/**
 * Bidirectional WebSocket proxy between browser client and ttyd inside a workspace container.
 *
 * Connects to the container using its Docker DNS hostname (container name) within the shared
 * Docker network. This is simpler and more reliable than inspecting the container for its IP.
 *
 * ttyd is started with no credential flag (-c), so no auth token is needed —
 * an empty AuthToken handshake is sent immediately on upstream open.
 *
 * @param {WebSocket} clientWs - Browser-side WebSocket connection
 * @param {{workspaceId: string, port: number, userId: string}} ticketData - Validated ticket data
 */
export async function proxyToTtyd(clientWs, ticketData) {
  const { workspaceId, port } = ticketData;

  // 1. Get workspace from DB
  const ws = getWorkspace(workspaceId);
  if (!ws || ws.status !== 'running') {
    clientWs.close(4404, 'Workspace not found or not running');
    return;
  }

  // 2. Resolve container DNS hostname from workspace record.
  //    Docker provides internal DNS resolution for container names within the same network.
  const containerName = ws.containerName;
  if (!containerName) {
    console.error(`proxyToTtyd: workspace ${workspaceId} has no containerName`);
    clientWs.close(4500, 'Container name not available');
    return;
  }

  // 3. Connect upstream WebSocket directly to ttyd via container DNS hostname.
  //    ttyd requires the 'tty' WebSocket subprotocol (libwebsockets protocol name).
  const upstreamUrl = `ws://${containerName}:${port}/ws`;
  console.log(`proxyToTtyd: connecting to ${upstreamUrl}`);
  const upstream = new WebSocket(upstreamUrl, ['tty']);

  // Buffer client messages until ttyd handshake completes
  let handshakeSent = false;
  const pendingClientMsgs = [];

  upstream.on('open', () => {
    console.log(`proxyToTtyd: upstream OPEN (${containerName}:${port})`);

    // Send ttyd auth handshake as first message.
    // ttyd is started without -c credential flag so AuthToken is empty.
    upstream.send(JSON.stringify({ AuthToken: '' }));
    handshakeSent = true;

    // Flush any client messages that arrived during connect
    for (const { data, isBinary } of pendingClientMsgs) {
      upstream.send(data, { binary: isBinary });
    }
    pendingClientMsgs.length = 0;

    try {
      updateWorkspace(workspaceId, { lastActivityAt: Date.now() });
    } catch (err) {
      console.warn(`proxyToTtyd: failed to update lastActivityAt: ${err.message}`);
    }
  });

  // 4. Bidirectional message relay (preserve binary for ttyd protocol)
  clientWs.on('message', (data, isBinary) => {
    if (!handshakeSent) {
      pendingClientMsgs.push({ data, isBinary });
      return;
    }
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    }
  });

  upstream.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  // 5. Close propagation
  clientWs.on('close', () => {
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close(1000, 'Client disconnected');
    }
  });

  upstream.on('close', (code) => {
    if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
      const safeCode = (code >= 1000 && code <= 4999) ? code : 1000;
      clientWs.close(safeCode, 'Upstream closed');
    }
  });

  // 6. Error handling
  clientWs.on('error', (err) => {
    console.error(`proxyToTtyd: client error: ${err.message}`);
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.close(1011, 'Client error');
    }
  });

  upstream.on('error', (err) => {
    console.error(`proxyToTtyd: upstream error (${containerName}:${port}): ${err.message}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(4500, 'Upstream connection error');
    }
  });
}
