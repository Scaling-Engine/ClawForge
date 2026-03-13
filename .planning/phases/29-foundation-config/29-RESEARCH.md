# Phase 29: Foundation & Config System - Research

**Researched:** 2026-03-12
**Domain:** SQLite config layer, UI primitives, static utility modules
**Confidence:** HIGH

## Summary

Phase 29 cherry-picks four files from thepopebot upstream and adds one new DB module (`lib/db/config.js`). All files are well-understood — the upstream source is publicly accessible and fully readable. The primary task is adapting import paths and understanding the schema relationship, not discovering new patterns.

The key insight: ClawForge already has a `settings` table whose schema is **identical** to thepopebot's `settings` table. No migration is required for a new table — the config system uses the existing `settings` table with `type = 'config'`, `type = 'config_secret'`, and `type = 'llm_provider'` discriminators. The encryption subsystem requires a new `lib/db/crypto.js` module (currently missing from ClawForge).

The combobox uses no Radix UI primitives — it is a fully custom React component that only needs ClawForge's existing icon exports (`SearchIcon`, `ChevronDownIcon`, `CheckIcon` all confirmed present in `lib/chat/components/icons.jsx`).

**Primary recommendation:** Cherry-pick upstream files with only import path and tool-name substitutions. No new npm packages required. Write `lib/db/crypto.js` as a new file (not a cherry-pick — it doesn't exist in ClawForge at all).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONFIG-01 | `lib/config.js` provides `getConfig(key)` backed by SQLite config table | Upstream source read. Uses `lib/db/config.js` + `lib/llm-providers.js`. Import paths must change from `thepopebot/db` to `./db/config.js`. |
| CONFIG-02 | `lib/chat/components/ui/combobox.jsx` renders a searchable dropdown | Upstream source read. No Radix UI. Imports `icons.js` (relative) and `../../utils.js`. All three icons confirmed in ClawForge. |
| CONFIG-03 | `lib/chat/components/tool-names.js` maps tool IDs to display names | Upstream file is a single `getToolDisplayName()` auto-formatter, no static map. ClawForge must export the 9 ClawForge tool names. |
| CONFIG-04 | `lib/llm-providers.js` lists providers with model IDs for settings UI | Upstream source read. `BUILTIN_PROVIDERS` object covers anthropic/openai/google matching `lib/ai/model.js` exactly. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.6.2 | SQLite driver | Already installed, used by Drizzle |
| drizzle-orm | ^0.44.0 | ORM query builder | Already installed, all DB modules use it |
| Node.js crypto | built-in | AES-256-GCM encryption for secrets | No new dep, already used in api-keys.js |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | (not used) | N/A | Combobox uses custom icons, NOT lucide |
| @radix-ui/* | (not installed) | N/A | Combobox does NOT use Radix — confirmed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reuse `settings` table | Add separate `config` table | No benefit — upstream uses `settings` with type discriminators. ClawForge schema already matches. |
| Auto-derive tool display names | Static name map | Upstream uses auto-derivation only. Static map is unnecessary overhead. |

**Installation:** No new packages required. All dependencies already in `package.json`.

## Architecture Patterns

### File Dependency Graph
```
lib/config.js
├── lib/db/config.js          (new — cherry-pick + adapt)
│   ├── lib/db/index.js       (existing — getDb())
│   ├── lib/db/schema.js      (existing — settings table)
│   └── lib/db/crypto.js      (new — must author)
└── lib/llm-providers.js      (new — cherry-pick verbatim)

lib/chat/components/ui/combobox.jsx
├── lib/chat/components/icons.js   (existing — SearchIcon, ChevronDownIcon, CheckIcon)
└── lib/chat/utils.js              (existing — cn())

lib/chat/components/tool-names.js  (new — write fresh for ClawForge tools)
```

### Pattern 1: Settings Table Type Discriminator
**What:** Single `settings` table handles multiple categories of data via the `type` column.
**When to use:** All config, secrets, and custom provider data go through this one table.

Existing type values already in use:
- `'api_key'` — used by `lib/db/api-keys.js`
- `'update'` — used by `lib/db/update-check.js`

New type values added by Phase 29:
- `'config'` — plain config values (LLM_PROVIDER, LLM_MODEL, etc.)
- `'config_secret'` — AES-256-GCM encrypted secrets (ANTHROPIC_API_KEY, GH_TOKEN, etc.)
- `'llm_provider'` — custom LLM provider definitions (encrypted JSON)

```javascript
// Source: https://raw.githubusercontent.com/stephengpope/thepopebot/main/lib/db/config.js
// Pattern used throughout lib/db/config.js:
db.select()
  .from(settings)
  .where(and(eq(settings.type, 'config'), eq(settings.key, key)))
  .get();
```

### Pattern 2: Config Cache with TTL
**What:** `lib/config.js` maintains a 60-second in-memory cache to avoid DB roundtrips on every `getConfig()` call.
**When to use:** `getConfig()` is called frequently from hot paths (model creation, auth checks).

```javascript
// Source: https://raw.githubusercontent.com/stephengpope/thepopebot/main/lib/config.js
const _cache = new Map();
const CACHE_TTL = 60_000; // 60 seconds

export function invalidateConfigCache() {
  _cache.clear();
}
```

Cache must be invalidated after any `setConfigValue()` or `setConfigSecret()` call.

### Pattern 3: Resolution Chain
**What:** `getConfig(key)` resolves: DB → `process.env` → DEFAULTS.
**Why:** Allows runtime DB overrides while preserving backwards compatibility with `.env` deployments.

```javascript
// Source: https://raw.githubusercontent.com/stephengpope/thepopebot/main/lib/config.js
// Resolution chain for getConfig():
// 1. Check in-memory cache
// 2. If CUSTOM_API_KEY → look up from custom provider record
// 3. If in SECRET_KEYS → getConfigSecret() (encrypted DB lookup)
// 4. If in CONFIG_KEYS → getConfigValue() (plain DB lookup)
// 5. Fall back to process.env[key]
// 6. Fall back to DEFAULTS[key]
// 7. Special case: LLM_MODEL depends on LLM_PROVIDER via getDefaultModel()
```

### Pattern 4: Combobox Component Interface
**What:** Controlled component receiving `options`, `value`, `onChange`. Self-contained with search filter state.

```javascript
// Source: https://raw.githubusercontent.com/stephengpope/thepopebot/main/lib/chat/components/ui/combobox.jsx
// Props: options, value, onChange, placeholder, loading, disabled, highlight
// options shape: [{ value: string, label: string }]
<Combobox
  options={[{ value: 'anthropic', label: 'Anthropic' }]}
  value={currentProvider}
  onChange={(val) => setProvider(val)}
  placeholder="Select provider..."
/>
```

### Anti-Patterns to Avoid
- **Using Radix UI for combobox:** The upstream component is fully custom. Do not add `@radix-ui/react-popover` or similar.
- **Creating a separate `config` table:** The `settings` table already handles this via type discriminators. Adding a new table creates migration complexity for no benefit.
- **Calling `getConfig()` inside the crypto module:** `crypto.js` reads `AUTH_SECRET` directly from `process.env` — it must never use `getConfig()` to avoid circular dependency.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret encryption | Custom cipher | AES-256-GCM via Node.js `crypto` (upstream pattern) | Already handles IV generation, auth tags, PBKDF2 key derivation |
| Config caching | React state / module-level Map without TTL | Module-level Map with 60s TTL (upstream pattern) | TTL prevents stale config after DB writes |
| Search filter in combobox | Fuse.js / third-party fuzzy search | Simple `String.includes()` case-insensitive filter | Sufficient for short provider/model lists |

## Common Pitfalls

### Pitfall 1: Missing `lib/db/crypto.js`
**What goes wrong:** `lib/db/config.js` imports `{ encrypt, decrypt }` from `./crypto.js`. This file does not exist in ClawForge. If omitted, all secret reads/writes throw `MODULE_NOT_FOUND`.
**Why it happens:** `crypto.js` is not part of the cherry-pick list in the phase brief but is a hard dependency of `db/config.js`.
**How to avoid:** Author `lib/db/crypto.js` as part of Phase 29 — copy the upstream implementation verbatim (it's pure Node.js, no thepopebot-specific imports).
**Warning signs:** `Error: Cannot find module './crypto.js'` at startup.

### Pitfall 2: Circular Import Between `config.js` and `model.js`
**What goes wrong:** If `lib/ai/model.js` is updated to call `getConfig()` for provider resolution, and `lib/config.js` imports from `lib/ai/model.js` (via `getDefaultModel`), there could be a circular dependency. Currently, `lib/config.js` only imports `getDefaultModel` from `lib/llm-providers.js` (static data) — safe.
**How to avoid:** `lib/config.js` imports from `lib/llm-providers.js` only, never from `lib/ai/model.js`.

### Pitfall 3: Combobox Icon Import Path
**What goes wrong:** Upstream combobox imports from `'../icons.js'` (one level up from `ui/`). In ClawForge, icons are at `lib/chat/components/icons.js`, so the correct relative import from `lib/chat/components/ui/combobox.jsx` is `'../icons.js'` — same relative path. This matches.
**Warning signs:** `SearchIcon is not a function` at runtime — check the import path first.

### Pitfall 4: `AUTH_SECRET` Requirement for Crypto
**What goes wrong:** `crypto.js` throws `Error: AUTH_SECRET environment variable is required for encryption` if the env var is missing. ClawForge validates `AUTH_SECRET` at startup in `config/instrumentation.js`, so this should always be set.
**How to avoid:** No action needed — `AUTH_SECRET` is already required and validated. Crypto module behavior is consistent.

### Pitfall 5: tool-names.js — Upstream is Auto-Formatter, Not Static Map
**What goes wrong:** The upstream `tool-names.js` exports `getToolDisplayName(toolName)` which auto-converts snake_case to Title Case (e.g., `create_job` → `Create Job`). There is no static map of tool IDs. The requirement says "maps internal tool IDs to human-readable display names" — auto-derivation satisfies this.
**How to avoid:** Copy the upstream `getToolDisplayName` function. No static map needed. If specific overrides are desired for ClawForge tools, add a small lookup table at the top.

### Pitfall 6: esbuild Build Step Required
**What goes wrong:** The `lib/chat/components/ui/combobox.jsx` file is a `.jsx` file. The build script in `package.json` (`npm run build`) compiles `lib/chat/components/ui/**/*.jsx` via esbuild. If the file is added but not built, importing the `.js` compiled version will fail.
**How to avoid:** Run `npm run build` after adding `combobox.jsx`. The glob `lib/chat/components/**/*.jsx` in the build script already covers `ui/` subdirectory.

## Code Examples

### lib/db/crypto.js (full — must author this file)
```javascript
// Source: https://raw.githubusercontent.com/stephengpope/thepopebot/main/lib/db/crypto.js
// Copy verbatim — no thepopebot-specific imports
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT = 'thepopebot-config-v1'; // keep same salt for migration compat
const ITERATIONS = 100_000;

function getKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET environment variable is required for encryption');
  return pbkdf2Sync(secret, SALT, ITERATIONS, KEY_LENGTH, 'sha256');
}

export function encrypt(plaintext) {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  });
}

export function decrypt(encryptedJson) {
  const key = getKey();
  const { iv, ciphertext, tag } = JSON.parse(encryptedJson);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
```

### lib/db/config.js import adaptation
```javascript
// Upstream uses:
import { getDb } from './index.js';
import { settings } from './schema.js';
import { encrypt, decrypt } from './crypto.js';
// All three paths are correct for ClawForge — no changes needed.
// The settings table shape in ClawForge schema.js is identical to upstream.
```

### lib/config.js import adaptation
```javascript
// Upstream uses:
import { getConfigValue, getConfigSecret, getCustomProvider } from './db/config.js';
import { BUILTIN_PROVIDERS, getDefaultModel } from './llm-providers.js';
// Both paths are correct for ClawForge — no changes needed.
// lib/config.js lives at lib/config.js, same level as lib/db/ and lib/llm-providers.js.
```

### lib/llm-providers.js — ClawForge model alignment
```javascript
// Upstream google models include gemini-2.5-flash (default) and gemini-2.5-flash-lite
// ClawForge lib/ai/model.js DEFAULT_MODELS.google = 'gemini-2.5-pro'
// DECISION: Use upstream provider list as-is — it covers anthropic/openai/google.
// The settings UI shows available models, model.js uses LLM_MODEL env/config override.
// No conflict — they serve different purposes.
```

### tool-names.js — ClawForge tool IDs
```javascript
// ClawForge tool names (from lib/ai/tools.js exports):
// create_job, get_job_status, get_system_technical_specs, create_instance_job,
// get_project_state, start_coding, list_workspaces, cancel_job, create_cluster_job
//
// All auto-derive cleanly via getToolDisplayName():
//   create_job → "Create Job"
//   get_job_status → "Get Job Status"
//   get_system_technical_specs → "Get System Technical Specs"
//   create_instance_job → "Create Instance Job"
//   get_project_state → "Get Project State"
//   start_coding → "Start Coding"
//   list_workspaces → "List Workspaces"
//   cancel_job → "Cancel Job"
//   create_cluster_job → "Create Cluster Job"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| process.env-only config | DB-backed config with env fallback | thepopebot v2+ | Settings UI can override env vars at runtime |
| Radix UI combobox | Custom React combobox | ClawForge already uses custom UI | No new deps, smaller bundle |

## Open Questions

1. **`SALT` value in crypto.js**
   - What we know: Upstream uses `'thepopebot-config-v1'` as the PBKDF2 salt
   - What's unclear: Should ClawForge rename to `'clawforge-config-v1'`?
   - Recommendation: Keep `'thepopebot-config-v1'`. ClawForge is a running instance of thepopebot — changing the salt would break decryption of any existing secrets. If there are no existing `config_secret` rows (likely — no prior code writes them), changing is safe but unnecessary. Keep as-is for simplicity.

2. **`setConfig` requirement in CONFIG-01**
   - What we know: CONFIG-01 spec says `getConfig(key) / setConfig(key, value)`. Upstream `lib/config.js` exports `getConfig` and `invalidateConfigCache` but NOT a `setConfig` wrapper. Writing config goes through `lib/db/config.js` functions directly (`setConfigValue`, `setConfigSecret`).
   - What's unclear: Is a `setConfig` wrapper needed at the `lib/config.js` level?
   - Recommendation: The planner should add a simple `setConfig(key, value)` export that dispatches to `setConfigValue` or `setConfigSecret` based on the `SECRET_KEYS` set, then calls `invalidateConfigCache()`. This satisfies CONFIG-01 without diverging from upstream architecture.

## Validation Architecture

nyquist_validation is not explicitly set to false in config.json (key absent) — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected |
| Config file | None — see Wave 0 |
| Quick run command | `node --input-type=module` (manual smoke test) |
| Full suite command | `npm test` (currently exits 0 with "No tests yet") |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONFIG-01 | `getConfig('LLM_PROVIDER')` returns 'anthropic' default | unit | manual-only — requires SQLite instance | No test file |
| CONFIG-02 | Combobox renders with options, filters on search input | unit | manual-only — requires React/jsdom | No test file |
| CONFIG-03 | `getToolDisplayName('create_job')` returns 'Create Job' | unit | `node -e "import('./lib/chat/components/tool-names.js').then(m => console.log(m.getToolDisplayName('create_job')))"` | No test file |
| CONFIG-04 | `BUILTIN_PROVIDERS` contains anthropic/openai/google | unit | `node -e "import('./lib/llm-providers.js').then(m => console.log(Object.keys(m.BUILTIN_PROVIDERS)))"` | No test file |

### Sampling Rate
- **Per task commit:** Manual import smoke test via node -e
- **Per wave merge:** `npm test` (currently no-op)
- **Phase gate:** Manual verification that `getConfig('LLM_PROVIDER')` resolves and Combobox renders before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] No test infrastructure exists — `npm test` is a no-op
- [ ] CONFIG-03 and CONFIG-04 can be smoke-tested with `node -e` inline commands without a test framework

## Sources

### Primary (HIGH confidence)
- `https://raw.githubusercontent.com/stephengpope/thepopebot/main/lib/config.js` — full source read
- `https://raw.githubusercontent.com/stephengpope/thepopebot/main/lib/db/config.js` — full source read
- `https://raw.githubusercontent.com/stephengpope/thepopebot/main/lib/db/crypto.js` — full source read
- `https://raw.githubusercontent.com/stephengpope/thepopebot/main/lib/llm-providers.js` — full source read
- `https://raw.githubusercontent.com/stephengpope/thepopebot/main/lib/chat/components/ui/combobox.jsx` — full source read
- `https://raw.githubusercontent.com/stephengpope/thepopebot/main/lib/chat/components/tool-names.js` — full source read
- ClawForge `lib/db/schema.js` — settings table schema verified identical to upstream
- ClawForge `lib/ai/model.js` — provider list verified (anthropic/openai/google/custom)
- ClawForge `lib/chat/components/icons.jsx` — SearchIcon, ChevronDownIcon, CheckIcon confirmed present
- ClawForge `package.json` — no Radix UI deps, no new deps needed

### Secondary (MEDIUM confidence)
- ClawForge `lib/db/api-keys.js` — confirms settings table type discriminator pattern is established

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all source files read directly, no inference
- Architecture: HIGH — upstream files read line-by-line, import paths traced
- Pitfalls: HIGH — derived from direct code inspection, not speculation

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (upstream repo stable; Drizzle/Node.js crypto APIs very stable)
