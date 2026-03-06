import { eq, and, gt } from 'drizzle-orm';
import { getDb } from './index.js';
import { jobOrigins } from './schema.js';

/**
 * Update an existing jobOrigins row to set the Docker containerId.
 * Called after container.start() in dispatchDockerJob.
 *
 * @param {string} jobId
 * @param {string} containerId - Docker container ID
 * @param {string} instanceName - Instance that dispatched this job
 */
export function saveDockerJob(jobId, containerId, instanceName) {
  const db = getDb();
  db.update(jobOrigins)
    .set({ containerId })
    .where(eq(jobOrigins.jobId, jobId))
    .run();
}

/**
 * Look up a job's Docker tracking info (containerId, dispatchMethod, etc).
 *
 * @param {string} jobId
 * @returns {object|undefined} jobOrigins row
 */
export function getDockerJob(jobId) {
  const db = getDb();
  return db.select().from(jobOrigins).where(eq(jobOrigins.jobId, jobId)).get();
}

/**
 * Mark a Docker-dispatched job as notified (dedup flag).
 *
 * @param {string} jobId
 */
export function markDockerJobNotified(jobId) {
  const db = getDb();
  db.update(jobOrigins)
    .set({ notified: 1 })
    .where(eq(jobOrigins.jobId, jobId))
    .run();
}

/**
 * Check if a job has already been notified (for dedup in webhook handler).
 *
 * @param {string} jobId
 * @returns {boolean}
 */
export function isJobNotified(jobId) {
  const db = getDb();
  const row = db.select({ notified: jobOrigins.notified })
    .from(jobOrigins)
    .where(eq(jobOrigins.jobId, jobId))
    .get();
  return row?.notified === 1;
}

/**
 * Get all Docker-dispatched jobs that haven't been notified yet (within last 24h).
 * Used for reconciliation and polling.
 *
 * @returns {Array<object>} jobOrigins rows
 */
export function getPendingDockerJobs() {
  const db = getDb();
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  return db.select()
    .from(jobOrigins)
    .where(
      and(
        eq(jobOrigins.dispatchMethod, 'docker'),
        eq(jobOrigins.notified, 0),
        gt(jobOrigins.createdAt, oneDayAgo)
      )
    )
    .all();
}
