# Quick Task: Enable Claude Max Subscription Auth for Job Containers - Research

**Researched:** 2026-03-23
**Domain:** Claude Code CLI authentication, Docker credential injection
**Confidence:** HIGH

## Summary

Claude Code CLI supports a `CLAUDE_CODE_OAUTH_TOKEN` environment variable that allows subscription-based auth without interactive login or credential file mounting. Running `claude setup-token` locally (or in an interactive workspace container) generates a long-lived OAuth token that can be injected as an env var into job containers. This is the cleanest path -- no volume mounts, no credential file sync, no refresh headaches.

**Primary recommendation:** Use `claude setup-token` to generate an OAuth token, store it as a config/secret in ClawForge, and inject it as `CLAUDE_CODE_OAUTH_TOKEN` into job containers via the existing secrets pipeline.

## How Claude Code Auth Works

### Authentication Precedence (from official docs)

1. Cloud provider credentials (Bedrock/Vertex/Foundry env vars)
2. `ANTHROPIC_AUTH_TOKEN` env var (bearer token for gateways)
3. `ANTHROPIC_API_KEY` env var (direct API key)
4. `apiKeyHelper` script output (dynamic/rotating credentials)
5. **Subscription OAuth credentials from `/login`** (Pro/Max/Team/Enterprise)

### Credential Storage

| Platform | Location |
|----------|----------|
| macOS | Encrypted macOS Keychain + `~/.claude/.credentials.json` fallback |
| Linux (containers) | `~/.claude/.credentials.json` (mode 0600) |
| Custom | `$CLAUDE_CONFIG_DIR/.credentials.json` |

The `.credentials.json` file format:
```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1748658860401,
    "scopes": ["user:inference", "user:profile"]
  }
}
```

### Key Finding: CLAUDE_CODE_OAUTH_TOKEN

**Confidence: HIGH** (referenced in official GitHub issues, community docs, and GitHub Actions setup)

`CLAUDE_CODE_OAUTH_TOKEN` is an environment variable that Claude Code reads directly. When set, it bypasses Keychain and `.credentials.json` entirely. Generated via `claude setup-token`.

### Key Finding: --bare skips OAuth

**Confidence: HIGH** (official docs at code.claude.com)

The `--bare` flag skips OAuth and keychain reads. ClawForge job containers do NOT use `--bare` (they use plain `claude -p`), so subscription OAuth credentials WILL be picked up from the environment. This is the desired behavior.

## Current Auth Flow in ClawForge

### Job Containers (entrypoint.sh)

1. `SECRETS` env var (JSON) is expanded into flat env vars -- these are hidden from Claude
2. `LLM_SECRETS` env var (JSON) is expanded into flat env vars -- these ARE accessible to Claude
3. `gh auth setup-git` handles git auth via `GH_TOKEN`
4. `claude -p` runs with `--append-system-prompt` and `--allowedTools`

**Current LLM auth:** `ANTHROPIC_API_KEY` passed via `AGENT_LLM_SECRETS` (JSON blob), expanded by entrypoint step 3 (`LLM_SECRETS`).

### Workspace Containers (entrypoint.sh)

1. `GH_TOKEN` used for `gh auth login`
2. `AGENT_LLM_*` secrets passed through as env vars
3. ttyd + tmux started for interactive terminal

**No Claude auth is currently injected into workspace containers** -- the user runs `claude` interactively and authenticates manually.

### Docker dispatch (lib/tools/docker.js)

```javascript
const env = [
  `REPO_URL=${opts.repoUrl}`,
  `BRANCH=${branch}`,
  `SECRETS=${JSON.stringify(opts.secrets || {})}`,
  `LLM_SECRETS=${JSON.stringify(opts.llmSecrets || {})}`,
  'DISPATCH_MODE=docker',
];
```

Secrets come from `process.env.AGENT_SECRETS` and `process.env.AGENT_LLM_SECRETS` (parsed in `lib/ai/tools.js:138-139`).

## Implementation Approach

### Recommended: Option B -- CLAUDE_CODE_OAUTH_TOKEN via Secrets Pipeline

**Why this wins:**
- No volume mounts needed (keeps Docker isolation clean)
- No credential file sync (avoids macOS/Linux Keychain incompatibility)
- Single env var injection -- fits existing AGENT_LLM_ prefix convention
- Token generated once, stored in ClawForge config/secrets
- Works for both job AND workspace containers

**Steps:**

1. **Generate token:** Run `claude setup-token` in an interactive workspace terminal (or on VPS host). This opens a browser OAuth flow and outputs a long-lived token (`sk-ant-oat01-...`).

2. **Store token:** Save as `AGENT_LLM_CLAUDE_CODE_OAUTH_TOKEN` in ClawForge secrets (Admin > Secrets page). The `AGENT_LLM_` prefix ensures it gets passed to containers AND is accessible to the LLM layer.

3. **Entrypoint picks it up automatically:** The entrypoint already expands `LLM_SECRETS` JSON into flat env vars (step 3). So `AGENT_LLM_CLAUDE_CODE_OAUTH_TOKEN` becomes `CLAUDE_CODE_OAUTH_TOKEN` in the container environment... **WAIT** -- it does NOT strip the prefix. The env var name stays as-is.

**Correction:** The `LLM_SECRETS` expansion preserves the key name from the JSON. So if the JSON has `{"AGENT_LLM_ANTHROPIC_API_KEY": "sk-..."}`, the container gets `AGENT_LLM_ANTHROPIC_API_KEY`. But Claude Code reads `CLAUDE_CODE_OAUTH_TOKEN`, not `AGENT_LLM_CLAUDE_CODE_OAUTH_TOKEN`.

**Actual secrets flow:**
- `AGENT_LLM_SECRETS` env var on event handler = `{"AGENT_LLM_ANTHROPIC_API_KEY": "sk-ant-..."}`
- Entrypoint `eval $(echo "$LLM_SECRETS" | jq -r 'to_entries | .[] | "export \(.key)=\"\(.value)\""')`
- Result: `export AGENT_LLM_ANTHROPIC_API_KEY="sk-ant-..."`

So we need to ensure the secret is stored with key name `CLAUDE_CODE_OAUTH_TOKEN` in the LLM secrets JSON, NOT with an `AGENT_LLM_` prefix on the key itself.

Let me re-examine the secrets pipeline more carefully.

### Secrets Pipeline Deep Dive

The event handler reads `process.env.AGENT_LLM_SECRETS` which is a JSON string like:
```json
{"ANTHROPIC_API_KEY": "sk-ant-...", "OPENAI_API_KEY": "sk-..."}
```

This gets passed to docker.js as `opts.llmSecrets`, then set as:
```javascript
`LLM_SECRETS=${JSON.stringify(opts.llmSecrets || {})}`
```

The entrypoint expands it:
```bash
eval $(echo "$LLM_SECRETS" | jq -r 'to_entries | .[] | "export \(.key)=\"\(.value)\""')
```

So the JSON keys become env var names directly. If `AGENT_LLM_SECRETS` = `{"ANTHROPIC_API_KEY": "sk-..."}`, the container gets `ANTHROPIC_API_KEY=sk-...`.

**Therefore:** To inject `CLAUDE_CODE_OAUTH_TOKEN`, we need it as a key in the `AGENT_LLM_SECRETS` JSON: `{"CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-oat01-...", "ANTHROPIC_API_KEY": "sk-ant-..."}`.

### But there's a naming mismatch

The GitHub Secrets UI (Admin > Secrets) enforces `AGENT_` or `AGENT_LLM_` prefix on secret names. The secret would be stored as `AGENT_LLM_CLAUDE_CODE_OAUTH_TOKEN` in GitHub/DB. But when it gets loaded into `AGENT_LLM_SECRETS` JSON, what key does it use?

Looking at `lib/ai/tools.js:138-139`:
```javascript
secrets: process.env.AGENT_SECRETS || '{}',
llmSecrets: process.env.AGENT_LLM_SECRETS || '{}',
```

These are set as env vars on the event handler container in docker-compose.yml:
```yaml
AGENT_SECRETS: ${NOAH_AGENT_SECRETS:-{}}
AGENT_LLM_SECRETS: ${NOAH_AGENT_LLM_SECRETS:-{}}
```

So `NOAH_AGENT_LLM_SECRETS` in `.env` is a pre-formatted JSON string. The operator manually constructs this JSON. **The key names inside the JSON are whatever the operator puts there.**

### Final Implementation

**No code changes needed for the core path.** The operator just needs to:

1. Run `claude setup-token` (interactive terminal or VPS host)
2. Add `CLAUDE_CODE_OAUTH_TOKEN` to the `NOAH_AGENT_LLM_SECRETS` JSON in `.env`:
   ```
   NOAH_AGENT_LLM_SECRETS={"ANTHROPIC_API_KEY":"sk-ant-...","CLAUDE_CODE_OAUTH_TOKEN":"sk-ant-oat01-..."}
   ```
3. Restart the event handler: `docker compose up -d noah-event-handler`
4. Job containers will now have `CLAUDE_CODE_OAUTH_TOKEN` in their environment

**If using subscription auth exclusively (no API key):** Remove `ANTHROPIC_API_KEY` from the JSON since `CLAUDE_CODE_OAUTH_TOKEN` is not in the auth precedence list shown in official docs -- it bypasses the precedence chain entirely.

### Can keep BOTH

Keep `ANTHROPIC_API_KEY` as fallback. Claude Code will prefer `ANTHROPIC_API_KEY` (precedence #3) over OAuth credentials (precedence #5), but `CLAUDE_CODE_OAUTH_TOKEN` appears to override everything when set (per GitHub issue reports). To be safe, if the goal is to use subscription exclusively, remove `ANTHROPIC_API_KEY`.

## Token Lifecycle

| Aspect | Detail | Confidence |
|--------|--------|------------|
| Token generated by | `claude setup-token` (interactive OAuth flow) | HIGH |
| Token format | `sk-ant-oat01-...` | HIGH |
| Token lifetime | ~1 year (long-lived) | MEDIUM (community docs) |
| Access token refresh | Claude Code CLI handles refresh automatically | HIGH (official docs) |
| Refresh token expiry | Eventually expires, requires re-auth | HIGH |
| Re-auth needed | Run `claude setup-token` again when token expires | HIGH |

## Alternative Approaches (Not Recommended)

### Option A: Mount shared volume with ~/.claude
- **Problem:** macOS host + Linux container credential incompatibility
- **Problem:** Read-write mount breaks Docker isolation model
- **Problem:** Credential file can be deleted by host Claude Code usage

### Option C: Run `claude login` on VPS host, mount into containers
- **Problem:** Same volume mount issues as Option A
- **Problem:** VPS may not have a browser for OAuth flow
- **Problem:** Couples host state to container auth

### Option D: Admin UI for credential management
- **Problem:** Over-engineering -- `claude setup-token` + env var is sufficient
- **Problem:** OAuth token is a single string, not worth a UI page

## Common Pitfalls

### Pitfall 1: --bare mode skips OAuth
**What goes wrong:** If anyone adds `--bare` to the `claude -p` invocation in entrypoint.sh, subscription auth stops working.
**How to avoid:** Never use `--bare` in job containers. The current `claude -p` (without `--bare`) correctly reads OAuth credentials.

### Pitfall 2: ANTHROPIC_API_KEY takes precedence
**What goes wrong:** If both `ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN` are set, behavior may be unpredictable.
**How to avoid:** When switching to subscription auth, remove `ANTHROPIC_API_KEY` from `AGENT_LLM_SECRETS`.

### Pitfall 3: Token expiry with no notification
**What goes wrong:** OAuth token silently expires, jobs start failing with auth errors.
**How to avoid:** Monitor job failures for auth-stage errors. Consider adding a health check or expiry warning. The `expiresAt` field in credentials could be checked.

### Pitfall 4: GitHub Actions path still needs API key
**What goes wrong:** GitHub Actions dispatch path (fallback) does not use Docker env vars -- it uses GitHub repo secrets directly.
**How to avoid:** If any repos still use Actions dispatch (`dispatch: "actions"` in REPOS.json), ensure `AGENT_ANTHROPIC_API_KEY` GitHub secret is still set OR add `AGENT_LLM_CLAUDE_CODE_OAUTH_TOKEN` as a GitHub secret.

## Existing Stub: lib/auth/claude-subscription.js

Phase 50/52 created a stub at `lib/auth/claude-subscription.js`. It gates Code mode access based on subscription status (always returns `allowed: true`). This stub is for the **event handler layer** (web UI access control), NOT for container auth. It remains a stub until Anthropic provides an OAuth validation API. **Not related to this task.**

## Sources

### Primary (HIGH confidence)
- [Authentication - Claude Code Docs](https://code.claude.com/docs/en/authentication) - credential precedence, storage, management
- [Headless Mode - Claude Code Docs](https://code.claude.com/docs/en/headless) - --bare behavior, -p flag

### Secondary (MEDIUM confidence)
- [GitHub Issue #1736](https://github.com/anthropics/claude-code/issues/1736) - Docker re-auth solutions, credential file mounting
- [GitHub Issue #16238](https://github.com/anthropics/claude-code/issues/16238) - CLAUDE_CODE_OAUTH_TOKEN behavior confirmation
- [cabinlab/claude-code-sdk-docker AUTHENTICATION.md](https://github.com/cabinlab/claude-code-sdk-docker/blob/main/docs/AUTHENTICATION.md) - Token format, Docker setup patterns
- [Claude Did This - Setup Container Guide](https://claude-did-this.com/claude-hub/getting-started/setup-container-guide) - Token lifecycle details
