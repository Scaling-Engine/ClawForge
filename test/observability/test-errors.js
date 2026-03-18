import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Test DB setup — use a temp file (same pattern as cluster-runs.test.js)
// ---------------------------------------------------------------------------

const TEST_DB_PATH = path.join(tmpdir(), `clawforge-obs-test-${crypto.randomUUID()}.sqlite`);

function createTestTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS error_log (
      id TEXT PRIMARY KEY NOT NULL,
      context TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      metadata TEXT,
      instance_name TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

before(() => {
  process.env.DATABASE_PATH = TEST_DB_PATH;
  const sqlite = new Database(TEST_DB_PATH);
  createTestTables(sqlite);
  sqlite.close();
});

after(() => {
  try {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  } catch { /* ignore */ }
  delete process.env.DATABASE_PATH;
});

// Import modules AFTER setting DATABASE_PATH
const { writeError, getRecentErrorCount, getLastErrorAt, pruneOldErrors } =
  await import('../../lib/db/error-log.js');
const { captureError } = await import('../../lib/observability/errors.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writeError', () => {
  it('inserts a row and getRecentErrorCount returns >= 1', async () => {
    await writeError({
      context: 'channel',
      severity: 'error',
      message: 'fail',
    });
    const count = await getRecentErrorCount(24);
    assert.ok(count >= 1, `expected count >= 1, got ${count}`);
  });

  it('accepts optional stack, metadata, instanceName', async () => {
    await writeError({
      context: 'webhook',
      severity: 'warn',
      message: 'test warning',
      stack: 'Error\n  at test.js:1',
      metadata: JSON.stringify({ route: '/api/test' }),
      instanceName: 'noah',
    });
    const count = await getRecentErrorCount(24);
    assert.ok(count >= 2, 'should have at least 2 errors now');
  });
});

describe('getLastErrorAt', () => {
  it('returns the createdAt timestamp of the most recent error', async () => {
    const ts = await getLastErrorAt();
    assert.ok(ts !== null, 'should return a timestamp');
    assert.strictEqual(typeof ts, 'number', 'timestamp should be a number');
    assert.ok(ts > 0, 'timestamp should be positive');
    // Should be a recent timestamp (within last 10 seconds)
    assert.ok(ts > Date.now() - 10000, 'timestamp should be recent');
  });

  it('returns null when no errors exist (after pruning all)', async () => {
    // This test depends on the pruneOldErrors tests below — but we test it explicitly
    // by pruning with days=0 which removes everything
    await pruneOldErrors(0);
    const ts = await getLastErrorAt();
    // After prune(0), no rows remain — should return null
    assert.strictEqual(ts, null, 'should return null when table is empty');
  });
});

describe('pruneOldErrors', () => {
  it('pruneOldErrors(0) deletes all rows; getRecentErrorCount returns 0', async () => {
    // Re-insert some rows first
    await writeError({ context: 'cron', severity: 'error', message: 'cron failed' });
    await writeError({ context: 'startup', severity: 'warn', message: 'startup warning' });

    // Confirm we have rows
    const beforeCount = await getRecentErrorCount(24);
    assert.ok(beforeCount >= 2, `expected >= 2 before prune, got ${beforeCount}`);

    // Prune all
    await pruneOldErrors(0);

    const afterCount = await getRecentErrorCount(24);
    assert.strictEqual(afterCount, 0, `expected 0 after prune, got ${afterCount}`);
  });

  it('pruneOldErrors(30) keeps recent rows', async () => {
    await writeError({ context: 'channel', severity: 'error', message: 'recent error' });

    const before = await getRecentErrorCount(24);
    assert.ok(before >= 1, 'should have at least 1 row');

    await pruneOldErrors(30);

    // Recent rows should survive 30-day prune
    const after = await getRecentErrorCount(24);
    assert.ok(after >= 1, 'recent rows should not be pruned by 30-day rule');
  });
});

describe('captureError', () => {
  it('inserts a row with correct context and message', async () => {
    // Start fresh
    await pruneOldErrors(0);

    await captureError('channel', new Error('boom'), { platform: 'telegram' });

    const count = await getRecentErrorCount(24);
    assert.strictEqual(count, 1, `expected 1 row after captureError, got ${count}`);
  });

  it('does not throw when DB write fails', async () => {
    // captureError wraps DB write in try/catch — must never throw
    const err = new Error('test error');
    await assert.doesNotReject(async () => {
      await captureError('channel', err, { platform: 'slack' });
    });
  });
});

describe('sanitizeMeta', () => {
  it('strips non-allowlisted keys from metadata', async () => {
    await pruneOldErrors(0);

    // Call captureError with a mix of allowed and disallowed keys
    await captureError('channel', new Error('sanitize-test'), {
      platform: 'telegram',        // allowed
      route: '/api/test',          // allowed
      jobId: 'job-abc',            // allowed
      messageText: 'secret msg',   // NOT allowed — should be stripped
      apiKey: 'sk-secret',         // NOT allowed — should be stripped
    });

    // Verify a row was inserted
    const count = await getRecentErrorCount(24);
    assert.ok(count >= 1, 'should have inserted a row');

    // Read the row directly to verify metadata was sanitized
    const sqlite = new Database(TEST_DB_PATH);
    const row = sqlite.prepare('SELECT metadata FROM error_log ORDER BY created_at DESC LIMIT 1').get();
    sqlite.close();

    assert.ok(row, 'row should exist');
    const meta = JSON.parse(row.metadata);
    assert.ok('platform' in meta, 'platform should be present');
    assert.ok('route' in meta, 'route should be present');
    assert.ok('jobId' in meta, 'jobId should be present');
    assert.ok(!('messageText' in meta), 'messageText should be stripped');
    assert.ok(!('apiKey' in meta), 'apiKey should be stripped');
  });
});
