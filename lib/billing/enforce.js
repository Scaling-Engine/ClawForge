import { getUsageSummary, getBillingLimits } from '../db/usage.js';

/**
 * Get the current billing period in 'YYYY-MM' format (UTC).
 * @returns {string}
 */
function currentPeriodMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Check whether an instance is within its usage limit for the current billing period.
 *
 * Returns:
 *   - { allowed: true, current: N, limit: null, remaining: null, percentUsed: 0, resetDate: null }
 *     when no limit is configured (unlimited by default)
 *   - { allowed: true|false, current: N, limit: M, remaining: R, percentUsed: P, resetDate: 'YYYY-MM-DD' }
 *     when a limit is configured
 *
 * @param {string} instanceName             - Instance name (e.g. 'noah', 'strategyES')
 * @param {string} [limitType='jobs_per_month'] - Limit type to check
 * @returns {{ allowed: boolean, current: number, limit: number|null, remaining: number|null, percentUsed: number, resetDate: string|null }}
 */
export function checkUsageLimit(instanceName, limitType = 'jobs_per_month') {
  const period = currentPeriodMonth();
  const { jobCount: current } = getUsageSummary(instanceName, period);
  const limits = getBillingLimits(instanceName);

  const limit = limitType === 'jobs_per_month' ? limits.jobsPerMonth : limits.concurrentJobs;

  if (limit === null) {
    return {
      allowed: true,
      current,
      limit: null,
      remaining: null,
      percentUsed: 0,
      resetDate: null,
    };
  }

  const allowed = current < limit;
  const remaining = Math.max(0, limit - current);
  const percentUsed = current / limit;

  // Reset date: first day of next month UTC in 'YYYY-MM-DD' format
  const now = new Date();
  const resetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);

  return {
    allowed,
    current,
    limit,
    remaining,
    percentUsed,
    resetDate,
  };
}
