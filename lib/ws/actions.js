'use server';

import { auth } from '../auth/config.js';
import { issueTicket } from './tickets.js';
import { getWorkspace } from '../db/workspaces.js';
import { spawnExtraShell, checkWorkspaceGitStatus } from '../tools/docker.js';

/**
 * Server Action to issue a terminal WebSocket ticket for an authenticated user.
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {number} [port=7681] - ttyd port inside the container
 * @returns {Promise<{ticket: string}>}
 */
export async function requestTerminalTicket(workspaceId, port = 7681) {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const ws = getWorkspace(workspaceId);
  if (!ws) {
    throw new Error('Workspace not found');
  }
  if (ws.status !== 'running') {
    throw new Error(`Workspace is not running (status: ${ws.status})`);
  }

  const ticket = issueTicket(workspaceId, port, session.user.id);
  return { ticket };
}

/**
 * Server Action to spawn an extra shell tab in a workspace container.
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {number} port - ttyd port (7682-7685)
 * @returns {Promise<{port: number}>}
 */
export async function requestSpawnShell(workspaceId, port) {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  return spawnExtraShell(workspaceId, port);
}

/**
 * Server Action to check workspace git status for unsaved changes.
 *
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<{hasUncommitted: boolean, uncommittedFiles: string[], hasUnpushed: boolean, unpushedCommits: string[], safe: boolean}>}
 */
export async function requestGitStatus(workspaceId) {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  return checkWorkspaceGitStatus(workspaceId);
}
