'use server';

import { unauthorized } from 'next/navigation';
import { auth } from '../auth/index.js';
import {
  createChat as dbCreateChat,
  getChatById,
  getMessagesByChatId,
  deleteChat as dbDeleteChat,
  deleteAllChatsByUser,
  updateChatTitle,
  toggleChatStarred,
} from '../db/chats.js';
import {
  getNotifications as dbGetNotifications,
  getUnreadCount as dbGetUnreadCount,
  markAllRead as dbMarkAllRead,
} from '../db/notifications.js';

/**
 * Get the authenticated user or throw.
 */
async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    unauthorized();
  }
  return session.user;
}

/**
 * Get the authenticated user and confirm they are an admin, or throw.
 */
async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== 'admin') {
    const { forbidden } = await import('next/navigation');
    forbidden();
  }
  return user;
}

/**
 * Get the authenticated user and confirm they are a superadmin, or throw.
 */
async function requireSuperadmin() {
  const user = await requireAuth();
  if (user.role !== 'superadmin') {
    const { forbidden } = await import('next/navigation');
    forbidden();
  }
  return user;
}

/**
 * Get all chats for the authenticated user (includes Telegram chats).
 * @returns {Promise<object[]>}
 */
export async function getChats() {
  const user = await requireAuth();
  const { or, eq, desc } = await import('drizzle-orm');
  const { getDb } = await import('../db/index.js');
  const { chats } = await import('../db/schema.js');
  const db = getDb();
  return db
    .select()
    .from(chats)
    .where(or(eq(chats.userId, user.id), eq(chats.userId, 'telegram')))
    .orderBy(desc(chats.updatedAt))
    .all();
}

/**
 * Get messages for a specific chat (with ownership check).
 * @param {string} chatId
 * @returns {Promise<object[]>}
 */
export async function getChatMessages(chatId) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || (chat.userId !== user.id && chat.userId !== 'telegram')) {
    return [];
  }
  return getMessagesByChatId(chatId);
}

/**
 * Create a new chat.
 * @param {string} [id] - Optional chat ID
 * @param {string} [title='New Chat']
 * @returns {Promise<object>}
 */
export async function createChat(id, title = 'New Chat') {
  const user = await requireAuth();
  return dbCreateChat(user.id, title, id);
}

/**
 * Delete a chat (with ownership check).
 * @param {string} chatId
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteChat(chatId) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || chat.userId !== user.id) {
    return { success: false };
  }
  dbDeleteChat(chatId);
  return { success: true };
}

/**
 * Rename a chat (with ownership check).
 * @param {string} chatId
 * @param {string} title
 * @returns {Promise<{success: boolean}>}
 */
export async function renameChat(chatId, title) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || chat.userId !== user.id) {
    return { success: false };
  }
  updateChatTitle(chatId, title);
  return { success: true };
}

/**
 * Toggle a chat's starred status (with ownership check).
 * @param {string} chatId
 * @returns {Promise<{success: boolean, starred?: number}>}
 */
export async function starChat(chatId) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || chat.userId !== user.id) {
    return { success: false };
  }
  const starred = toggleChatStarred(chatId);
  return { success: true, starred };
}

/**
 * Delete all chats for the authenticated user.
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteAllChats() {
  const user = await requireAuth();
  deleteAllChatsByUser(user.id);
  return { success: true };
}

/**
 * Get all notifications, newest first.
 * @returns {Promise<object[]>}
 */
export async function getNotifications() {
  await requireAuth();
  return dbGetNotifications();
}

/**
 * Get count of unread notifications.
 * @returns {Promise<number>}
 */
export async function getUnreadNotificationCount() {
  await requireAuth();
  return dbGetUnreadCount();
}

/**
 * Mark all notifications as read.
 * @returns {Promise<{success: boolean}>}
 */
export async function markNotificationsRead() {
  await requireAuth();
  dbMarkAllRead();
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// User management actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all users (without password hashes).
 * @returns {Promise<Array<{id: string, email: string, role: string, createdAt: number}>>}
 */
export async function getUsers() {
  await requireAuth();
  try {
    const { getAllUsers } = await import('../db/users.js');
    return getAllUsers();
  } catch {
    return [];
  }
}

/**
 * Update a user's role.
 * @param {string} userId
 * @param {string} newRole - 'admin' or 'user'
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function updateUserRole(userId, newRole) {
  await requireAuth();
  if (!['admin', 'user'].includes(newRole)) {
    return { error: 'Invalid role' };
  }
  try {
    const { updateUserRole: dbUpdateRole } = await import('../db/users.js');
    dbUpdateRole(userId, newRole);
    return { success: true };
  } catch {
    return { error: 'Failed to update user role' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// App info actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the installed package version and update status (auth-gated, never in client bundle).
 * @returns {Promise<{ version: string, updateAvailable: string|null }>}
 */
export async function getAppVersion() {
  await requireAuth();
  const { getInstalledVersion } = await import('../cron.js');
  const { getAvailableVersion } = await import('../db/update-check.js');
  return { version: getInstalledVersion(), updateAvailable: getAvailableVersion() };
}

/**
 * Trigger the upgrade-event-handler workflow via GitHub Actions.
 * @returns {Promise<{ success: boolean }>}
 */
export async function triggerUpgrade() {
  await requireAuth();
  const { triggerWorkflowDispatch } = await import('../tools/github.js');
  await triggerWorkflowDispatch('upgrade-event-handler.yml');
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// API Key actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create (or replace) the API key.
 * @returns {Promise<{ key: string, record: object } | { error: string }>}
 */
export async function createNewApiKey() {
  const user = await requireAuth();
  try {
    const { createApiKeyRecord } = await import('../db/api-keys.js');
    return createApiKeyRecord(user.id);
  } catch (err) {
    console.error('Failed to create API key:', err);
    return { error: 'Failed to create API key' };
  }
}

/**
 * Get the current API key metadata (no hash).
 * @returns {Promise<object|null>}
 */
export async function getApiKeys() {
  await requireAuth();
  try {
    const { getApiKey } = await import('../db/api-keys.js');
    return getApiKey();
  } catch (err) {
    console.error('Failed to get API key:', err);
    return null;
  }
}

/**
 * Delete the API key.
 * @returns {Promise<{ success: boolean } | { error: string }>}
 */
export async function deleteApiKey() {
  await requireAuth();
  try {
    const mod = await import('../db/api-keys.js');
    mod.deleteApiKey();
    return { success: true };
  } catch (err) {
    console.error('Failed to delete API key:', err);
    return { error: 'Failed to delete API key' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Swarm actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get swarm status (active + completed jobs with counts).
 * @returns {Promise<object>}
 */
export async function getSwarmStatus(page = 1) {
  await requireAuth();
  try {
    const { getSwarmStatus: fetchStatus } = await import('../tools/github.js');
    return await fetchStatus(page);
  } catch (err) {
    console.error('Failed to get swarm status:', err);
    return { error: 'Failed to get swarm status', runs: [], hasMore: false };
  }
}

/**
 * Get swarm config (crons + triggers).
 * @returns {Promise<{ crons: object[], triggers: object[] }>}
 */
export async function getSwarmConfig() {
  await requireAuth();
  const { cronsFile, triggersFile } = await import('../paths.js');
  const fs = await import('fs');
  let crons = [];
  let triggers = [];
  try { crons = JSON.parse(fs.readFileSync(cronsFile, 'utf8')); } catch {}
  try { triggers = JSON.parse(fs.readFileSync(triggersFile, 'utf8')); } catch {}
  return { crons, triggers };
}

// ─────────────────────────────────────────────────────────────────────────────
// Job control actions (cancel / retry)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List active Docker-dispatched jobs with live container status.
 * @returns {Promise<Array<object>>}
 */
export async function getDockerJobs() {
  await requireAuth();
  const { getPendingDockerJobs } = await import('../db/docker-jobs.js');
  const { inspectJob } = await import('../tools/docker.js');
  const { eq, desc } = await import('drizzle-orm');
  const { getDb } = await import('../db/index.js');
  const { jobOutcomes } = await import('../db/schema.js');
  const db = getDb();

  const pending = getPendingDockerJobs();
  const jobs = [];

  for (const row of pending) {
    let containerStatus = { running: false, status: 'unknown', exitCode: null };
    try {
      containerStatus = await inspectJob(row.jobId);
    } catch {}

    // Check for outcome (failed jobs)
    const outcome = db.select().from(jobOutcomes)
      .where(eq(jobOutcomes.jobId, row.jobId))
      .orderBy(desc(jobOutcomes.createdAt))
      .limit(1).get();

    jobs.push({
      jobId: row.jobId,
      threadId: row.threadId,
      containerId: row.containerId,
      dispatchMethod: row.dispatchMethod,
      createdAt: row.createdAt,
      containerRunning: containerStatus.running,
      containerStatus: containerStatus.status,
      exitCode: containerStatus.exitCode,
      outcome: outcome ? {
        status: outcome.status,
        mergeResult: outcome.mergeResult,
        prUrl: outcome.prUrl,
        targetRepo: outcome.targetRepo,
      } : null,
    });
  }

  return jobs;
}

/**
 * Cancel a running Docker job container.
 * Sends SIGTERM with a 10s grace period, then cancels the SSE stream.
 * @param {string} jobId
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function cancelJob(jobId) {
  await requireAdmin();
  if (!jobId || typeof jobId !== 'string') return { error: 'Invalid job ID' };

  const { getDockerJob } = await import('../db/docker-jobs.js');
  const { getDocker } = await import('../tools/docker.js');
  const { streamManager } = await import('../tools/stream-manager.js');

  const row = getDockerJob(jobId);
  if (!row?.containerId) return { error: 'Job not found or not a Docker job' };

  const docker = getDocker();
  if (!docker) return { error: 'Docker not available' };

  const container = docker.getContainer(row.containerId);
  try {
    await container.stop({ t: 10 });
  } catch (err) {
    if (!err.message?.includes('not running') && err.statusCode !== 304) {
      return { error: `Failed to stop container: ${err.message}` };
    }
  }

  streamManager.cancel(jobId);
  return { success: true };
}

/**
 * Retry a failed Docker job by fetching the original job.md from GitHub and
 * re-dispatching via createJob + dispatchDockerJob.
 * @param {string} jobId
 * @returns {Promise<{success: boolean, newJobId: string} | {error: string}>}
 */
export async function retryJob(jobId) {
  await requireAdmin();
  if (!jobId || typeof jobId !== 'string') return { error: 'Invalid job ID' };

  const { fetchRepoFile } = await import('../tools/github.js');
  const { getDb } = await import('../db/index.js');
  const { jobOutcomes } = await import('../db/schema.js');
  const { eq, desc } = await import('drizzle-orm');
  const { createJob } = await import('../tools/create-job.js');
  const { dispatchDockerJob, isDockerAvailable } = await import('../tools/docker.js');
  const { saveJobOrigin } = await import('../db/job-origins.js');

  const GH_OWNER = process.env.GH_OWNER;
  const GH_REPO = process.env.GH_REPO;

  // Fetch original prompt from the job branch
  const jobDescription = await fetchRepoFile(
    GH_OWNER, GH_REPO,
    `logs/${jobId}/job.md`,
    { ref: `job/${jobId}` }
  );
  if (!jobDescription) {
    return { error: 'Original job description not found (branch may have been pruned)' };
  }

  // Look up target repo from job_outcomes
  const db = getDb();
  const outcome = db.select().from(jobOutcomes)
    .where(eq(jobOutcomes.jobId, jobId))
    .orderBy(desc(jobOutcomes.createdAt))
    .limit(1).get();

  const targetRepo = outcome?.targetRepo || null;

  // Re-dispatch
  const result = await createJob(jobDescription, {
    targetRepo: targetRepo ? { owner: targetRepo.split('/')[0], slug: targetRepo.split('/')[1] } : null,
  });

  if (!result?.job_id) {
    return { error: 'Failed to create new job' };
  }

  // Record job origin so notifications route back correctly
  try {
    saveJobOrigin(result.job_id, 'web', 'web', isDockerAvailable() ? 'docker' : 'actions');
  } catch (err) {
    console.error('Failed to save job origin for retry:', err);
  }

  // Dispatch via Docker if available, otherwise it goes through Actions
  if (isDockerAvailable()) {
    try {
      await dispatchDockerJob(result.job_id, {
        targetRepo: targetRepo || undefined,
      });
    } catch (err) {
      return { error: `Job created but Docker dispatch failed: ${err.message}` };
    }
  }

  return { success: true, newJobId: result.job_id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature flags
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get feature flags from config/FEATURES.json.
 * Returns {} when no FEATURES.json exists (all flags off).
 * @returns {Promise<Record<string, boolean>>}
 */
export async function getFeatureFlags() {
  await requireAuth();
  const { featuresFile } = await import('../paths.js');
  const fs = (await import('fs')).default;
  try {
    return JSON.parse(fs.readFileSync(featuresFile, 'utf8'));
  } catch {
    return {}; // No FEATURES.json = all flags off
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo selector data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all accessible repos: GitHub API (user + org) merged with allowlist config.
 * Allowlisted repos retain custom config (dispatch, qualityGates, mergePolicy).
 * Non-allowlisted repos get safe defaults (docker dispatch, auto merge).
 * @returns {Promise<Array<{ owner: string, slug: string, name: string, aliases: string[], dispatch: string }>>}
 */
export async function getRepos() {
  await requireAuth();
  const { loadAllowedRepos } = await import('../tools/repos.js');
  const { githubApi } = await import('../tools/github.js');

  // Load allowlist for config overrides
  let allowlist = [];
  try {
    allowlist = loadAllowedRepos();
  } catch { /* no allowlist available */ }

  // Build lookup map: "owner/slug" → allowlist entry
  const configMap = new Map();
  for (const r of allowlist) {
    configMap.set(`${r.owner.toLowerCase()}/${r.slug.toLowerCase()}`, r);
  }

  // Fetch all repos accessible to the GH_TOKEN (user + org repos)
  let ghRepos = [];
  try {
    // Paginate through all accessible repos (up to 300)
    for (let page = 1; page <= 3; page++) {
      const batch = await githubApi(`/user/repos?per_page=100&page=${page}&sort=full_name&affiliation=owner,organization_member,collaborator`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      ghRepos.push(...batch);
      if (batch.length < 100) break;
    }
  } catch {
    // GitHub API unavailable — fall back to allowlist only
    return allowlist;
  }

  // Merge: GitHub repos + allowlist config overrides
  const seen = new Set();
  const merged = [];

  for (const gh of ghRepos) {
    const owner = gh.owner?.login || '';
    const slug = gh.name || '';
    const key = `${owner.toLowerCase()}/${slug.toLowerCase()}`;

    if (seen.has(key)) continue;
    seen.add(key);

    const config = configMap.get(key);
    merged.push({
      owner: config?.owner || owner,
      slug: config?.slug || slug,
      name: config?.name || gh.name || slug,
      aliases: config?.aliases || [],
      dispatch: config?.dispatch || 'docker',
      qualityGates: config?.qualityGates || [],
      mergePolicy: config?.mergePolicy || 'auto',
    });
  }

  // Add any allowlisted repos not found via API (e.g. repos token can't list but can access directly)
  for (const r of allowlist) {
    const key = `${r.owner.toLowerCase()}/${r.slug.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }

  return merged;
}

/**
 * Get branch names for a given repo.
 * @param {string} owner
 * @param {string} slug
 * @returns {Promise<string[]>}
 */
export async function getBranches(owner, slug) {
  await requireAuth();
  if (!owner || !slug) return [];
  const { githubApi } = await import('../tools/github.js');
  try {
    const branches = await githubApi(`/repos/${owner}/${slug}/branches`);
    return Array.isArray(branches) ? branches.map((b) => b.name) : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get cluster configuration from CLUSTER.json.
 * @returns {Promise<{ clusters: object[] }>}
 */
export async function getClusterConfig() {
  await requireAuth();
  const { loadClusterConfig } = await import('../cluster/config.js');
  return loadClusterConfig();
}

/**
 * Get all cluster runs for this instance.
 * @returns {Promise<object[]>}
 */
export async function getClusterRuns() {
  await requireAuth();
  const instanceName = process.env.INSTANCE_NAME || 'default';
  const { getClusterRuns: fetchRuns } = await import('../db/cluster-runs.js');
  return fetchRuns(instanceName);
}

/**
 * Get a single cluster run with its per-agent detail.
 * @param {string} runId
 * @returns {Promise<object|null>}
 */
export async function getClusterRunDetail(runId) {
  await requireAuth();
  const { getClusterRunDetail: fetchDetail } = await import('../db/cluster-runs.js');
  return fetchDetail(runId);
}

/**
 * Get a single agent run by ID (for logs page).
 * @param {string} agentRunId
 * @returns {Promise<object|null>}
 */
export async function getAgentRunLogs(agentRunId) {
  await requireAuth();
  const { getAgentRunById } = await import('../db/cluster-runs.js');
  return getAgentRunById(agentRunId);
}

/**
 * Get the currently active (running) agent for a cluster run (for console page).
 * @param {string} runId
 * @returns {Promise<{run: object, activeAgent: object|null}|null>}
 */
export async function getActiveClusterAgent(runId) {
  await requireAuth();
  const { getClusterRunDetail: fetchDetail } = await import('../db/cluster-runs.js');
  const detail = await fetchDetail(runId);
  if (!detail) return null;
  const active = detail.agentRuns.find(a => a.status === 'running');
  return { run: detail, activeAgent: active || null };
}

/**
 * Get cluster config for a specific cluster name (for role detail page).
 * @param {string} clusterName
 * @returns {Promise<object|null>}
 */
export async function getClusterDefinition(clusterName) {
  await requireAuth();
  const { loadClusterConfig } = await import('../cluster/config.js');
  const config = loadClusterConfig();
  if (!config?.clusters) return null;
  return config.clusters.find(c => c.name === clusterName) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP server actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get configured MCP servers with env values redacted.
 * Credentials are never sent to the client (MCP-09).
 * @returns {Promise<Array<{name: string, command: string, args: string[], allowedTools: string[], hydrateTools: Array}>>}
 */
export async function getMcpServers() {
  await requireAuth();
  const { loadMcpServers } = await import('../tools/mcp-servers.js');
  const servers = loadMcpServers();
  // Redact env values — never expose credentials in UI
  return servers.map(({ name, command, args, allowedTools, hydrateTools }) => ({
    name,
    command,
    args: args || [],
    allowedTools: allowedTools || [],
    hydrateTools: hydrateTools || [],
    // env deliberately omitted — credentials never sent to client
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Pull Request actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get open pull requests across all allowed repos.
 * @returns {Promise<object[]>}
 */
export async function getPendingPullRequests() {
  await requireAuth();
  try {
    const { loadAllowedRepos } = await import('../tools/repos.js');
    const { githubApi } = await import('../tools/github.js');
    const repos = loadAllowedRepos();
    const results = await Promise.all(
      repos.map(async ({ owner, slug }) => {
        try {
          const prs = await githubApi(`/repos/${owner}/${slug}/pulls?state=open&per_page=50`);
          return Array.isArray(prs) ? prs.map((pr) => ({ ...pr, _repo: `${owner}/${slug}` })) : [];
        } catch {
          return [];
        }
      })
    );
    return results.flat();
  } catch {
    return [];
  }
}

/**
 * Get count of open non-draft pull requests across all allowed repos.
 * @returns {Promise<number>}
 */
export async function getPendingPRCount() {
  try {
    const prs = await getPendingPullRequests();
    return prs.filter((pr) => !pr.draft).length;
  } catch {
    return 0;
  }
}

/**
 * Approve a pull request.
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @returns {Promise<object>}
 */
export async function approvePullRequest(owner, repo, prNumber) {
  await requireAuth();
  const { githubApi } = await import('../tools/github.js');
  return githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'APPROVE' }),
  });
}

/**
 * Request changes on a pull request.
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @param {string} [body='Changes requested']
 * @returns {Promise<object>}
 */
export async function requestChanges(owner, repo, prNumber, body = 'Changes requested') {
  await requireAuth();
  const { githubApi } = await import('../tools/github.js');
  return githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'REQUEST_CHANGES', body }),
  });
}

/**
 * Get pull requests across all allowed repos, filtered by state.
 * @param {string} [state='open'] - 'open', 'closed', or 'all'
 * @returns {Promise<object[]>}
 */
export async function getPullRequests(state = 'open') {
  await requireAuth();
  const validStates = ['open', 'closed', 'all'];
  const safeState = validStates.includes(state) ? state : 'open';
  try {
    const { loadAllowedRepos } = await import('../tools/repos.js');
    const { githubApi } = await import('../tools/github.js');
    const repos = loadAllowedRepos();
    const results = await Promise.all(
      repos.map(async ({ owner, slug }) => {
        try {
          const prs = await githubApi(
            `/repos/${owner}/${slug}/pulls?state=${safeState}&per_page=50&sort=updated&direction=desc`
          );
          return Array.isArray(prs) ? prs.map((pr) => ({ ...pr, _repo: `${owner}/${slug}` })) : [];
        } catch {
          return [];
        }
      })
    );
    return results.flat();
  } catch {
    return [];
  }
}

/**
 * Get the list of files changed in a pull request.
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @returns {Promise<object[]>}
 */
export async function getPRFiles(owner, repo, prNumber) {
  await requireAuth();
  try {
    const { githubApi } = await import('../tools/github.js');
    const files = await githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`);
    return Array.isArray(files) ? files : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Runners actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get GitHub Actions runners for the configured repo.
 * @returns {Promise<object[]>}
 */
export async function getRunners() {
  await requireAuth();
  try {
    const { githubApi } = await import('../tools/github.js');
    const owner = process.env.GH_OWNER;
    const repo = process.env.GH_REPO;
    const data = await githubApi(`/repos/${owner}/${repo}/actions/runners`);
    return data.runners || [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile actions
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Secrets actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List GitHub repo secrets with locally-cached masked values.
 * @returns {Promise<Array<{name: string, created_at: string, updated_at: string, masked: string|null}>>}
 */
export async function listGitHubSecrets() {
  await requireAuth();
  try {
    const { listSecrets } = await import('../github-api.js');
    const { getConfigSecret } = await import('../db/config.js');
    const secrets = await listSecrets();
    return secrets.map((s) => {
      const cached = getConfigSecret(`ghsec:${s.name}`);
      const masked = cached && cached.length >= 4
        ? '····' + cached.slice(-4)
        : cached ? '····' : null;
      return { name: s.name, created_at: s.created_at, updated_at: s.updated_at, masked };
    });
  } catch (err) {
    console.error('Failed to list GitHub secrets:', err);
    return { error: 'Failed to list GitHub secrets' };
  }
}

/**
 * Create a new GitHub repo secret (with AGENT_* prefix enforcement).
 * @param {string} name - Secret name (must start with AGENT_)
 * @param {string} value - Secret value
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function createGitHubSecret(name, value) {
  await requireAuth();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    return { error: 'Name must contain only uppercase letters, digits, and underscores' };
  }
  if (!name.startsWith('AGENT_')) {
    return { error: 'Secret name must start with AGENT_ or AGENT_LLM_' };
  }
  try {
    const { upsertSecret } = await import('../github-api.js');
    const { setConfigSecret } = await import('../db/config.js');
    await upsertSecret(name, value);
    setConfigSecret(`ghsec:${name}`, value);
    return { success: true };
  } catch (err) {
    console.error('Failed to create GitHub secret:', err);
    return { error: 'Failed to create GitHub secret' };
  }
}

/**
 * Update an existing GitHub repo secret value.
 * @param {string} name - Secret name
 * @param {string} value - New secret value
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function updateGitHubSecret(name, value) {
  await requireAuth();
  try {
    const { upsertSecret } = await import('../github-api.js');
    const { setConfigSecret } = await import('../db/config.js');
    await upsertSecret(name, value);
    setConfigSecret(`ghsec:${name}`, value);
    return { success: true };
  } catch (err) {
    console.error('Failed to update GitHub secret:', err);
    return { error: 'Failed to update GitHub secret' };
  }
}

/**
 * Delete a GitHub repo secret.
 * @param {string} name - Secret name to delete
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function deleteGitHubSecret(name) {
  await requireAuth();
  try {
    const { deleteSecret } = await import('../github-api.js');
    const { deleteConfigSecret } = await import('../db/config.js');
    await deleteSecret(name);
    deleteConfigSecret(`ghsec:${name}`);
    return { success: true };
  } catch (err) {
    console.error('Failed to delete GitHub secret:', err);
    return { error: 'Failed to delete GitHub secret' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Variables actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List GitHub repo variables (values included).
 * @returns {Promise<Array<{name: string, value: string, created_at: string, updated_at: string}>>}
 */
export async function listGitHubVariables() {
  await requireAuth();
  try {
    const { listVariables } = await import('../github-api.js');
    return await listVariables();
  } catch (err) {
    console.error('Failed to list GitHub variables:', err);
    return { error: 'Failed to list GitHub variables' };
  }
}

/**
 * Create a new GitHub repo variable.
 * @param {string} name - Variable name
 * @param {string} value - Variable value
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function createGitHubVariable(name, value) {
  await requireAuth();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    return { error: 'Name must contain only uppercase letters, digits, and underscores' };
  }
  try {
    const { createVariable } = await import('../github-api.js');
    await createVariable(name, value);
    return { success: true };
  } catch (err) {
    console.error('Failed to create GitHub variable:', err);
    return { error: 'Failed to create GitHub variable' };
  }
}

/**
 * Update a GitHub repo variable.
 * @param {string} name - Variable name
 * @param {string} value - New value
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function updateGitHubVariable(name, value) {
  await requireAuth();
  try {
    const { updateVariable } = await import('../github-api.js');
    await updateVariable(name, value);
    return { success: true };
  } catch (err) {
    console.error('Failed to update GitHub variable:', err);
    return { error: 'Failed to update GitHub variable' };
  }
}

/**
 * Delete a GitHub repo variable.
 * @param {string} name - Variable name to delete
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function deleteGitHubVariable(name) {
  await requireAuth();
  try {
    const { deleteVariable } = await import('../github-api.js');
    await deleteVariable(name);
    return { success: true };
  } catch (err) {
    console.error('Failed to delete GitHub variable:', err);
    return { error: 'Failed to delete GitHub variable' };
  }
}

/**
 * Update the authenticated user's password.
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function updatePassword(currentPassword, newPassword) {
  await requireAuth();
  try {
    const { auth: getAuth } = await import('../auth/index.js');
    const { getUserByEmail, verifyPassword, updateUserPassword } = await import('../db/users.js');
    const session = await getAuth();
    const user = getUserByEmail(session.user.email);
    if (!user) return { error: 'User not found' };
    const valid = await verifyPassword(user, currentPassword);
    if (!valid) return { error: 'Current password is incorrect' };
    updateUserPassword(user.id, newPassword);
    return { success: true };
  } catch {
    return { error: 'Failed to update password' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent identity actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the agent name from SOUL.md first line, INSTANCE_NAME env, or 'ClawForge'.
 * Not auth-gated — agent name is not sensitive.
 * @returns {Promise<string>}
 */
export async function getAgentName() {
  try {
    const { soulMd } = await import('../paths.js');
    const fs = await import('fs');
    const content = fs.readFileSync(soulMd, 'utf8');
    const match = content.match(/^#\s+(\S+)/);
    if (match) return match[1];
    if (process.env.INSTANCE_NAME) return process.env.INSTANCE_NAME;
    return 'ClawForge';
  } catch {
    if (process.env.INSTANCE_NAME) return process.env.INSTANCE_NAME;
    return 'ClawForge';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo management actions (admin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all repos from the DB (admin-only).
 * @returns {Promise<object[]>}
 */
export async function getRepoList() {
  await requireAdmin();
  try {
    const { getRepos } = await import('../db/repos.js');
    return getRepos();
  } catch {
    return [];
  }
}

/**
 * Add a new repo (admin-only).
 * @param {object} repoData
 * @returns {Promise<{success: boolean, repo: object} | {error: string}>}
 */
export async function addRepoAction(repoData) {
  await requireAdmin();
  try {
    const { addRepo } = await import('../db/repos.js');
    const result = addRepo(repoData);
    if (result.error) return { error: result.error };
    return { success: true, repo: result.repo };
  } catch (err) {
    return { error: err.message || 'Failed to add repo' };
  }
}

/**
 * Update an existing repo (admin-only).
 * @param {string} slug
 * @param {object} updates
 * @returns {Promise<{success: boolean, repo: object} | {error: string}>}
 */
export async function updateRepoAction(slug, updates) {
  await requireAdmin();
  try {
    const { updateRepo } = await import('../db/repos.js');
    const result = updateRepo(slug, updates);
    if (result.error) return { error: result.error };
    return { success: true, repo: result.repo };
  } catch (err) {
    return { error: err.message || 'Failed to update repo' };
  }
}

/**
 * Delete a repo (admin-only).
 * @param {string} slug
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function deleteRepoAction(slug) {
  await requireAdmin();
  try {
    const { deleteRepo } = await import('../db/repos.js');
    const deleted = deleteRepo(slug);
    if (!deleted) return { error: `Repo "${slug}" not found` };
    return { success: true };
  } catch (err) {
    return { error: err.message || 'Failed to delete repo' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config management actions (admin)
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_ALLOWLIST = [
  'LLM_PROVIDER',
  'LLM_MODEL',
  'JOB_TIMEOUT_MS',
  'ASSEMBLYAI_API_KEY',
  'BRAVE_API_KEY',
  'SLACK_REQUIRE_MENTION',
  'AUTO_MERGE_ENABLED',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_API_KEY',
];

const SECRET_KEYS = ['ASSEMBLYAI_API_KEY', 'BRAVE_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'];

/**
 * Get all editable config values (admin-only).
 * Returns object keyed by config name with current values.
 * @returns {Promise<Record<string, string|null>>}
 */
export async function getConfigValues() {
  await requireAdmin();
  try {
    const { getConfigValue, getConfigSecret } = await import('../db/config.js');
    const values = {};
    for (const key of CONFIG_ALLOWLIST) {
      if (SECRET_KEYS.includes(key)) {
        const val = getConfigSecret(key);
        // Mask secrets — show only last 4 chars
        values[key] = val ? '****' + val.slice(-4) : null;
      } else {
        // Check DB first, then fall back to env
        const dbVal = getConfigValue(key);
        values[key] = dbVal !== null ? dbVal : (process.env[key] || null);
      }
    }
    return values;
  } catch {
    return {};
  }
}

/**
 * Update a single config value (admin-only).
 * @param {string} key
 * @param {string} value
 * @param {boolean} [isSecret=false]
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function updateConfigAction(key, value, isSecret = false) {
  await requireAdmin();
  if (!CONFIG_ALLOWLIST.includes(key)) {
    return { error: `Config key "${key}" is not editable` };
  }
  try {
    const { setConfigValue, setConfigSecret } = await import('../db/config.js');
    if (isSecret || SECRET_KEYS.includes(key)) {
      setConfigSecret(key, value);
    } else {
      setConfigValue(key, value);
    }
    return { success: true };
  } catch (err) {
    return { error: err.message || 'Failed to update config' };
  }
}

/**
 * Detect which auth method job containers will use.
 * Reads AGENT_LLM_SECRETS env var to check for token presence.
 * @returns {Promise<{method: string, detail: string}>}
 */
export async function getJobAuthMethod() {
  await requireAdmin();
  try {
    // Check DB-stored secrets first, then fall back to env
    const { getConfigSecret } = await import('../db/config.js');
    const dbOAuth = getConfigSecret('CLAUDE_CODE_OAUTH_TOKEN');
    const dbApiKey = getConfigSecret('ANTHROPIC_API_KEY');

    // Also check env-based secrets (legacy / docker-compose .env)
    const envSecrets = JSON.parse(process.env.AGENT_LLM_SECRETS || '{}');

    const hasOAuth = !!dbOAuth || !!envSecrets.CLAUDE_CODE_OAUTH_TOKEN;
    const hasApiKey = !!dbApiKey || !!envSecrets.ANTHROPIC_API_KEY;
    const oauthSource = dbOAuth ? 'DB' : envSecrets.CLAUDE_CODE_OAUTH_TOKEN ? 'env' : null;
    const apiKeySource = dbApiKey ? 'DB' : envSecrets.ANTHROPIC_API_KEY ? 'env' : null;

    if (hasOAuth && hasApiKey) {
      return { method: 'subscription', detail: `CLAUDE_CODE_OAUTH_TOKEN (${oauthSource}) + ANTHROPIC_API_KEY fallback (${apiKeySource})` };
    }
    if (hasOAuth) {
      return { method: 'subscription', detail: `CLAUDE_CODE_OAUTH_TOKEN (${oauthSource})` };
    }
    if (hasApiKey) {
      return { method: 'api-key', detail: `ANTHROPIC_API_KEY (${apiKeySource})` };
    }
    return { method: 'none', detail: 'No auth configured — set via Admin > General' };
  } catch {
    return { method: 'unknown', detail: 'Could not read auth config' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Instance overview actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get overview of all instances (auth-gated).
 * Reads instance directories and checks Docker for active job counts.
 * @returns {Promise<object[]>}
 */
export async function getInstancesOverview() {
  await requireAuth();
  try {
    const fs = (await import('fs')).default;
    const path = (await import('path')).default;
    const { PROJECT_ROOT } = await import('../paths.js');

    const instancesDir = path.join(PROJECT_ROOT, 'instances');
    const currentInstance = process.env.INSTANCE_NAME || 'default';
    const instances = [];

    let dirs = [];
    try {
      dirs = fs.readdirSync(instancesDir).filter((d) => {
        return fs.statSync(path.join(instancesDir, d)).isDirectory();
      });
    } catch {
      // No instances directory — return single instance entry
      dirs = [];
    }

    if (dirs.length === 0) {
      // Single-instance mode — read agent name from SOUL.md
      const { loadAllowedRepos } = await import('../tools/repos.js');
      const repos = loadAllowedRepos();
      let agentName = currentInstance;
      try {
        const { soulMd } = await import('../paths.js');
        const soulContent = fs.readFileSync(soulMd, 'utf8');
        const nameMatch = soulContent.match(/^#\s+(\S+)/);
        if (nameMatch) agentName = nameMatch[1];
      } catch {}
      instances.push({
        name: agentName,
        instanceId: currentInstance,
        isCurrent: true,
        status: 'online',
        repos: repos.map((r) => r.name || r.slug),
        activeJobs: 0,
      });
      return instances;
    }

    for (const dir of dirs) {
      const configPath = path.join(instancesDir, dir, 'config', 'REPOS.json');
      let repos = [];
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        repos = (parsed.repos || []).map((r) => r.name || r.slug);
      } catch {
        // No REPOS.json — empty list
      }

      let activeJobs = 0;
      try {
        const { getDocker } = await import('../tools/docker.js');
        const docker = getDocker();
        if (docker) {
          const containers = await docker.listContainers({
            filters: { label: [`clawforge.instance=${dir}`], status: ['running'] },
          });
          activeJobs = containers.length;
        }
      } catch {
        // Docker not available
      }

      // Read agent name from SOUL.md (first word after #)
      let agentName = dir;
      try {
        const soulPath = path.join(instancesDir, dir, 'config', 'SOUL.md');
        const soulContent = fs.readFileSync(soulPath, 'utf8');
        const nameMatch = soulContent.match(/^#\s+(\S+)/);
        if (nameMatch) agentName = nameMatch[1];
      } catch {
        // No SOUL.md — use directory name
      }

      instances.push({
        name: agentName,
        instanceId: dir,
        isCurrent: dir === currentInstance,
        status: dir === currentInstance ? 'online' : 'unknown',
        repos,
        activeJobs,
      });
    }

    return instances;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice input actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a temporary AssemblyAI token for real-time transcription.
 * Only the token touches the server — audio flows browser-to-AssemblyAI directly.
 * @returns {Promise<{ token: string } | { error: string }>}
 */
export async function getVoiceToken() {
  await requireAuth();
  try {
    const { getConfig } = await import('../config.js');
    const apiKey = getConfig('ASSEMBLYAI_API_KEY');
    if (!apiKey) {
      return { error: 'Voice input not configured' };
    }
    const res = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60', {
      method: 'POST',
      headers: { Authorization: apiKey },
    });
    if (!res.ok) {
      return { error: 'Failed to get voice token' };
    }
    const { token } = await res.json();
    return { token };
  } catch {
    return { error: 'Voice token error' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Superadmin actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get aggregated dashboard data from all registered instances.
 * Queries health and stats endpoints in parallel.
 * @returns {Promise<{ instances: Array<object> } | { error: string }>}
 */
export async function getSuperadminDashboard() {
  await requireSuperadmin();
  try {
    const { queryAllInstances } = await import('../superadmin/client.js');
    const [healthResults, statsResults] = await Promise.all([
      queryAllInstances('health'),
      queryAllInstances('stats'),
    ]);

    // Merge health + stats per instance
    const instances = healthResults.map((h) => {
      const stats = statsResults.find((s) => s.instance === h.instance);
      return {
        name: h.instance,
        status: h.data?.status || 'offline',
        uptime: h.data?.uptime || null,
        error: h.error || stats?.error || null,
        activeJobs: stats?.data?.activeJobs ?? 0,
        lastJobAt: stats?.data?.lastJobAt || null,
        repoCount: stats?.data?.repoCount ?? 0,
        userCount: stats?.data?.userCount ?? 0,
      };
    });

    return { instances };
  } catch {
    return { error: 'Failed to load superadmin dashboard' };
  }
}

/**
 * Get aggregated monitoring data from all registered instances.
 * Merges health, usage, and onboarding data per instance for the monitoring dashboard (MON-01).
 * @returns {Promise<{ instances: Array<object> } | { error: string }>}
 */
export async function getMonitoringDashboard() {
  await requireSuperadmin();
  try {
    const { queryAllInstances } = await import('../superadmin/client.js');
    const [healthResults, usageResults, onboardingResults] = await Promise.all([
      queryAllInstances('health'),
      queryAllInstances('usage'),
      queryAllInstances('onboarding'),
    ]);

    // Merge health + usage + onboarding per instance
    const instances = healthResults.map((h) => {
      const usage = usageResults.find((u) => u.instance === h.instance);
      const onboarding = onboardingResults.find((o) => o.instance === h.instance);
      const usageData = usage?.data || {};
      const onboardingData = onboarding?.data?.onboarding || {};
      return {
        name: h.instance,
        status: h.data?.status || 'offline',
        errorCount24h: h.data?.errorCount24h ?? null,
        lastErrorAt: h.data?.lastErrorAt ?? null,
        jobSuccessRate: h.data?.jobSuccessRate ?? null,
        usage: {
          jobsDispatched: usageData.jobsDispatched ?? null,
          totalDurationSeconds: usageData.totalDurationSeconds ?? null,
          limits: usageData.limits ?? null,
        },
        onboarding: {
          currentStep: onboardingData.currentStep ?? null,
          completedAt: onboardingData.completedAt ?? null,
          githubConnect: onboardingData.githubConnect ?? null,
          dockerVerify: onboardingData.dockerVerify ?? null,
          channelConnect: onboardingData.channelConnect ?? null,
          firstJob: onboardingData.firstJob ?? null,
        },
        error: h.error || usage?.error || onboarding?.error || null,
      };
    });

    return { instances };
  } catch {
    return { error: 'Failed to load monitoring dashboard' };
  }
}

/**
 * Search jobs across all registered instances.
 * @param {{ repo?: string, status?: string, q?: string }} filters
 * @returns {Promise<{ jobs: Array<object> } | { error: string }>}
 */
export async function searchJobsAcrossInstances(filters = {}) {
  await requireSuperadmin();
  try {
    const { queryAllInstances } = await import('../superadmin/client.js');
    const results = await queryAllInstances('jobs', filters);

    // Flatten all jobs from all instances, sorted by createdAt desc
    const allJobs = [];
    for (const result of results) {
      if (result.data?.jobs) {
        allJobs.push(...result.data.jobs);
      }
    }

    allJobs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return { jobs: allJobs };
  } catch {
    return { error: 'Failed to search jobs' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Support guides actions
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORT_GUIDES = [
  { slug: 'operator-guide', title: 'Getting Started', filename: 'OPERATOR_GUIDE.md' },
  { slug: 'configuration', title: 'Settings & Configuration', filename: 'CONFIGURATION.md' },
  { slug: 'deployment', title: 'Deploying Your Instance', filename: 'DEPLOYMENT.md' },
  { slug: 'architecture', title: 'How It Works', filename: 'ARCHITECTURE.md' },
  { slug: 'security', title: 'Keeping Your Instance Safe', filename: 'SECURITY.md' },
  { slug: 'chat-integrations', title: 'Connecting Slack & Telegram', filename: 'CHAT_INTEGRATIONS.md' },
  { slug: 'voice', title: 'Using Voice Input', filename: 'VOICE.md' },
  { slug: 'code-workspaces', title: 'Interactive Code Sessions', filename: 'CODE_WORKSPACES_V2.md' },
  { slug: 'admin-panel', title: 'Admin Settings Guide', filename: 'ADMIN_PANEL.md' },
  { slug: 'auto-merge', title: 'Auto-Merge Rules', filename: 'AUTO_MERGE.md' },
  { slug: 'customization', title: 'Customizing Your Agent', filename: 'CUSTOMIZATION.md' },
  { slug: 'subagents', title: 'Using Subagents', filename: 'SUBAGENTS.md' },
];

/**
 * Get all support guide files from the docs/ directory.
 * Returns array of { slug, title, content } objects.
 * @returns {Promise<Array<{ slug: string, title: string, content: string }>>}
 */
export async function getSupportGuides() {
  await requireAuth();
  const fs = (await import('fs')).default;
  const path = (await import('path')).default;
  const docsDir = path.join(process.cwd(), 'docs');
  const guides = [];
  for (const guide of SUPPORT_GUIDES) {
    const filePath = path.join(docsDir, guide.filename);
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      content = `_Guide not found: ${guide.filename}_`;
    }
    guides.push({ slug: guide.slug, title: guide.title, content });
  }
  return guides;
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get billing usage summary and limits for the current instance.
 * Available to any admin.
 * @returns {Promise<{ instance: string, period: string, summary: object, limits: object }>}
 */
export async function getBillingUsage() {
  await requireAdmin();
  const { getUsageSummary, getBillingLimits } = await import('../db/usage.js');
  const periodMonth = new Date().toISOString().slice(0, 7);
  const instanceName = process.env.INSTANCE_NAME || 'default';
  const summary = getUsageSummary(instanceName, periodMonth);
  const limits = getBillingLimits(instanceName);
  return {
    instance: instanceName,
    period: periodMonth,
    summary: { jobCount: summary.jobCount, totalDurationSeconds: summary.totalDurationSeconds },
    limits: { jobsPerMonth: limits.jobsPerMonth, concurrentJobs: limits.concurrentJobs },
  };
}

/**
 * Set billing limits for the current instance.
 * Restricted to superadmins only.
 * @param {{ jobsPerMonth?: number|null, concurrentJobs?: number|null }} limits
 * @returns {Promise<{ success: boolean }>}
 */
export async function setBillingLimits({ jobsPerMonth, concurrentJobs }) {
  await requireSuperadmin();
  const { upsertBillingLimit } = await import('../db/usage.js');
  const instanceName = process.env.INSTANCE_NAME || 'default';
  if (jobsPerMonth !== undefined && jobsPerMonth !== null) {
    upsertBillingLimit(instanceName, 'jobs_per_month', Number(jobsPerMonth));
  }
  if (concurrentJobs !== undefined && concurrentJobs !== null) {
    upsertBillingLimit(instanceName, 'concurrent_jobs', Number(concurrentJobs));
  }
  return { success: true };
}

/**
 * Get instance names from the registry (without exposing tokens).
 * @returns {Promise<{ instances: Array<{ name: string, isLocal: boolean }> } | { error: string }>}
 */
export async function getInstanceRegistryAction() {
  await requireSuperadmin();
  try {
    const { getInstanceRegistry } = await import('../superadmin/config.js');
    const registry = getInstanceRegistry();
    return {
      instances: registry.map((i) => ({
        name: i.name,
        isLocal: i.url === null,
      })),
    };
  } catch {
    return { error: 'Failed to load instance registry' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding Server Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the GitHub PAT and mark the github_connect step complete on success.
 * @returns {{ success: boolean, login?: string, error?: string }}
 */
export async function verifyOnboardingGithub() {
  await requireAuth();
  const { verifyGithubPat } = await import('../onboarding/verify.js');
  const { upsertOnboardingStep } = await import('../onboarding/state.js');
  const result = await verifyGithubPat();
  if (result.success) {
    upsertOnboardingStep('github_connect', 'complete');
  }
  return result;
}

/**
 * Verify the Docker socket and mark the docker_verify step complete on success.
 * @returns {{ success: boolean, error?: string }}
 */
export async function verifyOnboardingDocker() {
  await requireAuth();
  const { verifyDockerSocket } = await import('../onboarding/verify.js');
  const { upsertOnboardingStep } = await import('../onboarding/state.js');
  const result = await verifyDockerSocket();
  if (result.success) {
    upsertOnboardingStep('docker_verify', 'complete');
  }
  return result;
}

/**
 * Verify a Slack incoming webhook URL and mark the channel_connect step complete on success.
 * @param {string} webhookUrl - The Slack incoming webhook URL to test
 * @returns {{ success: boolean, error?: string }}
 */
export async function verifyOnboardingSlack(webhookUrl) {
  await requireAuth();
  const { verifySlackWebhook } = await import('../onboarding/verify.js');
  const { upsertOnboardingStep } = await import('../onboarding/state.js');
  const result = await verifySlackWebhook(webhookUrl);
  if (result.success) {
    upsertOnboardingStep('channel_connect', 'complete');
  }
  return result;
}

/**
 * Dispatch the first onboarding job and mark the wizard complete when a PR URL is returned.
 * @returns {{ success: boolean, prUrl?: string, jobId?: string, error?: string }}
 */
export async function dispatchOnboardingFirstJob() {
  await requireAuth();
  try {
    const { createJob } = await import('../tools/create-job.js');
    const { upsertOnboardingStep, markOnboardingComplete } = await import('../onboarding/state.js');
    const result = await createJob(
      'Onboarding verification: create a test file at onboarding-test.md confirming the agent pipeline works.'
    );
    // createJob returns { job_id, branch } — no prUrl until GitHub Actions creates the PR.
    // We treat job dispatch success as pipeline verification.
    if (result?.job_id) {
      upsertOnboardingStep('first_job', 'complete');
      markOnboardingComplete();
      return { success: true, jobId: result.job_id, branch: result.branch };
    }
    return { success: false, error: 'Job dispatch returned no job ID' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get the current onboarding state. Used by the client to poll for updated state.
 * @returns {object|null}
 */
export async function getOnboardingStatus() {
  await requireAuth();
  const { getOnboardingState } = await import('../onboarding/state.js');
  return getOnboardingState();
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster management actions (admin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save the entire cluster config (admin-only). Validates before writing.
 * @param {object} config - Full config object { clusters: [...] }
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function saveClusterConfigAction(config) {
  await requireAdmin();
  try {
    const { validateClusterConfig, saveClusterConfig } = await import('../cluster/config.js');
    const { valid, errors } = validateClusterConfig(config);
    if (!valid) {
      return { error: errors.join('; ') };
    }
    await saveClusterConfig(config);
    return { success: true };
  } catch (err) {
    return { error: err.message || 'Failed to save cluster config' };
  }
}

/**
 * Save a single cluster (create or update by name). Admin-only.
 * @param {object} clusterData - Cluster object with name, systemPrompt, roles, etc.
 * @param {string|null} originalName - Original cluster name (for rename/update); null for new.
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function saveClusterAction(clusterData, originalName) {
  await requireAdmin();
  try {
    const { loadClusterConfig, validateClusterConfig, saveClusterConfig } = await import('../cluster/config.js');
    const config = await loadClusterConfig();
    const clusters = config.clusters || [];

    if (originalName) {
      // Update existing cluster
      const idx = clusters.findIndex((c) => c.name === originalName);
      if (idx === -1) {
        return { error: `Cluster "${originalName}" not found` };
      }
      clusters[idx] = clusterData;
    } else {
      // Check for duplicate name
      if (clusters.some((c) => c.name === clusterData.name)) {
        return { error: `Cluster "${clusterData.name}" already exists` };
      }
      clusters.push(clusterData);
    }

    const newConfig = { ...config, clusters };
    const { valid, errors } = validateClusterConfig(newConfig);
    if (!valid) {
      return { error: errors.join('; ') };
    }

    await saveClusterConfig(newConfig);
    return { success: true };
  } catch (err) {
    return { error: err.message || 'Failed to save cluster' };
  }
}

/**
 * Delete a cluster by name. Admin-only.
 * @param {string} clusterName - Name of the cluster to delete.
 * @returns {Promise<{success: boolean} | {error: string}>}
 */
export async function deleteClusterAction(clusterName) {
  await requireAdmin();
  try {
    const { loadClusterConfig, saveClusterConfig } = await import('../cluster/config.js');
    const config = await loadClusterConfig();
    const clusters = (config.clusters || []).filter((c) => c.name !== clusterName);
    await saveClusterConfig({ ...config, clusters });
    return { success: true };
  } catch (err) {
    return { error: err.message || 'Failed to delete cluster' };
  }
}
