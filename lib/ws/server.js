import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { validateTicket } from './tickets.js';
import { proxyToTtyd } from './proxy.js';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = parseInt(process.env.PORT, 10) || 80;

await app.prepare();

const server = createServer((req, res) => {
  const parsedUrl = parse(req.url, true);
  handle(req, res, parsedUrl);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname, query } = parse(req.url, true);
  console.log(`[ws] upgrade request: ${pathname}`);

  // Only handle /ws/terminal/* paths
  if (!pathname || !pathname.startsWith('/ws/terminal/')) {
    // Let other upgrade requests pass through (e.g. Next.js HMR in dev)
    console.log(`[ws] ignoring non-terminal upgrade: ${pathname}`);
    return;
  }

  // Validate ticket
  const ticket = query.ticket;
  const ticketData = validateTicket(ticket);
  console.log(`[ws] ticket validation: ${ticketData ? 'OK' : 'FAILED'} (ticket length: ${ticket?.length || 0})`);

  if (!ticketData) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // CSWSH defense: check Origin header against APP_URL
  const origin = req.headers.origin;
  const appUrl = process.env.APP_URL;
  if (appUrl && origin && origin !== appUrl) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, ticketData);
  });
});

wss.on('connection', (ws, _req, ticketData) => {
  proxyToTtyd(ws, ticketData);
});

server.listen(port, () => {
  console.log(`> ClawForge server listening on port ${port} (${dev ? 'development' : 'production'})`);
});
