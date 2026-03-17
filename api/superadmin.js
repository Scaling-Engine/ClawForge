/**
 * Superadmin API endpoints — machine-to-machine auth via AGENT_SUPERADMIN_TOKEN.
 *
 * These endpoints are called by the superadmin hub to query remote instances.
 * They are also called locally (bypassing HTTP) by the superadmin client module.
 *
 * Endpoints:
 *   GET /api/superadmin/health — instance health check
 *   GET /api/superadmin/stats  — active job count, last job, repo count, user count
 *   GET /api/superadmin/jobs   — job search with repo/status/keyword filters
 */

import { timingSafeEqual } from 'crypto';

const INSTANCE_NAME = process.env.INSTANCE_NAME || 'default';

/**
 * Verify Bearer token against AGENT_SUPERADMIN_TOKEN.
 * @param {Request} request
 * @returns {boolean}
 */
function verifySuperadminToken(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;

  const token = authHeader.slice(7);
  const expected = process.env.AGENT_SUPERADMIN_TOKEN;
  if (!expected || !token) return false;

  const bufA = Buffer.from(token);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Handle a superadmin endpoint by name (used for local direct calls).
 *
 * @param {string} endpoint - 'health', 'stats', or 'jobs'
 * @param {Record<string, string>} params - query parameters
 * @returns {Promise<object>}
 */
export async function handleSuperadminEndpoint(endpoint, params) {
  switch (endpoint) {
    case 'health':
      return getHealth();
    case 'stats':
      return await getStats();
    case 'jobs':
      return await getJobs(params);
    default:
      throw new Error(`Unknown superadmin endpoint: ${endpoint}`);
  }
}

/**
 * HTTP request handler — validates token, routes to endpoint handler.
 *
 * @param {Request} request
 * @param {string} endpoint - extracted from URL path
 * @returns {Promise<Response>}
 */
export async function handleSuperadminRequest(request, endpoint) {
  if (!verifySuperadminToken(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams);
    const data = await handleSuperadminEndpoint(endpoint, params);
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint implementations
// ─────────────────────────────────────────────────────────────────────────────

function getHealth() {
  return {
    instance: INSTANCE_NAME,
    status: 'online',
    uptime: process.uptime(),
  };
}

async function getStats() {
  const { getPendingDockerJobs } = await import('../lib/db/docker-jobs.js');
  const { getRepos } = await import('../lib/db/repos.js');
  const { getUserCount } = await import('../lib/db/users.js');

  const activeJobs = getPendingDockerJobs();
  const repos = await getRepos();
  const userCount = getUserCount();

  // Find most recent job timestamp
  let lastJobAt = null;
  if (activeJobs.length > 0) {
    lastJobAt = Math.max(...activeJobs.map((j) => j.createdAt));
  }

  return {
    instance: INSTANCE_NAME,
    activeJobs: activeJobs.length,
    lastJobAt,
    repoCount: repos.length,
    userCount,
  };
}

async function getJobs(params) {
  const { like, desc, eq } = await import('drizzle-orm');
  const { getDb } = await import('../lib/db/index.js');
  const { jobOutcomes, jobOrigins } = await import('../lib/db/schema.js');

  const db = getDb();
  const limit = Math.min(parseInt(params.limit, 10) || 50, 100);

  // Build query — start from jobOutcomes, left join jobOrigins
  let query = db
    .select({
      id: jobOutcomes.id,
      jobId: jobOutcomes.jobId,
      threadId: jobOutcomes.threadId,
      status: jobOutcomes.status,
      mergeResult: jobOutcomes.mergeResult,
      prUrl: jobOutcomes.prUrl,
      targetRepo: jobOutcomes.targetRepo,
      logSummary: jobOutcomes.logSummary,
      createdAt: jobOutcomes.createdAt,
      platform: jobOrigins.platform,
    })
    .from(jobOutcomes)
    .leftJoin(jobOrigins, eq(jobOutcomes.jobId, jobOrigins.jobId));

  // Apply filters via WHERE conditions
  const conditions = [];

  if (params.repo) {
    conditions.push(like(jobOutcomes.targetRepo, `%${params.repo}%`));
  }

  if (params.status) {
    conditions.push(eq(jobOutcomes.status, params.status));
  }

  if (params.q) {
    conditions.push(like(jobOutcomes.logSummary, `%${params.q}%`));
  }

  if (conditions.length > 0) {
    const { and } = await import('drizzle-orm');
    query = query.where(and(...conditions));
  }

  const jobs = query
    .orderBy(desc(jobOutcomes.createdAt))
    .limit(limit)
    .all();

  return {
    instance: INSTANCE_NAME,
    jobs: jobs.map((j) => ({
      ...j,
      instance: INSTANCE_NAME,
    })),
  };
}
