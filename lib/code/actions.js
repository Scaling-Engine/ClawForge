'use server';

import { auth } from '../auth/config.js';
import { unauthorized } from 'next/navigation';
import { getWorkspace } from '../db/workspaces.js';
import {
  addSession,
  getSession as getTermSession,
  getSessions,
  removeSession,
  getNextPort,
  clearWorkspaceSessions,
} from './terminal-sessions.js';

const RECOVERABLE_STATES = new Set(['exited', 'created', 'paused']);

async function requireAuth() {
  const session = await auth();
  if (!session?.user) unauthorized();
  return session.user;
}

/**
 * Ensure a workspace container is running.
 * Recovers stopped/removed containers via Docker startContainer.
 * @param {string} id - Workspace ID
 * @returns {Promise<{status: string, message?: string}>}
 */
export async function ensureCodeWorkspaceContainer(id) {
  await requireAuth();
  const workspace = getWorkspace(id);
  if (!workspace) {
    return { status: 'error', message: 'Workspace not found' };
  }

  if (!workspace.containerName) {
    return { status: 'no_container' };
  }

  try {
    const { getDocker } = await import('../tools/docker.js');
    const docker = getDocker();
    if (!docker) return { status: 'error', message: 'Docker not available' };

    const container = docker.getContainer(workspace.containerName);
    let info;
    try {
      info = await container.inspect();
    } catch (err) {
      if (err.statusCode === 404) {
        return { status: 'error', message: 'Container not found — workspace may need to be recreated' };
      }
      throw err;
    }

    const state = info.State?.Status;

    if (state === 'running') {
      return { status: 'running' };
    }

    if (RECOVERABLE_STATES.has(state)) {
      try {
        await container.start();
        return { status: 'started' };
      } catch {
        // Start failed — report error
      }
    }

    return { status: 'error', message: `Container in unrecoverable state: ${state}` };
  } catch (err) {
    console.error(`[ensureCodeWorkspaceContainer] workspace=${id}`, err);
    return { status: 'error', message: err.message };
  }
}

/**
 * Get git status from a running workspace container.
 * @param {string} id - Workspace ID
 */
export async function getContainerGitStatus(id) {
  await requireAuth();
  const workspace = getWorkspace(id);
  if (!workspace || !workspace.containerName) return null;

  try {
    const { checkWorkspaceGitStatus } = await import('../tools/docker.js');
    const result = await checkWorkspaceGitStatus(id);
    return {
      uncommitted: result.uncommittedFiles.join('\n'),
      commits: result.unpushedCommits.join('\n'),
      hasUnsavedWork: !result.safe,
    };
  } catch (err) {
    console.error(`[getContainerGitStatus] workspace=${id}`, err);
    return null;
  }
}

/**
 * Close interactive mode: stop the workspace container and navigate back.
 * @param {string} id - Workspace ID
 * @param {boolean} isClean
 */
export async function closeInteractiveMode(id, isClean) {
  await requireAuth();
  const workspace = getWorkspace(id);
  if (!workspace) {
    return { success: false, message: 'Workspace not found' };
  }

  try {
    const { closeWorkspace } = await import('../tools/docker.js');
    await closeWorkspace(id);
    clearWorkspaceSessions(id);
    return { success: true, chatId: workspace.threadId || null };
  } catch (err) {
    console.error(`[closeInteractiveMode] workspace=${id}`, err);
    return { success: false, message: err.message };
  }
}

/**
 * Scan a container for running ttyd processes via pgrep.
 * Returns an array of { pid, port, type } for extra tabs (excludes port 7681 primary).
 */
async function scanContainerTtyd(containerName, docker) {
  try {
    const container = docker.getContainer(containerName);
    const exec = await container.exec({
      Cmd: ['sh', '-c', 'pgrep -a ttyd 2>/dev/null || true'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    const raw = await new Promise((resolve, reject) => {
      let output = '';
      stream.on('data', (chunk) => { output += chunk.toString('utf8'); });
      stream.on('end', () => resolve(output));
      stream.on('error', reject);
      setTimeout(() => resolve(output), 5000);
    });

    if (!raw || !raw.trim()) return [];

    const results = [];
    for (const line of raw.trim().split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const pid = parseInt(trimmed.split(/\s+/)[0], 10);
      if (isNaN(pid)) continue;
      const portMatch = trimmed.match(/-p\s+(\d+)/);
      if (!portMatch) continue;
      const port = parseInt(portMatch[1], 10);
      if (port === 7681) continue;
      const type = (trimmed.includes('claude') || trimmed.includes(' pi') || trimmed.includes('gemini') || trimmed.includes('codex') || trimmed.includes('opencode')) ? 'code' : 'shell';
      results.push({ pid, port, type });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Create a new shell terminal session inside the workspace container.
 * @param {string} id - Workspace ID
 * @param {string} type - 'shell' or 'code'
 */
export async function createTerminalSession(id, type = 'shell') {
  await requireAuth();
  const workspace = getWorkspace(id);
  if (!workspace || !workspace.containerName) {
    return { success: false, message: 'Workspace not found or not running' };
  }

  try {
    const { getDocker } = await import('../tools/docker.js');
    const docker = getDocker();
    if (!docker) return { success: false, message: 'Docker not available' };

    const scanned = await scanContainerTtyd(workspace.containerName, docker);
    const scannedPorts = new Set(scanned.map(s => s.port));

    const port = getNextPort(id, scannedPorts);
    if (!port) {
      return { success: false, message: 'Too many terminal sessions' };
    }

    const { randomUUID } = await import('crypto');

    const command = type === 'code'
      ? `nohup ttyd --writable -p ${port} bash -c 'cd /workspace && exec claude --dangerously-skip-permissions' > /dev/null 2>&1 &`
      : `nohup ttyd --writable -p ${port} bash -c 'cd /workspace && exec bash' > /dev/null 2>&1 &`;

    const container = docker.getContainer(workspace.containerName);
    const exec = await container.exec({
      Cmd: ['sh', '-c', command],
      AttachStdout: false,
      AttachStderr: false,
      Detach: true,
    });
    await exec.start({ Detach: true });

    // Wait for ttyd to bind
    await new Promise((r) => setTimeout(r, 800));

    const sessionId = randomUUID().slice(0, 8);
    const existing = getSessions(id);
    let typeCount = 0;
    for (const s of existing.values()) {
      if ((s.type || 'shell') === type) typeCount++;
    }
    const label = type === 'code'
      ? `Code ${typeCount + 2}`
      : `Shell ${typeCount + 1}`;

    addSession(id, sessionId, { port, pid: null, label, type, createdAt: Date.now() });

    return { success: true, sessionId, label, type };
  } catch (err) {
    console.error(`[createTerminalSession] workspace=${id}`, err);
    return { success: false, message: err.message };
  }
}

/**
 * Close a shell terminal session.
 * @param {string} id - Workspace ID
 * @param {string} sessionId - Session ID
 */
export async function closeTerminalSession(id, sessionId) {
  await requireAuth();
  const workspace = getWorkspace(id);
  if (!workspace) {
    return { success: false };
  }

  const session = getTermSession(id, sessionId);
  if (!session) {
    return { success: false };
  }

  try {
    const { getDocker } = await import('../tools/docker.js');
    const docker = getDocker();
    if (docker && workspace.containerName && session.pid) {
      const container = docker.getContainer(workspace.containerName);
      const exec = await container.exec({
        Cmd: ['kill', String(session.pid)],
        AttachStdout: false,
        AttachStderr: false,
      });
      await exec.start({ Detach: true }).catch(() => {});
    }
  } catch {
    // Best effort
  }

  removeSession(id, sessionId);
  return { success: true };
}

/**
 * List terminal sessions for a workspace.
 * @param {string} id - Workspace ID
 */
export async function listTerminalSessions(id) {
  await requireAuth();
  const workspace = getWorkspace(id);
  if (!workspace) {
    return { success: false, sessions: [] };
  }

  if (!workspace.containerName) {
    clearWorkspaceSessions(id);
    return { success: true, sessions: [] };
  }

  try {
    const { getDocker } = await import('../tools/docker.js');
    const docker = getDocker();
    if (!docker) return { success: true, sessions: [] };

    const scanned = await scanContainerTtyd(workspace.containerName, docker);
    const scannedByPort = new Map();
    for (const s of scanned) {
      scannedByPort.set(s.port, s);
    }

    const existing = getSessions(id);
    const result = [];
    const matchedPorts = new Set();

    for (const [sessionId, session] of existing) {
      if (scannedByPort.has(session.port)) {
        result.push({ id: sessionId, label: session.label, type: session.type || 'shell' });
        matchedPorts.add(session.port);
      } else {
        removeSession(id, sessionId);
      }
    }

    return { success: true, sessions: result };
  } catch {
    clearWorkspaceSessions(id);
    return { success: true, sessions: [] };
  }
}
