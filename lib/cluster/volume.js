import { getDocker } from '../tools/docker.js';

/**
 * Produce a unique Docker volume name for a specific agent in a cluster run.
 *
 * Convention: clawforge-cluster-{runId}-{agentIndex}
 *
 * The "cluster" segment distinguishes these from:
 * - Job volumes: clawforge-{instanceName}-{slug}
 * - Workspace volumes: clawforge-ws-{instanceName}-{shortId}
 *
 * @param {string} runId - Cluster run UUID (or short ID).
 * @param {number} agentIndex - Zero-based index of the agent in the cluster.
 * @returns {string} Volume name.
 */
export function clusterVolumeNameFor(runId, agentIndex) {
  return `clawforge-cluster-${runId}-${agentIndex}`;
}

/**
 * Ensure a named Docker volume exists for a cluster agent.
 * Creates the volume if it does not already exist.
 *
 * @param {string} volumeName - The volume name (from clusterVolumeNameFor).
 * @returns {Promise<void>}
 */
export async function ensureClusterVolume(volumeName) {
  const docker = getDocker();
  if (!docker) throw new Error('Docker not initialized. Call initDocker() first.');

  try {
    await docker.getVolume(volumeName).inspect();
  } catch {
    await docker.createVolume({ Name: volumeName });
    console.log(`Created cluster volume: ${volumeName}`);
  }
}

/**
 * Copy the outbox directory from one cluster agent volume to another agent's inbox.
 *
 * Creates a temporary alpine:3 container with both volumes mounted:
 *   - srcVolumeName → /src  (source agent's volume)
 *   - destVolumeName → /dest (destination agent's volume)
 *
 * Copies /src/outbox/ into /dest/inbox/, creating /dest/inbox/ if missing.
 * The container is auto-removed after completion (AutoRemove: true).
 *
 * @param {string} srcVolumeName - Source volume (agent that produced output).
 * @param {string} destVolumeName - Destination volume (agent that will receive input).
 * @returns {Promise<void>}
 */
export async function copyOutboxToInbox(srcVolumeName, destVolumeName) {
  const docker = getDocker();
  if (!docker) throw new Error('Docker not initialized. Call initDocker() first.');

  // The shell command:
  //   mkdir -p /dest/inbox && cp -r /src/outbox/. /dest/inbox/
  // Uses /src/outbox/. (with trailing dot) to copy directory contents, not the directory itself.
  const cmd = [
    'sh', '-c',
    'mkdir -p /dest/inbox && cp -r /src/outbox/. /dest/inbox/',
  ];

  const container = await docker.createContainer({
    Image: 'alpine:3',
    Cmd: cmd,
    HostConfig: {
      AutoRemove: true,
      Mounts: [
        {
          Type: 'volume',
          Source: srcVolumeName,
          Target: '/src',
          ReadOnly: true,
        },
        {
          Type: 'volume',
          Source: destVolumeName,
          Target: '/dest',
          ReadOnly: false,
        },
      ],
    },
  });

  await container.start();

  // Wait for the container to finish
  const result = await container.wait();

  if (result.StatusCode !== 0) {
    throw new Error(
      `copyOutboxToInbox failed with exit code ${result.StatusCode} ` +
      `(src: ${srcVolumeName} → dest: ${destVolumeName})`
    );
  }

  console.log(`Copied outbox: ${srcVolumeName}/outbox → ${destVolumeName}/inbox`);
}
