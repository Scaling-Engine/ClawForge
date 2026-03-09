import WebSocket from 'ws';
import http from 'http';
import Docker from 'dockerode';
import { getWorkspace, updateWorkspace } from '../db/workspaces.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Fetch ttyd auth token from its /token HTTP endpoint.
 * ttyd requires this token as the first WebSocket message (even when empty).
 */
function fetchTtydToken(ip, port) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${ip}:${port}/token`, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body).token ?? '');
        } catch {
          resolve('');
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Token fetch timeout')); });
  });
}

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
    const networkName = process.env.DOCKER_NETWORK || `${ws.instanceName}-net`;
    let network = networks[networkName];
    if (!network) {
      const key = Object.keys(networks).find(n => n.includes(ws.instanceName));
      if (key) network = networks[key];
    }
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

  // 3. Fetch ttyd auth token (required handshake, even when no credential is set)
  let ttydToken;
  try {
    ttydToken = await fetchTtydToken(ip, port);
  } catch (err) {
    console.error(`proxyToTtyd: failed to fetch ttyd token: ${err.message}`);
    clientWs.close(4500, 'Failed to fetch ttyd token');
    return;
  }

  // 4. Connect upstream WebSocket to ttyd
  //    ttyd requires the 'tty' WebSocket subprotocol (libwebsockets protocol name).
  const upstreamUrl = `ws://${ip}:${port}/ws`;
  const upstream = new WebSocket(upstreamUrl, ['tty']);

  // Buffer client messages until ttyd auth handshake completes
  let authSent = false;
  const pendingClientMsgs = [];

  upstream.on('open', () => {
    console.log(`proxyToTtyd: upstream OPEN, sending auth token`);

    // Send ttyd auth handshake as first message
    upstream.send(JSON.stringify({ AuthToken: ttydToken }));
    authSent = true;

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

  // 5. Bidirectional message relay (preserve binary for ttyd protocol)
  clientWs.on('message', (data, isBinary) => {
    if (!authSent) {
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

  // 6. Close propagation
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

  // 7. Error handling
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
