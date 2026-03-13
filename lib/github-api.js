import { githubApi } from './tools/github.js';
import nacl from 'tweetnacl';
import sealedbox from 'tweetnacl-sealedbox-js';

/**
 * Base path for GitHub repo API calls.
 */
function base() {
  const { GH_OWNER, GH_REPO } = process.env;
  return `/repos/${GH_OWNER}/${GH_REPO}`;
}

/**
 * Encrypt a plaintext value using sealed-box encryption for the GitHub Secrets API.
 * @param {string} value - Plaintext secret value
 * @param {string} publicKeyBase64 - Base64-encoded public key from GitHub
 * @returns {string} Base64-encoded encrypted value
 */
function encryptForGitHub(value, publicKeyBase64) {
  const publicKey = new Uint8Array(Buffer.from(publicKeyBase64, 'base64'));
  const messageBytes = new Uint8Array(Buffer.from(value));
  const encryptedBytes = sealedbox.seal(messageBytes, publicKey);
  return Buffer.from(encryptedBytes).toString('base64');
}

/**
 * Raw GitHub API fetch for methods that return 204 No Content (PUT, DELETE).
 * githubApi() always calls res.json() which fails on empty body.
 */
async function githubApiRaw(endpoint, options = {}) {
  const { GH_TOKEN } = process.env;
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${error}`);
  }

  // 204 No Content or 201 Created with no body — return success
  const text = await res.text();
  if (!text) return { success: true };
  try {
    return JSON.parse(text);
  } catch {
    return { success: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Secrets CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all repository secrets (names + metadata, never values).
 * @returns {Promise<Array<{name: string, created_at: string, updated_at: string}>>}
 */
export async function listSecrets() {
  const data = await githubApi(`${base()}/actions/secrets`);
  return data.secrets || [];
}

/**
 * Get the repository public key for encrypting secrets.
 * @returns {Promise<{key: string, key_id: string}>}
 */
export async function getPublicKey() {
  return githubApi(`${base()}/actions/secrets/public-key`);
}

/**
 * Create or update a repository secret.
 * @param {string} name - Secret name (e.g., AGENT_MY_SECRET)
 * @param {string} value - Plaintext secret value (encrypted before transit)
 */
export async function upsertSecret(name, value) {
  const { key, key_id } = await getPublicKey();
  const encrypted_value = encryptForGitHub(value, key);
  return githubApiRaw(`${base()}/actions/secrets/${name}`, {
    method: 'PUT',
    body: JSON.stringify({ encrypted_value, key_id }),
  });
}

/**
 * Delete a repository secret.
 * @param {string} name - Secret name to delete
 */
export async function deleteSecret(name) {
  return githubApiRaw(`${base()}/actions/secrets/${name}`, {
    method: 'DELETE',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Variables CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all repository variables (names + values).
 * @returns {Promise<Array<{name: string, value: string, created_at: string, updated_at: string}>>}
 */
export async function listVariables() {
  const data = await githubApi(`${base()}/actions/variables`);
  return data.variables || [];
}

/**
 * Create a new repository variable.
 * @param {string} name - Variable name
 * @param {string} value - Variable value
 */
export async function createVariable(name, value) {
  return githubApiRaw(`${base()}/actions/variables`, {
    method: 'POST',
    body: JSON.stringify({ name, value }),
  });
}

/**
 * Update an existing repository variable.
 * @param {string} name - Variable name
 * @param {string} value - New value
 */
export async function updateVariable(name, value) {
  return githubApiRaw(`${base()}/actions/variables/${name}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });
}

/**
 * Delete a repository variable.
 * @param {string} name - Variable name to delete
 */
export async function deleteVariable(name) {
  return githubApiRaw(`${base()}/actions/variables/${name}`, {
    method: 'DELETE',
  });
}
