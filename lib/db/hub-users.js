import { randomUUID } from 'crypto';
import { hashSync, genSaltSync, compare } from 'bcrypt-ts';
import { eq, sql, and } from 'drizzle-orm';
import { getHubDb } from './hub.js';
import { hubUsers, agentAssignments } from './hub-schema.js';

/**
 * Get the total number of hub users.
 * Used to detect first-time setup (no users = needs setup).
 * @returns {number}
 */
export function getHubUserCount() {
  const db = getHubDb();
  const result = db.select({ count: sql`count(*)` }).from(hubUsers).get();
  return result?.count ?? 0;
}

/**
 * Find a hub user by email address.
 * @param {string} email
 * @returns {object|undefined}
 */
export function getHubUserByEmail(email) {
  const db = getHubDb();
  return db.select().from(hubUsers).where(eq(hubUsers.email, email.toLowerCase())).get();
}

/**
 * Atomically create the first hub user (admin) if no users exist.
 * Uses a transaction to prevent race conditions — only one caller wins.
 * @param {string} email
 * @param {string} password - Plain text password (will be hashed)
 * @returns {object|null} The created user, or null if users already exist
 */
export function createFirstHubUser(email, password) {
  const db = getHubDb();
  return db.transaction((tx) => {
    const count = tx.select({ count: sql`count(*)` }).from(hubUsers).get();
    if (count?.count > 0) return null;

    const now = Date.now();
    const passwordHash = hashSync(password, genSaltSync(10));
    const user = {
      id: randomUUID(),
      email: email.toLowerCase(),
      passwordHash,
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    };
    tx.insert(hubUsers).values(user).run();
    return { id: user.id, email: user.email, role: user.role };
  });
}

/**
 * Verify a password against a hub user's stored hash.
 * @param {object} user - Hub user object with passwordHash field
 * @param {string} password - Plain text password to verify
 * @returns {Promise<boolean>}
 */
export async function verifyHubPassword(user, password) {
  return compare(password, user.passwordHash);
}

/**
 * Get all agent slugs assigned to a hub user.
 * @param {string} userId - Hub user ID
 * @returns {string[]} Array of agent slugs (e.g., ['noah', 'strategyES'])
 */
export function getAgentSlugsForUser(userId) {
  const db = getHubDb();
  const rows = db.select({ agentSlug: agentAssignments.agentSlug })
    .from(agentAssignments)
    .where(eq(agentAssignments.userId, userId))
    .all();
  return rows.map(r => r.agentSlug);
}

/**
 * Get all hub users without password hashes.
 * @returns {Array<{id, email, role, createdAt}>}
 */
export function getHubUsers() {
  const db = getHubDb();
  return db.select({
    id: hubUsers.id,
    email: hubUsers.email,
    role: hubUsers.role,
    createdAt: hubUsers.createdAt,
  }).from(hubUsers).all();
}

/**
 * Get a single hub user by ID, without password hash.
 * @param {string} id
 * @returns {object|undefined}
 */
export function getUserById(id) {
  const db = getHubDb();
  return db.select({
    id: hubUsers.id,
    email: hubUsers.email,
    role: hubUsers.role,
    createdAt: hubUsers.createdAt,
  }).from(hubUsers).where(eq(hubUsers.id, id)).get();
}

/**
 * Get all agent assignments for a specific hub user.
 * @param {string} userId
 * @returns {Array<{id, userId, agentSlug, agentRole, createdAt}>}
 */
export function getAssignmentsForUser(userId) {
  const db = getHubDb();
  return db.select()
    .from(agentAssignments)
    .where(eq(agentAssignments.userId, userId))
    .all();
}

/**
 * Insert or update an agent assignment for a user.
 * Uses select-then-update/insert (not INSERT OR REPLACE) to preserve createdAt.
 * @param {string} userId
 * @param {string} agentSlug
 * @param {string} agentRole - 'viewer'|'operator'|'admin'
 */
export function upsertUserAssignment(userId, agentSlug, agentRole) {
  const db = getHubDb();
  const existing = db.select()
    .from(agentAssignments)
    .where(
      and(
        eq(agentAssignments.userId, userId),
        eq(agentAssignments.agentSlug, agentSlug)
      )
    ).get();
  if (existing) {
    db.update(agentAssignments)
      .set({ agentRole })
      .where(eq(agentAssignments.id, existing.id))
      .run();
  } else {
    db.insert(agentAssignments).values({
      id: randomUUID(),
      userId,
      agentSlug,
      agentRole,
      createdAt: Date.now(),
    }).run();
  }
}

/**
 * Remove a specific agent assignment from a user.
 * @param {string} userId
 * @param {string} agentSlug
 */
export function removeUserAssignment(userId, agentSlug) {
  const db = getHubDb();
  db.delete(agentAssignments)
    .where(
      and(
        eq(agentAssignments.userId, userId),
        eq(agentAssignments.agentSlug, agentSlug)
      )
    ).run();
}
