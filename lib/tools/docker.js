import Docker from 'dockerode';
import { PassThrough } from 'stream';
import { saveDockerJob, getDockerJob } from '../db/docker-jobs.js';

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

  const container = await docker.createContainer({
    name: containerName,
    Image: image,
    Env: env,
    Labels: {
      'clawforge': 'job',
      'clawforge.job_id': jobId,
      'clawforge.instance': instanceName,
      'clawforge.started_at': new Date().toISOString(),
    },
    HostConfig: {
      NetworkMode: opts.networkMode || 'bridge',
      AutoRemove: false,
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
