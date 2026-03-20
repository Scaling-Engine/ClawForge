import { eq, and, ne, lt } from 'drizzle-orm';
import { getDb } from './index.js';
import { chats, codeWorkspaces } from './schema.js';

/**
 * Generate a workspace volume name using the ws-specific prefix.
 * Uses clawforge-ws- prefix to avoid collisions with job volumes (clawforge-).
 *
 * @param {string} instanceName - e.g. 'noah', 'strategyES'
 * @param {string} shortId - Short workspace identifier
 * @returns {string} Volume name like 'clawforge-ws-noah-abc123'
 */
export function wsVolumeNameFor(instanceName, shortId) {
  return `clawforge-ws-${instanceName}-${shortId}`;
}

/**
 * Insert a new workspace record.
 *
 * @param {object} workspace - Workspace data matching codeWorkspaces schema
 */
export function createWorkspace(workspace) {
  const db = getDb();
  db.insert(codeWorkspaces).values(workspace).run();
}

/**
 * Get a workspace by its primary key.
 *
 * @param {string} id - Workspace UUID
 * @returns {object|undefined} Workspace row
 */
export function getWorkspace(id) {
  const db = getDb();
  return db.select().from(codeWorkspaces).where(eq(codeWorkspaces.id, id)).get();
}

/**
 * Get a workspace by instance name and repo slug.
 * Used to enforce one-workspace-per-repo constraint.
 *
 * @param {string} instanceName
 * @param {string} repoSlug
 * @returns {object|undefined} Workspace row
 */
export function getWorkspaceByRepo(instanceName, repoSlug) {
  const db = getDb();
  return db.select()
    .from(codeWorkspaces)
    .where(
      and(
        eq(codeWorkspaces.instanceName, instanceName),
        eq(codeWorkspaces.repoSlug, repoSlug),
        ne(codeWorkspaces.status, 'destroyed')
      )
    )
    .get();
}

/**
 * List all workspaces for an instance, excluding destroyed ones.
 *
 * @param {string} instanceName
 * @returns {Array<object>} Workspace rows
 */
export function listWorkspaces(instanceName) {
  const db = getDb();
  return db.select()
    .from(codeWorkspaces)
    .where(
      and(
        eq(codeWorkspaces.instanceName, instanceName),
        ne(codeWorkspaces.status, 'destroyed')
      )
    )
    .all();
}

/**
 * Partially update a workspace record. Auto-sets updatedAt.
 *
 * @param {string} id - Workspace UUID
 * @param {object} updates - Partial workspace fields to update
 */
export function updateWorkspace(id, updates) {
  const db = getDb();
  db.update(codeWorkspaces)
    .set({ ...updates, updatedAt: Date.now() })
    .where(eq(codeWorkspaces.id, id))
    .run();
}

/**
 * Hard delete a workspace record. Called after volume removal during cleanup.
 *
 * @param {string} id - Workspace UUID
 */
export function deleteWorkspace(id) {
  const db = getDb();
  db.delete(codeWorkspaces).where(eq(codeWorkspaces.id, id)).run();
}

/**
 * Count running workspaces for an instance. Used for concurrent limit enforcement.
 *
 * @param {string} instanceName
 * @returns {number} Count of running workspaces
 */
export function countRunningWorkspaces(instanceName) {
  const db = getDb();
  const rows = db.select()
    .from(codeWorkspaces)
    .where(
      and(
        eq(codeWorkspaces.instanceName, instanceName),
        eq(codeWorkspaces.status, 'running')
      )
    )
    .all();
  return rows.length;
}

/**
 * Get running workspaces where lastActivityAt is older than the idle threshold.
 * Used for idle timeout enforcement.
 *
 * @param {number} idleThresholdMs - Maximum idle duration in milliseconds
 * @returns {Array<object>} Idle workspace rows
 */
export function getIdleWorkspaces(idleThresholdMs) {
  const db = getDb();
  const cutoff = Date.now() - idleThresholdMs;
  return db.select()
    .from(codeWorkspaces)
    .where(
      and(
        eq(codeWorkspaces.status, 'running'),
        lt(codeWorkspaces.lastActivityAt, cutoff)
      )
    )
    .all();
}

/**
 * Get a running workspace linked to a specific chat via codeWorkspaceId.
 *
 * @param {string} chatId
 * @returns {object|undefined} Workspace row if linked and not destroyed
 */
export function getWorkspaceByChatId(chatId) {
  const db = getDb();
  const chat = db.select().from(chats).where(eq(chats.id, chatId)).get();
  if (!chat?.codeWorkspaceId) return undefined;
  const ws = db.select().from(codeWorkspaces).where(eq(codeWorkspaces.id, chat.codeWorkspaceId)).get();
  if (!ws || ws.status === 'destroyed') return undefined;
  return ws;
}

/**
 * Link a chat to a workspace by setting codeWorkspaceId.
 *
 * @param {string} chatId
 * @param {string} workspaceId
 */
export function linkChatToWorkspace(chatId, workspaceId) {
  const db = getDb();
  db.update(chats).set({ codeWorkspaceId: workspaceId, updatedAt: Date.now() }).where(eq(chats.id, chatId)).run();
}
