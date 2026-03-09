import Docker from 'dockerode';
import crypto from 'crypto';
import { PassThrough } from 'stream';
import { saveDockerJob, getDockerJob } from '../db/docker-jobs.js';
import {
  createWorkspace,
  getWorkspace,
  getWorkspaceByRepo,
  updateWorkspace,
  deleteWorkspace,
  countRunningWorkspaces,
  getIdleWorkspaces,
  wsVolumeNameFor,
} from '../db/workspaces.js';

let docker = null;
let dockerAvailable = false;

/**
 * Connect to Docker Engine via Unix socket and verify daemon is running.
 * On success, runs orphan reconciliation. On failure, sets dockerAvailable=false
 * so the system can fall back to GitHub Actions dispatch.
 */
export async function initDocker() {
  try {
    docker = new Docker({ socketPath: '/var/run/docker.sock' });
    await docker.ping();
    dockerAvailable = true;
    console.log('Docker Engine connected via /var/run/docker.sock');
    await reconcileOrphans();
  } catch (err) {
    dockerAvailable = false;
    console.warn(`Docker Engine not available, falling back to Actions: ${err.message}`);
  }
}

/**
 * Returns whether Docker Engine is available for direct dispatch.
 * @returns {boolean}
 */
export function isDockerAvailable() {
  return dockerAvailable;
}

/**
 * Derive a deterministic volume name from instance and repo URL.
 * Convention: clawforge-{instanceName}-{slug}
 *
 * @param {string} instanceName - Instance identifier (e.g. 'noah', 'strategyES')
 * @param {string} repoUrl - Git clone URL (with or without .git suffix)
 * @returns {string} Volume name
 */
export function volumeNameFor(instanceName, repoUrl) {
  const slug = repoUrl.replace(/\.git$/, '').split('/').pop();
  return `clawforge-${instanceName}-${slug}`;
}

/**
 * Ensure a named Docker volume exists. Creates it if missing.
 * @param {string} name - Volume name
 */
async function ensureVolume(name) {
  try {
    await docker.getVolume(name).inspect();
  } catch {
    await docker.createVolume({ Name: name });
    console.log(`Created named volume: ${name}`);
  }
}

/**
 * Create and start a job container via Docker Engine API.
 * Measures and logs startup time (DOCK-09).
 *
 * @param {string} jobId - UUID of the job
 * @param {object} opts
 * @param {string} opts.repoUrl - Git clone URL
 * @param {string} [opts.branch] - Branch name (defaults to job/{jobId})
 * @param {object} [opts.secrets] - Non-LLM secrets (AGENT_ prefixed)
 * @param {object} [opts.llmSecrets] - LLM-accessible secrets (AGENT_LLM_ prefixed)
 * @param {string} [opts.image] - Docker image to use
 * @param {string} [opts.networkMode] - Docker network mode
 * @param {string} [opts.instanceName] - Instance identifier for labeling
 * @returns {Promise<{container: object, containerId: string, dispatchMs: number}>}
 */
export async function dispatchDockerJob(jobId, opts = {}) {
  if (!docker) throw new Error('Docker not initialized. Call initDocker() first.');

  const startTime = Date.now();
  const containerName = `clawforge-job-${jobId.slice(0, 8)}`;
  const image = opts.image || process.env.JOB_IMAGE || 'scalingengine/clawforge:job-latest';
  const branch = opts.branch || `job/${jobId}`;
  const instanceName = opts.instanceName || process.env.INSTANCE_NAME || 'default';

  const env = [
    `REPO_URL=${opts.repoUrl}`,
    `BRANCH=${branch}`,
    `SECRETS=${JSON.stringify(opts.secrets || {})}`,
    `LLM_SECRETS=${JSON.stringify(opts.llmSecrets || {})}`,
    'DISPATCH_MODE=docker',
  ];

  // Ensure persistent repo-cache volume exists for warm starts
  const volName = volumeNameFor(instanceName, opts.repoUrl);
  await ensureVolume(volName);

  const container = await docker.createContainer({
    name: containerName,
    Image: image,
    Env: env,
    Labels: {
      'clawforge': 'job',
      'clawforge.job_id': jobId,
      'clawforge.instance': instanceName,
      'clawforge.started_at': new Date().toISOString(),
      'clawforge.volume': volName,
    },
    HostConfig: {
      NetworkMode: opts.networkMode || 'bridge',
      AutoRemove: false,
      Mounts: [
        {
          Type: 'volume',
          Source: volName,
          Target: '/repo-cache',
          ReadOnly: false,
        },
      ],
    },
  });

  await container.start();

  const dispatchMs = Date.now() - startTime;
  console.log(`Docker dispatch ${jobId.slice(0, 8)}: container started in ${dispatchMs}ms`);

  // Persist container tracking in DB
  saveDockerJob(jobId, container.id, instanceName);

  return { container, containerId: container.id, dispatchMs };
}

/**
 * Collect stdout/stderr logs from a container.
 * Handles both Buffer and stream return types from dockerode.
 *
 * @param {object} container - Dockerode container instance
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function collectLogs(container) {
  const logStream = await container.logs({
    stdout: true,
    stderr: true,
    follow: false,
  });

  // dockerode may return a Buffer or a stream depending on TTY setting
  if (Buffer.isBuffer(logStream)) {
    // For non-TTY containers, the buffer has multiplexed headers
    // but for simplicity with follow:false, treat as combined output
    const text = logStream.toString('utf8');
    return { stdout: text, stderr: '' };
  }

  // Stream return -- demux stdout and stderr
  return new Promise((resolve, reject) => {
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();
    const stdoutChunks = [];
    const stderrChunks = [];

    stdoutStream.on('data', (chunk) => stdoutChunks.push(chunk));
    stderrStream.on('data', (chunk) => stderrChunks.push(chunk));

    docker.modem.demuxStream(logStream, stdoutStream, stderrStream);

    logStream.on('end', () => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });

    logStream.on('error', reject);
  });
}

/**
 * Wait for a container to finish execution.
 * @param {object} container - Dockerode container instance
 * @returns {Promise<{StatusCode: number}>}
 */
export async function waitForContainer(container) {
  return container.wait();
}

/**
 * Remove a container (best-effort, logs errors but does not throw).
 * @param {object} container - Dockerode container instance
 */
export async function removeContainer(container) {
  try {
    await container.remove();
  } catch (err) {
    console.warn(`Failed to remove container: ${err.message}`);
  }
}

/**
 * Inspect a running or stopped job container (DOCK-10).
 * Looks up the containerId from DB, then inspects via Docker API.
 *
 * @param {string} jobId - UUID of the job
 * @returns {Promise<{running: boolean, startedAt: string, status: string, exitCode: number|null}|null>}
 */
export async function inspectJob(jobId) {
  if (!docker) return null;

  const row = getDockerJob(jobId);
  if (!row || !row.containerId) return null;

  try {
    const info = await docker.getContainer(row.containerId).inspect();
    return {
      running: info.State.Running,
      startedAt: info.State.StartedAt,
      status: info.State.Status,
      exitCode: info.State.ExitCode ?? null,
    };
  } catch (err) {
    // Container may have been removed already
    return null;
  }
}

/**
 * Detect and clean up orphaned job containers from a previous crash (DOCK-08).
 * Filters by clawforge=job label, optionally scoped to current instance.
 */
export async function reconcileOrphans() {
  if (!docker) return;

  const instanceName = process.env.INSTANCE_NAME;

  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ['clawforge=job'] },
    });

    for (const containerInfo of containers) {
      // Optionally scope to current instance
      if (instanceName && containerInfo.Labels['clawforge.instance'] !== instanceName) {
        continue;
      }

      const containerId = containerInfo.Id;
      const jobLabel = containerInfo.Labels['clawforge.job_id'] || 'unknown';
      const container = docker.getContainer(containerId);

      console.log(`Reconciling orphan container for job ${jobLabel} (${containerId.slice(0, 12)})`);

      try {
        if (containerInfo.State === 'running') {
          console.log(`  Killing running orphan ${containerId.slice(0, 12)}`);
          await container.kill();
        }
      } catch (err) {
        console.warn(`  Failed to kill orphan: ${err.message}`);
      }

      // Attempt to collect logs for debugging before removal
      try {
        const logs = await collectLogs(container);
        if (logs.stdout) {
          console.log(`  Orphan logs (stdout, last 500 chars): ${logs.stdout.slice(-500)}`);
        }
        if (logs.stderr) {
          console.log(`  Orphan logs (stderr, last 500 chars): ${logs.stderr.slice(-500)}`);
        }
      } catch (err) {
        console.warn(`  Could not collect orphan logs: ${err.message}`);
      }

      try {
        await container.remove({ force: true });
        console.log(`  Removed orphan container ${containerId.slice(0, 12)}`);
      } catch (err) {
        console.warn(`  Failed to remove orphan: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`Orphan reconciliation failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Workspace Lifecycle
// ---------------------------------------------------------------------------

/**
 * Ensure a workspace container exists for the given repo, implementing a full
 * state machine: creating, running, stopped, error, destroyed.
 *
 * If a workspace already exists for this repo/instance, it is reused or
 * recovered. Otherwise a new container is created subject to the concurrent
 * workspace limit.
 *
 * @param {object} opts
 * @param {string} opts.instanceName - 'noah', 'strategyES'
 * @param {string} opts.repoUrl - Full git clone URL
 * @param {string} opts.repoSlug - Short repo name (e.g. 'clawforge')
 * @param {object} [opts.secrets] - Non-LLM secrets (GH_TOKEN, etc.)
 * @param {object} [opts.llmSecrets] - LLM-accessible secrets (AGENT_LLM_ prefixed)
 * @param {string} [opts.threadId] - Originating chat thread for Phase 24
 * @param {number} [opts.maxConcurrent=3] - Max running workspaces per instance
 * @param {string} [opts.image] - Docker image override
 * @returns {Promise<{workspace: object, created: boolean}>}
 */
export async function ensureWorkspaceContainer(opts) {
  if (!docker) throw new Error('Docker not initialized. Call initDocker() first.');

  const {
    instanceName,
    repoUrl,
    repoSlug,
    secrets = {},
    llmSecrets = {},
    threadId,
    maxConcurrent = 3,
  } = opts;

  // ---- 1. Check for existing workspace ----
  const existing = getWorkspaceByRepo(instanceName, repoSlug);

  if (existing) {
    const result = await _handleExistingWorkspace(existing);
    if (result) return result;
    // If null, fall through to create new
  }

  // ---- 3. Concurrent limit check ----
  const running = countRunningWorkspaces(instanceName);
  if (running >= maxConcurrent) {
    throw new Error(`Max concurrent workspaces (${maxConcurrent}) reached for ${instanceName}`);
  }

  // ---- 4. Generate IDs ----
  const workspaceId = crypto.randomUUID();
  const shortId = workspaceId.slice(0, 8);
  const volName = wsVolumeNameFor(instanceName, shortId);
  const containerName = `clawforge-ws-${instanceName}-${shortId}`;
  const featureBranch = `clawforge/workspace-${shortId}`;
  const image = opts.image || process.env.WORKSPACE_IMAGE || 'scalingengine/clawforge:workspace-latest';

  // ---- 5. Create DB record (status=creating) ----
  const now = Date.now();
  createWorkspace({
    id: workspaceId,
    instanceName,
    repoSlug,
    repoUrl,
    volumeName: volName,
    status: 'creating',
    threadId: threadId || null,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  });

  try {
    // ---- 6. Ensure volume ----
    await ensureVolume(volName);

    // ---- 7. Build env vars ----
    const env = [
      `REPO_URL=${repoUrl}`,
      `BRANCH=main`,
      `FEATURE_BRANCH=${featureBranch}`,
      `INSTANCE_NAME=${instanceName}`,
    ];

    if (secrets.GH_TOKEN) env.push(`GH_TOKEN=${secrets.GH_TOKEN}`);
    // Pass through any AGENT_LLM_ secrets
    for (const [k, v] of Object.entries(llmSecrets)) {
      env.push(`${k}=${v}`);
    }

    // ---- 8. Security check: block Docker socket mounts ----
    const mounts = [
      {
        Type: 'volume',
        Source: volName,
        Target: '/workspace',
        ReadOnly: false,
      },
    ];

    for (const m of mounts) {
      if (
        (m.Source && m.Source.includes('/var/run/docker.sock')) ||
        (m.Target && m.Target.includes('/var/run/docker.sock'))
      ) {
        throw new Error('SECURITY: Docker socket mount is not allowed in workspace containers');
      }
    }

    // ---- 7 (cont). Create container ----
    const container = await docker.createContainer({
      name: containerName,
      Image: image,
      Env: env,
      ExposedPorts: { '7681/tcp': {} },
      Labels: {
        'clawforge': 'workspace',
        'clawforge.instance': instanceName,
        'clawforge.repo': repoSlug,
        'clawforge.workspace_id': workspaceId,
        'clawforge.created_at': new Date().toISOString(),
      },
      Healthcheck: {
        Test: ['CMD', 'curl', '-sf', 'http://localhost:7681/'],
        Interval: 30 * 1e9,      // 30s in nanoseconds
        Timeout: 5 * 1e9,        // 5s
        Retries: 3,
        StartPeriod: 10 * 1e9,   // 10s
      },
      HostConfig: {
        NetworkMode: `${instanceName}-net`,
        RestartPolicy: { Name: 'unless-stopped' },
        Memory: 2 * 1024 * 1024 * 1024,  // 2GB
        CpuPeriod: 100000,
        CpuQuota: 100000,                 // 1 CPU
        Mounts: mounts,
      },
    });

    // ---- 9. Start container ----
    await container.start();

    updateWorkspace(workspaceId, {
      status: 'running',
      containerId: container.id,
      containerName,
      featureBranch,
      lastActivityAt: Date.now(),
    });

    // ---- 10. Feature branch verification (DATA-03) ----
    await _waitForWorkspaceReady(container, featureBranch);

    // ---- 11. Return result ----
    const workspace = getWorkspace(workspaceId);
    return { workspace, created: true };
  } catch (err) {
    // Cleanup on failure
    try {
      const c = docker.getContainer(containerName);
      await c.remove({ force: true });
    } catch { /* ignore cleanup failures */ }

    updateWorkspace(workspaceId, { status: 'error' });
    throw err;
  }
}

/**
 * Handle an existing workspace based on its status and container state.
 * Returns { workspace, created: false } if recovered, or null to signal
 * "delete and create new".
 * @private
 */
async function _handleExistingWorkspace(ws) {
  const { id, status, containerId } = ws;

  if (status === 'running' || status === 'stopped') {
    if (!containerId) {
      deleteWorkspace(id);
      return null;
    }

    try {
      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      if (status === 'running' && info.State.Running) {
        // Already running -- just touch activity timestamp
        updateWorkspace(id, { lastActivityAt: Date.now() });
        return { workspace: getWorkspace(id), created: false };
      }

      if (status === 'running' && !info.State.Running) {
        // Container exited -- restart
        await container.start();
        updateWorkspace(id, { status: 'running', lastActivityAt: Date.now() });
        return { workspace: getWorkspace(id), created: false };
      }

      if (status === 'stopped') {
        // Explicitly stopped -- restart
        await container.start();
        updateWorkspace(id, { status: 'running', lastActivityAt: Date.now() });
        return { workspace: getWorkspace(id), created: false };
      }
    } catch (err) {
      // Container not found (404) -- clean up and create new
      if (err.statusCode === 404) {
        deleteWorkspace(id);
        return null;
      }
      throw err;
    }
  }

  // status=creating, error, destroyed -> delete record, create new
  if (status === 'creating' || status === 'error' || status === 'destroyed') {
    deleteWorkspace(id);
    return null;
  }

  // Unknown status -- clean up
  deleteWorkspace(id);
  return null;
}

/**
 * Wait for workspace container to signal readiness and verify feature branch.
 * Polls /tmp/.workspace-ready via docker exec for up to 30 seconds.
 * @private
 */
async function _waitForWorkspaceReady(container, expectedBranch) {
  const maxWaitMs = 30000;
  const pollInterval = 2000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    try {
      const exec = await container.exec({
        Cmd: ['test', '-f', '/tmp/.workspace-ready'],
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({ Detach: false });
      // Wait for stream to close
      await new Promise((resolve) => {
        stream.on('end', resolve);
        stream.on('error', resolve);
        stream.resume(); // drain
      });
      const inspectResult = await exec.inspect();
      if (inspectResult.ExitCode === 0) {
        // Ready -- verify branch
        await _verifyFeatureBranch(container, expectedBranch);
        return;
      }
    } catch {
      // exec may fail if container is still starting
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  console.warn(`Workspace ready signal not found after ${maxWaitMs / 1000}s (continuing anyway)`);
}

/**
 * Verify the workspace container is on the expected feature branch.
 * Logs a warning if it isn't, but does NOT mark workspace as error.
 * @private
 */
async function _verifyFeatureBranch(container, expectedBranch) {
  try {
    const exec = await container.exec({
      Cmd: ['git', '-C', '/workspace', 'branch', '--show-current'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ Detach: false });
    const chunks = [];
    await new Promise((resolve) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', resolve);
      stream.on('error', resolve);
    });
    const branch = Buffer.concat(chunks).toString('utf8').trim();
    // Strip dockerode mux header bytes if present (first 8 bytes per frame)
    const cleanBranch = branch.replace(/^[\x00-\x08].{0,7}/g, '').trim();
    if (cleanBranch && cleanBranch !== expectedBranch) {
      console.warn(`Workspace branch mismatch: expected '${expectedBranch}', got '${cleanBranch}'`);
    } else if (cleanBranch === expectedBranch) {
      console.log(`Workspace feature branch verified: ${expectedBranch}`);
    }
  } catch (err) {
    console.warn(`Could not verify feature branch: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Workspace Stop / Destroy / Reconcile / Idle
// ---------------------------------------------------------------------------

/**
 * Stop a running workspace container.
 *
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<{ok: boolean, reason?: string, workspace?: object}>}
 */
export async function stopWorkspace(workspaceId) {
  if (!docker) throw new Error('Docker not initialized. Call initDocker() first.');

  const ws = getWorkspace(workspaceId);
  if (!ws) return { ok: false, reason: 'not found' };
  if (ws.status !== 'running') return { ok: false, reason: `status is '${ws.status}', not 'running'` };

  try {
    const container = docker.getContainer(ws.containerId);
    await container.stop();
  } catch (err) {
    if (err.statusCode === 404) {
      updateWorkspace(workspaceId, { status: 'error' });
      return { ok: false, reason: 'container not found (marked as error)' };
    }
    // 304 = already stopped
    if (err.statusCode !== 304) throw err;
  }

  updateWorkspace(workspaceId, { status: 'stopped' });
  return { ok: true, workspace: getWorkspace(workspaceId) };
}

/**
 * Destroy a workspace: stop + remove container, remove volume, mark destroyed.
 * Keeps the DB record for audit trail.
 *
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function destroyWorkspace(workspaceId) {
  if (!docker) throw new Error('Docker not initialized. Call initDocker() first.');

  const ws = getWorkspace(workspaceId);
  if (!ws) return { ok: false, reason: 'not found' };

  // Stop and remove container
  if (ws.containerId) {
    try {
      const container = docker.getContainer(ws.containerId);
      try { await container.stop(); } catch { /* may already be stopped */ }
      await container.remove({ force: true });
    } catch (err) {
      if (err.statusCode !== 404) {
        console.warn(`destroyWorkspace: container cleanup error: ${err.message}`);
      }
    }
  }

  // Remove volume
  if (ws.volumeName) {
    try {
      await docker.getVolume(ws.volumeName).remove();
    } catch (err) {
      if (err.statusCode !== 404) {
        console.warn(`destroyWorkspace: volume cleanup error: ${err.message}`);
      }
    }
  }

  updateWorkspace(workspaceId, { status: 'destroyed' });
  return { ok: true };
}

/**
 * Reconcile workspace containers with DB state.
 * - Discovers orphan containers (in Docker but not DB) and creates records.
 * - Detects stale DB records (in DB but container missing) and marks as error.
 * - Syncs running/stopped state between Docker and DB.
 */
export async function reconcileWorkspaces() {
  if (!docker) return;

  const instanceName = process.env.INSTANCE_NAME;
  let containerCount = 0;
  let dbRecordCount = 0;
  let synced = 0;
  let orphansRecovered = 0;
  let staleRecords = 0;

  try {
    // ---- Pass 1: Containers -> DB ----
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ['clawforge=workspace'] },
    });

    for (const containerInfo of containers) {
      // Scope to current instance if set
      if (instanceName && containerInfo.Labels['clawforge.instance'] !== instanceName) continue;

      containerCount++;
      const wsId = containerInfo.Labels['clawforge.workspace_id'];

      if (!wsId) {
        console.warn(`Workspace container ${containerInfo.Id.slice(0, 12)} has no workspace_id label`);
        continue;
      }

      const dbRecord = getWorkspace(wsId);

      if (!dbRecord) {
        // Orphan: container exists but no DB record -- create one
        const now = Date.now();
        const containerState = containerInfo.State === 'running' ? 'running' : 'stopped';
        createWorkspace({
          id: wsId,
          instanceName: containerInfo.Labels['clawforge.instance'] || 'unknown',
          repoSlug: containerInfo.Labels['clawforge.repo'] || 'unknown',
          repoUrl: '',
          containerId: containerInfo.Id,
          containerName: containerInfo.Names?.[0]?.replace(/^\//, '') || '',
          volumeName: '',
          status: containerState,
          lastActivityAt: now,
          createdAt: now,
          updatedAt: now,
        });
        orphansRecovered++;
        console.log(`Recovered orphan workspace container: ${wsId.slice(0, 8)}`);
      } else {
        // Sync container state -> DB
        const isRunning = containerInfo.State === 'running';
        if (isRunning && dbRecord.status !== 'running') {
          updateWorkspace(wsId, { status: 'running' });
          synced++;
        }
        // If container is exited but DB says 'running', leave it --
        // RestartPolicy will handle restart, or it was manually stopped.
      }
    }

    // ---- Pass 2: DB -> Containers ----
    // Check records that claim running/creating but have no container
    const { listWorkspaces } = await import('../db/workspaces.js');
    const allRecords = instanceName
      ? listWorkspaces(instanceName)
      : []; // Without instance name, skip stale check

    dbRecordCount = allRecords.length;

    for (const record of allRecords) {
      if (record.status !== 'running' && record.status !== 'creating') continue;
      if (!record.containerId) {
        updateWorkspace(record.id, { status: 'error' });
        staleRecords++;
        continue;
      }

      try {
        await docker.getContainer(record.containerId).inspect();
      } catch (err) {
        if (err.statusCode === 404) {
          updateWorkspace(record.id, { status: 'error' });
          staleRecords++;
          console.log(`Marked stale workspace ${record.id.slice(0, 8)} as error (container missing)`);
        }
      }
    }

    console.log(
      `Workspace reconciliation: ${containerCount} containers, ${dbRecordCount} DB records, ` +
      `${synced} synced, ${orphansRecovered} orphans recovered, ${staleRecords} stale records`
    );
  } catch (err) {
    console.warn(`Workspace reconciliation failed: ${err.message}`);
  }
}

/**
 * Find and stop workspaces that have been idle past the timeout threshold.
 *
 * @param {number} [idleTimeoutMs] - Override idle timeout (default: WORKSPACE_IDLE_TIMEOUT_MS env or 30 min)
 * @returns {Promise<number>} Count of workspaces stopped
 */
export async function checkIdleWorkspaces(idleTimeoutMs) {
  if (!docker) return 0;

  const timeout = idleTimeoutMs
    || parseInt(process.env.WORKSPACE_IDLE_TIMEOUT_MS, 10)
    || 30 * 60 * 1000; // 30 minutes

  const idleWorkspaces = getIdleWorkspaces(timeout);
  let stopped = 0;

  for (const ws of idleWorkspaces) {
    const result = await stopWorkspace(ws.id);
    if (result.ok) stopped++;
  }

  if (stopped > 0) {
    console.log(`Idle timeout: stopped ${stopped} workspace(s)`);
  }

  return stopped;
}
