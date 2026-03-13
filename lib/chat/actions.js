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
 * Get list of allowed repos configured for this instance.
 * @returns {Promise<Array<{ owner: string, slug: string, name: string, aliases: string[], dispatch: string }>>}
 */
export async function getRepos() {
  await requireAuth();
  const { loadAllowedRepos } = await import('../tools/repos.js');
  try {
    return loadAllowedRepos();
  } catch {
    return [];
  }
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

