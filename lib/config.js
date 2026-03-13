import {
  getConfigValue,
  getConfigSecret,
  setConfigValue,
  setConfigSecret,
  getCustomProvider,
} from './db/config.js';
import { BUILTIN_PROVIDERS, getDefaultModel } from './llm-providers.js';

// ---------------------------------------------------------------------------
// Key classification
// ---------------------------------------------------------------------------

/**
 * Plain config keys stored unencrypted in the settings table (type = 'config').
 */
const CONFIG_KEYS = new Set([
  'LLM_PROVIDER',
  'LLM_MODEL',
  'SYSTEM_PROMPT',
  'DISABLE_JOBS',
  'DISABLE_REGISTRATION',
  'MAX_TOKENS',
  'TEMPERATURE',
]);

/**
 * Secret keys stored AES-256-GCM encrypted (type = 'config_secret').
 */
const SECRET_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'GH_TOKEN',
  'GH_WEBHOOK_SECRET',
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'ASSEMBLYAI_API_KEY',
  'BRAVE_API_KEY',
]);

/**
 * Default values returned when no DB row and no env var exists.
 */
const DEFAULTS = {
  LLM_PROVIDER: 'anthropic',
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const _cache = new Map();
const CACHE_TTL = 60_000; // 60 seconds

/**
 * Invalidate the in-memory config cache.
 * Call after any setConfig* write.
 */
export function invalidateConfigCache() {
  _cache.clear();
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Get a config value using the full resolution chain:
 *   cache -> custom provider API key -> encrypted DB secret -> plain DB config -> process.env -> DEFAULTS
 *
 * Special case: LLM_MODEL defaults to getDefaultModel(LLM_PROVIDER) when not set.
 *
 * @param {string} key
 * @returns {string|undefined}
 */
export function getConfig(key) {
  // 1. Check in-memory cache
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.value;
  }

  let value;

  // 2. Custom provider API key check: if LLM_PROVIDER is a custom provider,
  //    look up the API key from the custom provider record.
  if (key === 'ANTHROPIC_API_KEY' || key === 'OPENAI_API_KEY' || key === 'GOOGLE_API_KEY') {
    const provider = getConfig('LLM_PROVIDER');
    if (provider && !BUILTIN_PROVIDERS[provider]) {
      // Custom provider — get API key from provider definition
      const customProvider = getCustomProvider(provider);
      if (customProvider && customProvider.apiKey) {
        value = customProvider.apiKey;
        _cache.set(key, { value, ts: Date.now() });
        return value;
      }
    }
  }

  // 3. Encrypted secret from DB
  if (SECRET_KEYS.has(key)) {
    const secret = getConfigSecret(key);
    if (secret != null) {
      value = secret;
      _cache.set(key, { value, ts: Date.now() });
      return value;
    }
  }

  // 4. Plain config value from DB
  if (CONFIG_KEYS.has(key)) {
    const dbVal = getConfigValue(key);
    if (dbVal != null) {
      value = dbVal;
      _cache.set(key, { value, ts: Date.now() });
      return value;
    }
  }

  // 5. Environment variable
  if (process.env[key] != null) {
    value = process.env[key];
    _cache.set(key, { value, ts: Date.now() });
    return value;
  }

  // 6. Defaults
  if (key in DEFAULTS) {
    value = DEFAULTS[key];
    _cache.set(key, { value, ts: Date.now() });
    return value;
  }

  // 7. Special case: LLM_MODEL derives from LLM_PROVIDER default
  if (key === 'LLM_MODEL') {
    const provider = getConfig('LLM_PROVIDER');
    value = getDefaultModel(provider);
    _cache.set(key, { value, ts: Date.now() });
    return value;
  }

  return undefined;
}

/**
 * Set a config value. Dispatches to setConfigSecret or setConfigValue
 * based on whether the key is in SECRET_KEYS. Always invalidates cache.
 *
 * @param {string} key
 * @param {string} value
 */
export function setConfig(key, value) {
  if (SECRET_KEYS.has(key)) {
    setConfigSecret(key, value);
  } else {
    setConfigValue(key, value);
  }
  invalidateConfigCache();
}
