import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNextRole, checkCycleLimit, AGENT_LIMIT, RUN_LIMIT } from './coordinator.js';

// ── Test data ────────────────────────────────────────────────────────────────

const clusterRoles = [
  {
    name: 'researcher',
    systemPrompt: 'You research topics.',
    allowedTools: ['Read', 'WebSearch'],
    transitions: {
      needs_more_research: 'researcher',
      draft_ready: 'writer',
      complete: null,
    },
  },
  {
    name: 'writer',
    systemPrompt: 'You write content.',
    allowedTools: ['Read', 'Write'],
    transitions: {
      needs_revision: 'reviewer',
      complete: null,
    },
  },
  {
    name: 'reviewer',
    systemPrompt: 'You review content.',
    allowedTools: ['Read'],
    transitions: {
      approved: null,
      rejected: 'writer',
    },
  },
];

// ── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  test('AGENT_LIMIT is 5', () => {
    assert.strictEqual(AGENT_LIMIT, 5);
  });

  test('RUN_LIMIT is 15', () => {
    assert.strictEqual(RUN_LIMIT, 15);
  });
});

// ── resolveNextRole ──────────────────────────────────────────────────────────

describe('resolveNextRole', () => {
  test('returns the correct role object when label matches a transition', () => {
    const result = resolveNextRole(clusterRoles[0], 'draft_ready', clusterRoles);
    assert.ok(result !== null, 'expected a role object, got null');
    assert.strictEqual(result.name, 'writer');
  });

  test('returns the same role when transition loops back to self', () => {
    const result = resolveNextRole(clusterRoles[0], 'needs_more_research', clusterRoles);
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'researcher');
  });

  test('returns null when transition maps to null (terminal label)', () => {
    const result = resolveNextRole(clusterRoles[0], 'complete', clusterRoles);
    assert.strictEqual(result, null);
  });

  test('returns null when label has no matching transition', () => {
    const result = resolveNextRole(clusterRoles[0], 'unknown_label', clusterRoles);
    assert.strictEqual(result, null);
  });

  test('returns null when transitions map is missing entirely', () => {
    const roleWithoutTransitions = { name: 'solo', systemPrompt: 'Solo agent.' };
    const result = resolveNextRole(roleWithoutTransitions, 'complete', clusterRoles);
    assert.strictEqual(result, null);
  });

  test('returns null when the target role name does not exist in clusterRoles', () => {
    const roleWithBadTarget = {
      name: 'broken',
      transitions: { go: 'nonexistent_role' },
    };
    const result = resolveNextRole(roleWithBadTarget, 'go', clusterRoles);
    assert.strictEqual(result, null);
  });

  test('resolves reviewer role from writer transitions', () => {
    const result = resolveNextRole(clusterRoles[1], 'needs_revision', clusterRoles);
    assert.ok(result !== null);
    assert.strictEqual(result.name, 'reviewer');
  });
});

// ── checkCycleLimit ──────────────────────────────────────────────────────────

describe('checkCycleLimit', () => {
  test('returns false when cycle count is under limit', () => {
    const cycleMap = new Map();
    const exceeded = checkCycleLimit(cycleMap, '0:researcher:initial', AGENT_LIMIT);
    assert.strictEqual(exceeded, false);
  });

  test('increments cycle count across multiple calls', () => {
    const cycleMap = new Map();
    const key = '0:researcher:initial';
    checkCycleLimit(cycleMap, key, AGENT_LIMIT); // count = 1
    checkCycleLimit(cycleMap, key, AGENT_LIMIT); // count = 2
    checkCycleLimit(cycleMap, key, AGENT_LIMIT); // count = 3
    checkCycleLimit(cycleMap, key, AGENT_LIMIT); // count = 4
    assert.strictEqual(cycleMap.get(key), 4);
  });

  test('returns false when cycle count equals limit minus 1', () => {
    const cycleMap = new Map();
    const key = '0:researcher:initial';
    // call 4 times (limit = 5, so at count=4 it should still be false)
    for (let i = 0; i < 4; i++) {
      checkCycleLimit(cycleMap, key, AGENT_LIMIT);
    }
    const exceeded = checkCycleLimit(cycleMap, key, AGENT_LIMIT); // count = 5, equals limit -> exceeded
    // count > limit means > 5, so at count=5 it's actually still at the boundary
    // The spec says: "returns true when cycle count equals AGENT_LIMIT (5)"
    // So checkCycleLimit returns true when count > limit (strictly greater)
    // Let's verify count is 5 here
    assert.strictEqual(cycleMap.get(key), 5);
    assert.strictEqual(exceeded, true);
  });

  test('returns true when cycle count exceeds limit', () => {
    const cycleMap = new Map();
    const key = '0:researcher:repeat';
    // Pre-populate to just above limit
    cycleMap.set(key, AGENT_LIMIT); // already at limit
    const exceeded = checkCycleLimit(cycleMap, key, AGENT_LIMIT); // now count = AGENT_LIMIT + 1
    assert.strictEqual(exceeded, true);
  });

  test('tracks different cycle keys independently', () => {
    const cycleMap = new Map();
    const key1 = '0:researcher:initial';
    const key2 = '1:writer:draft_ready';

    checkCycleLimit(cycleMap, key1, AGENT_LIMIT);
    checkCycleLimit(cycleMap, key1, AGENT_LIMIT);
    checkCycleLimit(cycleMap, key2, AGENT_LIMIT);

    assert.strictEqual(cycleMap.get(key1), 2);
    assert.strictEqual(cycleMap.get(key2), 1);
  });

  test('first call for a new key returns false (count=1, under limit)', () => {
    const cycleMap = new Map();
    const exceeded = checkCycleLimit(cycleMap, 'new:key:here', AGENT_LIMIT);
    assert.strictEqual(exceeded, false);
    assert.strictEqual(cycleMap.get('new:key:here'), 1);
  });
});
