import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// We'll test via dynamic import so we can control the environment
// Use a fixture directory to avoid touching real config/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '__fixtures__');
const fixtureClusterFile = path.join(fixtureDir, 'CLUSTER.json');

const validConfig = {
  clusters: [
    {
      name: 'test-cluster',
      roles: [
        {
          name: 'researcher',
          systemPrompt: 'You are a researcher.',
          allowedTools: ['Read', 'Grep'],
        },
        {
          name: 'writer',
          systemPrompt: 'You are a writer.',
          allowedTools: ['Write', 'Edit'],
        },
      ],
    },
  ],
};

// Set up fixture directory before tests
before(() => {
  fs.mkdirSync(fixtureDir, { recursive: true });
});

after(() => {
  // Clean up fixture directory
  try {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

describe('loadClusterConfig', () => {
  it('parses a valid CLUSTER.json and returns clusters array', async () => {
    fs.writeFileSync(fixtureClusterFile, JSON.stringify(validConfig));

    // Temporarily override process.cwd to point to fixture
    const origCwd = process.cwd;
    process.cwd = () => fixtureDir;

    try {
      // Re-import with fresh module cache isn't trivial in ESM, so we test via the function directly
      const { loadClusterConfig } = await import('./config.js');
      // For this test we'll use a workaround: call with the fixture path
      // The module reads from paths.js which uses process.cwd() — so we test via validateClusterConfig
      // instead of relying on process.cwd override (which may not affect already-resolved paths)
      // Instead, we test that the config structure returned matches the expected format
      const result = await loadClusterConfig(fixtureClusterFile);
      assert.ok(result, 'should return a config object');
      assert.ok(Array.isArray(result.clusters), 'clusters should be an array');
      assert.strictEqual(result.clusters.length, 1);
      assert.strictEqual(result.clusters[0].name, 'test-cluster');
    } finally {
      process.cwd = origCwd;
    }
  });

  it('returns { clusters: [] } when file does not exist', async () => {
    const { loadClusterConfig } = await import('./config.js');
    const result = await loadClusterConfig('/nonexistent/path/CLUSTER.json');
    assert.deepStrictEqual(result, { clusters: [] });
  });
});

describe('getCluster', () => {
  it('returns cluster definition matching the name', async () => {
    fs.writeFileSync(fixtureClusterFile, JSON.stringify(validConfig));

    const { getCluster } = await import('./config.js');
    const result = await getCluster('test-cluster', fixtureClusterFile);
    assert.ok(result, 'should return a cluster definition');
    assert.strictEqual(result.name, 'test-cluster');
    assert.strictEqual(result.roles.length, 2);
  });

  it('returns null when cluster name does not exist', async () => {
    fs.writeFileSync(fixtureClusterFile, JSON.stringify(validConfig));

    const { getCluster } = await import('./config.js');
    const result = await getCluster('nonexistent', fixtureClusterFile);
    assert.strictEqual(result, null);
  });
});

describe('validateClusterConfig', () => {
  it('accepts a valid cluster config', async () => {
    const { validateClusterConfig } = await import('./config.js');
    const result = validateClusterConfig(validConfig);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('rejects config missing "clusters" array', async () => {
    const { validateClusterConfig } = await import('./config.js');
    const result = validateClusterConfig({});
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0, 'should have errors');
    assert.ok(result.errors.some(e => e.includes('clusters')), 'error should mention clusters');
  });

  it('rejects a cluster missing "name"', async () => {
    const { validateClusterConfig } = await import('./config.js');
    const badConfig = {
      clusters: [
        {
          roles: [{ name: 'r', systemPrompt: 'p', allowedTools: [] }],
        },
      ],
    };
    const result = validateClusterConfig(badConfig);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('rejects a cluster missing "roles"', async () => {
    const { validateClusterConfig } = await import('./config.js');
    const badConfig = {
      clusters: [{ name: 'test' }],
    };
    const result = validateClusterConfig(badConfig);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('roles')));
  });

  it('rejects a role missing "name"', async () => {
    const { validateClusterConfig } = await import('./config.js');
    const badConfig = {
      clusters: [
        {
          name: 'test',
          roles: [{ systemPrompt: 'p', allowedTools: [] }],
        },
      ],
    };
    const result = validateClusterConfig(badConfig);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('rejects a role missing "systemPrompt"', async () => {
    const { validateClusterConfig } = await import('./config.js');
    const badConfig = {
      clusters: [
        {
          name: 'test',
          roles: [{ name: 'r', allowedTools: [] }],
        },
      ],
    };
    const result = validateClusterConfig(badConfig);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('systemPrompt')));
  });

  it('rejects a role missing "allowedTools"', async () => {
    const { validateClusterConfig } = await import('./config.js');
    const badConfig = {
      clusters: [
        {
          name: 'test',
          roles: [{ name: 'r', systemPrompt: 'p' }],
        },
      ],
    };
    const result = validateClusterConfig(badConfig);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('allowedTools')));
  });
});
