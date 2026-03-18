import { randomUUID } from 'crypto';
import { lt, gt, lte, sql } from 'drizzle-orm';
import { getDb } from './index.js';
import { errorLog } from './schema.js';

/**
 * Persist an error entry to the error_log table.
 *
 * @param {object} opts
 * @param {string} opts.context       - Subsystem label ('channel', 'webhook', 'startup', 'db', 'cron')
 * @param {string} opts.severity      - 'error', 'warn', or 'info'
 * @param {string} opts.message       - Error message text
 * @param {string} [opts.stack]       - Stack trace string
 * @param {string} [opts.metadata]    - JSON string of sanitized metadata
 * @param {string} [opts.instanceName] - Instance name (e.g. 'noah', 'strategyES')
 * @returns {Promise<void>}
 */
export async function writeError({ context, severity, message, stack, metadata, instanceName }) {
  const db = getDb();
  db.insert(errorLog).values({
    id: randomUUID(),
    context,
    severity,
    message,
    stack: stack || null,
    metadata: metadata || null,
    instanceName: instanceName || null,
    createdAt: Date.now(),
  }).run();
}

/**
 * Count error_log rows created within the last N hours.
 *
 * @param {number} [hours=24]
 * @returns {Promise<number>}
 */
export async function getRecentErrorCount(hours = 24) {
  const db = getDb();
  const cutoff = Date.now() - hours * 3_600_000;
  const result = db
    .select({ count: sql`COUNT(*)` })
    .from(errorLog)
    .where(gt(errorLog.createdAt, cutoff))
    .get();
  return result?.count ?? 0;
}

/**
 * Return the createdAt timestamp of the most recent error_log row, or null if none exist.
 *
 * @returns {Promise<number|null>}
 */
export async function getLastErrorAt() {
  const db = getDb();
  const result = db
    .select({ maxCreatedAt: sql`MAX(created_at)` })
    .from(errorLog)
    .get();
  return result?.maxCreatedAt ?? null;
}

/**
 * Delete error_log rows older than N days.
 * Pass days=0 to delete all rows.
 *
 * @param {number} [days=30]
 * @returns {Promise<void>}
 */
export async function pruneOldErrors(days = 30) {
  const db = getDb();
  if (days <= 0) {
    // Delete all rows (used in tests and manual flush)
    db.delete(errorLog).run();
  } else {
    const cutoff = Date.now() - days * 86_400_000;
    db.delete(errorLog).where(lte(errorLog.createdAt, cutoff)).run();
  }
}
