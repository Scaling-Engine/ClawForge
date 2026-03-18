import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Test DB setup
// ---------------------------------------------------------------------------

const TEST_DB_PATH = path.join(tmpdir(), `clawforge-billing-test-${crypto.randomUUID()}.sqlite`);

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
const { recordUsageEvent, getUsageSummary, getBillingLimits, upsertBillingLimit, markWarningSent, wasWarningSent } =
  await import('../../lib/db/usage.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('recordUsageEvent + getUsageSummary', () => {
  it('inserts a row and getUsageSummary returns jobCount=1 with correct duration', async () => {
    await recordUsageEvent({
      instanceName: 'noah',
      eventType: 'job_dispatch',
      quantity: 1,
      durationSeconds: 120,
      periodMonth: '2026-03',
    });
    const summary = await getUsageSummary('noah', '2026-03');
    assert.strictEqual(summary.jobCount, 1, `expected jobCount=1, got ${summary.jobCount}`);
    assert.strictEqual(summary.totalDurationSeconds, 120, `expected totalDurationSeconds=120, got ${summary.totalDurationSeconds}`);
  });

  it('multiple rows: getUsageSummary returns correct aggregate count and sum', async () => {
    await recordUsageEvent({
      instanceName: 'noah',
      eventType: 'job_dispatch',
      quantity: 1,
      durationSeconds: 60,
      periodMonth: '2026-03',
    });
    await recordUsageEvent({
      instanceName: 'noah',
      eventType: 'job_dispatch',
      quantity: 1,
      durationSeconds: 90,
      periodMonth: '2026-03',
    });
    const summary = await getUsageSummary('noah', '2026-03');
    assert.ok(summary.jobCount >= 3, `expected jobCount >= 3, got ${summary.jobCount}`);
    assert.ok(summary.totalDurationSeconds >= 270, `expected totalDurationSeconds >= 270, got ${summary.totalDurationSeconds}`);
  });

  it('filters by instanceName — different instance returns 0', async () => {
    const summary = await getUsageSummary('strategyES', '2026-03');
    assert.strictEqual(summary.jobCount, 0, `expected 0 for different instance, got ${summary.jobCount}`);
  });

  it('filters by periodMonth — different period returns 0', async () => {
    const summary = await getUsageSummary('noah', '2026-02');
    assert.strictEqual(summary.jobCount, 0, `expected 0 for different period, got ${summary.jobCount}`);
  });
});

describe('getBillingLimits', () => {
  it('returns { jobsPerMonth: null, concurrentJobs: null } when no rows exist', async () => {
    const limits = await getBillingLimits('new-instance');
    assert.strictEqual(limits.jobsPerMonth, null, 'expected jobsPerMonth null');
    assert.strictEqual(limits.concurrentJobs, null, 'expected concurrentJobs null');
  });
});

describe('upsertBillingLimit', () => {
  it('creates new row; getBillingLimits returns the value', async () => {
    await upsertBillingLimit('testinstance', 'jobs_per_month', 50);
    const limits = await getBillingLimits('testinstance');
    assert.strictEqual(limits.jobsPerMonth, 50, `expected 50, got ${limits.jobsPerMonth}`);
  });

  it('updates existing row (not duplicate); getBillingLimits returns updated value', async () => {
    await upsertBillingLimit('testinstance', 'jobs_per_month', 100);
    const limits = await getBillingLimits('testinstance');
    assert.strictEqual(limits.jobsPerMonth, 100, `expected 100 after update, got ${limits.jobsPerMonth}`);

    // Verify only one row exists (no duplicate)
    const sqlite = new Database(TEST_DB_PATH);
    const rows = sqlite.prepare(`SELECT COUNT(*) as cnt FROM billing_limits WHERE instance_name = 'testinstance' AND limit_type = 'jobs_per_month'`).get();
    sqlite.close();
    assert.strictEqual(rows.cnt, 1, `expected 1 row, got ${rows.cnt}`);
  });
});

describe('markWarningSent + wasWarningSent', () => {
  it('wasWarningSent returns false before marking', async () => {
    const result = await wasWarningSent('warntest', '2026-03');
    assert.strictEqual(result, false, 'should return false before warning sent');
  });

  it('markWarningSent then wasWarningSent returns true', async () => {
    await upsertBillingLimit('warntest', 'jobs_per_month', 10);
    await markWarningSent('warntest', '2026-03');
    const result = await wasWarningSent('warntest', '2026-03');
    assert.strictEqual(result, true, 'should return true after marking');
  });

  it('wasWarningSent returns false for different period', async () => {
    const result = await wasWarningSent('warntest', '2026-04');
    assert.strictEqual(result, false, 'should return false for different period');
  });
});
