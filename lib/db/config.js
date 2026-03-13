import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from './index.js';
import { settings } from './schema.js';
import { encrypt, decrypt } from './crypto.js';

// ---------------------------------------------------------------------------
// Plain config values (type = 'config')
// ---------------------------------------------------------------------------

/**
 * Get a plain config value from the settings table.
 * @param {string} key
 * @returns {string|null}
 */
export function getConfigValue(key) {
  const db = getDb();
  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'config'), eq(settings.key, key)))
    .get();
  return row ? row.value : null;
}

/**
 * Set (upsert) a plain config value in the settings table.
 * @param {string} key
 * @param {string} value
 */
export function setConfigValue(key, value) {
  const db = getDb();
  const now = Date.now();

  const existing = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'config'), eq(settings.key, key)))
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
        type: 'config',
        key,
        value,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

// ---------------------------------------------------------------------------
// Encrypted secrets (type = 'config_secret')
// ---------------------------------------------------------------------------

/**
 * Get and decrypt a secret config value from the settings table.
 * @param {string} key
 * @returns {string|null}
 */
export function getConfigSecret(key) {
  const db = getDb();
  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'config_secret'), eq(settings.key, key)))
    .get();
  if (!row) return null;
  try {
    return decrypt(row.value);
  } catch {
    return null;
  }
}

/**
 * Encrypt and set a secret config value in the settings table.
 * @param {string} key
 * @param {string} value
 */
export function setConfigSecret(key, value) {
  const db = getDb();
  const now = Date.now();
  const encrypted = encrypt(value);

  const existing = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'config_secret'), eq(settings.key, key)))
    .get();

  if (existing) {
    db.update(settings)
      .set({ value: encrypted, updatedAt: now })
      .where(eq(settings.id, existing.id))
      .run();
  } else {
    db.insert(settings)
      .values({
        id: randomUUID(),
        type: 'config_secret',
        key,
        value: encrypted,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

// ---------------------------------------------------------------------------
// Custom LLM providers (type = 'llm_provider')
// ---------------------------------------------------------------------------

/**
 * Get a custom LLM provider definition by key.
 * @param {string} key - Provider key (e.g. 'my-provider')
 * @returns {object|null} Parsed provider definition
 */
export function getCustomProvider(key) {
  const db = getDb();
  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'llm_provider'), eq(settings.key, key)))
    .get();
  if (!row) return null;
  try {
    const decrypted = decrypt(row.value);
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

/**
 * Set (upsert) a custom LLM provider definition.
 * @param {string} key - Provider key
 * @param {object} providerDef - Provider definition object
 */
export function setCustomProvider(key, providerDef) {
  const db = getDb();
  const now = Date.now();
  const encrypted = encrypt(JSON.stringify(providerDef));

  const existing = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'llm_provider'), eq(settings.key, key)))
    .get();

  if (existing) {
    db.update(settings)
      .set({ value: encrypted, updatedAt: now })
      .where(eq(settings.id, existing.id))
      .run();
  } else {
    db.insert(settings)
      .values({
        id: randomUUID(),
        type: 'llm_provider',
        key,
        value: encrypted,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

/**
 * Delete a custom LLM provider definition.
 * @param {string} key - Provider key
 */
export function deleteCustomProvider(key) {
  const db = getDb();
  db.delete(settings)
    .where(and(eq(settings.type, 'llm_provider'), eq(settings.key, key)))
    .run();
}

/**
 * Get all custom LLM provider definitions.
 * @returns {Array<{ key: string, provider: object }>}
 */
export function getCustomProviders() {
  const db = getDb();
  const rows = db
    .select()
    .from(settings)
    .where(eq(settings.type, 'llm_provider'))
    .all();

  return rows
    .map((row) => {
      try {
        const decrypted = decrypt(row.value);
        return { key: row.key, provider: JSON.parse(decrypted) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
