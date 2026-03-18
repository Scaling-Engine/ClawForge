import { createHash, timingSafeEqual } from 'crypto';
import { captureError } from '../lib/observability/errors.js';
import { createJob } from '../lib/tools/create-job.js';
import { setWebhook } from '../lib/tools/telegram.js';
import { getJobStatus } from '../lib/tools/github.js';
import { getTelegramAdapter, getSlackAdapter } from '../lib/channels/index.js';
import { chat, summarizeJob, addToThread } from '../lib/ai/index.js';
import { createNotification } from '../lib/db/notifications.js';
import { getJobOrigin } from '../lib/db/job-origins.js';
import { saveJobOutcome } from '../lib/db/job-outcomes.js';
import { recordUsageEvent } from '../lib/db/usage.js';
import { loadTriggers } from '../lib/triggers.js';
import { verifyApiKey } from '../lib/db/api-keys.js';
import { isJobNotified } from '../lib/db/docker-jobs.js';
import { ensureWorkspaceContainer, stopWorkspace, destroyWorkspace, spawnExtraShell, checkWorkspaceGitStatus } from '../lib/tools/docker.js';
import { listWorkspaces, getWorkspace, updateWorkspace } from '../lib/db/workspaces.js';
import { handleSuperadminRequest } from './superadmin.js';

// Bot token from env, can be overridden by /telegram/register
let telegramBotToken = null;

// Cached trigger firing function (initialized on first request)
let _fireTriggers = null;

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiter — sliding window per IP, per route
// ─────────────────────────────────────────────────────────────────────────────

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP per route

function checkRateLimit(ip, route) {
  const key = `${ip}:${route}`;
  const now = Date.now();
  let timestamps = rateLimitStore.get(key);
  if (!timestamps) {
    timestamps = [];
    rateLimitStore.set(key, timestamps);
  }
  // Remove expired entries
  while (timestamps.length > 0 && timestamps[0] <= now - RATE_LIMIT_WINDOW_MS) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_LIMIT_MAX) {
    return false;
  }
  timestamps.push(now);
  return true;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitStore) {
    while (timestamps.length > 0 && timestamps[0] <= now - RATE_LIMIT_WINDOW_MS) {
      timestamps.shift();
    }
    if (timestamps.length === 0) rateLimitStore.delete(key);
  }
}, 300_000);

function getTelegramBotToken() {
  if (!telegramBotToken) {
    telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || null;
  }
  return telegramBotToken;
}

function getFireTriggers() {
  if (!_fireTriggers) {
    const result = loadTriggers();
    _fireTriggers = result.fireTriggers;
  }
  return _fireTriggers;
}

// Routes that have their own authentication
const PUBLIC_ROUTES = ['/telegram/webhook', '/github/webhook', '/slack/events', '/ping'];

/**
 * Timing-safe string comparison.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Centralized auth gate for all API routes.
 * Public routes pass through; everything else requires a valid API key from the database.
 * @param {string} routePath - The route path
 * @param {Request} request - The incoming request
 * @returns {Response|null} - Error response or null if authorized
 */
function checkAuth(routePath, request) {
  if (PUBLIC_ROUTES.includes(routePath)) return null;

  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const record = verifyApiKey(apiKey);
  if (!record) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/**
 * Extract job ID from branch name (e.g., "job/abc123" -> "abc123")
 */
function extractJobId(branchName) {
  if (!branchName || !branchName.startsWith('job/')) return null;
  return branchName.slice(4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleWebhook(request) {
  const body = await request.json();
  const { job } = body;
  if (!job) return Response.json({ error: 'Missing job field' }, { status: 400 });

  try {
    const result = await createJob(job);
    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Failed to create job' }, { status: 500 });
  }
}

async function handleTelegramRegister(request) {
  const body = await request.json();
  const { bot_token, webhook_url } = body;
  if (!bot_token || !webhook_url) {
    return Response.json({ error: 'Missing bot_token or webhook_url' }, { status: 400 });
  }

  try {
    const result = await setWebhook(bot_token, webhook_url, process.env.TELEGRAM_WEBHOOK_SECRET);
    telegramBotToken = bot_token;
    return Response.json({ success: true, result });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Failed to register webhook' }, { status: 500 });
  }
}

async function handleTelegramWebhook(request) {
  const botToken = getTelegramBotToken();
  if (!botToken) return Response.json({ ok: true });

  const adapter = getTelegramAdapter(botToken);
  const normalized = await adapter.receive(request);
  if (!normalized) return Response.json({ ok: true });

  // Process message asynchronously (don't block the webhook response)
  processChannelMessage(adapter, normalized, { userId: 'telegram', chatTitle: 'Telegram' }).catch((err) => {
    captureError('channel', err, { platform: 'telegram', threadId: normalized.threadId });
  });

  return Response.json({ ok: true });
}

/**
 * Process a normalized message through the AI layer with channel UX.
 * Message persistence is handled centrally by the AI layer.
 *
 * @param {ChannelAdapter} adapter
 * @param {object} normalized - { threadId, text, attachments, metadata }
 * @param {object} [channelContext] - { userId, chatTitle } for AI layer
 */
async function processChannelMessage(adapter, normalized, channelContext = { userId: 'unknown', chatTitle: 'Unknown' }) {
  await adapter.acknowledge(normalized.metadata);
  const stopIndicator = adapter.startProcessingIndicator(normalized.metadata);

  try {
    const response = await chat(
      normalized.threadId,
      normalized.text,
      normalized.attachments,
      channelContext
    );
    await adapter.sendResponse(normalized.threadId, response, normalized.metadata);
  } catch (err) {
    console.error('Failed to process message with AI:', err);
    await adapter
      .sendResponse(
        normalized.threadId,
        'Sorry, I encountered an error processing your message.',
        normalized.metadata
      )
      .catch(() => {});
  } finally {
    stopIndicator();
  }
}

async function handleSlackEvents(request) {
  const { SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_ALLOWED_USERS, SLACK_ALLOWED_CHANNELS, SLACK_REQUIRE_MENTION } = process.env;

  if (!SLACK_BOT_TOKEN || !SLACK_SIGNING_SECRET) {
    console.error('[slack] SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET not configured');
    return Response.json({ error: 'Slack not configured' }, { status: 500 });
  }

  const allowedUserIds = SLACK_ALLOWED_USERS
    ? SLACK_ALLOWED_USERS.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const allowedChannelIds = SLACK_ALLOWED_CHANNELS
    ? SLACK_ALLOWED_CHANNELS.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const adapter = getSlackAdapter({
    botToken: SLACK_BOT_TOKEN,
    signingSecret: SLACK_SIGNING_SECRET,
    allowedUserIds,
    allowedChannelIds,
    requireMention: SLACK_REQUIRE_MENTION === 'true',
  });

  const result = await adapter.receive(request);

  // URL verification challenge — must respond synchronously
  if (result && result.type === 'url_verification') {
    return Response.json({ challenge: result.challenge });
  }

  if (!result) return Response.json({ ok: true });

  // Process message asynchronously (don't block the webhook response)
  processChannelMessage(adapter, result, { userId: 'slack', chatTitle: 'Slack' }).catch((err) => {
    captureError('channel', err, { platform: 'slack', threadId: result.threadId });
  });

  return Response.json({ ok: true });
}

async function handleGithubWebhook(request) {
  const { GH_WEBHOOK_SECRET } = process.env;

  // Validate webhook secret (timing-safe, required)
  if (!GH_WEBHOOK_SECRET || !safeCompare(request.headers.get('x-github-webhook-secret-token'), GH_WEBHOOK_SECRET)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json();
  const jobId = payload.job_id || extractJobId(payload.branch);
  if (!jobId) return Response.json({ ok: true, skipped: true, reason: 'not a job' });

  // Dedup: skip notification if Docker dispatch already handled it
  if (jobId && isJobNotified(jobId)) {
    console.log(`Skipping Actions notification for job ${jobId.slice(0, 8)} -- already notified via Docker dispatch`);
    return Response.json({ ok: true, skipped: true, reason: 'already_notified_via_docker' });
  }

  try {
    const results = {
      job: payload.job || '',
      pr_url: payload.pr_url || payload.run_url || '',
      run_url: payload.run_url || '',
      status: payload.status || '',
      failure_stage: payload.failure_stage || '',
      merge_result: payload.merge_result || '',
      log: payload.log || '',
      changed_files: payload.changed_files || [],
      commit_message: payload.commit_message || '',
      target_repo: payload.target_repo || '',   // NEW: passthrough from Phase 10 payload
    };

    const message = await summarizeJob(results);
    await createNotification(message, payload);

    console.log(`Notification saved for job ${jobId.slice(0, 8)}`);

    // Route notification back to originating thread
    const origin = getJobOrigin(jobId);
    if (origin) {
      // Persist job outcome for future thread-scoped lookups
      try {
        saveJobOutcome({
          jobId,
          threadId: origin.threadId,
          status: results.status,
          mergeResult: results.merge_result,
          prUrl: results.pr_url,
          targetRepo: results.target_repo || null,   // NEW: nullable
          changedFiles: results.changed_files,
          logSummary: message,  // message = await summarizeJob(results)
        });
      } catch (err) {
        console.error('Failed to save job outcome:', err);
      }

      // Record usage event for billing (BILL-01) — Actions path
      try {
        recordUsageEvent({
          instanceName: process.env.INSTANCE_NAME || 'noah',
          eventType: 'job_dispatch',
          quantity: 1,
          durationSeconds: null, // Actions path does not have container timing
          refId: jobId,
          periodMonth: new Date().toISOString().slice(0, 7),
        });
      } catch (err) {
        console.error('Failed to record usage event (actions path):', err);
      }

      // Inject into LangGraph memory so agent knows the job finished
      addToThread(origin.threadId, `[Job completed] ${message}`).catch(() => {});

      // Send to Slack thread
      if (origin.platform === 'slack') {
        const [channel, threadTs] = origin.threadId.split(':');
        const { SLACK_BOT_TOKEN } = process.env;
        if (SLACK_BOT_TOKEN && channel && threadTs) {
          try {
            const { WebClient } = await import('@slack/web-api');
            const slack = new WebClient(SLACK_BOT_TOKEN);
            await slack.chat.postMessage({ channel, thread_ts: threadTs, text: message });
            console.log(`Slack notification sent for job ${jobId.slice(0, 8)}`);
          } catch (err) {
            console.error('Failed to send Slack notification:', err);
          }
        }
      }

      // Send to Telegram thread (thread-origin routing)
      if (origin.platform === 'telegram') {
        const { TELEGRAM_BOT_TOKEN } = process.env;
        if (TELEGRAM_BOT_TOKEN && origin.threadId) {
          try {
            const { sendMessage } = await import('../lib/tools/telegram.js');
            await sendMessage(TELEGRAM_BOT_TOKEN, origin.threadId, message);
            console.log(`Telegram notification sent for job ${jobId.slice(0, 8)}`);
          } catch (err) {
            console.error('Failed to send Telegram notification:', err);
          }
        }
      }
    }

    return Response.json({ ok: true, notified: true });
  } catch (err) {
    console.error('Failed to process GitHub webhook:', err);
    return Response.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}

async function handleJobStatus(request) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('job_id');
    const result = await getJobStatus(jobId);
    return Response.json(result);
  } catch (err) {
    console.error('Failed to get job status:', err);
    return Response.json({ error: 'Failed to get job status' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace route handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleCreateWorkspace(request) {
  const body = await request.json();
  const { instanceName, repoUrl, repoSlug } = body;

  if (!instanceName || !repoUrl || !repoSlug) {
    return Response.json({ error: 'Missing required fields: instanceName, repoUrl, repoSlug' }, { status: 400 });
  }

  try {
    const result = await ensureWorkspaceContainer(body);
    return Response.json(result, { status: 201 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 409 });
  }
}

async function handleListWorkspaces(request) {
  const url = new URL(request.url);
  const instanceName = url.searchParams.get('instance');

  if (!instanceName) {
    return Response.json({ error: 'Missing instance query param' }, { status: 400 });
  }

  const workspaces = listWorkspaces(instanceName);
  return Response.json({ workspaces });
}

async function handleStopWorkspace(request, workspaceId) {
  const result = await stopWorkspace(workspaceId);

  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 404 });
  }

  updateWorkspace(workspaceId, { lastActivityAt: Date.now() });
  return Response.json(result);
}

async function handleStartWorkspace(request, workspaceId) {
  const ws = getWorkspace(workspaceId);

  if (!ws) {
    return Response.json({ error: 'Workspace not found' }, { status: 404 });
  }

  try {
    const result = await ensureWorkspaceContainer({
      instanceName: ws.instanceName,
      repoUrl: ws.repoUrl,
      repoSlug: ws.repoSlug,
    });
    updateWorkspace(workspaceId, { lastActivityAt: Date.now() });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 409 });
  }
}

async function handleDestroyWorkspace(request, workspaceId) {
  const result = await destroyWorkspace(workspaceId);

  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 404 });
  }

  return Response.json(result);
}

async function handleSpawnShell(request, workspaceId) {
  let port = 7682;
  try {
    const body = await request.json();
    if (body.port) port = body.port;
  } catch { /* use default port */ }

  if (port < 7682 || port > 7685) {
    return Response.json({ error: 'Port must be between 7682 and 7685' }, { status: 400 });
  }

  try {
    const result = await spawnExtraShell(workspaceId, port);
    return Response.json(result);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 409;
    return Response.json({ error: err.message }, { status });
  }
}

async function handleGitStatus(request, workspaceId) {
  try {
    const result = await checkWorkspaceGitStatus(workspaceId);
    return Response.json(result);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    return Response.json({ error: err.message }, { status });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Next.js Route Handlers (catch-all)
// ─────────────────────────────────────────────────────────────────────────────

async function POST(request) {
  const url = new URL(request.url);
  const routePath = url.pathname.replace(/^\/api/, '');
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // Rate limit webhook endpoints
  if (['/slack/events', '/telegram/webhook', '/github/webhook'].includes(routePath)) {
    if (!checkRateLimit(clientIp, routePath)) {
      console.warn(`[rate-limit] ${clientIp} ${routePath} — blocked`);
      return Response.json({ error: 'Too many requests' }, { status: 429 });
    }
  }

  // Audit log
  console.log(`[api] POST ${routePath} from ${clientIp}`);

  // Auth check
  const authError = checkAuth(routePath, request);
  if (authError) return authError;

  // Fire triggers (non-blocking)
  try {
    const fireTriggers = getFireTriggers();
    // Clone request to read body for triggers without consuming it for the handler
    const clonedRequest = request.clone();
    const body = await clonedRequest.json().catch(() => ({}));
    const query = Object.fromEntries(url.searchParams);
    const headers = Object.fromEntries(request.headers);
    fireTriggers(routePath, body, query, headers);
  } catch (e) {
    // Trigger errors are non-fatal
  }

  // Route to handler
  switch (routePath) {
    case '/create-job':          return handleWebhook(request);
    case '/telegram/webhook':   return handleTelegramWebhook(request);
    case '/telegram/register':  return handleTelegramRegister(request);
    case '/slack/events':       return handleSlackEvents(request);
    case '/github/webhook':     return handleGithubWebhook(request);
    case '/workspaces':         return handleCreateWorkspace(request);
    default: {
      // Workspace sub-routes: /workspaces/:id/stop, /workspaces/:id/start
      const wsStopMatch = routePath.match(/^\/workspaces\/([^/]+)\/stop$/);
      if (wsStopMatch) return handleStopWorkspace(request, wsStopMatch[1]);

      const wsStartMatch = routePath.match(/^\/workspaces\/([^/]+)\/start$/);
      if (wsStartMatch) return handleStartWorkspace(request, wsStartMatch[1]);

      const wsShellMatch = routePath.match(/^\/workspaces\/([^/]+)\/shell$/);
      if (wsShellMatch) return handleSpawnShell(request, wsShellMatch[1]);

      const wsGitStatusMatch = routePath.match(/^\/workspaces\/([^/]+)\/git-status$/);
      if (wsGitStatusMatch) return handleGitStatus(request, wsGitStatusMatch[1]);

      return Response.json({ error: 'Not found' }, { status: 404 });
    }
  }
}

async function GET(request) {
  const url = new URL(request.url);
  const routePath = url.pathname.replace(/^\/api/, '');

  // Superadmin routes use their own Bearer token auth (not x-api-key)
  const superadminMatch = routePath.match(/^\/superadmin\/([a-z]+)$/);
  if (superadminMatch) {
    return handleSuperadminRequest(request, superadminMatch[1]);
  }

  // Auth check
  const authError = checkAuth(routePath, request);
  if (authError) return authError;

  switch (routePath) {
    case '/ping':           return Response.json({ message: 'Pong!' });
    case '/jobs/status':    return handleJobStatus(request);
    case '/workspaces':     return handleListWorkspaces(request);
    default:                return Response.json({ error: 'Not found' }, { status: 404 });
  }
}

async function DELETE(request) {
  const url = new URL(request.url);
  const routePath = url.pathname.replace(/^\/api/, '');

  const authError = checkAuth(routePath, request);
  if (authError) return authError;

  const wsMatch = routePath.match(/^\/workspaces\/([^/]+)$/);
  if (wsMatch) return handleDestroyWorkspace(request, wsMatch[1]);

  return Response.json({ error: 'Not found' }, { status: 404 });
}

export { GET, POST, DELETE };
