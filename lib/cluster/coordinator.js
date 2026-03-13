import crypto from 'crypto';
import { getDocker } from '../tools/docker.js';
import { dispatchDockerJob, waitForContainer, streamContainerLogs, collectLogs } from '../tools/docker.js';
import {
  createAgentRun,
  updateAgentRun,
  updateClusterRun,
} from '../db/cluster-runs.js';
import {
  clusterVolumeNameFor,
  ensureClusterVolume,
  copyOutboxToInbox,
} from './volume.js';
import { buildMcpConfig } from '../tools/mcp-servers.js';

// ── Safety limits ─────────────────────────────────────────────────────────────

/** Maximum iterations allowed for a single (agentIndex:role:label) cycle key */
export const AGENT_LIMIT = 5;

/** Maximum total agent dispatches per cluster run */
export const RUN_LIMIT = 15;

// ── Pure routing helpers ──────────────────────────────────────────────────────

/**
 * Determine the next role to dispatch based on the current role's transition map and a label.
 *
 * @param {object} currentRole - The role object that just completed (must have .transitions map)
 * @param {string} label - The label string read from outbox/label.txt
 * @param {Array<object>} clusterRoles - Full list of cluster roles (array of role objects)
 * @returns {object|null} The next role object, or null for terminal/unknown transitions
 */
export function resolveNextRole(currentRole, label, clusterRoles) {
  const transitions = currentRole.transitions;
  if (!transitions || !(label in transitions)) {
    return null;
  }

  const targetName = transitions[label];
  if (targetName === null || targetName === undefined) {
    return null;
  }

  const nextRole = clusterRoles.find((r) => r.name === targetName);
  return nextRole || null;
}

/**
 * Check if a specific cycle key has exceeded the per-cycle limit.
 * Increments the count for the cycle key before checking.
 *
 * @param {Map<string, number>} cycleMap - Mutable map tracking iteration counts per key
 * @param {string} cycleKey - Unique key for this cycle (e.g. "0:researcher:initial")
 * @param {number} limit - Maximum allowed count (inclusive — returns true when count > limit)
 * @returns {boolean} True if the cycle has exceeded the limit, false otherwise
 */
export function checkCycleLimit(cycleMap, cycleKey, limit) {
  const current = cycleMap.get(cycleKey) || 0;
  const next = current + 1;
  cycleMap.set(cycleKey, next);
  return next >= limit;
}

// ── Docker helpers ────────────────────────────────────────────────────────────

/**
 * Read the label from a cluster agent's outbox volume.
 * Runs a temporary alpine container to `cat /vol/outbox/label.txt`.
 *
 * Returns the trimmed label string, or 'complete' on any error
 * (entrypoint guarantees label.txt exists, but we guard against container failures).
 *
 * @param {string} volumeName - The cluster agent volume name
 * @returns {Promise<string>} Trimmed label string
 */
export async function readLabelFromOutbox(volumeName) {
  const docker = getDocker();
  if (!docker) throw new Error('Docker not initialized. Call initDocker() first.');

  try {
    const container = await docker.createContainer({
      Image: 'alpine:3',
      Cmd: ['cat', '/vol/outbox/label.txt'],
      HostConfig: {
        AutoRemove: true,
        Mounts: [
          {
            Type: 'volume',
            Source: volumeName,
            Target: '/vol',
            ReadOnly: true,
          },
        ],
      },
    });

    // Attach to container before starting so we can capture stdout
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: false,
    });

    await container.start();

    // Collect stdout chunks
    const chunks = [];
    await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    await container.wait();

    // Demux dockerode stream (strips 8-byte mux header per frame)
    const raw = Buffer.concat(chunks).toString('utf8');
    // Strip dockerode mux header bytes if present (each frame has an 8-byte header)
    const cleaned = raw.replace(/^[\x00-\x08].{7}/gm, '').trim();
    return cleaned || 'complete';
  } catch (err) {
    console.warn(`readLabelFromOutbox(${volumeName}): ${err.message} — defaulting to 'complete'`);
    return 'complete';
  }
}

// ── Agent dispatch ────────────────────────────────────────────────────────────

/**
 * Dispatch a single cluster agent container and wait for it to finish.
 *
 * @param {object} opts
 * @param {object} opts.role - Role definition object (name, systemPrompt, allowedTools, mcpServers)
 * @param {string} opts.runId - Cluster run ID
 * @param {string} opts.agentRunId - Agent run DB record ID
 * @param {number} opts.agentIndex - Zero-based index of this agent in the cluster run
 * @param {string} opts.volumeName - Docker volume name for this agent's workspace
 * @param {string} opts.instanceName - Instance name (e.g. 'noah', 'strategyES')
 * @param {string} [opts.initialPrompt] - Initial prompt (only for agentIndex === 0)
 * @param {string} opts.repoUrl - Git clone URL for the target repository
 * @param {string} [opts.branch] - Branch to check out in the container
 * @param {string} [opts.networkMode] - Docker network mode override
 * @returns {Promise<number>} Container exit code
 */
export async function dispatchClusterAgent({
  role,
  runId,
  agentRunId,
  agentIndex,
  volumeName,
  instanceName,
  initialPrompt,
  repoUrl,
  branch,
  networkMode,
}) {
  // Encode system prompt as base64 to avoid quoting issues
  const systemPromptB64 = Buffer.from(role.systemPrompt || '', 'utf8').toString('base64');

  // Build env vars for the cluster agent entrypoint
  const envObj = {
    ROLE_NAME: role.name,
    INBOX_DIR: '/workspace/inbox',
    OUTBOX_DIR: '/workspace/outbox',
    CLUSTER_RUN_ID: runId,
    ROLE_SYSTEM_PROMPT_B64: systemPromptB64,
    ALLOWED_TOOLS: (role.allowedTools || []).join(','),
    REPO_URL: repoUrl,
    BRANCH: branch || 'main',
  };

  // Inject MCP config if role specifies servers
  if (role.mcpServers && role.mcpServers.length > 0) {
    const mcpConfig = buildMcpConfig(role.mcpServers);
    if (mcpConfig) {
      envObj.MCP_CONFIG_JSON = mcpConfig.configJson;
    }
  }

  // Inject initial prompt only for the first agent
  if (agentIndex === 0 && initialPrompt) {
    envObj.INITIAL_PROMPT = initialPrompt;
  }

  const image =
    process.env.CLUSTER_AGENT_IMAGE || 'scalingengine/clawforge:cluster-agent-latest';

  // dispatchDockerJob accepts a jobId and opts.
  // We use agentRunId as the "jobId" for labeling purposes, plus we override image/volume/network.
  const agentJobId = agentRunId;

  const { container } = await dispatchDockerJob(agentJobId, {
    repoUrl,
    branch: branch || 'main',
    image,
    networkMode: networkMode || process.env.DOCKER_NETWORK || 'bridge',
    instanceName,
    // Pass env vars as additional env (dispatchDockerJob builds base env from opts.repoUrl/branch/secrets)
    _clusterEnv: envObj,
    // Volume binding: cluster agent writes to /workspace
    _clusterVolume: {
      Source: volumeName,
      Target: '/workspace',
    },
  });

  // Attach live log streaming for SSE consumers (fire-and-forget, not awaited)
  // Uses agentRunId as stream key so /api/jobs/stream/[agentRunId] works
  const streamAbort = new AbortController();
  streamContainerLogs(container, agentRunId, streamAbort.signal).catch((err) => {
    console.warn(`Cluster stream attach failed for agent ${agentRunId.slice(0, 8)}:`, err.message);
  });

  const result = await waitForContainer(container);
  return { exitCode: result.StatusCode, container };
}

// ── Coordinator loop ──────────────────────────────────────────────────────────

/**
 * Main coordinator dispatch loop. Drives sequential agent execution:
 * 1. Dispatches agents one-by-one in their own Docker containers
 * 2. Reads label from each agent's outbox to determine next agent
 * 3. Enforces cycle limits (AGENT_LIMIT per key, RUN_LIMIT per run)
 * 4. Posts Slack thread replies for each agent completion
 * 5. Copies outbox to next agent's inbox between dispatches
 *
 * This function is designed to run async (fire-and-forget from runCluster()).
 *
 * @param {object} cluster - Full cluster definition (name, roles array)
 * @param {string} runId - Cluster run DB ID
 * @param {string} initialPrompt - The prompt that kicked off this run
 * @param {object} options
 * @param {string} options.instanceName - Instance identifier
 * @param {string} options.repoUrl - Git clone URL
 * @param {string} [options.branch] - Branch to check out
 * @param {object} [options.slackClient] - @slack/web-api WebClient instance (optional)
 * @param {string} [options.channelId] - Slack channel ID for thread replies (optional)
 * @param {string} [options.threadTs] - Slack parent thread ts (optional)
 * @returns {Promise<{ status: 'completed'|'failed', totalAgentRuns: number, failReason?: string }>}
 */
export async function runClusterLoop(cluster, runId, initialPrompt, options = {}) {
  const {
    instanceName,
    repoUrl,
    branch,
    slackClient,
    channelId,
    threadTs,
  } = options;

  const clusterRoles = cluster.roles;
  let currentRole = clusterRoles[0];
  let agentIndex = 0;
  let totalIterations = 0;
  let lastLabel = null;
  const cycleMap = new Map();

  let finalStatus = 'completed';
  let failReason = null;

  while (currentRole && totalIterations < RUN_LIMIT) {
    // Build cycle key for this iteration
    const cycleKey = `${agentIndex}:${currentRole.name}:${lastLabel || 'initial'}`;

    // Check cycle limit
    if (checkCycleLimit(cycleMap, cycleKey, AGENT_LIMIT)) {
      finalStatus = 'failed';
      failReason = `Cycle limit exceeded for key "${cycleKey}" (max ${AGENT_LIMIT} iterations per cycle)`;
      console.warn(`[runClusterLoop] ${failReason}`);
      break;
    }

    // Name this volume for the current agent
    const volumeName = clusterVolumeNameFor(runId, agentIndex);

    // Create agent run DB record
    const agentRunId = await createAgentRun({
      clusterRunId: runId,
      role: currentRole.name,
      agentIndex,
      volumeName,
    });

    // Ensure volume exists
    try {
      await ensureClusterVolume(volumeName);
    } catch (err) {
      console.error(`[runClusterLoop] ensureClusterVolume failed for ${volumeName}:`, err.message);
      await updateAgentRun(agentRunId, {
        status: 'failed',
        exitCode: -1,
        completedAt: Date.now(),
      });
      finalStatus = 'failed';
      failReason = `Volume setup failed: ${err.message}`;
      break;
    }

    // Dispatch and wait
    let exitCode = -1;
    let dispatchResult = null;
    try {
      dispatchResult = await dispatchClusterAgent({
        role: currentRole,
        runId,
        agentRunId,
        agentIndex,
        volumeName,
        instanceName,
        initialPrompt: agentIndex === 0 ? initialPrompt : undefined,
        repoUrl,
        branch,
      });
      exitCode = dispatchResult.exitCode;
    } catch (err) {
      console.error(`[runClusterLoop] dispatchClusterAgent failed for agent ${agentIndex}:`, err.message);
      exitCode = -1;
    }

    // Persist logs to DB before container cleanup (only if we have a container)
    let logsJson = null;
    if (dispatchResult?.container) {
      try {
        const logOutput = await collectLogs(dispatchResult.container);
        const combined = (logOutput.stdout || '') + (logOutput.stderr || '');
        logsJson = combined.slice(0, 200000) || null;
      } catch (logErr) {
        console.warn(`[runClusterLoop] collectLogs failed for agent ${agentIndex}:`, logErr.message);
      }
    }

    // Read label from outbox
    const label = await readLabelFromOutbox(volumeName);

    // Update agent run in DB
    const agentStatus = exitCode === 0 ? 'completed' : 'failed';
    await updateAgentRun(agentRunId, {
      status: agentStatus,
      label,
      exitCode,
      logs: logsJson,
      completedAt: Date.now(),
    });

    // Post Slack thread reply
    if (slackClient && channelId && threadTs) {
      try {
        const emoji = exitCode === 0 ? ':white_check_mark:' : ':x:';
        await slackClient.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `${emoji} Agent *${currentRole.name}* (step ${agentIndex + 1}) ${agentStatus} — label: \`${label}\``,
        });
      } catch (slackErr) {
        console.warn(`[runClusterLoop] Slack notify failed for agent ${agentIndex}:`, slackErr.message);
      }
    }

    totalIterations++;

    // Determine next role
    const nextRole = resolveNextRole(currentRole, label, clusterRoles);

    if (nextRole) {
      // Copy outbox to next agent's inbox
      const nextVolumeName = clusterVolumeNameFor(runId, agentIndex + 1);
      try {
        await ensureClusterVolume(nextVolumeName);
        await copyOutboxToInbox(volumeName, nextVolumeName);
      } catch (err) {
        console.error(`[runClusterLoop] copyOutboxToInbox failed:`, err.message);
        finalStatus = 'failed';
        failReason = `Outbox copy failed: ${err.message}`;
        break;
      }
    }

    // Advance state
    lastLabel = label;
    agentIndex++;
    currentRole = nextRole;
  }

  // Check if we hit RUN_LIMIT
  if (currentRole && totalIterations >= RUN_LIMIT && finalStatus !== 'failed') {
    finalStatus = 'failed';
    failReason = `Run limit of ${RUN_LIMIT} total agent iterations exceeded`;
    console.warn(`[runClusterLoop] ${failReason}`);
  }

  // Update cluster run final state
  await updateClusterRun(runId, {
    status: finalStatus,
    totalAgentRuns: totalIterations,
    failReason: failReason || null,
    completedAt: Date.now(),
  });

  // Clean up volumes on success
  if (finalStatus === 'completed') {
    const docker = getDocker();
    if (docker) {
      for (let i = 0; i < agentIndex; i++) {
        const volName = clusterVolumeNameFor(runId, i);
        try {
          await docker.getVolume(volName).remove();
          console.log(`Removed cluster volume: ${volName}`);
        } catch (err) {
          if (err.statusCode !== 404) {
            console.warn(`Failed to remove cluster volume ${volName}: ${err.message}`);
          }
        }
      }
    }
  }

  return { status: finalStatus, totalAgentRuns: totalIterations, failReason };
}
