import { randomUUID } from 'crypto';
import { eq, desc, and, gt, sql } from 'drizzle-orm';
import { getDb } from './index.js';
import { jobOutcomes } from './schema.js';

/**
 * Persist a completed job outcome linked to its originating thread.
 * changedFiles is stored as a JSON array string.
 * @param {object} params
 * @param {string} params.jobId
 * @param {string} params.threadId
 * @param {string} params.status
 * @param {string} params.mergeResult
 * @param {string} params.prUrl
 * @param {string|null} [params.targetRepo] - Optional target repo slug (e.g. 'owner/repo'). Null for same-repo jobs.
 * @param {string[]|any} params.changedFiles
 * @param {string} params.logSummary
 */
export function saveJobOutcome({ jobId, threadId, status, mergeResult, prUrl, targetRepo, changedFiles, logSummary }) {
  const db = getDb();
  const id = randomUUID();
  db.insert(jobOutcomes)
    .values({
      id,
      jobId,
      threadId,
      status,
      mergeResult,
      prUrl: prUrl ?? '',
      targetRepo: targetRepo ?? null,  // nullable — explicit null, not undefined
      changedFiles: JSON.stringify(Array.isArray(changedFiles) ? changedFiles : []),
      logSummary: logSummary ?? '',
      createdAt: Date.now(),
    })
    .run();
}

/**
 * Calculate job success rate for the last N hours.
 * Queries ALL job_outcomes (no instance_name filter — each instance has its own DB).
 * Uses LIMIT 100 + ORDER BY created_at DESC to avoid full table scan.
 * @param {number} [hours=24] - Time window in hours
 * @returns {{ total: number, succeeded: number, rate: number | null }}
 */
export function getJobSuccessRate(hours = 24) {
  const db = getDb();
  const since = Date.now() - hours * 60 * 60 * 1000;

  const rows = db
    .select({
      status: jobOutcomes.status,
    })
    .from(jobOutcomes)
    .where(gt(jobOutcomes.createdAt, since))
    .orderBy(sql`${jobOutcomes.createdAt} DESC`)
    .limit(100)
    .all();

  const total = rows.length;
  if (total === 0) return { total: 0, succeeded: 0, rate: null };

  const succeeded = rows.filter((r) => r.status === 'success').length;
  return { total, succeeded, rate: Math.round((succeeded / total) * 1000) / 1000 };
}

/**
 * Count consecutive job failures from the most recent outcomes.
 * Queries the N most recent rows and counts from newest until a 'success' is found.
 * Returns 0 if no rows exist or the most recent job succeeded.
 * @param {number} [n=10] - Number of recent rows to check
 * @returns {number} Count of consecutive failures at the head of the history
 */
export function getConsecutiveFailureCount(n = 10) {
  const db = getDb();
  const rows = db
    .select({ status: jobOutcomes.status })
    .from(jobOutcomes)
    .orderBy(desc(jobOutcomes.createdAt))
    .limit(n)
    .all();

  let count = 0;
  for (const row of rows) {
    if (row.status === 'success') break;
    count++;
  }
  return count;
}

/**
 * Return the most recent merged job outcome for a given thread, or null if none exists.
 * Filters by both threadId and mergeResult='merged' at query level (HIST-03, HIST-04).
 * @param {string} threadId
 * @returns {{ id: string, jobId: string, threadId: string, status: string, mergeResult: string, prUrl: string, changedFiles: string, logSummary: string, createdAt: number } | null}
 */
export function getLastMergedJobOutcome(threadId) {
  const db = getDb();
  return (
    db
      .select()
      .from(jobOutcomes)
      .where(and(eq(jobOutcomes.threadId, threadId), eq(jobOutcomes.mergeResult, 'merged')))
      .orderBy(desc(jobOutcomes.createdAt))
      .limit(1)
      .get() ?? null
  );
}
