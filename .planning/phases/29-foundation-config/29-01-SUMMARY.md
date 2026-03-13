---
phase: 29-foundation-config
plan: "01"
subsystem: config
tags: [config, sqlite, encryption, llm-providers]
dependency_graph:
  requires: [lib/db/index.js, lib/db/schema.js]
  provides: [lib/db/crypto.js, lib/db/config.js, lib/llm-providers.js, lib/config.js]
  affects: [all phases that call getConfig/setConfig]
tech_stack:
  added: []
  patterns: [AES-256-GCM via Node.js crypto, PBKDF2 key derivation, Drizzle ORM upsert, 60s TTL in-memory cache]
key_files:
  created:
    - lib/db/crypto.js
    - lib/db/config.js
    - lib/llm-providers.js
    - lib/config.js
  modified: []
decisions:
  - "crypto.js reads AUTH_SECRET directly from process.env (not getConfig) to avoid circular dependency"
  - "SALT kept as 'thepopebot-config-v1' for migration compatibility with any existing encrypted rows"
  - "setConfig added as new wrapper in lib/config.js (not in upstream) to satisfy CONFIG-01 requirement"
  - "LLM_MODEL special-cased at end of resolution chain to derive from getDefaultModel(LLM_PROVIDER)"
metrics:
  duration: "12 minutes"
  completed: "2026-03-13"
  tasks_completed: 2
  files_created: 4
---

# Phase 29 Plan 01: DB-Backed Config System Summary

DB-backed config foundation with AES-256-GCM secret encryption, Drizzle ORM CRUD for settings table type discriminators (config/config_secret/llm_provider), static BUILTIN_PROVIDERS for the settings UI, and a cached resolution facade (DB -> env -> defaults).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Crypto module + DB config CRUD | c850559 | lib/db/crypto.js, lib/db/config.js |
| 2 | LLM providers + config facade | c850559 | lib/llm-providers.js, lib/config.js |

## What Was Built

### lib/db/crypto.js
AES-256-GCM symmetric encryption using Node.js built-in `crypto`. Key derived from `process.env.AUTH_SECRET` via PBKDF2 (100K iterations, SHA-256). Each `encrypt()` call generates a fresh 12-byte IV; output is a JSON string with `{ iv, ciphertext, tag }` all base64-encoded. Reads `AUTH_SECRET` directly from `process.env` — never via `getConfig()` to avoid circular dependency.

### lib/db/config.js
Full CRUD layer for the `settings` table using three type discriminators:
- `'config'` — plain text values (`getConfigValue`/`setConfigValue`)
- `'config_secret'` — AES-256-GCM encrypted values (`getConfigSecret`/`setConfigSecret`)
- `'llm_provider'` — encrypted JSON provider definitions (`getCustomProvider`/`setCustomProvider`/`deleteCustomProvider`/`getCustomProviders`)

All writes use upsert logic (update if exists, insert if not). Uses Drizzle ORM `eq`/`and` from `drizzle-orm`, `randomUUID()` for new row IDs, `Date.now()` for timestamps.

### lib/llm-providers.js
Static `BUILTIN_PROVIDERS` object covering `anthropic`, `openai`, and `google`. Each provider includes `name`, `defaultModel`, and a `models` array of `{ id, name }` objects for the settings UI. `getDefaultModel(providerKey)` returns the provider's default model ID, falling back to anthropic's default for unknown providers.

### lib/config.js
Top-level config facade with 60-second TTL in-memory cache. Resolution chain for `getConfig(key)`:
1. In-memory cache (60s TTL)
2. Custom provider API key (if LLM_PROVIDER is not a builtin, fetch from custom provider record)
3. Encrypted DB secret (`SECRET_KEYS` set)
4. Plain DB config value (`CONFIG_KEYS` set)
5. `process.env[key]`
6. `DEFAULTS` (LLM_PROVIDER defaults to `'anthropic'`)
7. LLM_MODEL special case: derives from `getDefaultModel(LLM_PROVIDER)`

`setConfig(key, value)` dispatches to `setConfigSecret` or `setConfigValue` based on `SECRET_KEYS` membership, then invalidates cache. `invalidateConfigCache()` clears the Map.

## Verification Results

```
# Crypto round-trip
AUTH_SECRET=test-secret-key node -e "import('./lib/db/crypto.js').then(m => { const e = m.encrypt('hello'); console.log(m.decrypt(e)); })"
# Output: hello  ✓

# BUILTIN_PROVIDERS keys
node -e "import('./lib/llm-providers.js').then(m => console.log(Object.keys(m.BUILTIN_PROVIDERS)))"
# Output: [ 'anthropic', 'openai', 'google' ]  ✓

# Config facade exports
AUTH_SECRET=test-secret-key node -e "import('./lib/config.js').then(m => console.log(typeof m.getConfig, typeof m.setConfig, typeof m.invalidateConfigCache))"
# Output: function function function  ✓
```

## Deviations from Plan

None — plan executed exactly as written.

The `setConfig` wrapper was explicitly specified in the plan (Task 2 action) even though it is not in the upstream thepopebot source. This was expected and implemented as described.

## Self-Check: PASSED

Files exist:
- FOUND: lib/db/crypto.js
- FOUND: lib/db/config.js
- FOUND: lib/llm-providers.js
- FOUND: lib/config.js

Commits exist:
- FOUND: c850559 feat(29-01): add DB-backed config system
