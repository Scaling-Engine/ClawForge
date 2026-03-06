import { eq } from 'drizzle-orm';
import { getDb } from './index.js';
import { jobOrigins } from './schema.js';

/**
 * Save the originating thread for a job so we can route notifications back.
 * @param {string} jobId
 * @param {string} threadId
 * @param {string} platform - 'slack' | 'telegram' | 'web'
 * @param {string} [dispatchMethod='actions'] - 'docker' | 'actions'
 */
export function saveJobOrigin(jobId, threadId, platform, dispatchMethod = 'actions') {
  const db = getDb();
  db.insert(jobOrigins)
    .values({ jobId, threadId, platform, dispatchMethod, createdAt: Date.now() })
    .onConflictDoNothing()
    .run();
}

/**
 * Look up the originating thread for a job.
 * @param {string} jobId
 * @returns {{ jobId: string, threadId: string, platform: string, createdAt: number } | undefined}
 */
export function getJobOrigin(jobId) {
  const db = getDb();
  return db.select().from(jobOrigins).where(eq(jobOrigins.jobId, jobId)).get();
}
