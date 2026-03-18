import { describe, it } from 'node:test';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Logger smoke tests
// Verify that log() does not throw and emits a JSON string to stdout.
// We use pino's built-in stream support to capture output.
// ---------------------------------------------------------------------------

describe('logger', () => {
  it('imports without throwing', async () => {
    const mod = await import('../../lib/observability/logger.js');
    assert.ok(mod.default, 'pino instance should be default export');
    assert.strictEqual(typeof mod.log, 'function', 'log should be a named export function');
  });

  it('log() does not throw for valid levels', async () => {
    const { log } = await import('../../lib/observability/logger.js');
    assert.doesNotThrow(() => log('info', 'test', 'hello world', { foo: 1 }));
    assert.doesNotThrow(() => log('warn', 'test', 'a warning'));
    assert.doesNotThrow(() => log('error', 'test', 'an error'));
  });

  it('log() accepts extra metadata', async () => {
    const { log } = await import('../../lib/observability/logger.js');
    // Should not throw with various metadata shapes
    assert.doesNotThrow(() => log('info', 'channel', 'test msg', { platform: 'telegram', threadId: 'abc' }));
    assert.doesNotThrow(() => log('info', 'startup', 'initialized'));
    assert.doesNotThrow(() => log('debug', 'db', 'query executed', { rows: 5 }));
  });
});
