import crypto from 'crypto';
import { eq, desc, asc } from 'drizzle-orm';
import { getDb } from './index.js';
import { clusterRuns, clusterAgentRuns } from './schema.js';

/**
 * Create a new cluster run record.
 *
 * @param {object} opts
 * @param {string} opts.instanceName - Instance identifier (e.g. 'noah', 'strategyES')
 * @param {string} opts.clusterName - Name of the cluster definition from CLUSTER.json
 * @param {string} [opts.initialPrompt] - The prompt that triggered this cluster run
 * @param {string} [opts.slackChannel] - Slack channel ID if triggered from Slack
 * @param {string} [opts.slackThreadTs] - Slack thread timestamp for reply threading
 * @returns {Promise<string>} The generated UUID for the new run
 */
export async function createClusterRun({ instanceName, clusterName, initialPrompt, slackChannel, slackThreadTs } = {}) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  db.insert(clusterRuns).values({
    id,
    instanceName,
    clusterName,
    status: 'running',
    initialPrompt: initialPrompt || null,
    slackChannel: slackChannel || null,
    slackThreadTs: slackThreadTs || null,
    failReason: null,
    totalAgentRuns: 0,
    createdAt: now,
    completedAt: null,
  }).run();

  return id;
}

/**
 * Update a cluster run record with partial fields.
 *
 * @param {string} id - Cluster run UUID
 * @param {object} fields - Partial fields to update (status, failReason, completedAt, totalAgentRuns)
 */
export async function updateClusterRun(id, fields) {
  const db = getDb();
  db.update(clusterRuns)
    .set(fields)
    .where(eq(clusterRuns.id, id))
    .run();
}

/**
 * Create a new agent run record within a cluster run.
 *
 * @param {object} opts
 * @param {string} opts.clusterRunId - Parent cluster run UUID (FK to clusterRuns.id)
 * @param {string} opts.role - Role name from the cluster definition (e.g. 'researcher', 'writer')
 * @param {number} opts.agentIndex - Zero-based index of this agent in the cluster
 * @param {string} [opts.volumeName] - Docker volume name for this agent
 * @returns {Promise<string>} The generated UUID for the new agent run
 */
export async function createAgentRun({ clusterRunId, role, agentIndex, volumeName } = {}) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  db.insert(clusterAgentRuns).values({
    id,
    clusterRunId,
    role,
    agentIndex,
    status: 'running',
    label: null,
    exitCode: null,
    prUrl: null,
    volumeName: volumeName || null,
    createdAt: now,
    completedAt: null,
  }).run();

  return id;
}

/**
 * Update an agent run record with partial fields.
 *
 * @param {string} id - Agent run UUID
 * @param {object} fields - Partial fields to update (status, label, exitCode, prUrl, completedAt)
 */
export async function updateAgentRun(id, fields) {
  const db = getDb();
  db.update(clusterAgentRuns)
    .set(fields)
    .where(eq(clusterAgentRuns.id, id))
    .run();
}

/**
 * List all cluster runs for an instance, ordered by createdAt descending (newest first).
 *
 * @param {string} instanceName - Instance identifier
 * @returns {Promise<Array>} Array of clusterRuns rows
 */
export async function getClusterRuns(instanceName) {
  const db = getDb();
  return db.select()
    .from(clusterRuns)
    .where(eq(clusterRuns.instanceName, instanceName))
    .orderBy(desc(clusterRuns.createdAt))
    .all();
}

/**
 * Get a cluster run with all its associated agent runs.
 *
 * @param {string} runId - Cluster run UUID
 * @returns {Promise<object|null>} The run object with an `agentRuns` array property, or null if not found
 */
export async function getClusterRunDetail(runId) {
  const db = getDb();

  const run = db.select()
    .from(clusterRuns)
    .where(eq(clusterRuns.id, runId))
    .get();

  if (!run) return null;

  const agentRunRows = db.select()
    .from(clusterAgentRuns)
    .where(eq(clusterAgentRuns.clusterRunId, runId))
    .orderBy(asc(clusterAgentRuns.agentIndex))
    .all();

  return { ...run, agentRuns: agentRunRows };
}
