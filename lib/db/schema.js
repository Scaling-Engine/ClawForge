import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('New Chat'),
  starred: integer('starred').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  notification: text('notification').notNull(),
  payload: text('payload').notNull(),
  read: integer('read').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull(),
  channelId: text('channel_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const jobOrigins = sqliteTable('job_origins', {
  jobId: text('job_id').primaryKey(),
  threadId: text('thread_id').notNull(),
  platform: text('platform').notNull(),
  dispatchMethod: text('dispatch_method').notNull().default('actions'),
  containerId: text('container_id'),
  notified: integer('notified').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const jobOutcomes = sqliteTable('job_outcomes', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
  threadId: text('thread_id').notNull(),
  status: text('status').notNull(),
  mergeResult: text('merge_result').notNull(),
  prUrl: text('pr_url').notNull().default(''),
  targetRepo: text('target_repo'),  // nullable — no .notNull(), no .default() — null for same-repo jobs
  changedFiles: text('changed_files').notNull().default('[]'),
  logSummary: text('log_summary').notNull().default(''),
  createdAt: integer('created_at').notNull(),
});

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdBy: text('created_by'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const codeWorkspaces = sqliteTable('code_workspaces', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),
  repoSlug: text('repo_slug').notNull(),
  repoUrl: text('repo_url').notNull(),
  containerId: text('container_id'),
  containerName: text('container_name'),
  volumeName: text('volume_name').notNull(),
  featureBranch: text('feature_branch'),
  status: text('status').notNull().default('creating'),
  threadId: text('thread_id'),
  lastActivityAt: integer('last_activity_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const clusterRuns = sqliteTable('cluster_runs', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),
  clusterName: text('cluster_name').notNull(),
  status: text('status').notNull().default('running'),
  initialPrompt: text('initial_prompt'),
  slackChannel: text('slack_channel'),
  slackThreadTs: text('slack_thread_ts'),
  failReason: text('fail_reason'),
  totalAgentRuns: integer('total_agent_runs').default(0),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
});

export const clusterAgentRuns = sqliteTable('cluster_agent_runs', {
  id: text('id').primaryKey(),
  clusterRunId: text('cluster_run_id').notNull().references(() => clusterRuns.id),
  role: text('role').notNull(),
  agentIndex: integer('agent_index').notNull(),
  status: text('status').notNull().default('running'),
  label: text('label'),
  exitCode: integer('exit_code'),
  prUrl: text('pr_url'),
  volumeName: text('volume_name'),
  logs: text('logs'),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
});

export const terminalSessions = sqliteTable('terminal_sessions', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').notNull(),
  repoSlug: text('repo_slug'),
  volumeName: text('volume_name'),
  cwdPath: text('cwd_path'),
  status: text('status').notNull().default('running'),
  thinkingEnabled: integer('thinking_enabled').notNull().default(0),
  shellMode: integer('shell_mode').notNull().default(0),
  totalCostUsd: real('total_cost_usd').default(0),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
});

export const terminalCosts = sqliteTable('terminal_costs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  turnIndex: integer('turn_index').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheCreationTokens: integer('cache_creation_tokens').notNull().default(0),
  estimatedUsd: real('estimated_usd').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const errorLog = sqliteTable('error_log', {
  id: text('id').primaryKey(),
  context: text('context').notNull(),       // 'channel', 'webhook', 'startup', 'db', 'cron'
  severity: text('severity').notNull(),     // 'error', 'warn', 'info'
  message: text('message').notNull(),
  stack: text('stack'),
  metadata: text('metadata'),              // JSON string — sanitized, no PII
  instanceName: text('instance_name'),
  createdAt: integer('created_at').notNull(),
});

export const usageEvents = sqliteTable('usage_events', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),
  eventType: text('event_type').notNull(),       // 'job_dispatch'
  quantity: real('quantity').notNull().default(1),
  durationSeconds: integer('duration_seconds'),   // nullable — populated on job completion
  periodMonth: text('period_month').notNull(),     // 'YYYY-MM'
  refId: text('ref_id'),                          // jobId for tracing
  createdAt: integer('created_at').notNull(),
});

export const billingLimits = sqliteTable('billing_limits', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),
  limitType: text('limit_type').notNull(),         // 'jobs_per_month', 'concurrent_jobs'
  limitValue: real('limit_value').notNull(),
  warningSentPeriod: text('warning_sent_period'),  // 'YYYY-MM' — dedup 80% warnings
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const onboardingState = sqliteTable('onboarding_state', {
  id: text('id').primaryKey(),                                          // always 'singleton'
  currentStep: text('current_step').notNull().default('github_connect'), // tracks wizard position
  githubConnect: text('github_connect').notNull().default('pending'),   // 'pending' | 'complete' | 'failed'
  dockerVerify: text('docker_verify').notNull().default('pending'),
  channelConnect: text('channel_connect').notNull().default('pending'),
  firstJob: text('first_job').notNull().default('pending'),
  completedAt: text('completed_at'),                                    // nullable ISO string when wizard done
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
