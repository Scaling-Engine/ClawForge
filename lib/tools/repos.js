import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT } from '../paths.js';
import { getRepos as getDbRepos } from '../db/repos.js';

/**
 * Load allowed repos from DB first, falling back to config/REPOS.json.
 * DB read also auto-migrates from file on first call.
 * @returns {Array<{owner: string, slug: string, name: string, aliases: string[]}>}
 */
function loadAllowedRepos() {
  // Try DB first (includes auto-migration from file on first call)
  try {
    const dbRepos = getDbRepos();
    if (dbRepos.length > 0) return dbRepos;
  } catch {
    // DB not available (e.g., in job container) — fall through to file
  }

  // Fallback to config/REPOS.json
  const reposFile = path.join(PROJECT_ROOT, 'config', 'REPOS.json');
  try {
    const raw = fs.readFileSync(reposFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.repos || [];
  } catch {
    return [];
  }
}

/**
 * Resolve a natural language input to a canonical repo entry.
 * Matches case-insensitively against slug, name, and all aliases.
 * @param {string} input - User-supplied repo reference (e.g. "cf", "ClawForge", "the bot")
 * @param {Array<{owner: string, slug: string, name: string, aliases: string[]}>} repos - Repo list from loadAllowedRepos()
 * @returns {{owner: string, slug: string, name: string, aliases: string[]}|null}
 */
function resolveTargetRepo(input, repos) {
  if (!input || !Array.isArray(repos)) return null;
  const needle = input.toLowerCase();
  return repos.find((repo) => {
    if (repo.slug.toLowerCase() === needle) return true;
    if (repo.name.toLowerCase() === needle) return true;
    if (Array.isArray(repo.aliases) && repo.aliases.some((a) => a.toLowerCase() === needle)) return true;
    return false;
  }) ?? null;
}

/**
 * Determine dispatch method for a resolved repo.
 * Explicit per-repo config takes priority; defaults to 'docker'.
 * @param {object} resolvedRepo - Repo entry from resolveTargetRepo()
 * @returns {'docker'|'actions'}
 */
function getDispatchMethod(resolvedRepo) {
  if (resolvedRepo?.dispatch) return resolvedRepo.dispatch;
  return 'docker';
}

/**
 * Get quality gate commands for a resolved repo.
 * @param {object} resolvedRepo - Repo entry from resolveTargetRepo()
 * @returns {string[]} Array of shell commands to run as gates (empty = no gates)
 */
function getQualityGates(resolvedRepo) {
  return Array.isArray(resolvedRepo?.qualityGates) ? resolvedRepo.qualityGates : [];
}

/**
 * Get merge policy for a resolved repo.
 * @param {object} resolvedRepo - Repo entry from resolveTargetRepo()
 * @returns {'auto'|'gate-required'|'manual'}
 */
function getMergePolicy(resolvedRepo) {
  const policy = resolvedRepo?.mergePolicy;
  if (policy === 'gate-required' || policy === 'manual') return policy;
  return 'auto';
}

export { loadAllowedRepos, resolveTargetRepo, getDispatchMethod, getQualityGates, getMergePolicy };
