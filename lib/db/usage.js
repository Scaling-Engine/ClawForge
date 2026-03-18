import { randomUUID } from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from './index.js';
import { usageEvents, billingLimits } from './schema.js';

/**
 * Record a usage event (e.g. job dispatch).
 *
 * @param {object} opts
 * @param {string} opts.instanceName      - Instance name (e.g. 'noah', 'strategyES')
 * @param {string} opts.eventType         - Event type (e.g. 'job_dispatch')
 * @param {number} [opts.quantity=1]      - Quantity consumed
 * @param {number} [opts.durationSeconds] - Duration in seconds (nullable, set on completion)
 * @param {string} [opts.refId]           - Reference ID (e.g. jobId for tracing)
 * @param {string} opts.periodMonth       - Billing period in 'YYYY-MM' format
 */
export function recordUsageEvent({ instanceName, eventType, quantity = 1, durationSeconds, refId, periodMonth }) {
  const db = getDb();
  db.insert(usageEvents).values({
    id: randomUUID(),
    instanceName,
    eventType,
    quantity,
    durationSeconds: durationSeconds ?? null,
    periodMonth,
    refId: refId ?? null,
    createdAt: Date.now(),
  }).run();
}

/**
 * Get usage summary for an instance and billing period.
 * Only counts 'job_dispatch' events.
 *
 * @param {string} instanceName - Instance name
 * @param {string} periodMonth  - Billing period in 'YYYY-MM' format
 * @returns {{ jobCount: number, totalDurationSeconds: number }}
 */
export function getUsageSummary(instanceName, periodMonth) {
  const db = getDb();
  const result = db
    .select({
      jobCount: sql`COUNT(*)`,
      totalDurationSeconds: sql`COALESCE(SUM(duration_seconds), 0)`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.instanceName, instanceName),
        eq(usageEvents.eventType, 'job_dispatch'),
        eq(usageEvents.periodMonth, periodMonth),
      )
    )
    .get();
  return {
    jobCount: result?.jobCount ?? 0,
    totalDurationSeconds: result?.totalDurationSeconds ?? 0,
  };
}

/**
 * Get billing limits for an instance.
 *
 * @param {string} instanceName - Instance name
 * @returns {{ jobsPerMonth: number|null, concurrentJobs: number|null }}
 */
export function getBillingLimits(instanceName) {
  const db = getDb();
  const rows = db
    .select()
    .from(billingLimits)
    .where(eq(billingLimits.instanceName, instanceName))
    .all();

  const result = { jobsPerMonth: null, concurrentJobs: null };
  for (const row of rows) {
    if (row.limitType === 'jobs_per_month') {
      result.jobsPerMonth = row.limitValue;
    } else if (row.limitType === 'concurrent_jobs') {
      result.concurrentJobs = row.limitValue;
    }
  }
  return result;
}

/**
 * Upsert a billing limit for an instance.
 * Creates a new row if one doesn't exist for this instanceName+limitType,
 * otherwise updates the existing row.
 *
 * @param {string} instanceName - Instance name
 * @param {string} limitType    - Limit type ('jobs_per_month', 'concurrent_jobs')
 * @param {number} limitValue   - Limit value
 */
export function upsertBillingLimit(instanceName, limitType, limitValue) {
  const db = getDb();
  const now = Date.now();

  const existing = db
    .select()
    .from(billingLimits)
    .where(
      and(
        eq(billingLimits.instanceName, instanceName),
        eq(billingLimits.limitType, limitType),
      )
    )
    .get();

  if (existing) {
    db.update(billingLimits)
      .set({ limitValue, updatedAt: now })
      .where(eq(billingLimits.id, existing.id))
      .run();
  } else {
    db.insert(billingLimits).values({
      id: randomUUID(),
      instanceName,
      limitType,
      limitValue,
      warningSentPeriod: null,
      createdAt: now,
      updatedAt: now,
    }).run();
  }
}

/**
 * Mark that an 80% warning was sent for a given instance and billing period.
 * Updates the 'jobs_per_month' billing limit row.
 *
 * @param {string} instanceName - Instance name
 * @param {string} periodMonth  - Billing period in 'YYYY-MM' format
 */
export function markWarningSent(instanceName, periodMonth) {
  const db = getDb();
  db.update(billingLimits)
    .set({ warningSentPeriod: periodMonth })
    .where(
      and(
        eq(billingLimits.instanceName, instanceName),
        eq(billingLimits.limitType, 'jobs_per_month'),
      )
    )
    .run();
}

/**
 * Check whether an 80% warning was already sent for a given instance and period.
 *
 * @param {string} instanceName - Instance name
 * @param {string} periodMonth  - Billing period in 'YYYY-MM' format
 * @returns {boolean}
 */
export function wasWarningSent(instanceName, periodMonth) {
  const db = getDb();
  const row = db
    .select({ warningSentPeriod: billingLimits.warningSentPeriod })
    .from(billingLimits)
    .where(
      and(
        eq(billingLimits.instanceName, instanceName),
        eq(billingLimits.limitType, 'jobs_per_month'),
      )
    )
    .get();
  return row?.warningSentPeriod === periodMonth;
}
