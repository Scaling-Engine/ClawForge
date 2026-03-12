# Phase 27: MCP Tool Layer - Research

**Researched:** 2026-03-12
**Domain:** Claude Code CLI MCP configuration, runtime credential injection, Docker container dispatch, Next.js Server Actions
**Confidence:** HIGH

## Summary

Phase 27 adds curated MCP server support to ClawForge. Each instance defines its available MCP servers in `config/MCP_SERVERS.json`. At job and workspace container startup, that config is resolved (template variables substituted from environment), written to `/tmp/mcp-config.json` inside the container, and passed to `claude -p` via `--mcp-config`. MCP tool names are included in the `--allowedTools` whitelist using the `mcp__servername__toolname` format. A pre-run hydration step (MCP-08) can execute specified MCP tools before the main `claude -p` invocation and prepend their output to the job prompt. A read-only settings page at `/settings/mcp` lets operators inspect configured servers and their tool subsets.

The `--mcp-config` flag is verified against official Claude Code CLI docs (HIGH confidence). The implementation follows the existing `loadAllowedRepos()` / `config/REPOS.json` pattern for config loading, the `{{AGENT_LLM_*}}` template variable convention for credential injection, and the Server Actions + `requireAuth()` pattern for settings data serving.

**Primary recommendation:** Implement in three waves: (1) `lib/tools/mcp-servers.js` + `lib/paths.js` update + schema design, (2) entrypoint.sh + docker.js injection, (3) settings UI + Server Action.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MCP-01 | Each instance has a `MCP_SERVERS.json` config file defining available MCP servers with name, command, args, env, and tool subset | Config schema and file location pattern verified from repos.js and paths.js |
| MCP-02 | `loadMcpServers()` reads and validates instance MCP config, resolving `{{AGENT_LLM_*}}` template variables at load time | Template var pattern confirmed in codebase; resolution logic must use process.env |
| MCP-03 | Job containers receive MCP server configs via `--mcp-config` flag; MCP servers are available to Claude Code during job execution | `--mcp-config` flag confirmed in official Claude Code CLI docs |
| MCP-04 | Workspace (interactive) containers receive the same MCP server configs as job containers | `ensureWorkspaceContainer()` in docker.js confirmed; needs same MCP pass-through |
| MCP-05 | Tool subset curation restricts which MCP tools are included in the `--allowedTools` whitelist per instance | MCP tool format `mcp__servername__toolname` confirmed from official docs |
| MCP-06 | MCP startup health check validates server connections at container start; logs clear error on failure with `mcp_startup` failure stage | Health check pattern matches existing job failure logging in entrypoint.sh |
| MCP-07 | Operator can view configured MCP servers and their tool subsets in a read-only settings page section | Settings tab pattern confirmed from settings-layout.jsx; `/settings/mcp` tab |
| MCP-08 | Pre-run MCP context hydration executes specified tools before `claude -p` and appends output to the job prompt | Hydration runs after MCP health check, before main claude -p invocation |
| MCP-09 | MCP credentials are never stored in git; `{{AGENT_LLM_*}}` template variables resolve from environment at container start | `AGENT_LLM_*` secrets are passed as container env vars via docker.js; same mechanism used |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `claude` CLI | Current installed | `--mcp-config` flag consumer | Already in job container Dockerfile |
| Node built-in `fs` | N/A | Read `MCP_SERVERS.json` | No external dep; same pattern as repos.js |
| Node built-in `crypto` | N/A | AES-256-GCM for any future encrypted credential fields | Already decided in STATE.md |
| `dockerode` | Already installed | Container creation with env injection | Already used in docker.js |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@slack/web-api` | Already installed | N/A for this phase | Not needed |
| Next.js Server Actions | Already in use | `getMcpServers()` settings action | Any UI data fetch |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Write config to `/tmp/mcp-config.json` in entrypoint | Pass inline JSON string to `--mcp-config` | Inline JSON can be complex to escape in shell; file is cleaner for large configs |
| `--strict-mcp-config` to isolate | Let default MCP config also load | Strict mode prevents unexpected MCP servers from other config sources (more predictable) |

**Installation:** No new dependencies required.

## Architecture Patterns

### Recommended Project Structure

New files for this phase:
```
lib/tools/
├── mcp-servers.js           # loadMcpServers(), buildMcpConfig(), checkMcpHealth()
instances/{name}/config/
├── MCP_SERVERS.json         # Per-instance MCP server definitions
lib/chat/components/
├── settings-mcp-page.jsx    # Read-only MCP servers view
lib/chat/
├── actions.js               # Add getMcpServers() Server Action
lib/
├── paths.js                 # Add mcpServersFile export
templates/config/
├── MCP_SERVERS.json         # Default empty config for new instances
```

Modified files:
```
templates/docker/job/entrypoint.sh   # Write /tmp/mcp-config.json, add --mcp-config flag
lib/tools/docker.js                  # Pass mcpConfig to both dispatch functions
lib/ai/tools.js                      # Load MCP config before dispatching
lib/chat/components/settings-layout.jsx  # Add MCP Servers tab
```

### Pattern 1: MCP_SERVERS.json Schema

**What:** Per-instance JSON file defining MCP servers with tool subsets
**When to use:** Operator adds MCP servers to their instance
**Example:**
```json
{
  "mcpServers": [
    {
      "name": "github",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "{{AGENT_LLM_GITHUB_TOKEN}}"
      },
      "allowedTools": ["create_pull_request", "get_file_contents", "search_code"]
    },
    {
      "name": "brave-search",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "{{AGENT_LLM_BRAVE_API_KEY}}"
      },
      "allowedTools": ["brave_web_search"]
    }
  ]
}
```

Note the shape difference: `mcpServers` is an **array** with a `name` field (ClawForge schema), not the `{"mcpServers": {"name": {...}}}` object map Claude Code uses. `loadMcpServers()` transforms the array to the object map format when building the config file.

### Pattern 2: Template Variable Resolution

**What:** Replace `{{AGENT_LLM_*}}` placeholders with environment variable values at runtime
**When to use:** Every call to `loadMcpServers()`; never cache resolved output
**Example:**
```javascript
// Source: lib/tools/repos.js (pattern reference), extended for MCP
function resolveMcpTemplateVars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\{\{(AGENT_LLM_[^}]+)\}\}/g, (_, key) => {
      return process.env[key] ?? '';
    });
  }
  if (Array.isArray(obj)) return obj.map(resolveMcpTemplateVars);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, resolveMcpTemplateVars(v)])
    );
  }
  return obj;
}
```

### Pattern 3: Claude Code `--mcp-config` Injection

**What:** Write resolved config to temp file, pass to `claude -p` via `--mcp-config`
**When to use:** Inside `entrypoint.sh` before the main claude invocation
**Example:**
```bash
# Source: Official Claude Code CLI docs (code.claude.com/docs/en/cli-reference)
# After SECRETS/LLM_SECRETS injection block (line ~23 in entrypoint.sh)

# Write MCP config if provided via MCP_CONFIG_JSON env var
if [ -n "$MCP_CONFIG_JSON" ]; then
  echo "$MCP_CONFIG_JSON" > /tmp/mcp-config.json
  MCP_FLAGS="--mcp-config /tmp/mcp-config.json --strict-mcp-config"
  MCP_TOOL_FLAGS="$MCP_ALLOWED_TOOLS"  # e.g. "mcp__github__create_pr,mcp__brave-search__brave_web_search"
else
  MCP_FLAGS=""
  MCP_TOOL_FLAGS=""
fi

# Then in claude invocation:
claude -p "$PROMPT" \
  --output-format json \
  --append-system-prompt "$SYSTEM_PROMPT" \
  --allowedTools "${ALLOWED_TOOLS}${MCP_TOOL_FLAGS:+,$MCP_TOOL_FLAGS}" \
  $MCP_FLAGS \
  2>&1
```

### Pattern 4: MCP Tool Format in `--allowedTools`

**What:** MCP tools use namespaced format in the allowedTools whitelist
**When to use:** Every MCP tool listed in `allowedTools` array of MCP_SERVERS.json
**Example:**
```
mcp__github__create_pull_request
mcp__brave-search__brave_web_search
mcp__filesystem__read_file
```
Format: `mcp__{server-name}__{tool-name}` (double underscore separators)

### Pattern 5: Pre-Run MCP Hydration (MCP-08)

**What:** Execute specified MCP tools before main claude invocation, prepend output to prompt
**When to use:** When a server in MCP_SERVERS.json has a `hydrateTools` array defined
**Example:**
```json
{
  "name": "context-fetcher",
  "command": "...",
  "hydrateTools": [
    { "tool": "get_project_status", "args": {} }
  ]
}
```
```bash
# In entrypoint.sh, after MCP config write, before main claude -p:
if [ -n "$MCP_HYDRATION_STEPS" ]; then
  HYDRATION_OUTPUT=$(claude --mcp-config /tmp/mcp-config.json \
    --allowedTools "$MCP_HYDRATION_TOOLS" \
    -p "$MCP_HYDRATION_PROMPT" \
    --output-format text 2>/dev/null)
  PROMPT="$HYDRATION_OUTPUT\n\n---\n\n$PROMPT"
fi
```

### Pattern 6: Settings Page Tab (MCP-07)

**What:** New read-only tab in settings sidebar showing configured MCP servers
**When to use:** Operator navigates to `/settings/mcp`
**Example (from existing settings-layout.jsx pattern):**
```jsx
// Add to TABS array in settings-layout.jsx
{ id: 'mcp', label: 'MCP Servers', href: '/settings/mcp', icon: ServerIcon }
```

```jsx
// New file: lib/chat/components/settings-mcp-page.jsx
// Pattern mirrors settings-secrets-page.jsx
// - useEffect + getMcpServers() Server Action
// - Renders each server: name, command, args, allowedTools
// - Env values REDACTED (never shown in UI)
```

### Anti-Patterns to Avoid

- **Caching resolved MCP config:** Template vars resolve from process.env at call time; caching would miss env changes. Call `loadMcpServers()` fresh on each container dispatch.
- **Storing literal credential values in MCP_SERVERS.json:** All env values must use `{{AGENT_LLM_*}}` placeholders. Log a warning and refuse to load if literal values detected in `env` fields.
- **Passing MCP config via command-line arg instead of file:** Inline JSON in shell args is fragile with escaping. Always write to `/tmp/mcp-config.json`.
- **Loading MCP servers in workspace without matching job behavior:** MCP-04 requires workspace and job containers to get identical configs. Both `dispatchDockerJob()` and `ensureWorkspaceContainer()` must call the same `buildMcpConfig()` function.
- **Including all MCP tools in allowedTools by default:** MCP-05 requires per-server tool subset curation. If `allowedTools` is absent from a server config entry, log a warning and allow no tools for that server (fail-safe).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP server process management | Custom stdio/pipe management | Claude Code CLI handles MCP subprocess lifecycle | CLI starts, monitors, and restarts MCP servers |
| MCP protocol parsing | Custom JSON-RPC client | Claude Code CLI is the MCP client | MCP protocol is complex; CLI handles it |
| Tool discovery from MCP server | Enumerate tools at startup | Use `allowedTools` explicit list per server | Dynamic discovery requires MCP connection at config-load time, which is before container start |
| Credential encryption at rest | Custom crypto | AES-256-GCM (decided in STATE.md) if needed | But `{{AGENT_LLM_*}}` pattern already handles this — env vars in `.env` file are not in git |

**Key insight:** Claude Code CLI fully manages the MCP client side. ClawForge only needs to write a config file and pass `--mcp-config`. All MCP session management, tool call routing, and protocol handling is handled by the CLI.

## Common Pitfalls

### Pitfall 1: Claude Code MCP Config Schema vs ClawForge Schema

**What goes wrong:** Using the Claude Code config object format `{"mcpServers": {"name": {...}}}` directly in `MCP_SERVERS.json` instead of ClawForge's array format with `allowedTools` field. Then failing to transform before writing to `/tmp/mcp-config.json`.
**Why it happens:** Official docs show object map format; ClawForge needs array format with extra `name` and `allowedTools` fields.
**How to avoid:** `buildMcpConfig()` transforms array → object map, stripping `allowedTools` field (not valid in Claude Code schema). Write only the transformed result to `/tmp/mcp-config.json`.
**Warning signs:** Claude Code errors about unrecognized fields in MCP config.

### Pitfall 2: `{{AGENT_LLM_*}}` Variables Not Available in Container

**What goes wrong:** Template vars resolve to empty string because `AGENT_LLM_*` env vars aren't passed to the container.
**Why it happens:** `docker.js` filters env vars via `opts.llmSecrets`; MCP env vars are a subset of those.
**How to avoid:** MCP server env values that use `{{AGENT_LLM_*}}` must reference vars that exist in `opts.llmSecrets`. Document this constraint in `MCP_SERVERS.json` template comments. The `loadMcpServers()` function resolves template vars using `process.env` before passing the JSON string to docker dispatch — so resolution happens in the event handler process where the vars are available, not in the container.
**Warning signs:** MCP server auth failures; empty env values in resolved config.

### Pitfall 3: `--strict-mcp-config` Breaking Default MCP Servers

**What goes wrong:** Adding `--strict-mcp-config` removes MCP servers the operator had configured in their Claude Code global settings (`~/.claude/settings.json` baked into the image).
**Why it happens:** `--strict-mcp-config` ignores ALL other MCP config sources.
**How to avoid:** This is intentional — container MCP servers should be deterministic. Document that instance-level MCP_SERVERS.json fully replaces any baked-in MCP config. If no MCP_SERVERS.json exists, omit both `--mcp-config` and `--strict-mcp-config` flags entirely.
**Warning signs:** MCP tools that worked before Phase 27 no longer available after.

### Pitfall 4: Health Check Timing

**What goes wrong:** MCP health check passes because the MCP server process starts, but the server isn't ready to handle tool calls yet (startup latency).
**Why it happens:** MCP servers are stdio-based; the process starting doesn't mean it's initialized.
**How to avoid:** Health check should issue a `tools/list` request via a minimal claude invocation (e.g., `claude --mcp-config /tmp/mcp-config.json --allowedTools "mcp__*" -p "list available tools" --output-format json 2>&1 | head -1`). Timeout after 30s. Log failure with `mcp_startup` stage tag.
**Warning signs:** Health check passes, but first tool call in main invocation fails.

### Pitfall 5: Hydration Output Contaminating Prompt (MCP-08)

**What goes wrong:** Hydration tool output is malformed JSON or contains special characters that break the prompt assembly in entrypoint.sh.
**Why it happens:** MCP tool output is arbitrary text; shell variable assignment doesn't escape it.
**How to avoid:** Write hydration output to a temp file (`/tmp/mcp-hydration.txt`), then read it into the prompt using `$(cat /tmp/mcp-hydration.txt)`. Limit hydration output to reasonable size (e.g., 10KB) via head.
**Warning signs:** Prompt assembly fails with shell syntax errors; main claude invocation gets truncated prompt.

## Code Examples

Verified patterns from official sources and codebase analysis:

### loadMcpServers() — New lib/tools/mcp-servers.js
```javascript
// Source: pattern from lib/tools/repos.js (loadAllowedRepos)
import { mcpServersFile } from '../paths.js';
import fs from 'fs';

/**
 * Read and validate MCP_SERVERS.json. Returns empty array if file absent.
 * Does NOT resolve template variables (call buildMcpConfig for that).
 */
export function loadMcpServers() {
  try {
    const raw = fs.readFileSync(mcpServersFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.mcpServers)) return [];
    return parsed.mcpServers;
  } catch {
    return [];
  }
}

/**
 * Resolve {{AGENT_LLM_*}} template variables from process.env.
 * Returns { configJson, allowedToolsFragment }
 */
export function buildMcpConfig(servers = loadMcpServers()) {
  if (!servers.length) return null;

  const mcpServersObj = {};
  const toolFragments = [];

  for (const server of servers) {
    const { name, command, args = [], env = {}, allowedTools = [] } = server;
    // Resolve template vars in env values
    const resolvedEnv = {};
    for (const [k, v] of Object.entries(env)) {
      resolvedEnv[k] = typeof v === 'string'
        ? v.replace(/\{\{(AGENT_LLM_[^}]+)\}\}/g, (_, key) => process.env[key] ?? '')
        : v;
    }
    mcpServersObj[name] = { command, args, env: resolvedEnv };
    for (const tool of allowedTools) {
      toolFragments.push(`mcp__${name}__${tool}`);
    }
  }

  return {
    configJson: JSON.stringify({ mcpServers: mcpServersObj }),
    allowedToolsFragment: toolFragments.join(','),
  };
}
```

### paths.js Addition
```javascript
// Source: lib/paths.js existing pattern
export const mcpServersFile = path.join(PROJECT_ROOT, 'config', 'MCP_SERVERS.json');
```

### entrypoint.sh MCP Block (after existing SECRETS block ~line 23)
```bash
# Source: Official Claude Code CLI docs + existing entrypoint.sh pattern
# MCP config injection
if [ -n "$MCP_CONFIG_JSON" ]; then
  echo "$MCP_CONFIG_JSON" > /tmp/mcp-config.json
  MCP_FLAGS="--mcp-config /tmp/mcp-config.json --strict-mcp-config"
  # MCP_ALLOWED_TOOLS comes in as comma-separated mcp__name__tool list
  if [ -n "$MCP_ALLOWED_TOOLS" ]; then
    ALLOWED_TOOLS="${ALLOWED_TOOLS},${MCP_ALLOWED_TOOLS}"
  fi
else
  MCP_FLAGS=""
fi
```

### docker.js Addition (dispatchDockerJob / ensureWorkspaceContainer)
```javascript
// Source: lib/tools/docker.js existing Env array pattern
// In both dispatch functions, after existing env assembly:
const mcpConfig = buildMcpConfig(); // from lib/tools/mcp-servers.js
if (mcpConfig) {
  env.push(`MCP_CONFIG_JSON=${mcpConfig.configJson}`);
  env.push(`MCP_ALLOWED_TOOLS=${mcpConfig.allowedToolsFragment}`);
}
```

### getMcpServers() Server Action
```javascript
// Source: lib/chat/actions.js existing pattern
export async function getMcpServers() {
  await requireAuth();
  const servers = loadMcpServers();
  // Redact env values — never expose credentials in UI
  return servers.map(({ name, command, args, allowedTools, hydrateTools }) => ({
    name, command, args, allowedTools: allowedTools ?? [], hydrateTools: hydrateTools ?? [],
    // env deliberately omitted
  }));
}
```

### MCP_SERVERS.json Template (for new instances)
```json
{
  "mcpServers": []
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No MCP support in job containers | `--mcp-config` flag in Claude Code CLI | Verified current | Phase 27 baseline |
| `--dangerously-skip-permissions` | `--allowedTools` whitelist + `mcp__name__tool` format | ClawForge v2.0 | MCP tools curated per server |

**Deprecated/outdated:**
- None relevant to this phase. `--mcp-config` is current API per official docs as of 2026-03-12.

## Open Questions

1. **MCP server installation in job containers**
   - What we know: MCP servers installed via `npx -y` at runtime (per typical MCP server invocation). Dockerfile doesn't pre-install any MCP servers. `MCP-F02` (dynamic install at startup) is deferred.
   - What's unclear: Does `npx -y @modelcontextprotocol/server-github` in a container with no npm cache cause acceptable latency? First-call cold start could be 10-30s.
   - Recommendation: Document in MCP_SERVERS.json template that `npx -y` servers have cold-start cost. Encourage baking heavy MCP servers into Dockerfile at operator discretion. Not a blocker for Phase 27.

2. **Health check implementation complexity**
   - What we know: A minimal `claude` invocation is needed to verify MCP server is responsive. This adds another LLM API call at job start.
   - What's unclear: Whether MCP-06 health check should use `claude -p` (makes an LLM call) or a direct stdio probe to the MCP process.
   - Recommendation: Use a lightweight subprocess test — spawn the MCP server process directly (same command/args), send a JSON-RPC `initialize` request, check for valid response, then kill. No LLM call needed for health check.

3. **Hydration tool output format (MCP-08)**
   - What we know: MCP tools return structured JSON. Hydration step should append context to job prompt.
   - What's unclear: Should hydration output be formatted as markdown section or raw text? How should multiple hydration tools be combined?
   - Recommendation: Format each hydration tool output as a markdown section with the tool name as heading. Combine all hydration outputs into a single `## MCP Context` block prepended to the job prompt.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — ClawForge has no test infrastructure |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-01 | MCP_SERVERS.json parsed correctly | unit | N/A — no test framework | Wave 0 gap |
| MCP-02 | Template vars resolved from env | unit | N/A | Wave 0 gap |
| MCP-03 | `--mcp-config` flag passed to claude | integration (manual) | Run job, inspect container logs | manual-only |
| MCP-04 | Workspace container gets same MCP config | integration (manual) | Open workspace, check env vars | manual-only |
| MCP-05 | MCP tools appear in allowedTools | integration (manual) | Check claude invocation flags in logs | manual-only |
| MCP-06 | Health check logs `mcp_startup` on failure | integration (manual) | Point to bad MCP server, check logs | manual-only |
| MCP-07 | Settings page renders servers | manual | Navigate to /settings/mcp | manual-only |
| MCP-08 | Hydration output prepended to prompt | integration (manual) | Check job.md context in container | manual-only |
| MCP-09 | Env values never in git or UI | code review | `grep -r 'AGENT_LLM_' config/` | manual-only |

### Sampling Rate
- **Per task commit:** No automated tests; manual spot-check MCP config resolution logic
- **Per wave merge:** Verify docker dispatch env vars contain MCP_CONFIG_JSON for wave 2
- **Phase gate:** Manual integration test with a real MCP server (e.g., `@modelcontextprotocol/server-filesystem`) before `/gsd:verify-work`

### Wave 0 Gaps
- No test framework exists in this project — all MCP-specific testing is manual integration testing
- Recommendation: Add unit tests for `buildMcpConfig()` and `resolveMcpTemplateVars()` using Node's built-in `node:test` if time allows (not blocking)

## Sources

### Primary (HIGH confidence)
- Official Claude Code CLI docs (code.claude.com/docs/en/cli-reference) — `--mcp-config`, `--strict-mcp-config`, `--allowedTools`, MCP config schema
- `lib/tools/repos.js` — `loadAllowedRepos()` pattern for config loading
- `lib/tools/docker.js` — `dispatchDockerJob()` and `ensureWorkspaceContainer()` env injection pattern
- `templates/docker/job/entrypoint.sh` — claude invocation pattern and flag structure
- `lib/chat/components/settings-layout.jsx` — Tab pattern for settings page
- `lib/chat/actions.js` — `requireAuth()` Server Action pattern
- `lib/paths.js` — Central path resolver pattern for new `mcpServersFile` export
- `.planning/STATE.md` — Architecture decisions (AES-256-GCM for crypto, `--mcp-config` pre-check resolved)

### Secondary (MEDIUM confidence)
- MCP tool naming convention `mcp__servername__toolname` — from Claude Code CLI docs context and `--allowedTools` docs

### Tertiary (LOW confidence)
- MCP server cold-start latency estimates (10-30s for `npx -y`) — based on general npm package download times, not measured in ClawForge context

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all patterns verified from existing codebase + official docs
- Architecture: HIGH — follows established ClawForge patterns exactly; `--mcp-config` flag confirmed
- Pitfalls: HIGH — derived from codebase analysis of existing patterns + official docs constraints

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable CLI API; check for Claude Code CLI updates if researching after this date)
