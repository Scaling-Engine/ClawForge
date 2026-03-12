import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { getCluster } from './config.js';
import { createClusterRun, updateClusterRun } from '../db/cluster-runs.js';
import { runClusterLoop } from './coordinator.js';

/**
 * Start a cluster run for the named cluster.
 *
 * Creates a Slack parent thread (if channelId is provided), records the run in
 * the database, then drives the coordinator loop asynchronously. Returns quickly
 * with the runId and initial status — the loop runs in the background.
 *
 * Errors inside the loop are caught and recorded in the DB; they do not propagate
 * to the caller. This function is designed to be called with `.catch(console.error)`
 * (fire-and-forget) from tools.js and actions.js.
 *
 * @param {string} clusterName - Name of the cluster from CLUSTER.json
 * @param {string} initialPrompt - The prompt that triggered this run
 * @param {object} [options]
 * @param {string} [options.runId] - Override the generated run UUID (useful for testing)
 * @param {string} [options.instanceName] - Instance identifier (falls back to INSTANCE_NAME env)
 * @param {string} [options.repoUrl] - Git clone URL for the target repository
 * @param {string} [options.branch] - Branch to check out in each agent container
 * @param {string} [options.channelId] - Slack channel ID (omit to skip Slack entirely)
 * @param {string} [options.threadTs] - Existing Slack thread ts to reply into (optional — creates new thread if omitted)
 * @returns {Promise<{ runId: string, status: 'started' }>}
 */
export async function runCluster(clusterName, initialPrompt, options = {}) {
  const {
    instanceName = process.env.INSTANCE_NAME || 'default',
    repoUrl,
    branch,
    channelId,
    threadTs: callerThreadTs,
  } = options;

  // Generate run ID if not provided
  const runId =
    options.runId ||
    crypto.randomUUID().replace(/-/g, '').slice(0, 12);

  // Load cluster definition
  const cluster = await getCluster(clusterName);
  if (!cluster) {
    throw new Error(`Cluster not found: "${clusterName}"`);
  }

  // Optional Slack setup
  let slackClient = null;
  let slackThreadTs = callerThreadTs || null;

  if (channelId) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (token) {
      slackClient = new WebClient(token);

      // Create parent thread message if no threadTs provided
      if (!slackThreadTs) {
        try {
          const parentMsg = await slackClient.chat.postMessage({
            channel: channelId,
            text: `Cluster run started: *${clusterName}*\nRun ID: \`${runId}\``,
          });
          slackThreadTs = parentMsg.ts;
        } catch (err) {
          console.warn(`[runCluster] Slack parent message failed: ${err.message}`);
          // Continue without Slack rather than failing the run
          slackClient = null;
          slackThreadTs = null;
        }
      }
    } else {
      console.warn('[runCluster] channelId provided but SLACK_BOT_TOKEN not set — skipping Slack');
    }
  }

  // Create cluster run record in DB
  const dbRunId = await createClusterRun({
    instanceName,
    clusterName,
    initialPrompt,
    slackChannel: channelId || null,
    slackThreadTs: slackThreadTs || null,
  });

  // Run the coordinator loop async (fire-and-forget)
  const loopPromise = runClusterLoop(cluster, dbRunId, initialPrompt, {
    instanceName,
    repoUrl,
    branch,
    slackClient,
    channelId: channelId || null,
    threadTs: slackThreadTs || null,
  });

  // Attach completion handler to post final Slack reply and handle errors
  loopPromise
    .then(async ({ status, totalAgentRuns, failReason }) => {
      if (slackClient && channelId && slackThreadTs) {
        try {
          const text =
            status === 'completed'
              ? `Cluster *${clusterName}* complete after ${totalAgentRuns} agent run${totalAgentRuns !== 1 ? 's' : ''}.`
              : `Cluster *${clusterName}* failed: ${failReason || 'unknown error'}`;
          await slackClient.chat.postMessage({
            channel: channelId,
            thread_ts: slackThreadTs,
            text,
          });
        } catch (err) {
          console.warn(`[runCluster] Slack completion message failed: ${err.message}`);
        }
      }
    })
    .catch(async (err) => {
      console.error(`[runCluster] Unhandled coordinator error for run ${dbRunId}:`, err);

      // Best-effort: mark run as failed in DB
      try {
        await updateClusterRun(dbRunId, {
          status: 'failed',
          failReason: err.message,
          completedAt: Date.now(),
        });
      } catch (dbErr) {
        console.error('[runCluster] Could not update cluster run status to failed:', dbErr.message);
      }

      // Best-effort: post Slack error
      if (slackClient && channelId && slackThreadTs) {
        try {
          await slackClient.chat.postMessage({
            channel: channelId,
            thread_ts: slackThreadTs,
            text: `Cluster *${clusterName}* failed with unhandled error: ${err.message}`,
          });
        } catch { /* ignore */ }
      }
    });

  return { runId: dbRunId, status: 'started' };
}
