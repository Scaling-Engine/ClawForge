# Phase 34: GitHub Secrets Management - Research

**Researched:** 2026-03-13
**Domain:** GitHub REST API (Actions secrets + variables), NaCl sealed-box encryption, admin panel CRUD UI
**Confidence:** HIGH

## Summary

Phase 34 adds GitHub secrets and variables management to the existing `/admin/secrets` page. The codebase already has most of the infrastructure: `lib/tools/github.js` provides an authenticated `githubApi()` wrapper, `lib/db/crypto.js` provides AES-256-GCM encrypt/decrypt for local storage, the admin panel layout and routing are complete (Phase 33), and `tweetnacl@0.14.5` is already installed as a transitive dependency (via `ssh2`).

The main technical challenge is that GitHub's Secrets API requires encrypting secret values using libsodium sealed-box (`crypto_box_seal`) before PUT. The project rule says "Node crypto (AES-256-GCM), NOT libsodium" -- but this refers to LOCAL encryption. GitHub's API mandates sealed-box encryption for transit; there is no alternative. The solution is to use `tweetnacl` (already in node_modules) plus the lightweight `tweetnacl-sealedbox-js` package (~2KB, zero deps beyond tweetnacl) for the GitHub-specific sealed-box operation, while keeping AES-256-GCM for any local secret storage.

The current `/admin/secrets` page (`settings-secrets-page.jsx`) only manages API keys. It needs to be extended with a new section for GitHub secrets/variables CRUD. The page already has the `Section` component pattern, making it natural to add a "GitHub Secrets" section and a "GitHub Variables" section below the existing API Key section.

**Primary recommendation:** Create `lib/github-api.js` as the dedicated GitHub secrets/variables CRUD wrapper (distinct from `lib/tools/github.js` which handles workflow/job operations). Add `tweetnacl-sealedbox-js` as a direct dependency for sealed-box encryption. Extend `settings-secrets-page.jsx` with GitHub secrets CRUD UI.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GHSEC-01 | `lib/github-api.js` provides CRUD for GitHub repo secrets and variables via REST API | New file wrapping `githubApi()` from `lib/tools/github.js`; endpoints documented below; sealed-box encryption via `tweetnacl` + `tweetnacl-sealedbox-js` |
| GHSEC-02 | `/admin/secrets` page lists secrets (masked, last 4 chars) with create/update/delete | Extend existing `settings-secrets-page.jsx` with new GitHub Secrets section; GitHub API returns secret names but NOT values (GitHub never returns values after creation) |
| GHSEC-03 | Secret values encrypted with Node `crypto` (AES-256-GCM) for any local storage | `lib/db/crypto.js` already provides `encrypt()`/`decrypt()` using AES-256-GCM; `lib/db/config.js` has `getConfigSecret()`/`setConfigSecret()` pattern |
| GHSEC-04 | AGENT_* prefix convention enforced in create/edit forms | UI validation; prefix select dropdown (AGENT_ / AGENT_LLM_) + name input; clear help text explaining the convention |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `lib/tools/github.js` | n/a | Authenticated GitHub REST API wrapper (`githubApi()`) | Already used by create-job, swarm, PRs, runners, branches |
| `lib/db/crypto.js` | n/a | AES-256-GCM encrypt/decrypt for local storage | Already used by `lib/db/config.js` |
| `lib/db/config.js` | n/a | DB-backed config with encrypted secret support | Pattern for local secret storage |
| `tweetnacl` | 0.14.5 | NaCl crypto primitives | Already installed (transitive via ssh2) |

### New (must add)
| Library | Version | Purpose | Why This One |
|---------|---------|---------|--------------|
| `tweetnacl-sealedbox-js` | ^1.0.0 | Sealed-box encryption (`crypto_box_seal`) for GitHub Secrets API | Lightweight (~2KB), uses existing tweetnacl, GitHub's own docs recommend this pattern. Alternatives: `libsodium-wrappers` (5MB+, overkill), `sealed-box` by gadget-inc (another option, slightly newer) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tweetnacl-sealedbox-js` | `libsodium-wrappers` | Full libsodium is 5MB+; overkill when only `crypto_box_seal` is needed. Project already has tweetnacl. |
| `tweetnacl-sealedbox-js` | `sealed-box` (gadget-inc) | Also works, TypeScript types included; either is fine. `tweetnacl-sealedbox-js` is more widely used for GitHub secrets specifically. |

**Installation:**
```bash
npm install tweetnacl-sealedbox-js
```

Note: `tweetnacl` is already installed as a transitive dep but should also be added as a direct dependency since the code will import it explicitly:
```bash
npm install tweetnacl tweetnacl-sealedbox-js
```

## Architecture Patterns

### Target File Structure
```
lib/
├── github-api.js           # NEW — GitHub Secrets + Variables CRUD
├── tools/
│   └── github.js           # EXISTING — githubApi(), workflow runs, job status
├── db/
│   ├── crypto.js           # EXISTING — AES-256-GCM encrypt/decrypt
│   └── config.js           # EXISTING — DB config with encrypted secrets
└── chat/
    ├── actions.js           # EXTEND — new server actions for GitHub secrets
    └── components/
        └── settings-secrets-page.jsx  # EXTEND — add GitHub Secrets/Variables UI
```

### Pattern 1: GitHub API Secrets Flow
**What:** The complete flow for creating/updating a GitHub secret via the REST API
**When to use:** Every PUT to `/repos/{owner}/{repo}/actions/secrets/{name}`

```
1. GET /repos/{owner}/{repo}/actions/secrets/public-key → { key_id, key }
2. Encrypt value with sealed-box using returned public key
3. PUT /repos/{owner}/{repo}/actions/secrets/{name} → { encrypted_value, key_id }
```

### Pattern 2: Server Action CRUD (Established Pattern)
**What:** Server actions in `lib/chat/actions.js` with `requireAuth()` guard
**When to use:** Every admin CRUD operation
**Example:**
```javascript
// lib/chat/actions.js
export async function listGitHubSecrets() {
  await requireAuth();
  const { listSecrets } = await import('../github-api.js');
  return listSecrets();
}
```

### Pattern 3: Section-based Page Layout (Established Pattern)
**What:** The existing `settings-secrets-page.jsx` uses `<Section>` components for grouping
**When to use:** Adding new sections to the secrets page
**Example:**
```jsx
<Section title="GitHub Secrets" description="Manage AGENT_* secrets passed to job containers.">
  <GitHubSecretsSection />
</Section>
```

### Anti-Patterns to Avoid
- **Using `libsodium-wrappers` for one function:** The full libsodium package is 5MB+. Use tweetnacl + sealedbox addon instead.
- **Storing GitHub secret values locally:** GitHub never returns secret values after creation. The masked display shows name + metadata only. If local caching is desired, use `lib/db/config.js` with `setConfigSecret()`.
- **Creating a separate page for GitHub secrets:** The `/admin/secrets` page already exists conceptually; extend it rather than creating a new route.
- **Bypassing `githubApi()` for API calls:** Reuse the existing authenticated wrapper to avoid duplicating auth logic.

## GitHub REST API Endpoints

### Actions Secrets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/actions/secrets` | List repo secrets (names only, no values) |
| GET | `/repos/{owner}/{repo}/actions/secrets/public-key` | Get public key for encrypting secrets |
| GET | `/repos/{owner}/{repo}/actions/secrets/{name}` | Get a single secret metadata (name, created_at, updated_at) |
| PUT | `/repos/{owner}/{repo}/actions/secrets/{name}` | Create or update a secret (requires encrypted_value + key_id) |
| DELETE | `/repos/{owner}/{repo}/actions/secrets/{name}` | Delete a secret |

### Actions Variables
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/repos/{owner}/{repo}/actions/variables` | List repo variables (names + values) |
| GET | `/repos/{owner}/{repo}/actions/variables/{name}` | Get a single variable |
| POST | `/repos/{owner}/{repo}/actions/variables` | Create a variable |
| PATCH | `/repos/{owner}/{repo}/actions/variables/{name}` | Update a variable |
| DELETE | `/repos/{owner}/{repo}/actions/variables/{name}` | Delete a variable |

**Key difference:** Secrets use PUT (upsert) while Variables use POST (create) + PATCH (update). Secrets require sealed-box encryption; Variables are plaintext.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sealed-box encryption | Custom NaCl crypto_box_seal impl | `tweetnacl-sealedbox-js` | Sealed box is a specific construction (ephemeral keypair + crypto_box); easy to get wrong |
| GitHub API auth | Custom fetch with auth headers | `githubApi()` from `lib/tools/github.js` | Already handles Bearer token, Accept header, API version, error handling |
| Local secret encryption | Custom AES implementation | `lib/db/crypto.js` encrypt/decrypt | Already tested, uses AUTH_SECRET key derivation |
| Confirmation dialogs | Custom modal system | Inline confirm pattern from existing `settings-secrets-page.jsx` | The codebase uses a "click once to arm, click again to confirm" pattern with 3-second timeout |

**Key insight:** The existing codebase has mature patterns for everything except the GitHub sealed-box encryption, which is the one thing that genuinely requires a new dependency.

## Common Pitfalls

### Pitfall 1: GitHub Never Returns Secret Values
**What goes wrong:** Developer builds UI expecting to retrieve and display existing secret values
**Why it happens:** GitHub's design philosophy is write-only for secrets; the GET endpoint returns name, created_at, updated_at but NEVER the value
**How to avoid:** UI must show only the secret name + metadata (created/updated dates). The "masked last 4 chars" display in GHSEC-02 can only work if the value is ALSO stored locally (encrypted via AES-256-GCM in the settings DB). When creating a secret, save a local encrypted copy alongside the GitHub API call.
**Warning signs:** GET returns `{ name, created_at, updated_at }` with no `value` field

### Pitfall 2: Public Key Caching
**What goes wrong:** Fetching the public key for every single secret creation, hitting rate limits
**Why it happens:** The public key changes rarely (only on key rotation), but devs don't cache it
**How to avoid:** Cache the public key + key_id for the duration of a CRUD session. The key_id is required in the PUT body, so the response from GET public-key provides both.
**Warning signs:** Excessive API calls, 403 rate limit errors

### Pitfall 3: tweetnacl vs tweetnacl-sealedbox Confusion
**What goes wrong:** Trying to do sealed-box with vanilla tweetnacl (which doesn't have `crypto_box_seal`)
**Why it happens:** `tweetnacl` has `crypto_box` (authenticated encryption between two keypairs) but NOT `crypto_box_seal` (anonymous sender sealed box). These are different operations.
**How to avoid:** Use `tweetnacl-sealedbox-js` which adds the `sealedbox.seal()` method to tweetnacl. Import pattern: `import nacl from 'tweetnacl'; nacl.sealedbox = require('tweetnacl-sealedbox-js');`
**Warning signs:** Import errors, missing `.seal()` method

### Pitfall 4: Secret Name Validation
**What goes wrong:** Creating secrets with names that don't match GitHub's naming rules
**Why it happens:** GitHub requires secret names to start with a letter or underscore, contain only alphanumeric and underscores, and not start with `GITHUB_`
**How to avoid:** Validate name client-side with regex: `/^[A-Z_][A-Z0-9_]*$/` (convention is uppercase). Additionally enforce the AGENT_ prefix per GHSEC-04.
**Warning signs:** 422 validation errors from GitHub API

### Pitfall 5: Variables vs Secrets Confusion
**What goes wrong:** Using the secrets API for non-sensitive values or vice versa
**Why it happens:** Both look similar but have different API patterns (PUT upsert vs POST create + PATCH update)
**How to avoid:** UI should clearly separate the two sections. Variables are visible (values returned by GET); Secrets are write-only (values never returned).
**Warning signs:** Using encrypted PUT for plain variables, or plaintext PATCH for secrets

## Code Examples

### Sealed-Box Encryption for GitHub Secrets
```javascript
// lib/github-api.js
import nacl from 'tweetnacl';
import sealedbox from 'tweetnacl-sealedbox-js';

/**
 * Encrypt a secret value for GitHub's Secrets API using sealed-box.
 * @param {string} value - Plaintext secret value
 * @param {string} publicKeyBase64 - Base64-encoded public key from GitHub
 * @returns {string} Base64-encoded encrypted value
 */
function encryptForGitHub(value, publicKeyBase64) {
  const publicKey = Buffer.from(publicKeyBase64, 'base64');
  const messageBytes = Buffer.from(value);
  const encryptedBytes = sealedbox.seal(messageBytes, publicKey);
  return Buffer.from(encryptedBytes).toString('base64');
}
```

### GitHub Secrets CRUD Wrapper
```javascript
// lib/github-api.js
import { githubApi } from './tools/github.js';

const { GH_OWNER, GH_REPO } = process.env;
const base = () => `/repos/${process.env.GH_OWNER}/${process.env.GH_REPO}`;

/**
 * List all repo secrets (names + metadata only, no values).
 */
export async function listSecrets() {
  const data = await githubApi(`${base()}/actions/secrets`);
  return data.secrets || [];
}

/**
 * Get the repo public key for encrypting secrets.
 */
export async function getPublicKey() {
  return githubApi(`${base()}/actions/secrets/public-key`);
}

/**
 * Create or update a secret.
 * @param {string} name - Secret name (AGENT_* prefix)
 * @param {string} value - Plaintext value (encrypted before sending)
 */
export async function upsertSecret(name, value) {
  const { key, key_id } = await getPublicKey();
  const encrypted_value = encryptForGitHub(value, key);
  return githubApi(`${base()}/actions/secrets/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted_value, key_id }),
  });
}

/**
 * Delete a secret.
 */
export async function deleteSecret(name) {
  return githubApi(`${base()}/actions/secrets/${name}`, { method: 'DELETE' });
}
```

### Server Actions Pattern
```javascript
// In lib/chat/actions.js
export async function listGitHubSecrets() {
  await requireAuth();
  const { listSecrets } = await import('../github-api.js');
  return listSecrets();
}

export async function createGitHubSecret(name, value) {
  await requireAuth();
  // Validate AGENT_* prefix
  if (!name.startsWith('AGENT_')) {
    return { error: 'Secret name must start with AGENT_' };
  }
  const { upsertSecret } = await import('../github-api.js');
  await upsertSecret(name, value);
  // Optionally store locally (encrypted) for masked display
  const { setConfigSecret } = await import('../db/config.js');
  setConfigSecret(`github_secret:${name}`, value);
  return { success: true };
}
```

### AGENT_* Prefix UI Enforcement
```jsx
// Prefix selector pattern for the create form
const PREFIXES = [
  { value: 'AGENT_', label: 'AGENT_', description: 'Container-only (not visible to LLM)' },
  { value: 'AGENT_LLM_', label: 'AGENT_LLM_', description: 'Visible to LLM in container' },
];

// Name input shows: [AGENT_▼] [___NAME_HERE___]
// Full secret name = prefix + user input
```

## Existing Component Inventory

Components and modules that will be reused or extended:

| Component/Module | File | Current State | Phase 34 Change |
|-----------------|------|---------------|-----------------|
| `SettingsSecretsPage` | `settings-secrets-page.jsx` | API key CRUD only | Add GitHub Secrets + Variables sections |
| `Section` | `settings-secrets-page.jsx` (local) | Reusable section wrapper | Use for new sections |
| `CopyButton` | `settings-secrets-page.jsx` (local) | Copy-to-clipboard helper | Reuse in variables section |
| `githubApi()` | `lib/tools/github.js` | Authenticated GitHub REST wrapper | Import from new `lib/github-api.js` |
| `encrypt()`/`decrypt()` | `lib/db/crypto.js` | AES-256-GCM encryption | For local secret value caching |
| `getConfigSecret()`/`setConfigSecret()` | `lib/db/config.js` | DB-backed encrypted config | For local secret value storage |
| `requireAuth()` | `lib/chat/actions.js` | Server action auth guard | Used in new server actions |
| Admin sidebar nav | `admin-layout.jsx` | Already has "Secrets" link at `/admin/secrets` | No change needed |
| Barrel exports | `lib/chat/components/index.js` | Exports `SettingsSecretsPage` | No change needed (same component) |

Route page needed:

| Route | File | Status |
|-------|------|--------|
| `/admin/secrets` | `templates/app/admin/secrets/page.js` | Does NOT exist yet -- must create |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tweetsodium` (GitHub's own) | `tweetnacl-sealedbox-js` or `libsodium-wrappers` | 2023 (tweetsodium deprecated) | Use tweetnacl-sealedbox-js |
| Manage secrets via GitHub UI | Admin panel CRUD | Phase 34 | Operators stay in ClawForge |
| API key only on secrets page | API key + GitHub secrets + variables | Phase 34 | Complete secrets management |

## Open Questions

1. **Local secret value caching for masked display**
   - What we know: GitHub never returns secret values. GHSEC-02 says "masked values (last 4 chars)".
   - What's unclear: Should we store a local encrypted copy of each secret value just to show the last 4 chars? Or just show name + dates?
   - Recommendation: Store locally via `setConfigSecret()` when creating/updating. This enables the "last 4 chars" display and also provides a local backup. The local copy is encrypted with AES-256-GCM.

2. **Scope: repo secrets only, or also org-level?**
   - What we know: Requirements say "GitHub repo secrets and variables". The existing `GH_OWNER`/`GH_REPO` env vars point to a single repo.
   - What's unclear: Whether org-level secrets should be managed too.
   - Recommendation: Repo-level only. Org secrets require different API endpoints and permissions. Can be added later.

3. **Variables section scope**
   - What we know: GHSEC-01 says "secrets and variables". Variables are plaintext and have a different API pattern.
   - What's unclear: How prominent should variables management be vs secrets?
   - Recommendation: Include a basic variables section. Variables are simpler (no encryption needed, values are returned by GET). Show as a second `<Section>` below secrets.

## Sources

### Primary (HIGH confidence)
- Codebase files examined directly:
  - `lib/tools/github.js` — existing githubApi() wrapper, all exports
  - `lib/db/crypto.js` — AES-256-GCM encrypt/decrypt implementation
  - `lib/db/config.js` — getConfigSecret/setConfigSecret pattern
  - `lib/chat/actions.js` — server action patterns with requireAuth()
  - `lib/chat/components/settings-secrets-page.jsx` — current secrets page (API keys only)
  - `lib/chat/components/admin-layout.jsx` — admin sidebar with Secrets link
  - `lib/tools/create-job.js` — githubApi() usage example
  - `package.json` — dependency inventory
  - `package-lock.json` — tweetnacl@0.14.5 confirmed installed
  - `node_modules/tweetnacl/` — confirmed present on disk

### Secondary (MEDIUM confidence)
- [GitHub Docs: Encrypting secrets for the REST API](https://docs.github.com/en/rest/guides/encrypting-secrets-for-the-rest-api) — Node.js encryption example using libsodium-wrappers
- [GitHub Docs: REST API endpoints for Actions Secrets](https://docs.github.com/en/rest/actions/secrets) — CRUD endpoint reference
- [GitHub Docs: REST API endpoints for Actions Variables](https://docs.github.com/en/rest/actions/variables) — Variables CRUD endpoints
- [tweetnacl-sealedbox-js](https://github.com/nicholasgasior/tweetnacl-sealedbox-js) — Sealed box implementation for tweetnacl
- [tweetsodium (deprecated)](https://github.com/github/tweetsodium) — GitHub's own deprecated sealed-box lib, confirms tweetnacl-sealedbox pattern

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all core deps already in project, only adding ~2KB sealedbox addon
- Architecture: HIGH - follows established patterns (server actions, Section components, githubApi wrapper)
- GitHub API endpoints: HIGH - from official GitHub docs
- Sealed-box encryption: HIGH - well-documented, multiple implementations available
- Pitfalls: HIGH - identified from GitHub API behavior and codebase analysis

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable APIs and patterns)
