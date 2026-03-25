'use server';

import { auth } from '../auth/config.js';
import { unauthorized } from 'next/navigation';
import { getWorkspace, updateWorkspace } from '../db/workspaces.js';
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
 * Recreate a workspace container from the DB record.
 * Reuses the existing volume so workspace data persists across container replacements.
 * @param {object} workspace - Workspace DB row
 * @returns {Promise<void>}
 * @private
 */
async function _recreateContainer(workspace) {
  const { getDocker } = await import('../tools/docker.js');
  const docker = getDocker();
  if (!docker) throw new Error('Docker not available');

  const image = process.env.WORKSPACE_IMAGE || 'scalingengine/clawforge:workspace-latest';

  // Build env vars matching ensureWorkspaceContainer behavior
  const env = [
    `REPO_URL=${workspace.repoUrl || ''}`,
    `BRANCH=main`,
    `INSTANCE_NAME=${workspace.instanceName || ''}`,
  ];
  if (workspace.featureBranch) {
    env.push(`FEATURE_BRANCH=${workspace.featureBranch}`);
  }

  // Pass through GH_TOKEN if available (from config chain or env)
  const { getConfig } = await import('../config.js');
  const ghToken = getConfig('GH_TOKEN') || process.env.GH_TOKEN;
  if (ghToken) env.push(`GH_TOKEN=${ghToken}`);

  // Remove old container (by name and ID) to avoid name conflicts on recreation
  for (const ref of [workspace.containerName, workspace.containerId].filter(Boolean)) {
    try {
      const old = docker.getContainer(ref);
      await old.remove({ force: true });
    } catch {
      // Already gone — that's fine
    }
  }

  // Generate new container name but keep the same workspace ID and volume
  const shortId = workspace.id.slice(0, 8);
  const containerName = `clawforge-ws-${workspace.instanceName}-${shortId}`;
  const volName = workspace.volumeName;

  const mounts = volName ? [{
    Type: 'volume',
    Source: volName,
    Target: '/workspace',
    ReadOnly: false,
  }] : [];

  const container = await docker.createContainer({
    name: containerName,
    Image: image,
    Env: env,
    ExposedPorts: { '7681/tcp': {} },
    Labels: {
      'clawforge': 'workspace',
      'clawforge.instance': workspace.instanceName || '',
      'clawforge.repo': workspace.repoSlug || '',
      'clawforge.workspace_id': workspace.id,
      'clawforge.created_at': new Date().toISOString(),
    },
    Healthcheck: {
      Test: ['CMD', 'curl', '-sf', 'http://localhost:7681/'],
      Interval: 30 * 1e9,
      Timeout: 5 * 1e9,
      Retries: 3,
      StartPeriod: 10 * 1e9,
    },
    HostConfig: {
      NetworkMode: process.env.DOCKER_NETWORK || `${workspace.instanceName}-net`,
      RestartPolicy: { Name: 'unless-stopped' },
      Memory: 2 * 1024 * 1024 * 1024,
      CpuPeriod: 100000,
      CpuQuota: 100000,
      Mounts: mounts,
    },
  });

  await container.start();

  updateWorkspace(workspace.id, {
    status: 'running',
    containerId: container.id,
    containerName,
    lastActivityAt: Date.now(),
  });

  clearWorkspaceSessions(workspace.id);

  console.log(`[ensureCodeWorkspaceContainer] recreated container ${containerName} for workspace ${workspace.id.slice(0, 8)}`);
}

/**
 * Ensure a workspace container is running.
 * Automatically recovers stopped, crashed, or missing containers by recreating them
 * (matching upstream thepopebot behavior). The workspace volume is reused so data persists.
 *
 * @param {string} id - Workspace ID
 * @returns {Promise<{status: string, message?: string}>}
 */
export async function ensureCodeWorkspaceContainer(id) {
  await requireAuth();
  const workspace = getWorkspace(id);
  if (!workspace) {
    return { status: 'error', message: 'Workspace not found' };
  }

  // Workspaces in 'destroyed' state with no container have no recovery path
  // (volume was removed). For other error states, try to recover.
  if (!workspace.containerName && workspace.status === 'destroyed') {
    return { status: 'error', message: 'Workspace was destroyed. Create a new workspace.' };
  }

  try {
    const { getDocker } = await import('../tools/docker.js');
    const docker = getDocker();
    if (!docker) return { status: 'error', message: 'Docker not available' };

    // --- Check actual container state ---
    let info = null;
    if (workspace.containerName) {
      try {
        const container = docker.getContainer(workspace.containerName);
        info = await container.inspect();
      } catch (err) {
        if (err.statusCode !== 404) throw err;
        // Container not found (404) — will recreate below
        console.log(`[ensureCodeWorkspaceContainer] container ${workspace.containerName} not found, will recreate`);
      }
    }

    if (!info) {
      // Container missing — recreate from workspace record
      await _recreateContainer(workspace);
      return { status: 'created' };
    }

    const state = info.State?.Status;
    const restartCount = info.RestartCount || 0;

    // Detect crash-looping containers: if Docker keeps restarting them (> 3 times),
    // the image is likely stale/broken. Remove and recreate with current image.
    if (restartCount > 3 || state === 'dead') {
      console.log(`[ensureCodeWorkspaceContainer] container ${workspace.containerName} is crash-looping (state=${state}, restarts=${restartCount}), replacing`);
      await _recreateContainer(workspace);
      return { status: 'created' };
    }

    if (state === 'running') {
      // Sync DB status if it drifted
      if (workspace.status !== 'running') {
        updateWorkspace(id, { status: 'running', lastActivityAt: Date.now() });
      }
      return { status: 'running' };
    }

    if (RECOVERABLE_STATES.has(state)) {
      try {
        const container = docker.getContainer(workspace.containerName);
        await container.start();
        updateWorkspace(id, { status: 'running', lastActivityAt: Date.now() });
        return { status: 'started' };
      } catch {
        // Start failed — fall through to remove + recreate
        console.log(`[ensureCodeWorkspaceContainer] start failed for ${workspace.containerName} (${state}), will recreate`);
      }
    }

    // Container is in unrecoverable state (restarting, dead, crash-loop) or start failed.
    // Remove and recreate with fresh image (like upstream).
    console.log(`[ensureCodeWorkspaceContainer] container ${workspace.containerName} is ${state}, removing and recreating`);
    await _recreateContainer(workspace);
    return { status: 'created' };
  } catch (err) {
    console.error(`[ensureCodeWorkspaceContainer] workspace=${id}`, err);
    return { status: 'error', message: err.message };
  }
}

/**
 * Debug endpoint: returns workspace + container state for troubleshooting.
 * Call from browser console: await fetch('/api/...') or from server action.
 */
export async function debugWorkspaceState(id) {
  await requireAuth();
  const workspace = getWorkspace(id);
  if (!workspace) return { error: 'Workspace not found' };

  const result = {
    workspace: {
      id: workspace.id,
      status: workspace.status,
      containerName: workspace.containerName,
      containerId: workspace.containerId?.slice(0, 12),
      repoSlug: workspace.repoSlug,
      volumeName: workspace.volumeName,
      instanceName: workspace.instanceName,
    },
    container: null,
    error: null,
  };

  try {
    const { getDocker } = await import('../tools/docker.js');
    const docker = getDocker();
    if (!docker) { result.error = 'Docker not available'; return result; }
    if (!workspace.containerName) { result.error = 'No container name'; return result; }

    const container = docker.getContainer(workspace.containerName);
    const info = await container.inspect();
    result.container = {
      state: info.State?.Status,
      running: info.State?.Running,
      exitCode: info.State?.ExitCode,
      restartCount: info.RestartCount,
      image: info.Config?.Image,
      startedAt: info.State?.StartedAt,
      finishedAt: info.State?.FinishedAt,
      error: info.State?.Error || null,
      health: info.State?.Health?.Status || null,
      networkMode: info.HostConfig?.NetworkMode,
    };
  } catch (err) {
    result.error = `Container inspect failed: ${err.message}`;
  }

  return result;
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
