import { describe, it } from 'node:test';
import assert from 'node:assert';
import { clusterVolumeNameFor } from './volume.js';

describe('clusterVolumeNameFor', () => {
  it('returns "clawforge-cluster-abc123-0" for runId="abc123", agentIndex=0', () => {
    const result = clusterVolumeNameFor('abc123', 0);
    assert.strictEqual(result, 'clawforge-cluster-abc123-0');
  });

  it('returns "clawforge-cluster-abc123-1" for runId="abc123", agentIndex=1', () => {
    const result = clusterVolumeNameFor('abc123', 1);
    assert.strictEqual(result, 'clawforge-cluster-abc123-1');
  });

  it('produces different names for different agentIndexes with same runId', () => {
    const a = clusterVolumeNameFor('run-xyz', 0);
    const b = clusterVolumeNameFor('run-xyz', 1);
    const c = clusterVolumeNameFor('run-xyz', 2);
    assert.notStrictEqual(a, b);
    assert.notStrictEqual(b, c);
    assert.notStrictEqual(a, c);
  });

  it('produces different volume name prefixes for different runIds', () => {
    const a = clusterVolumeNameFor('run-aaa', 0);
    const b = clusterVolumeNameFor('run-bbb', 0);
    assert.notStrictEqual(a, b);
    // Prefixes differ
    assert.ok(a.includes('run-aaa'));
    assert.ok(b.includes('run-bbb'));
  });

  it('names start with "clawforge-cluster-"', () => {
    const result = clusterVolumeNameFor('myrun', 3);
    assert.ok(result.startsWith('clawforge-cluster-'), `Expected to start with clawforge-cluster-, got: ${result}`);
  });

  it('never collides with repo-based volume names (clawforge-{instance}-{slug} format)', () => {
    // Repo volumes: clawforge-noah-clawforge (no "cluster" segment)
    // Cluster volumes: clawforge-cluster-{runId}-{index}
    const clusterVol = clusterVolumeNameFor('abc123', 0);
    const repoVol = 'clawforge-noah-clawforge';
    assert.notStrictEqual(clusterVol, repoVol);
    assert.ok(clusterVol.includes('-cluster-'), 'cluster volume must include "-cluster-" segment');
  });
});
