'use server';

import { unauthorized } from 'next/navigation';
import { auth } from '../auth/config.js';
import { issueTicket } from './tickets.js';
import { getWorkspace } from '../db/workspaces.js';
import { spawnExtraShell, checkWorkspaceGitStatus, closeWorkspace, listWorkspaceFiles, readWorkspaceFile } from '../tools/docker.js';

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
    unauthorized();
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
    unauthorized();
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
    unauthorized();
  }

  return checkWorkspaceGitStatus(workspaceId);
}

/**
 * Server Action to list files in a workspace container's directory tree.
 * Non-critical feature — returns empty array on error.
 *
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<Array<{type: string, path: string}>>}
 */
export async function requestFileTree(workspaceId) {
  const session = await auth();
  if (!session?.user) {
    unauthorized();
  }

  try {
    return await listWorkspaceFiles(workspaceId);
  } catch (err) {
    console.warn('requestFileTree failed:', err.message);
    return [];
  }
}

/**
 * Server Action to read a file's content from a workspace container.
 * Non-critical feature — returns error message on failure.
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {string} filePath - Absolute path inside the container
 * @returns {Promise<{ content: string, truncated: boolean, error: string|null }>}
 */
export async function requestFileContent(workspaceId, filePath) {
  const session = await auth();
  if (!session?.user) {
    unauthorized();
  }

  try {
    const result = await readWorkspaceFile(workspaceId, filePath);
    return { ...result, error: null };
  } catch (err) {
    console.warn('requestFileContent failed:', err.message);
    return { content: '', truncated: false, error: err.message };
  }
}

/**
 * Server Action to close a workspace: stop container + notify originating thread with commits.
 * Fire-and-forget from the browser's perspective -- does not block navigation.
 *
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function closeWorkspaceAction(workspaceId) {
  const session = await auth();
  if (!session?.user) {
    unauthorized();
  }

  const ws = getWorkspace(workspaceId);
  if (!ws) {
    throw new Error('Workspace not found');
  }

  // closeWorkspace handles stop + commit collection + notification internally
  return closeWorkspace(workspaceId);
}
