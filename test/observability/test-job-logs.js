import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// JSONL job logger tests
// Uses a temp directory as the base dir so real logs/ is never touched.
// ---------------------------------------------------------------------------

let tmpDir;

before(() => {
  tmpDir = path.join(os.tmpdir(), `clawforge-job-logger-test-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
});

after(() => {
  // Clean up temp directory
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// Import appendJobEvent after tmpDir is created
const { appendJobEvent } = await import('../../lib/observability/job-logger.js');

describe('appendJobEvent', () => {
  it('creates a JSONL file with exactly 1 line for a single call', async () => {
    const jobId = `job-${crypto.randomUUID().slice(0, 8)}`;
    appendJobEvent(jobId, { type: 'start', repo: 'org/repo' }, tmpDir);

    const filePath = path.join(tmpDir, 'jobs', `${jobId}.jsonl`);
    assert.ok(fs.existsSync(filePath), `JSONL file should exist at ${filePath}`);

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1, 'should have exactly 1 line');
  });

  it('the line is valid JSON containing jobId, type, and a numeric t field', async () => {
    const jobId = `job-${crypto.randomUUID().slice(0, 8)}`;
    appendJobEvent(jobId, { type: 'start', repo: 'org/repo' }, tmpDir);

    const filePath = path.join(tmpDir, 'jobs', `${jobId}.jsonl`);
    const content = fs.readFileSync(filePath, 'utf8');
    const line = content.trim();

    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(line); }, 'line should be valid JSON');
    assert.strictEqual(parsed.jobId, jobId, 'jobId should match');
    assert.strictEqual(parsed.type, 'start', 'type should match');
    assert.strictEqual(typeof parsed.t, 'number', 't should be a number (timestamp)');
  });

  it('50 calls to appendJobEvent produce exactly 50 lines in the JSONL file', async () => {
    const jobId = `job-${crypto.randomUUID().slice(0, 8)}`;

    for (let i = 0; i < 50; i++) {
      appendJobEvent(jobId, { type: 'step', index: i }, tmpDir);
    }

    const filePath = path.join(tmpDir, 'jobs', `${jobId}.jsonl`);
    assert.ok(fs.existsSync(filePath), 'JSONL file should exist');

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 50, 'should have exactly 50 lines');
  });

  it('does NOT throw when given an invalid/read-only base dir', async () => {
    // Use a path that cannot be created as a directory (file in place of dir)
    const badDir = path.join(tmpDir, 'this-is-a-file');
    fs.writeFileSync(badDir, 'not a directory');

    assert.doesNotThrow(
      () => appendJobEvent('job-error', { type: 'start' }, badDir),
      'appendJobEvent should never throw even on filesystem errors'
    );
  });
});
