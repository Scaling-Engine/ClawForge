import { randomUUID } from 'crypto';
import { hashSync, genSaltSync, compare } from 'bcrypt-ts';
import { eq, sql } from 'drizzle-orm';
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
