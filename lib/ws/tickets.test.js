import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { issueTicket, validateTicket, _getTicketsMap } from './tickets.js';

describe('issueTicket', () => {
  it('returns a 64-char hex string', () => {
    const ticket = issueTicket('ws-123', 7681, 'user-abc');
    assert.equal(typeof ticket, 'string');
    assert.equal(ticket.length, 64);
    assert.match(ticket, /^[0-9a-f]{64}$/);
  });

  it('generates unique tickets each call', () => {
    const t1 = issueTicket('ws-1', 7681, 'user-1');
    const t2 = issueTicket('ws-1', 7681, 'user-1');
    assert.notEqual(t1, t2);
  });
});

describe('validateTicket', () => {
  it('returns ticket data for a valid ticket', () => {
    const ticket = issueTicket('ws-valid', 7681, 'user-valid');
    const data = validateTicket(ticket);
    assert.ok(data);
    assert.equal(data.workspaceId, 'ws-valid');
    assert.equal(data.port, 7681);
    assert.equal(data.userId, 'user-valid');
    assert.equal(typeof data.expiresAt, 'number');
  });

  it('deletes ticket after first use (single-use)', () => {
    const ticket = issueTicket('ws-once', 7681, 'user-once');
    const first = validateTicket(ticket);
    assert.ok(first);
    const second = validateTicket(ticket);
    assert.equal(second, null);
  });

  it('returns null for null input', () => {
    assert.equal(validateTicket(null), null);
  });

  it('returns null for nonexistent ticket', () => {
    assert.equal(validateTicket('nonexistent'), null);
  });

  it('returns null for expired ticket', () => {
    const ticket = issueTicket('ws-expire', 7681, 'user-expire');
    // Manually set expiresAt to the past
    const map = _getTicketsMap();
    const entry = map.get(ticket);
    entry.expiresAt = Date.now() - 1000;
    const result = validateTicket(ticket);
    assert.equal(result, null);
  });
});
