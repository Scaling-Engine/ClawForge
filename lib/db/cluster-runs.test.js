import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

// ---------------------------------------------------------------------------
// Test DB setup
// We spin up a fresh in-memory SQLite DB for each test run.
// Tables are created directly (not via migrations) to keep tests self-contained.
// ---------------------------------------------------------------------------

let testDb;
let sqlite;

function createTestTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cluster_runs (
      id TEXT PRIMARY KEY NOT NULL,
      instance_name TEXT NOT NULL,
      cluster_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      initial_prompt TEXT,
      slack_channel TEXT,
      slack_thread_ts TEXT,
      fail_reason TEXT,
      total_agent_runs INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS cluster_agent_runs (
      id TEXT PRIMARY KEY NOT NULL,
      cluster_run_id TEXT NOT NULL REFERENCES cluster_runs(id),
      role TEXT NOT NULL,
      agent_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      label TEXT,
      exit_code INTEGER,
      pr_url TEXT,
      volume_name TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
  `);
}

// We inject the test DB via a module-level override approach.
// cluster-runs.js uses getDb() — we need to make our test DB available.
// Strategy: set process.env.DATABASE_PATH to ':memory:' so getDb() uses in-memory,
// and reset the DB singleton between tests.

// Actually, better-sqlite3 doesn't support ':memory:' as DATABASE_PATH easily across modules.
// Instead, we'll use a temp file path and clean up afterward.

import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';

const TEST_DB_PATH = path.join(tmpdir(), `clawforge-test-${crypto.randomUUID()}.sqlite`);

before(() => {
  // Set env var before the module is imported so getDb() picks it up
  process.env.DATABASE_PATH = TEST_DB_PATH;

  // Create the test DB and tables
  sqlite = new Database(TEST_DB_PATH);
  createTestTables(sqlite);
  sqlite.close();
});

after(() => {
  // Clean up the test database file
  try {
    import('fs').then(({ default: fs }) => {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
    });
  } catch { /* ignore */ }
  delete process.env.DATABASE_PATH;
});

// Import the module under test AFTER setting DATABASE_PATH
const { createClusterRun, updateClusterRun, createAgentRun, updateAgentRun, getClusterRuns, getClusterRunDetail } =
  await import('./cluster-runs.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createClusterRun', () => {
  it('inserts a row and returns a string id', async () => {
    const id = await createClusterRun({
      instanceName: 'noah',
      clusterName: 'research-cluster',
      initialPrompt: 'Do some research',
      slackChannel: 'C123',
      slackThreadTs: '1234567890.123',
    });

    assert.ok(id, 'should return a truthy id');
    assert.strictEqual(typeof id, 'string');
    assert.ok(id.length > 0);
  });

  it('returns a unique id for each call', async () => {
    const id1 = await createClusterRun({ instanceName: 'noah', clusterName: 'cluster-a' });
    const id2 = await createClusterRun({ instanceName: 'noah', clusterName: 'cluster-b' });
    assert.notStrictEqual(id1, id2);
  });
});

describe('updateClusterRun', () => {
  it('changes status of an existing run', async () => {
    const id = await createClusterRun({ instanceName: 'noah', clusterName: 'update-test' });
    await updateClusterRun(id, { status: 'completed', completedAt: Date.now() });

    const runs = await getClusterRuns('noah');
    const updated = runs.find((r) => r.id === id);
    assert.ok(updated, 'should find the updated run');
    assert.strictEqual(updated.status, 'completed');
  });

  it('updates failReason', async () => {
    const id = await createClusterRun({ instanceName: 'noah', clusterName: 'fail-test' });
    await updateClusterRun(id, { status: 'failed', failReason: 'Agent crashed' });

    const runs = await getClusterRuns('noah');
    const updated = runs.find((r) => r.id === id);
    assert.strictEqual(updated.status, 'failed');
    assert.strictEqual(updated.failReason, 'Agent crashed');
  });
});

describe('createAgentRun', () => {
  it('inserts with correct clusterRunId FK and returns a string id', async () => {
    const runId = await createClusterRun({ instanceName: 'noah', clusterName: 'agent-test' });
    const agentId = await createAgentRun({
      clusterRunId: runId,
      role: 'researcher',
      agentIndex: 0,
      volumeName: `clawforge-cluster-${runId}-0`,
    });

    assert.ok(agentId, 'should return a truthy agent run id');
    assert.strictEqual(typeof agentId, 'string');

    const detail = await getClusterRunDetail(runId);
    assert.ok(detail, 'should return run detail');
    assert.ok(Array.isArray(detail.agentRuns), 'agentRuns should be an array');
    assert.strictEqual(detail.agentRuns.length, 1);
    assert.strictEqual(detail.agentRuns[0].id, agentId);
    assert.strictEqual(detail.agentRuns[0].clusterRunId, runId);
  });

  it('returns unique ids for multiple agent runs', async () => {
    const runId = await createClusterRun({ instanceName: 'noah', clusterName: 'multi-agent' });
    const id1 = await createAgentRun({ clusterRunId: runId, role: 'r1', agentIndex: 0 });
    const id2 = await createAgentRun({ clusterRunId: runId, role: 'r2', agentIndex: 1 });
    assert.notStrictEqual(id1, id2);
  });
});

describe('updateAgentRun', () => {
  it('updates status, exitCode, prUrl', async () => {
    const runId = await createClusterRun({ instanceName: 'noah', clusterName: 'update-agent-test' });
    const agentId = await createAgentRun({ clusterRunId: runId, role: 'worker', agentIndex: 0 });

    await updateAgentRun(agentId, {
      status: 'completed',
      exitCode: 0,
      prUrl: 'https://github.com/org/repo/pull/42',
      completedAt: Date.now(),
    });

    const detail = await getClusterRunDetail(runId);
    const agent = detail.agentRuns.find((a) => a.id === agentId);
    assert.ok(agent, 'should find agent run');
    assert.strictEqual(agent.status, 'completed');
    assert.strictEqual(agent.exitCode, 0);
    assert.strictEqual(agent.prUrl, 'https://github.com/org/repo/pull/42');
  });
});

describe('getClusterRuns', () => {
  it('returns runs ordered by createdAt descending', async () => {
    const instanceName = `order-test-${Date.now()}`;

    // Insert with different timestamps
    const id1 = await createClusterRun({ instanceName, clusterName: 'first', _createdAt: Date.now() - 2000 });
    await new Promise((r) => setTimeout(r, 10)); // tiny delay to ensure ordering
    const id2 = await createClusterRun({ instanceName, clusterName: 'second' });

    const runs = await getClusterRuns(instanceName);
    assert.ok(runs.length >= 2, 'should have at least 2 runs');

    // Most recent first
    const ids = runs.map((r) => r.id);
    const idx1 = ids.indexOf(id1);
    const idx2 = ids.indexOf(id2);
    assert.ok(idx2 < idx1, 'second (newer) run should appear before first (older) run');
  });

  it('filters by instanceName', async () => {
    const uniqueInstance = `filter-test-${crypto.randomUUID().slice(0, 8)}`;
    await createClusterRun({ instanceName: uniqueInstance, clusterName: 'filtered-run' });

    const runs = await getClusterRuns(uniqueInstance);
    assert.ok(runs.length >= 1);
    assert.ok(runs.every((r) => r.instanceName === uniqueInstance));
  });
});

describe('getClusterRunDetail', () => {
  it('returns the run plus all associated agent runs', async () => {
    const runId = await createClusterRun({ instanceName: 'noah', clusterName: 'detail-test' });
    await createAgentRun({ clusterRunId: runId, role: 'researcher', agentIndex: 0 });
    await createAgentRun({ clusterRunId: runId, role: 'writer', agentIndex: 1 });

    const detail = await getClusterRunDetail(runId);
    assert.ok(detail, 'detail should not be null');
    assert.strictEqual(detail.id, runId);
    assert.ok(Array.isArray(detail.agentRuns));
    assert.strictEqual(detail.agentRuns.length, 2);
    // Ordered by agentIndex ascending
    assert.strictEqual(detail.agentRuns[0].agentIndex, 0);
    assert.strictEqual(detail.agentRuns[1].agentIndex, 1);
  });

  it('returns null for a non-existent run', async () => {
    const detail = await getClusterRunDetail('nonexistent-id');
    assert.strictEqual(detail, null);
  });
});
