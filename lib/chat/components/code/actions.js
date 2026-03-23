'use server';

import { unauthorized, forbidden } from 'next/navigation';
import { auth } from '../../../auth/index.js';
import { getWorkspaceByChatId, linkChatToWorkspace } from '../../../db/workspaces.js';
import { ensureWorkspaceContainer } from '../../../tools/docker.js';
import { getConfigSecret } from '../../../db/config.js';

/**
 * Validate repoSlug is a valid owner/repo format.
 * @param {string} slug
 * @returns {boolean}
 */
function isValidRepoSlug(slug) {
  return typeof slug === 'string' && /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(slug);
}

/**
 * Launch or reuse a workspace for a chat session.
 * Calls ensureWorkspaceContainer (which handles dedup internally).
 * Links the workspace to the chat via codeWorkspaceId FK.
 *
 * @param {{ chatId: string, repoSlug: string }} params
 * @returns {Promise<{ workspaceId: string, reused: boolean }>}
 */
export async function launchWorkspace({ chatId, repoSlug }) {
  const session = await auth();
  if (!session?.user) unauthorized();
  if (session.user.role !== 'admin' && session.user.role !== 'superadmin') forbidden();

  if (!chatId) {
    throw new Error('chatId is required');
  }
  if (!isValidRepoSlug(repoSlug)) {
    throw new Error('repoSlug must be a valid owner/repo format (e.g. "owner/repo")');
  }

  // Check if chat already has a linked running workspace
  const existing = getWorkspaceByChatId(chatId);
  if (existing && (existing.status === 'running' || existing.status === 'starting' || existing.status === 'creating')) {
    return { workspaceId: existing.id, reused: true };
  }

  // Determine instance name from env (same pattern as job dispatch)
  const instanceName = process.env.INSTANCE_NAME || 'default';

  // Build repo URL from validated slug (owner/repo format)
  const repoUrl = `https://github.com/${repoSlug}.git`;

  // Build LLM secrets from DB + env for workspace auth
  const llmSecrets = JSON.parse(process.env.AGENT_LLM_SECRETS || '{}');
  try {
    const dbOAuth = getConfigSecret('CLAUDE_CODE_OAUTH_TOKEN');
    const dbApiKey = getConfigSecret('ANTHROPIC_API_KEY');
    if (dbOAuth) llmSecrets.CLAUDE_CODE_OAUTH_TOKEN = dbOAuth;
    if (dbApiKey) llmSecrets.ANTHROPIC_API_KEY = dbApiKey;
  } catch { /* DB not available */ }

  // Launch or reuse container via existing docker infrastructure
  const result = await ensureWorkspaceContainer({
    instanceName,
    repoUrl,
    repoSlug,
    secrets: { GH_TOKEN: process.env.GH_TOKEN },
    llmSecrets,
    threadId: chatId,
  });

  // Link workspace to chat
  await linkChatToWorkspace(chatId, result.workspace.id);

  return { workspaceId: result.workspace.id, reused: !result.created };
}

/**
 * Get the linked workspace for a chat, if any.
 *
 * @param {{ chatId: string }} params
 * @returns {Promise<{ workspace: object|null }>}
 */
export async function getLinkedWorkspace({ chatId }) {
  const session = await auth();
  if (!session?.user) unauthorized();

  if (!chatId) return { workspace: null };

  const ws = getWorkspaceByChatId(chatId);
  return { workspace: ws || null };
}
