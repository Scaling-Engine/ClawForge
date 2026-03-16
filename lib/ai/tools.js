import fs from 'fs';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createJob } from '../tools/create-job.js';
import { getJobStatus, fetchRepoFile, githubApi } from '../tools/github.js';
import { claudeMd } from '../paths.js';
import { saveJobOrigin, getJobOrigin } from '../db/job-origins.js';
import { getLastMergedJobOutcome, saveJobOutcome } from '../db/job-outcomes.js';
import { loadAllowedRepos, resolveTargetRepo, getDispatchMethod, getQualityGates, getMergePolicy } from '../tools/repos.js';
import { buildInstanceJobDescription } from '../tools/instance-job.js';
import { buildMcpConfig } from '../tools/mcp-servers.js';
import { isDockerAvailable, dispatchDockerJob, waitForContainer, collectLogs, removeContainer, inspectJob, ensureWorkspaceContainer, streamContainerLogs, getDocker } from '../tools/docker.js';
import { streamManager } from '../tools/stream-manager.js';
import { getDockerJob, markDockerJobNotified } from '../db/docker-jobs.js';
import { listWorkspaces } from '../db/workspaces.js';
import { summarizeJob, addToThread } from '../ai/index.js';
import { createNotification } from '../db/notifications.js';

/**
 * Detect platform from thread ID format.
 * Slack: "C0AGVADJDKK:1234567890.123456" (channel:ts)
 * Telegram: numeric chat ID
 * Web: UUID
 */
function detectPlatform(threadId) {
  if (/^C[A-Z0-9]+:\d+\.\d+$/.test(threadId)) return 'slack';
  if (/^\d+$/.test(threadId)) return 'telegram';
  return 'web';
}

const createJobTool = tool(
  async ({ job_description, target_repo }, config) => {
    // Capture originating thread so we can route notifications back and look up prior context
    const threadId = config?.configurable?.thread_id;

    // Enrich job_description with prior job context if a merged outcome exists
    let enrichedDescription = job_description;
    if (threadId) {
      try {
        const prior = getLastMergedJobOutcome(threadId);
        if (prior) {
          const changedFiles = JSON.parse(prior.changedFiles || '[]');
          const priorContext = [
            '## Prior Job Context',
            '',
            `**Previous PR:** ${prior.prUrl || '(no URL)'}`,
            `**Status:** ${prior.status} (${prior.mergeResult})`,
            changedFiles.length ? `**Files changed:** ${changedFiles.join(', ')}` : '',
            prior.logSummary ? `**What happened:** ${prior.logSummary}` : '',
          ].filter(Boolean).join('\n');

          enrichedDescription = `${priorContext}\n\n---\n\n${job_description}`;
        }
      } catch (err) {
        console.error('Failed to load prior job context:', err);
        // Non-fatal — proceed with original description
      }
    }

    // Resolve target repo if specified
    let resolvedTarget = null;
    if (target_repo) {
      const repos = loadAllowedRepos();
      resolvedTarget = resolveTargetRepo(target_repo, repos);
      if (!resolvedTarget) {
        return JSON.stringify({
          success: false,
          error: `Target repo "${target_repo}" not recognized or not in allowed repos list. ` +
                 `Available: ${repos.map(r => r.name).join(', ')}`,
        });
      }
    }

    // Determine dispatch method: Docker if available and repo configured, else Actions
    const dispatchMethod = (isDockerAvailable() && getDispatchMethod(resolvedTarget) === 'docker')
      ? 'docker' : 'actions';

    // Both paths create the job branch (audit trail + entrypoint reads job.md)
    const result = await createJob(enrichedDescription, { targetRepo: resolvedTarget });

    if (threadId) {
      try {
        saveJobOrigin(result.job_id, threadId, detectPlatform(threadId), dispatchMethod);
      } catch (err) {
        console.error('Failed to save job origin:', err);
      }
    }

    // Docker path: dispatch container and fire-and-forget notification
    if (dispatchMethod === 'docker') {
      const owner = resolvedTarget?.owner || process.env.GH_OWNER;
      const slug = resolvedTarget?.slug || process.env.GH_REPO;
      const repoUrl = `https://github.com/${owner}/${slug}.git`;

      const mcpConfig = buildMcpConfig();
      const qualityGates = getQualityGates(resolvedTarget);
      const mergePolicy = getMergePolicy(resolvedTarget);

      const { container } = await dispatchDockerJob(result.job_id, {
        repoUrl,
        branch: `job/${result.job_id}`,
        secrets: process.env.AGENT_SECRETS || '{}',
        llmSecrets: process.env.AGENT_LLM_SECRETS || '{}',
        image: process.env.JOB_IMAGE || 'scalingengine/clawforge:job-latest',
        networkMode: process.env.DOCKER_NETWORK || 'noah-net',
        instanceName: process.env.INSTANCE_NAME || 'noah',
        mcpConfig,
        qualityGates,
        mergePolicy,
      });

      // Attach log stream immediately after container.start() so SSE consumers
      // can connect and receive events from the very first log line.
      const streamAbort = new AbortController();
      streamContainerLogs(container, result.job_id, streamAbort.signal).catch((err) => {
        console.warn(`Stream attach failed for job ${result.job_id.slice(0, 8)}:`, err.message);
      });

      // Fire-and-forget: wait for container, then notify
      waitAndNotify(container, result.job_id, threadId, streamAbort).catch((err) => {
        console.error(`waitAndNotify failed for job ${result.job_id.slice(0, 8)}:`, err);
      });
    }

    // Actions path: job branch push triggers run-job.yml automatically (no additional action needed)

    const responsePayload = JSON.stringify({
      success: true,
      job_id: result.job_id,
      branch: result.branch,
      dispatch_method: dispatchMethod,
      ...(resolvedTarget && { target_repo: `${resolvedTarget.owner}/${resolvedTarget.slug}` }),
    });

    // Append the JOB_STREAM marker so the agent's reply text triggers
    // JobStreamViewer rendering in the web chat UI (message.jsx).
    return `${responsePayload}\n\n[JOB_STREAM:${result.job_id}]`;
  },
  {
    name: 'create_job',
    description:
      'Create an autonomous job that runs Claude Code CLI in an isolated Docker container. Claude Code has full filesystem access, tool use (Read, Write, Edit, Bash, Glob, Grep), and GSD workflow skills. The job description you provide becomes the task prompt. Returns the job ID and branch name.',
    schema: z.object({
      job_description: z
        .string()
        .describe(
          'Detailed job description including context and requirements. Be specific about what needs to be done.'
        ),
      target_repo: z.string().optional().describe(
        'Optional: target repository name or alias (e.g., "neurostory", "ns"). ' +
        'Must match an entry in the allowed repos list. ' +
        'If omitted, job runs against the default clawforge repo.'
      ),
    }),
  }
);

/**
 * Wait for a Docker container to complete, then build and send notification.
 * Runs as a detached async (fire-and-forget) after Docker dispatch.
 * Mirrors the notification shape from handleGithubWebhook in api/index.js.
 *
 * @param {object} container - Dockerode container instance
 * @param {string} jobId - UUID of the job
 * @param {string|null} threadId - Originating thread for notification routing
 * @param {AbortController} [streamAbort] - Abort controller for the log stream (cleanup on exit)
 */
async function waitAndNotify(container, jobId, threadId, streamAbort) {
  // --- Slack edit-in-place status updates (STRM-06) ---
  let slackUpdateInterval = null;

  const origin = threadId ? getJobOrigin(jobId) : null;
  if (origin?.platform === 'slack') {
    const [channel, threadTs] = origin.threadId.split(':');
    const { SLACK_BOT_TOKEN } = process.env;
    if (SLACK_BOT_TOKEN && channel && threadTs) {
      try {
        const { WebClient } = await import('@slack/web-api');
        const slack = new WebClient(SLACK_BOT_TOKEN);

        // Post initial status message
        const result = await slack.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: `Job \`${jobId.slice(0, 8)}\` started — warming up...`,
        });

        const statusTs = result.ts;
        streamManager.setSlackStatus(jobId, channel, statusTs);

        // Track last known activity for update text
        let lastActivity = 'starting';
        const updateUnsub = streamManager.subscribe(jobId, (type, data) => {
          if (type === 'file-change') lastActivity = `Editing ${data.path || 'files'}`;
          else if (type === 'bash-output') lastActivity = `Running: ${(data.command || data.line || 'command').slice(0, 60)}`;
          else if (type === 'progress') lastActivity = data.label || 'Working...';
          else if (type === 'error') lastActivity = `Error: ${(data.message || '').slice(0, 60)}`;
        });

        const slackStart = Date.now();
        slackUpdateInterval = setInterval(async () => {
          const elapsedSecs = Math.floor((Date.now() - slackStart) / 1000);
          const mins = Math.floor(elapsedSecs / 60);
          const secs = elapsedSecs % 60;
          try {
            await slack.chat.update({
              channel,
              ts: statusTs,
              text: `Job \`${jobId.slice(0, 8)}\` — ${lastActivity} (${mins}m ${secs}s)`,
            });
          } catch (err) {
            if (err.data?.error === 'ratelimited') {
              console.warn('[slack-status] Rate limited on status update, backing off');
            } else {
              console.warn('[slack-status] Update error:', err.message);
            }
          }
        }, 10_000);

        // Store unsub so we can call it after container exits
        slackUpdateInterval._unsub = updateUnsub;
      } catch (err) {
        console.warn('Failed to post Slack status message:', err.message);
      }
    }
  }

  try {
    const { StatusCode } = await waitForContainer(container);

    // Container has exited — abort the log stream if it's still attached.
    // streamManager.complete() will also be called by the stream 'end' event,
    // but aborting here ensures cleanup if the stream hasn't ended yet.
    streamAbort?.abort();

    // Clear Slack update interval now that container has exited
    if (slackUpdateInterval) {
      if (typeof slackUpdateInterval._unsub === 'function') slackUpdateInterval._unsub();
      clearInterval(slackUpdateInterval);
      slackUpdateInterval = null;
    }
    const { stdout, stderr } = await collectLogs(container);

    const owner = process.env.GH_OWNER;
    const repo = process.env.GH_REPO;

    // Query GitHub for PR created by this job branch
    let prUrl = '';
    let changedFiles = [];
    let commitMessage = '';
    try {
      const prs = await githubApi(`/repos/${owner}/${repo}/pulls?head=${owner}:job/${jobId}&state=all`);
      if (prs.length > 0) {
        prUrl = prs[0].html_url;
        commitMessage = prs[0].title || '';
        // Fetch changed files from PR
        try {
          const files = await githubApi(`/repos/${owner}/${repo}/pulls/${prs[0].number}/files`);
          changedFiles = files.map((f) => f.filename);
        } catch { /* non-fatal */ }
      }
    } catch (err) {
      console.warn(`Failed to fetch PR info for job ${jobId.slice(0, 8)}:`, err.message);
    }

    const status = StatusCode === 0 ? 'success' : 'failure';
    const log = stdout.slice(-2000) + (stderr ? `\n--- stderr ---\n${stderr.slice(-500)}` : '');

    // Extract gate failure details from container output if present
    let gateFailures = '';
    const gateMarkerIdx = stdout.indexOf('[GATE] FAILED');
    if (gateMarkerIdx !== -1) {
      // Include gate output from the marker to end of relevant section (cap at 2000 chars)
      gateFailures = stdout.slice(gateMarkerIdx, gateMarkerIdx + 2000);
    }

    // Also check for the gate-failures.md commit message as indicator
    const hasGateFailures = stdout.includes('gate-failures.md') || stdout.includes('[GATES]');

    // Build results matching Actions webhook shape
    const results = {
      job: jobId,
      pr_url: prUrl,
      run_url: '',
      status,
      failure_stage: hasGateFailures && StatusCode !== 0 ? 'quality_gates' : (StatusCode !== 0 ? 'container_execution' : ''),
      merge_result: '',
      log: gateFailures ? `${log}\n\n--- QUALITY GATE FAILURES ---\n${gateFailures}` : log,
      changed_files: changedFiles,
      commit_message: commitMessage,
      target_repo: `${owner}/${repo}`,
    };

    const message = await summarizeJob(results);
    await createNotification(message, { ...results, dispatch_method: 'docker' });
    markDockerJobNotified(jobId);

    console.log(`Docker notification saved for job ${jobId.slice(0, 8)} (status: ${status})`);

    // Route notification to originating thread
    // (origin was computed at the top of waitAndNotify before container wait)
    if (origin) {
      // Persist job outcome
      try {
        saveJobOutcome({
          jobId,
          threadId: origin.threadId,
          status,
          mergeResult: results.merge_result,
          prUrl,
          targetRepo: results.target_repo || null,
          changedFiles,
          logSummary: message,
        });
      } catch (err) {
        console.error('Failed to save job outcome:', err);
      }

      // Inject into LangGraph memory so agent knows the Docker job finished
      addToThread(origin.threadId, `[Job completed] ${message}`).catch(() => {});

      // Send to Slack thread
      if (origin.platform === 'slack') {
        const [channel, threadTs] = origin.threadId.split(':');
        const { SLACK_BOT_TOKEN } = process.env;
        if (SLACK_BOT_TOKEN && channel && threadTs) {
          try {
            const { WebClient } = await import('@slack/web-api');
            const slack = new WebClient(SLACK_BOT_TOKEN);

            const slackStatus = streamManager.getSlackStatus(jobId);
            if (slackStatus?.statusTs) {
              // Edit the running status message to show the final result (no message spam)
              await slack.chat.update({
                channel: slackStatus.channel,
                ts: slackStatus.statusTs,
                text: `Job \`${jobId.slice(0, 8)}\` ${status === 'success' ? 'completed' : 'failed'}: ${message.slice(0, 200)}`,
              });
              // Post a thread reply with the full summary for detail
              await slack.chat.postMessage({ channel, thread_ts: threadTs, text: message });
            } else {
              // Non-streaming fallback: post a new message
              await slack.chat.postMessage({ channel, thread_ts: threadTs, text: message });
            }
            console.log(`Slack notification sent for Docker job ${jobId.slice(0, 8)}`);
          } catch (err) {
            console.error('Failed to send Slack notification:', err);
          }
        }
      }

      // Send to Telegram thread
      if (origin.platform === 'telegram') {
        const { TELEGRAM_BOT_TOKEN } = process.env;
        if (TELEGRAM_BOT_TOKEN && origin.threadId) {
          try {
            const { sendMessage } = await import('../tools/telegram.js');
            await sendMessage(TELEGRAM_BOT_TOKEN, origin.threadId, message);
            console.log(`Telegram notification sent for Docker job ${jobId.slice(0, 8)}`);
          } catch (err) {
            console.error('Failed to send Telegram notification:', err);
          }
        }
      }
    }

    // Clean up container
    await removeContainer(container);
  } catch (err) {
    console.error(`waitAndNotify error for job ${jobId.slice(0, 8)}:`, err);
    // Clear Slack update interval in the error path
    if (slackUpdateInterval) {
      if (typeof slackUpdateInterval._unsub === 'function') slackUpdateInterval._unsub();
      clearInterval(slackUpdateInterval);
    }
    // Best-effort cleanup
    try { await removeContainer(container); } catch { /* already logged by removeContainer */ }
  }
}

const getJobStatusTool = tool(
  async ({ job_id }) => {
    const result = await getJobStatus(job_id);

    // Augment with Docker container inspection if available
    if (job_id) {
      try {
        const inspection = await inspectJob(job_id);
        if (inspection) {
          result.container = inspection;
        }
      } catch { /* non-fatal — container may not exist or Docker unavailable */ }
    }

    return JSON.stringify(result);
  },
  {
    name: 'get_job_status',
    description:
      'Check status of running jobs or look up completed job outcomes. For live jobs, returns active workflow runs with timing and current step. For completed jobs (when a job_id is provided), returns the outcome including PR URL and target repo if applicable. Use when user asks about job progress, running jobs, job status, or what happened with a specific job.',
    schema: z.object({
      job_id: z
        .string()
        .optional()
        .describe(
          'Optional: specific job ID to check. If omitted, returns all running jobs.'
        ),
    }),
  }
);

const getSystemTechnicalSpecsTool = tool(
  async () => {
    try {
      return fs.readFileSync(claudeMd, 'utf8');
    } catch {
      return 'No technical documentation found (CLAUDE.md not present in project root).';
    }
  },
  {
    name: 'get_system_technical_specs',
    description:
      'Read the system architecture and technical documentation (CLAUDE.md). Use this when you need to understand how the system itself works — the event handler, Docker agent, API routes, database, cron/trigger configuration, GitHub Actions, deployment, or file structure.',
    schema: z.object({}),
  }
);

/**
 * LangGraph tool for creating a new ClawForge instance.
 * Phase 13 stub — handler builds a minimal job description.
 * Phase 15 will replace the description with buildInstanceJobDescription(config).
 */
const createInstanceJobTool = tool(
  async ({ name, purpose, allowed_repos, enabled_channels, slack_user_ids, telegram_chat_id }, runConfig) => {
    // Capture originating thread so instance job completions route back to conversation
    const threadId = runConfig?.configurable?.thread_id;

    const description = buildInstanceJobDescription({
      name,
      purpose,
      allowed_repos,
      enabled_channels,
      slack_user_ids,
      telegram_chat_id,
    });

    const result = await createJob(description);

    if (threadId) {
      try {
        saveJobOrigin(result.job_id, threadId, detectPlatform(threadId));
      } catch (err) {
        console.error('Failed to save job origin:', err);
      }
    }

    return JSON.stringify({ success: true, job_id: result.job_id, branch: result.branch });
  },
  {
    name: 'create_instance_job',
    description:
      'Create a new ClawForge instance. Dispatches an autonomous job that generates all instance files (Dockerfile, SOUL.md, AGENT.md, EVENT_HANDLER.md, REPOS.json, .env.example) and updates docker-compose.yml. Call this only after collecting all required config and receiving operator approval.',
    schema: z.object({
      name: z.string().describe('Instance slug — lowercase, no spaces (e.g. "jim", "acmecorp")'),
      purpose: z.string().describe('What this instance is for, used to author persona files'),
      allowed_repos: z.array(z.string()).describe('GitHub repo slugs this instance can target (e.g. ["strategyes-lab"])'),
      enabled_channels: z.array(z.enum(['slack', 'telegram', 'web'])).describe('Communication channels to enable'),
      slack_user_ids: z.array(z.string()).optional().describe('Slack user IDs that can interact with this instance'),
      telegram_chat_id: z.string().optional().describe('Telegram chat ID for this instance'),
    }),
  }
);

const getProjectStateTool = tool(
  async ({ repo }) => {
    const repos = loadAllowedRepos();
    const resolved = resolveTargetRepo(repo, repos);

    if (!resolved) {
      return JSON.stringify({
        success: false,
        error: `Repo "${repo}" not recognized or not in allowed repos list. Available: ${repos.map(r => r.name).join(', ')}`,
      });
    }

    const { owner, slug } = resolved;

    const [state, roadmap] = await Promise.all([
      fetchRepoFile(owner, slug, '.planning/STATE.md', { maxChars: 4000 }),
      fetchRepoFile(owner, slug, '.planning/ROADMAP.md', { maxChars: 6000 }),
    ]);

    if (!state && !roadmap) {
      return JSON.stringify({
        success: true,
        repo: `${owner}/${slug}`,
        state: null,
        roadmap: null,
        message: 'No GSD planning state found in this repo.',
      });
    }

    return JSON.stringify({
      success: true,
      repo: `${owner}/${slug}`,
      state,
      roadmap,
    });
  },
  {
    name: 'get_project_state',
    description:
      'Read project planning state (STATE.md + ROADMAP.md) from a target repo via the GitHub API. ' +
      'Use this to understand where a project stands — current phase, progress, decisions, blockers, and upcoming work. ' +
      'Useful before creating jobs (for better context) or when answering questions about project status.',
    schema: z.object({
      repo: z
        .string()
        .describe(
          'Repository name or alias (e.g., "neurostory", "clawforge", "cf", "strategyes-lab", "portal"). Must match an entry in the allowed repos list.'
        ),
    }),
  }
);

/**
 * Format recent chat messages into a plain-text string for injection into workspace containers.
 * Filters to human/AI messages only, takes last 20, handles both string and array content.
 *
 * @param {Array} messages - LangGraph BaseMessage array
 * @returns {string} Formatted chat history
 */
function formatChatContextForInjection(messages) {
  const filtered = messages.filter((m) => {
    const type = m._getType?.();
    return type === 'human' || type === 'ai';
  });

  return filtered.slice(-20).map((m) => {
    const type = m._getType?.();
    const role = type === 'human' ? 'Operator' : 'Assistant';

    // Content may be a string or an array of content blocks
    let text = '';
    if (typeof m.content === 'string') {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = m.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(' ');
    }

    return `${role}: ${text}`;
  }).join('\n');
}

const startCodingTool = tool(
  async ({ repo }, config) => {
    const threadId = config?.configurable?.thread_id;

    // Resolve repo
    const repos = loadAllowedRepos();
    const resolved = resolveTargetRepo(repo, repos);
    if (!resolved) {
      return JSON.stringify({
        success: false,
        error: `Repo "${repo}" not recognized or not in allowed repos list. Available: ${repos.map(r => r.name).join(', ')}`,
      });
    }

    // Extract chat context from LangGraph checkpointer (non-fatal)
    let chatContext = '';
    if (threadId) {
      try {
        // Dynamic import to avoid circular dependency (agent.js imports tools.js)
        const { getAgent } = await import('./agent.js');
        const agent = await getAgent();
        const state = await agent.getState({ configurable: { thread_id: threadId } });
        const messages = state?.values?.messages || [];
        chatContext = formatChatContextForInjection(messages);
      } catch (err) {
        console.warn('Could not extract chat context for workspace:', err.message);
      }
    }

    const instanceName = process.env.INSTANCE_NAME || 'noah';
    const owner = resolved.owner || process.env.GH_OWNER;
    const repoUrl = `https://github.com/${owner}/${resolved.slug}.git`;

    const mcpConfig = buildMcpConfig();

    const result = await ensureWorkspaceContainer({
      instanceName,
      repoUrl,
      repoSlug: resolved.slug,
      secrets: { GH_TOKEN: process.env.GH_TOKEN },
      threadId,
      chatContext: chatContext || undefined,
      mcpConfig,
    });

    const appUrl = process.env.APP_URL || '';
    const url = `${appUrl}/workspace/${result.workspace.id}`;

    const response = {
      success: true,
      workspace_id: result.workspace.id,
      repo: resolved.slug,
      branch: result.workspace.featureBranch,
      url,
      created: result.created,
    };

    if (result.created) {
      return JSON.stringify({
        ...response,
        message: 'Your workspace is starting. The terminal will be ready in ~15 seconds.',
      });
    }

    return JSON.stringify(response);
  },
  {
    name: 'start_coding',
    description: 'Create or reconnect to a persistent workspace for a repo. Returns a terminal URL the operator can open in their browser.',
    schema: z.object({
      repo: z.string().describe('Repository name or alias (e.g. "clawforge", "cf")'),
    }),
  }
);

const listWorkspacesTool = tool(
  async () => {
    const instanceName = process.env.INSTANCE_NAME || 'noah';
    const workspaces = listWorkspaces(instanceName);

    if (!workspaces || workspaces.length === 0) {
      return 'No active workspaces.';
    }

    const appUrl = process.env.APP_URL || '';
    const lines = workspaces.map((ws) => {
      const urlPart = ws.status === 'running'
        ? `${appUrl}/workspace/${ws.id}`
        : '(stopped)';
      const branch = ws.featureBranch || 'no branch';
      return `- **${ws.repoSlug}** (${ws.status}) -- ${branch} -- ${urlPart}`;
    });

    return lines.join('\n');
  },
  {
    name: 'list_workspaces',
    description: 'List all active workspaces with their status and reconnect URLs.',
    schema: z.object({}),
  }
);

const cancelJobTool = tool(
  async ({ job_id }, { configurable }) => {
    const row = getDockerJob(job_id);
    if (!row?.containerId) {
      return JSON.stringify({ success: false, error: 'Job not found or not a Docker job' });
    }

    const docker = getDocker();
    if (!docker) {
      return JSON.stringify({ success: false, error: 'Docker not available' });
    }

    const container = docker.getContainer(row.containerId);
    try {
      await container.stop({ t: 10 }); // SIGTERM, 10s grace period, then SIGKILL
    } catch (err) {
      if (!err.message.includes('not running') && err.statusCode !== 304) {
        throw err;
      }
    }

    // Clean up the log stream (emits 'cancelled' to all SSE subscribers)
    streamManager.cancel(job_id);

    // Inject cancellation confirmation into LangGraph thread so the agent
    // has memory of the cancellation (per CONTEXT.md decision)
    const threadId = configurable?.thread_id;
    if (threadId) {
      await addToThread(
        threadId,
        `Job \`${job_id.slice(0, 8)}\` cancelled. Container stopped with SIGTERM (10s grace). Branch preserved for inspection.`
      );
    }

    return JSON.stringify({
      success: true,
      job_id,
      message: 'Container stopped. Branch preserved for inspection.',
    });
  },
  {
    name: 'cancel_job',
    description:
      'Cancel a running Docker job container. Sends SIGTERM with 10s grace period before SIGKILL. The job branch and any committed work are preserved for inspection.',
    schema: z.object({
      job_id: z.string().describe('UUID of the job to cancel'),
    }),
  }
);

const createClusterJobTool = tool(
  async ({ clusterName, prompt, repoUrl, branch }, config) => {
    const threadId = config?.configurable?.thread_id;
    const platform = threadId ? detectPlatform(threadId) : 'web';

    // Extract channel/thread info for Slack notifications
    let channelId;
    let threadTs;
    if (platform === 'slack' && threadId) {
      const parts = threadId.split(':');
      channelId = parts[0];
      threadTs = parts[1];
    }

    const instanceName = process.env.INSTANCE_NAME || 'noah';
    const { randomUUID } = await import('crypto');
    const runId = randomUUID().replace(/-/g, '').slice(0, 12);

    // Fire-and-forget — import and run async, errors are logged not thrown
    import('../cluster/index.js')
      .then(({ runCluster }) => runCluster(clusterName, prompt, {
        runId,
        instanceName,
        repoUrl,
        branch,
        channelId,
        threadTs,
      }))
      .catch(err => console.error(`[cluster] run ${runId} failed:`, err));

    return `Cluster run started: **${clusterName}** (run ID: \`${runId}\`). I'll post updates in the thread as agents complete.`;
  },
  {
    name: 'create_cluster_job',
    description:
      'Start a multi-agent cluster run. Use this for complex multi-step tasks that benefit from sequential specialized agents working together. The cluster defines a pipeline of agents with distinct roles.',
    schema: z.object({
      clusterName: z
        .string()
        .describe('Name of the cluster from CLUSTER.json (e.g., "code-review-pipeline")'),
      prompt: z
        .string()
        .describe('Initial task description passed to the first agent in the cluster'),
      repoUrl: z
        .string()
        .optional()
        .describe('Target repository URL (uses default if omitted)'),
      branch: z
        .string()
        .optional()
        .describe('Target branch (uses main/master if omitted)'),
    }),
  }
);

export { createJobTool, getJobStatusTool, getSystemTechnicalSpecsTool, createInstanceJobTool, getProjectStateTool, startCodingTool, listWorkspacesTool, cancelJobTool, createClusterJobTool, detectPlatform };
