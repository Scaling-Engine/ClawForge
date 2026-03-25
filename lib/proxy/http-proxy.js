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
 * server.on('request', ...) listener fires before Next.js handles requests.
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

  server.on('request', (req, res) => {
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
