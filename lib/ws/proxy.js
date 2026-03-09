import WebSocket from 'ws';
import Docker from 'dockerode';
import { getWorkspace, updateWorkspace } from '../db/workspaces.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Bidirectional WebSocket proxy between browser client and ttyd inside a workspace container.
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

  // 2. Resolve container IP
  let ip;
  try {
    const info = await docker.getContainer(ws.containerId).inspect();
    const networks = info.NetworkSettings.Networks;
    const networkName = `${ws.instanceName}-net`;
    const network = networks[networkName];
    ip = network?.IPAddress;
  } catch (err) {
    console.error(`proxyToTtyd: failed to inspect container ${ws.containerId}: ${err.message}`);
    clientWs.close(4500, 'Container inspection failed');
    return;
  }

  if (!ip) {
    clientWs.close(4500, 'Could not resolve container IP');
    return;
  }

  // 3. Connect upstream WebSocket to ttyd
  const upstreamUrl = `ws://${ip}:${port}/ws`;
  const upstream = new WebSocket(upstreamUrl);

  upstream.on('open', () => {
    // Touch lastActivityAt on connection
    try {
      updateWorkspace(workspaceId, { lastActivityAt: Date.now() });
    } catch (err) {
      console.warn(`proxyToTtyd: failed to update lastActivityAt: ${err.message}`);
    }
  });

  // 4. Bidirectional message relay (preserve binary for ttyd protocol)
  clientWs.on('message', (data, isBinary) => {
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
  clientWs.on('close', (code, reason) => {
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      upstream.close(1000, 'Client disconnected');
    }
  });

  upstream.on('close', (code, reason) => {
    if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
      clientWs.close(code, reason);
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
    console.error(`proxyToTtyd: upstream error: ${err.message}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(4500, 'Upstream connection error');
    }
  });
}
