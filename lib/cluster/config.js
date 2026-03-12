import fs from 'fs/promises';
import { clusterFile } from '../paths.js';

/**
 * Load and parse the cluster configuration file.
 *
 * @param {string} [filePath] - Optional override path (defaults to config/CLUSTER.json via paths.js).
 *   Accepts an override so tests can point to fixture files without touching the real config.
 * @returns {Promise<{clusters: Array}>} Parsed config object, or { clusters: [] } if file missing.
 */
export async function loadClusterConfig(filePath) {
  const resolvedPath = filePath || clusterFile;
  try {
    const raw = await fs.readFile(resolvedPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { clusters: [] };
    }
    throw err;
  }
}

/**
 * Get a single cluster definition by name.
 *
 * @param {string} name - Cluster name to find.
 * @param {string} [filePath] - Optional override path for the cluster config file (for testing).
 * @returns {Promise<object|null>} Cluster definition or null if not found.
 */
export async function getCluster(name, filePath) {
  const config = await loadClusterConfig(filePath);
  const found = (config.clusters || []).find((c) => c.name === name);
  return found || null;
}

/**
 * Validate a cluster config object.
 *
 * Checks:
 * - config.clusters must be an array
 * - Each cluster must have: name (string), roles (non-empty array)
 * - Each role must have: name (string), systemPrompt (string), allowedTools (array)
 *
 * @param {object} config - The config object to validate.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateClusterConfig(config) {
  const errors = [];

  if (!config || !Array.isArray(config.clusters)) {
    errors.push('"clusters" must be an array at the root of the config');
    return { valid: false, errors };
  }

  config.clusters.forEach((cluster, ci) => {
    const prefix = `Cluster[${ci}]`;

    if (!cluster.name || typeof cluster.name !== 'string') {
      errors.push(`${prefix}: missing required field "name" (must be a string)`);
    }

    if (!Array.isArray(cluster.roles) || cluster.roles.length === 0) {
      errors.push(`${prefix}: missing required field "roles" (must be a non-empty array)`);
      return; // Skip role validation if roles is missing/empty
    }

    cluster.roles.forEach((role, ri) => {
      const rprefix = `${prefix} Role[${ri}]`;

      if (!role.name || typeof role.name !== 'string') {
        errors.push(`${rprefix}: missing required field "name" (must be a string)`);
      }

      if (!role.systemPrompt || typeof role.systemPrompt !== 'string') {
        errors.push(`${rprefix}: missing required field "systemPrompt" (must be a string)`);
      }

      if (!Array.isArray(role.allowedTools)) {
        errors.push(`${rprefix}: missing required field "allowedTools" (must be an array)`);
      }
    });
  });

  return { valid: errors.length === 0, errors };
}
