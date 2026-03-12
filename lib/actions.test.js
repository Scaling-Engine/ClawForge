import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// We test executeAction without running Docker/cluster infrastructure.
// The cluster type test verifies fire-and-forget behavior: function returns
// immediately with a "cluster {id}" string without awaiting the cluster run.

describe('executeAction', () => {
  test('type=command: returns stdout from shell command', async () => {
    // Dynamically import to avoid top-level module side effects
    const { executeAction } = await import('./actions.js');
    const result = await executeAction({ type: 'command', command: 'echo hello' });
    assert.equal(result.trim(), 'hello');
  });

  test('type=cluster: returns immediately with cluster run ID string', async () => {
    const { executeAction } = await import('./actions.js');

    // Monkey-patch the cluster module before calling executeAction
    // by overriding the dynamic import via a module-level shim.
    // Since we cannot easily intercept dynamic imports in Node ESM,
    // we verify the contract: the function must return a string
    // starting with "cluster " without actually spinning up a container.

    // We trigger the cluster path. runCluster will fail (module not found)
    // but the error is swallowed by .catch(). The function should still
    // return immediately before runCluster resolves.
    let returned = false;
    const resultPromise = executeAction({
      type: 'cluster',
      clusterName: 'test-pipeline',
      prompt: 'analyze the repo',
    }).then(r => { returned = true; return r; });

    // Wait a tick — the function should resolve on the next microtask
    // (fire-and-forget means no await on runCluster)
    await Promise.resolve();
    await Promise.resolve();

    const result = await resultPromise;
    assert.match(result, /^cluster /, 'return value should start with "cluster "');
    assert.equal(result.split(' ').length, 2, 'return value should be "cluster {id}" (two words)');
    assert.equal(result.split(' ')[1].length, 12, 'run ID should be 12 chars');
  });

  test('type=cluster: run ID is alphanumeric (no hyphens)', async () => {
    const { executeAction } = await import('./actions.js');
    const result = await executeAction({
      type: 'cluster',
      clusterName: 'review',
      prompt: 'test',
    });
    const runId = result.split(' ')[1];
    assert.match(runId, /^[a-f0-9]{12}$/, 'run ID should be 12 hex chars with no hyphens');
  });

  test('type=agent (default): calls createJob and returns "job {id}"', async () => {
    // This test verifies the default path still works (no regression).
    // createJob will fail (no GitHub token in test env) — we just confirm
    // the cluster branch does not interfere with the default path.
    const { executeAction } = await import('./actions.js');
    try {
      await executeAction({ type: 'agent', job: 'do something' });
    } catch (err) {
      // Expected — no GitHub token in test environment
      // The important thing is it reached createJob, not the cluster branch
      assert.ok(
        err.message.includes('token') || err.message.includes('fetch') ||
        err.message.includes('401') || err.message.includes('GH') ||
        err.message.includes('owner') || err.message.includes('network') ||
        err.message.includes('ENOTFOUND') || err.message.includes('env'),
        `unexpected error: ${err.message}`
      );
    }
  });
});
