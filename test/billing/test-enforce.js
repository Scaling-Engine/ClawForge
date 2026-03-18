import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Test DB setup
// ---------------------------------------------------------------------------

const TEST_DB_PATH = path.join(tmpdir(), `clawforge-enforce-test-${crypto.randomUUID()}.sqlite`);

function createTestTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY NOT NULL,
      instance_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      duration_seconds INTEGER,
      period_month TEXT NOT NULL,
      ref_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS billing_limits (
      id TEXT PRIMARY KEY NOT NULL,
      instance_name TEXT NOT NULL,
      limit_type TEXT NOT NULL,
      limit_value REAL NOT NULL,
      warning_sent_period TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
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
const { checkUsageLimit } = await import('../../lib/billing/enforce.js');
const { recordUsageEvent, upsertBillingLimit } = await import('../../lib/db/usage.js');

// Helper: get current YYYY-MM
function currentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkUsageLimit — unlimited default', () => {
  it('returns { allowed: true, limit: null } when no billingLimits row exists', async () => {
    const result = await checkUsageLimit('nolimit-instance');
    assert.strictEqual(result.allowed, true, 'should be allowed');
    assert.strictEqual(result.limit, null, 'limit should be null');
  });
});

describe('checkUsageLimit — 80% threshold', () => {
  it('returns { allowed: true, percentUsed: 0.8 } when 4 of 5 jobs used', async () => {
    const instance = 'enforce-80pct';
    const period = currentPeriod();

    // Set limit of 5
    await upsertBillingLimit(instance, 'jobs_per_month', 5);

    // Record 4 jobs
    for (let i = 0; i < 4; i++) {
      await recordUsageEvent({
        instanceName: instance,
        eventType: 'job_dispatch',
        quantity: 1,
        durationSeconds: 30,
        periodMonth: period,
      });
    }

    const result = await checkUsageLimit(instance);
    assert.strictEqual(result.allowed, true, 'should still be allowed at 80%');
    assert.strictEqual(result.percentUsed, 0.8, `expected percentUsed=0.8, got ${result.percentUsed}`);
    assert.strictEqual(result.current, 4, `expected current=4, got ${result.current}`);
    assert.strictEqual(result.limit, 5, `expected limit=5, got ${result.limit}`);
  });
});

describe('checkUsageLimit — hard limit', () => {
  it('returns { allowed: false, current: 5, limit: 5 } when at limit', async () => {
    const instance = 'enforce-hard-limit';
    const period = currentPeriod();

    // Set limit of 5
    await upsertBillingLimit(instance, 'jobs_per_month', 5);

    // Record 5 jobs
    for (let i = 0; i < 5; i++) {
      await recordUsageEvent({
        instanceName: instance,
        eventType: 'job_dispatch',
        quantity: 1,
        durationSeconds: 30,
        periodMonth: period,
      });
    }

    const result = await checkUsageLimit(instance);
    assert.strictEqual(result.allowed, false, 'should be blocked at limit');
    assert.strictEqual(result.current, 5, `expected current=5, got ${result.current}`);
    assert.strictEqual(result.limit, 5, `expected limit=5, got ${result.limit}`);
  });
});

describe('checkUsageLimit — resetDate', () => {
  it('returns resetDate as first day of next month in YYYY-MM-DD format', async () => {
    const instance = 'enforce-reset-date';

    // Set a limit so we get a resetDate
    await upsertBillingLimit(instance, 'jobs_per_month', 100);

    const result = await checkUsageLimit(instance);
    assert.ok(result.resetDate, 'resetDate should be present when limit is set');

    // Verify format: YYYY-MM-DD
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    assert.ok(datePattern.test(result.resetDate), `expected YYYY-MM-DD format, got ${result.resetDate}`);

    // Verify it's the first day of a month
    const day = result.resetDate.slice(8, 10);
    assert.strictEqual(day, '01', `expected day=01 (first of month), got ${day}`);

    // Verify it's in the future
    const resetTs = new Date(result.resetDate).getTime();
    assert.ok(resetTs > Date.now(), 'resetDate should be in the future');
  });
});
