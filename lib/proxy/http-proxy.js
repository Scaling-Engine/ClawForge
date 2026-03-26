/**
 * HTTP proxy for /agent/[slug]/* — forwards hub requests to spoke instances.
 *
 * Pattern: Node.js built-in http/https.request() + pipe()
 * No http-proxy-middleware (ESM incompatibility with Next.js #86434)
 *
 * Only active when SUPERADMIN_HUB=true. Spoke instances pass /agent/* to Next.js.
 */

import http from 'http';
import https from 'https';
import net from 'net';
import { parse } from 'url';

// Hop-by-hop headers that must not be forwarded to the upstream spoke
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
  'host', // replaced with target host
]);

/**
 * Resolve a slug to its spoke instance URL and token.
 * Returns null if slug is not found in registry.
 *
 * Reads SUPERADMIN_INSTANCES at request time (not module load time) so env vars
 * can be updated without restart.
 *
 * @param {string} slug - Agent slug (e.g. "archie", "noah", "strategyes")
 * @returns {{ url: string, token: string } | null}
 */
function resolveInstance(slug) {
  const raw = process.env.SUPERADMIN_INSTANCES;
  if (!raw) return null;

  let instances;
  try {
    instances = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(instances)) return null;

  const match = instances.find(
    (i) => i && typeof i === 'object' && i.name === slug && i.url
  );

  if (!match) return null;
  return { url: match.url.replace(/\/$/, ''), token: match.token || process.env.AGENT_SUPERADMIN_TOKEN || '' };
}

/**
 * Forward an incoming Node.js IncomingMessage to a spoke instance URL.
 * Handles both regular JSON responses and SSE streams (no buffering).
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} targetBaseUrl - Spoke base URL (e.g. "http://archie-app:80")
 * @param {string} spokePath - Path on spoke (e.g. "/api/jobs")
 * @param {string} token - Bearer token for spoke auth
 */
function forwardRequest(req, res, targetBaseUrl, spokePath, token) {
  const parsedTarget = parse(targetBaseUrl);
  const isHttps = parsedTarget.protocol === 'https:';
  const transport = isHttps ? https : http;

  const hostname = parsedTarget.hostname;
  const port = parsedTarget.port
    ? parseInt(parsedTarget.port, 10)
    : isHttps ? 443 : 80;

  // Build forwarded headers — strip hop-by-hop, inject Bearer
  const forwardedHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      forwardedHeaders[key] = value;
    }
  }
  forwardedHeaders['authorization'] = `Bearer ${token}`;
  forwardedHeaders['host'] = hostname + (parsedTarget.port ? `:${parsedTarget.port}` : '');

  // Preserve query string from the original request
  const originalUrl = parse(req.url, true);
  const spokeFull = spokePath + (originalUrl.search || '');

  const options = {
    hostname,
    port,
    path: spokeFull,
    method: req.method,
    headers: forwardedHeaders,
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    const isSSE = (proxyRes.headers['content-type'] || '').includes('text/event-stream');

    // For SSE streams: disable Nginx/proxy buffering and flush headers immediately
    if (isSSE) {
      proxyRes.headers['x-accel-buffering'] = 'no';
      proxyRes.headers['cache-control'] = 'no-cache';
    }

    res.writeHead(proxyRes.statusCode, proxyRes.headers);

    if (isSSE) {
      // Pipe with immediate flushing for SSE — no internal buffering
      proxyRes.on('data', (chunk) => {
        res.write(chunk);
        if (typeof res.flush === 'function') res.flush();
      });
      proxyRes.on('end', () => res.end());
    } else {
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (err) => {
    console.error(`[proxy] upstream error for ${spokeFull}: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502);
    }
    res.end(JSON.stringify({ error: 'Bad Gateway', detail: err.message }));
  });

  // Pipe request body (for POST/PUT/PATCH)
  req.pipe(proxyReq);
}

/**
 * Attach HTTP proxy handler to the Node.js HTTP server.
 * Must be called after createServer() but before listen() so that the
 * server.prependListener('request', ...) guarantees proxy fires before Next.js.
 *
 * Route pattern: /agent/[slug]/api/* → spoke /api/*
 *
 * Only activates when SUPERADMIN_HUB=true.
 *
 * @param {http.Server} server
 * @param {Function} nextHandle - Next.js request handler (fallback, not used directly but kept for API symmetry)
 */
export function attachHttpProxy(server, nextHandle) {
  if (process.env.SUPERADMIN_HUB !== 'true') {
    console.log('[proxy] SUPERADMIN_HUB not set — HTTP proxy disabled');
    return;
  }

  console.log('[proxy] HTTP proxy enabled — intercepting /agent/[slug]/* requests');

  server.prependListener('request', (req, res) => {
    const { pathname } = parse(req.url, true);

    // Match /agent/[slug]/... — slug is lowercase alphanumeric + hyphens
    const proxyMatch = pathname.match(/^\/agent\/([a-z0-9-]+)(\/.*)?$/);
    if (!proxyMatch) return; // Not a proxy route — let Next.js handle

    const slug = proxyMatch[1];
    const spokePath = proxyMatch[2] || '/';

    const instance = resolveInstance(slug);
    if (!instance) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `No instance registered for agent: ${slug}` }));
      return;
    }

    console.log(`[proxy] ${req.method} /agent/${slug}${spokePath} → ${instance.url}${spokePath}`);
    forwardRequest(req, res, instance.url, spokePath, instance.token);
  });
}

/**
 * Attach WebSocket proxy handler to the Node.js HTTP server.
 * Intercepts upgrade events for /agent/[slug]/ws/terminal/* and relays them
 * as raw TCP connections to the spoke instance — dumb pipe, no inspection.
 *
 * The spoke instance's proxyToTtyd handles ticket validation and ttyd auth handshake.
 * This relay just pipes bytes bidirectionally.
 *
 * Must be called before any server.on('upgrade', ...) that handles /ws/terminal/*
 * (no collision since patterns are disjoint, but ordering is correct per server.js comments).
 *
 * Only activates when SUPERADMIN_HUB=true.
 *
 * @param {http.Server} server
 */
export function attachWsProxy(server) {
  if (process.env.SUPERADMIN_HUB !== 'true') {
    console.log('[ws-proxy] SUPERADMIN_HUB not set — WS proxy disabled');
    return;
  }
  console.log('[ws-proxy] WS proxy enabled — intercepting /agent/[slug]/ws/terminal/* upgrades');

  server.on('upgrade', (req, socket, head) => {
    const { pathname, search } = parse(req.url, true);

    // Match /agent/[slug]/ws/terminal/[workspaceId]
    const match = pathname.match(/^\/agent\/([a-z0-9-]+)(\/ws\/terminal\/.+)$/);
    if (!match) return; // Not ours — let other upgrade handlers run

    const slug = match[1];
    const spokePath = match[2]; // /ws/terminal/[workspaceId]

    const instance = resolveInstance(slug);
    if (!instance) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const spokeUrl = parse(instance.url);
    const spokeHost = spokeUrl.hostname;
    const spokePort = spokeUrl.port ? parseInt(spokeUrl.port, 10) : 80;

    // Rebuild the upstream path with original query string
    const upstreamPath = spokePath + (search || '');

    console.log(`[ws-proxy] upgrade /agent/${slug}${spokePath} → ${spokeHost}:${spokePort}${upstreamPath}`);

    // Open a raw TCP connection to the spoke
    const upstream = net.createConnection({ host: spokeHost, port: spokePort }, () => {
      // Forward the HTTP Upgrade request verbatim, adding Bearer auth header
      const headers = [
        `GET ${upstreamPath} HTTP/1.1`,
        `Host: ${spokeHost}:${spokePort}`,
        `Upgrade: websocket`,
        `Connection: Upgrade`,
        `Authorization: Bearer ${instance.token}`,
      ];

      // Forward key WS handshake headers from the original request
      for (const h of ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'origin']) {
        if (req.headers[h]) headers.push(`${h}: ${req.headers[h]}`);
      }

      upstream.write(headers.join('\r\n') + '\r\n\r\n');

      // Any buffered head bytes from the original upgrade — replay to upstream
      if (head && head.length) upstream.write(head);

      // Pipe bidirectionally — dumb relay, no inspection
      socket.pipe(upstream);
      upstream.pipe(socket);
    });

    upstream.on('error', (err) => {
      console.error(`[ws-proxy] upstream TCP error for ${slug}: ${err.message}`);
      socket.destroy();
    });

    socket.on('error', (err) => {
      console.error(`[ws-proxy] client socket error for ${slug}: ${err.message}`);
      upstream.destroy();
    });

    upstream.on('end', () => socket.destroy());
    socket.on('end', () => upstream.destroy());
  });
}
