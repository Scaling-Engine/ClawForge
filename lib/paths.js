import path from 'path';

/**
 * Central path resolver for ClawForge.
 * All paths resolve from process.cwd() (the user's project root).
 */

const PROJECT_ROOT = process.cwd();

export {
  PROJECT_ROOT,
};

// config/ files
export const configDir = path.join(PROJECT_ROOT, 'config');
export const cronsFile = path.join(PROJECT_ROOT, 'config', 'CRONS.json');
export const triggersFile = path.join(PROJECT_ROOT, 'config', 'TRIGGERS.json');
export const eventHandlerMd = path.join(PROJECT_ROOT, 'config', 'EVENT_HANDLER.md');
export const jobSummaryMd = path.join(PROJECT_ROOT, 'config', 'JOB_SUMMARY.md');
export const soulMd = path.join(PROJECT_ROOT, 'config', 'SOUL.md');
export const claudeMd = path.join(PROJECT_ROOT, 'CLAUDE.md');

// Working directories for command-type actions
export const cronDir = path.join(PROJECT_ROOT, 'cron');
export const triggersDir = path.join(PROJECT_ROOT, 'triggers');

// Logs
export const logsDir = path.join(PROJECT_ROOT, 'logs');

// Data (SQLite memory, etc.)
export const dataDir = path.join(PROJECT_ROOT, 'data');

// Database
export const clawforgeDb = process.env.DATABASE_PATH || path.join(PROJECT_ROOT, 'data', 'clawforge.sqlite');
export const hubDb = process.env.HUB_DATABASE_PATH || path.join(PROJECT_ROOT, 'data', 'hub.sqlite');

// .env
export const envFile = path.join(PROJECT_ROOT, '.env');

// Feature flags
export const featuresFile = path.join(PROJECT_ROOT, 'config', 'FEATURES.json');

// MCP servers
export const mcpServersFile = path.join(PROJECT_ROOT, 'config', 'MCP_SERVERS.json');

// Defaults — image-baked seed data, outside the mounted config volume.
// Files here survive Docker named volume mounts over config/.
export const defaultsDir = path.join(PROJECT_ROOT, 'defaults');
export const defaultReposFile = path.join(PROJECT_ROOT, 'defaults', 'REPOS.json');
export const defaultClusterFile = path.join(PROJECT_ROOT, 'defaults', 'CLUSTER.json');

// Cluster config
export const clusterFile = path.join(PROJECT_ROOT, 'config', 'CLUSTER.json');
