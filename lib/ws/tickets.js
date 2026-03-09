import crypto from 'crypto';

// Use globalThis to share the Map across module instances.
// Next.js bundles Server Actions separately from the custom server entry point,
// so a module-level Map would create two isolated instances — tickets issued by
// the Server Action would never be found by the WebSocket upgrade handler.
/** @type {Map<string, {workspaceId: string, port: number, userId: string, expiresAt: number}>} */
const tickets = globalThis._clawforgeTickets ??= new Map();

const TICKET_TTL_MS = 30_000; // 30 seconds

/**
 * Issue a short-lived, single-use ticket for WebSocket authentication.
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {number} port - ttyd port inside the container
 * @param {string} userId - Authenticated user ID
 * @returns {string} 64-char hex ticket string
 */
export function issueTicket(workspaceId, port, userId) {
  const ticket = crypto.randomBytes(32).toString('hex');
  tickets.set(ticket, {
    workspaceId,
    port,
    userId,
    expiresAt: Date.now() + TICKET_TTL_MS,
  });
  return ticket;
}

/**
 * Validate and consume a ticket (single-use).
 * Returns ticket data if valid, null otherwise.
 *
 * @param {string|null} ticket - Ticket string to validate
 * @returns {{workspaceId: string, port: number, userId: string, expiresAt: number}|null}
 */
export function validateTicket(ticket) {
  if (!ticket) return null;

  const data = tickets.get(ticket);
  if (!data) return null;

  // Always delete immediately (single-use)
  tickets.delete(ticket);

  // Check expiry
  if (Date.now() > data.expiresAt) return null;

  return data;
}

/**
 * Test helper -- exposes the internal tickets Map for TTL manipulation in tests.
 * @returns {Map}
 */
export function _getTicketsMap() {
  return tickets;
}

// Periodic cleanup of expired tickets (every 60s).
// Guard against duplicate intervals when this module is loaded by multiple bundled contexts.
if (!globalThis._clawforgeTicketCleanup) {
  globalThis._clawforgeTicketCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of tickets) {
      if (now > val.expiresAt) {
        tickets.delete(key);
      }
    }
  }, 60_000);
  if (globalThis._clawforgeTicketCleanup.unref) {
    globalThis._clawforgeTicketCleanup.unref();
  }
}
