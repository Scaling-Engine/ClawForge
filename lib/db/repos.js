import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { eq, and } from 'drizzle-orm';
import { getDb } from './index.js';
import { settings } from './schema.js';
import { PROJECT_ROOT } from '../paths.js';

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;
const VALID_DISPATCH = ['docker', 'actions'];
const VALID_MERGE_POLICY = ['auto', 'gate-required', 'manual'];

/**
 * Validate a repo object. Returns null on success, or an error string.
 * @param {object} repo
 * @param {boolean} isNew - Whether this is a new repo (slug required)
 * @returns {string|null}
 */
function validateRepo(repo, isNew = true) {
  if (isNew) {
    if (!repo.owner || typeof repo.owner !== 'string' || !repo.owner.trim()) {
      return 'owner is required';
    }
    if (!repo.slug || typeof repo.slug !== 'string') {
      return 'slug is required';
    }
    if (!SLUG_RE.test(repo.slug)) {
      return 'slug must be 2-50 chars, lowercase alphanumeric and hyphens only';
    }
    if (!repo.name || typeof repo.name !== 'string' || !repo.name.trim()) {
      return 'name is required';
    }
    if (repo.name.length > 100) {
      return 'name must be 100 chars or fewer';
    }
  } else {
    // Updates: validate only provided fields
    if (repo.owner !== undefined && (typeof repo.owner !== 'string' || !repo.owner.trim())) {
      return 'owner must be a non-empty string';
    }
    if (repo.name !== undefined) {
      if (typeof repo.name !== 'string' || !repo.name.trim()) return 'name must be a non-empty string';
      if (repo.name.length > 100) return 'name must be 100 chars or fewer';
    }
  }

  if (repo.aliases !== undefined) {
    if (!Array.isArray(repo.aliases)) return 'aliases must be an array of strings';
    if (!repo.aliases.every((a) => typeof a === 'string')) return 'each alias must be a string';
  }

  if (repo.dispatch !== undefined && !VALID_DISPATCH.includes(repo.dispatch)) {
    return `dispatch must be one of: ${VALID_DISPATCH.join(', ')}`;
  }

  if (repo.qualityGates !== undefined) {
    if (!Array.isArray(repo.qualityGates)) return 'qualityGates must be an array of strings';
    if (!repo.qualityGates.every((g) => typeof g === 'string')) return 'each quality gate must be a string';
  }

  if (repo.mergePolicy !== undefined && !VALID_MERGE_POLICY.includes(repo.mergePolicy)) {
    return `mergePolicy must be one of: ${VALID_MERGE_POLICY.join(', ')}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Core CRUD
// ---------------------------------------------------------------------------

let _migrated = false;

/**
 * Get all repos from the settings table. Falls back to empty array.
 * On first call, auto-migrates from config/REPOS.json if DB is empty.
 * @returns {Array<object>}
 */
export function getRepos() {
  if (!_migrated) {
    _migrated = true;
    migrateReposFromFile();
  }

  const db = getDb();
  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'repos'), eq(settings.key, 'all')))
    .get();

  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save the full repos array to the settings table.
 * @param {Array<object>} repos
 */
export function saveRepos(repos) {
  if (!Array.isArray(repos)) throw new Error('repos must be an array');

  const db = getDb();
  const now = Date.now();
  const value = JSON.stringify(repos);

  const existing = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'repos'), eq(settings.key, 'all')))
    .get();

  if (existing) {
    db.update(settings)
      .set({ value, updatedAt: now })
      .where(eq(settings.id, existing.id))
      .run();
  } else {
    db.insert(settings)
      .values({
        id: randomUUID(),
        type: 'repos',
        key: 'all',
        value,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

/**
 * Add a new repo. Validates fields and checks slug uniqueness.
 * @param {object} repo
 * @returns {{ repo: object } | { error: string }}
 */
export function addRepo(repo) {
  const normalized = {
    owner: repo.owner?.trim(),
    slug: repo.slug?.trim().toLowerCase(),
    name: repo.name?.trim(),
    aliases: Array.isArray(repo.aliases) ? repo.aliases.filter(Boolean) : [],
    dispatch: repo.dispatch || 'docker',
    qualityGates: Array.isArray(repo.qualityGates) ? repo.qualityGates.filter(Boolean) : [],
    mergePolicy: repo.mergePolicy || 'auto',
  };

  const err = validateRepo(normalized, true);
  if (err) return { error: err };

  const repos = getRepos();
  if (repos.some((r) => r.slug === normalized.slug)) {
    return { error: `A repo with slug "${normalized.slug}" already exists` };
  }

  repos.push(normalized);
  saveRepos(repos);
  return { repo: normalized };
}

/**
 * Update an existing repo by slug. Merges updates into existing entry.
 * @param {string} slug
 * @param {object} updates
 * @returns {{ repo: object } | { error: string }}
 */
export function updateRepo(slug, updates) {
  const err = validateRepo(updates, false);
  if (err) return { error: err };

  const repos = getRepos();
  const idx = repos.findIndex((r) => r.slug === slug);
  if (idx === -1) return { error: `Repo "${slug}" not found` };

  // Merge updates (slug is immutable)
  const updated = { ...repos[idx] };
  if (updates.owner !== undefined) updated.owner = updates.owner.trim();
  if (updates.name !== undefined) updated.name = updates.name.trim();
  if (updates.aliases !== undefined) updated.aliases = updates.aliases.filter(Boolean);
  if (updates.dispatch !== undefined) updated.dispatch = updates.dispatch;
  if (updates.qualityGates !== undefined) updated.qualityGates = updates.qualityGates.filter(Boolean);
  if (updates.mergePolicy !== undefined) updated.mergePolicy = updates.mergePolicy;

  repos[idx] = updated;
  saveRepos(repos);
  return { repo: updated };
}

/**
 * Delete a repo by slug.
 * @param {string} slug
 * @returns {boolean}
 */
export function deleteRepo(slug) {
  const repos = getRepos();
  const filtered = repos.filter((r) => r.slug !== slug);
  if (filtered.length === repos.length) return false;
  saveRepos(filtered);
  return true;
}

/**
 * Migrate repos from config/REPOS.json into the DB if DB is empty.
 * Called lazily on first getRepos() call.
 */
export function migrateReposFromFile() {
  const db = getDb();
  const existing = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'repos'), eq(settings.key, 'all')))
    .get();

  // Only migrate if no repos in DB yet
  if (existing) return;

  const reposFile = path.join(PROJECT_ROOT, 'config', 'REPOS.json');
  try {
    const raw = fs.readFileSync(reposFile, 'utf8');
    const parsed = JSON.parse(raw);
    const repos = parsed.repos || [];
    if (repos.length > 0) {
      saveRepos(repos);
    }
  } catch {
    // No file or invalid JSON — nothing to migrate
  }
}
