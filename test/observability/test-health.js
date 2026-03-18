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

const TEST_DB_PATH = path.join(tmpdir(), `clawforge-health-test-${crypto.randomUUID()}.sqlite`);

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

    CREATE TABLE IF NOT EXISTS job_outcomes (
      id TEXT PRIMARY KEY NOT NULL,
      job_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL,
      merge_result TEXT NOT NULL,
      pr_url TEXT NOT NULL DEFAULT '',
      target_repo TEXT,
      changed_files TEXT NOT NULL DEFAULT '[]',
      log_summary TEXT NOT NULL DEFAULT '',
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
const { getJobSuccessRate } = await import('../../lib/db/job-outcomes.js');
const { handleSuperadminEndpoint } = await import('../../api/superadmin.js');

// ---------------------------------------------------------------------------
// Helper: insert a job_outcomes row directly
// ---------------------------------------------------------------------------

function insertJobOutcome(db, { status, createdAt }) {
  db.prepare(`
    INSERT INTO job_outcomes (id, job_id, thread_id, status, merge_result, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), crypto.randomUUID(), 'thread-1', status, 'merged', createdAt);
}

// ---------------------------------------------------------------------------
// Tests: getJobSuccessRate
// ---------------------------------------------------------------------------

describe('getJobSuccessRate — empty table', () => {
  it('returns { total: 0, succeeded: 0, rate: null } with no rows', async () => {
    // Table is empty at start (or pruned between tests)
    const sqlite = new Database(TEST_DB_PATH);
    sqlite.prepare('DELETE FROM job_outcomes').run();
    sqlite.close();

    const result = getJobSuccessRate(24);
    assert.deepStrictEqual(result, { total: 0, succeeded: 0, rate: null });
  });
});

describe('getJobSuccessRate — with rows', () => {
  it('returns correct total, succeeded, and rate for 3 success + 1 failure', async () => {
    const sqlite = new Database(TEST_DB_PATH);
    sqlite.prepare('DELETE FROM job_outcomes').run();

    const now = Date.now();
    insertJobOutcome(sqlite, { status: 'success', createdAt: now - 1000 });
    insertJobOutcome(sqlite, { status: 'success', createdAt: now - 2000 });
    insertJobOutcome(sqlite, { status: 'success', createdAt: now - 3000 });
    insertJobOutcome(sqlite, { status: 'failure', createdAt: now - 4000 });
    sqlite.close();

    const result = getJobSuccessRate(24);
    assert.strictEqual(result.total, 4);
    assert.strictEqual(result.succeeded, 3);
    assert.strictEqual(result.rate, 0.75);
  });

  it('excludes rows older than the given hours window', async () => {
    const sqlite = new Database(TEST_DB_PATH);
    sqlite.prepare('DELETE FROM job_outcomes').run();

    const now = Date.now();
    // 1 row within 24h window
    insertJobOutcome(sqlite, { status: 'success', createdAt: now - 3600 * 1000 });
    // 1 row older than 24h (25 hours ago)
    insertJobOutcome(sqlite, { status: 'failure', createdAt: now - 25 * 3600 * 1000 });
    sqlite.close();

    const result = getJobSuccessRate(24);
    assert.strictEqual(result.total, 1, 'should only count rows within 24h window');
    assert.strictEqual(result.succeeded, 1);
    assert.strictEqual(result.rate, 1);
  });

  it('rate is null when total is 0 (all rows excluded by time window)', async () => {
    const sqlite = new Database(TEST_DB_PATH);
    sqlite.prepare('DELETE FROM job_outcomes').run();

    const now = Date.now();
    // Only old rows (outside window)
    insertJobOutcome(sqlite, { status: 'success', createdAt: now - 48 * 3600 * 1000 });
    sqlite.close();

    const result = getJobSuccessRate(24);
    assert.deepStrictEqual(result, { total: 0, succeeded: 0, rate: null });
  });
});

// ---------------------------------------------------------------------------
// Tests: getHealth response shape
// ---------------------------------------------------------------------------

describe('getHealth — response shape', () => {
  it('returns all required keys', async () => {
    // Set env var so the health endpoint can identify the instance
    process.env.AGENT_SUPERADMIN_TOKEN = 'test-token';

    const result = await handleSuperadminEndpoint('health', {});

    assert.ok(typeof result === 'object' && result !== null, 'result should be an object');
    assert.ok('instance' in result, 'should have instance key');
    assert.ok('status' in result, 'should have status key');
    assert.ok('uptime' in result, 'should have uptime key');
    assert.ok('errorCount24h' in result, 'should have errorCount24h key');
    assert.ok('lastErrorAt' in result, 'should have lastErrorAt key');
    assert.ok('dbStatus' in result, 'should have dbStatus key');
    assert.ok('jobSuccessRate' in result, 'should have jobSuccessRate key');
  });

  it('errorCount24h is a number', async () => {
    const result = await handleSuperadminEndpoint('health', {});
    assert.strictEqual(typeof result.errorCount24h, 'number');
  });

  it('lastErrorAt is a number or null', async () => {
    const result = await handleSuperadminEndpoint('health', {});
    assert.ok(
      result.lastErrorAt === null || typeof result.lastErrorAt === 'number',
      `lastErrorAt should be number or null, got ${typeof result.lastErrorAt}`
    );
  });

  it("dbStatus is 'ok' when DB is accessible", async () => {
    const result = await handleSuperadminEndpoint('health', {});
    assert.strictEqual(result.dbStatus, 'ok');
  });

  it('jobSuccessRate is an object with total, succeeded, rate fields', async () => {
    const result = await handleSuperadminEndpoint('health', {});
    const jsr = result.jobSuccessRate;
    assert.ok(typeof jsr === 'object' && jsr !== null, 'jobSuccessRate should be an object');
    assert.ok('total' in jsr, 'jobSuccessRate should have total');
    assert.ok('succeeded' in jsr, 'jobSuccessRate should have succeeded');
    assert.ok('rate' in jsr, 'jobSuccessRate should have rate');
  });
});
