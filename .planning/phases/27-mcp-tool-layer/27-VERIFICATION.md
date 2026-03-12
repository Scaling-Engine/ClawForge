---
phase: 27-mcp-tool-layer
verified: 2026-03-12T18:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 27: MCP Tool Layer Verification Report

**Phase Goal:** Each instance has curated MCP server configs that get injected into job and workspace containers at runtime, with credentials never stored in git
**Verified:** 2026-03-12T18:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                         | Status     | Evidence                                                                                     |
|----|-----------------------------------------------------------------------------------------------|------------|----------------------------------------------------------------------------------------------|
| 1  | loadMcpServers() reads MCP_SERVERS.json and returns array of server configs                   | VERIFIED   | `lib/tools/mcp-servers.js:9-17` — reads `mcpServersFile`, returns `parsed.mcpServers` array, catches all errors |
| 2  | buildMcpConfig() resolves {{AGENT_LLM_*}} template vars from process.env                     | VERIFIED   | `lib/tools/mcp-servers.js:33,46` — regex `/\{\{(AGENT_LLM_[^}]+)\}\}/g`, replaces with `process.env[key] ?? ''` |
| 3  | buildMcpConfig() transforms ClawForge array format to Claude Code object map format           | VERIFIED   | `lib/tools/mcp-servers.js:52-56,72` — builds `mcpServersObj[name]={command,args,env}`, returns `{mcpServers: mcpServersObj}` |
| 4  | allowedTools fragment uses mcp__servername__toolname double-underscore format                  | VERIFIED   | `lib/tools/mcp-servers.js:61` — `toolFragments.push(\`mcp__${name}__${tool}\`)` |
| 5  | No literal credentials appear in MCP_SERVERS.json files                                       | VERIFIED   | `instances/noah/config/MCP_SERVERS.json` uses `{{AGENT_LLM_BRAVE_API_KEY}}` and `{{AGENT_LLM_GITHUB_TOKEN}}` only |
| 6  | Job containers receive MCP config via --mcp-config flag and MCP servers are available         | VERIFIED   | `entrypoint.sh:26-38,431-436` — writes `/tmp/mcp-config.json`, passes `$MCP_FLAGS` to `claude -p` |
| 7  | Workspace containers receive the same MCP config as job containers                            | VERIFIED   | `lib/tools/docker.js:532-539` — `ensureWorkspaceContainer` injects same `MCP_CONFIG_JSON`, `MCP_ALLOWED_TOOLS`, `MCP_HYDRATION_STEPS` |
| 8  | Failed MCP server connection is logged with mcp_startup stage and job continues               | VERIFIED   | `entrypoint.sh:281-288` — `echo "[mcp] Failure stage: mcp_startup"`, clears `MCP_FLAGS` and continues |
| 9  | Hydration tools run before main claude -p and output is prepended to prompt                   | VERIFIED   | `entrypoint.sh:294-327,406-415` — hydration block runs before main invocation, prepends `## MCP Context` section |
| 10 | Operator can view configured MCP servers and their tool subsets at /settings/mcp              | VERIFIED   | `lib/chat/components/settings-mcp-page.jsx` — 129-line component renders server cards with name, command, allowedTools |
| 11 | MCP server env values are never shown in the UI — only name, command, args, allowedTools      | VERIFIED   | `lib/chat/actions.js:338` — `getMcpServers()` destructures and omits `env` key before returning to client |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact                                         | Expected                                          | Status     | Details                                                               |
|--------------------------------------------------|---------------------------------------------------|------------|-----------------------------------------------------------------------|
| `lib/tools/mcp-servers.js`                       | loadMcpServers, buildMcpConfig exports            | VERIFIED   | 79 lines, exports both functions at line 78                           |
| `lib/paths.js`                                   | mcpServersFile export                             | VERIFIED   | Line 43: `export const mcpServersFile = path.join(PROJECT_ROOT, 'config', 'MCP_SERVERS.json')` |
| `templates/config/MCP_SERVERS.json`              | Empty mcpServers array template                   | VERIFIED   | `{"mcpServers": []}` — correct scaffold                               |
| `instances/noah/config/MCP_SERVERS.json`         | Example with {{AGENT_LLM_*}} template vars        | VERIFIED   | brave-search and github servers, all env values use template vars     |
| `templates/docker/job/entrypoint.sh`             | MCP config write, health check, hydration, flag   | VERIFIED   | Lines 25-38 (config write), 267-292 (health check), 294-327 (hydration), 431-436 (flag) |
| `lib/tools/docker.js`                            | MCP_CONFIG_JSON + MCP_ALLOWED_TOOLS injection     | VERIFIED   | Lines 113-120 (dispatchDockerJob), 532-539 (ensureWorkspaceContainer) |
| `lib/ai/tools.js`                                | buildMcpConfig import + calls before both dispatches | VERIFIED | Line 11 import, line 95 (createJobTool), line 576 (startCodingTool)  |
| `lib/chat/components/settings-mcp-page.jsx`      | Read-only MCP servers list, min 40 lines          | VERIFIED   | 129 lines, renders server cards with all fields, no edit controls     |
| `lib/chat/actions.js`                            | getMcpServers() Server Action with env redaction  | VERIFIED   | Lines 333-344, `requireAuth()` called, `env` key omitted from return |
| `lib/chat/components/settings-layout.jsx`        | MCP Servers tab in navigation                     | VERIFIED   | Line 11: `{ id: 'mcp', label: 'MCP Servers', href: '/settings/mcp', icon: WrenchIcon }` |
| `templates/app/settings/mcp/page.js`             | Next.js route for /settings/mcp                   | VERIFIED   | Imports `SettingsMcpPage` from barrel, renders as route               |
| `lib/chat/components/index.js`                   | SettingsMcpPage barrel export                     | VERIFIED   | Line 10: `export { default as SettingsMcpPage } from './settings-mcp-page.js'` |

### Key Link Verification

| From                                        | To                              | Via                                   | Status   | Details                                                               |
|---------------------------------------------|---------------------------------|---------------------------------------|----------|-----------------------------------------------------------------------|
| `lib/tools/mcp-servers.js`                  | `lib/paths.js`                  | import mcpServersFile                 | WIRED    | Line 2: `import { mcpServersFile } from '../paths.js'`                |
| `lib/tools/mcp-servers.js`                  | `config/MCP_SERVERS.json`       | fs.readFileSync(mcpServersFile)       | WIRED    | Line 11: `fs.readFileSync(mcpServersFile, 'utf8')`                    |
| `lib/ai/tools.js`                           | `lib/tools/mcp-servers.js`      | import buildMcpConfig                 | WIRED    | Line 11: `import { buildMcpConfig } from '../tools/mcp-servers.js'`  |
| `lib/ai/tools.js`                           | `lib/tools/docker.js`           | passes mcpConfig to both dispatchers  | WIRED    | Lines 95+105 (job), 576+585 (workspace) — mcpConfig in opts object   |
| `lib/tools/docker.js`                       | `entrypoint.sh`                 | MCP_CONFIG_JSON env var consumed      | WIRED    | docker.js pushes `MCP_CONFIG_JSON=...` env var; entrypoint.sh:26 reads `$MCP_CONFIG_JSON` |
| `lib/chat/components/settings-mcp-page.jsx` | `lib/chat/actions.js`           | getMcpServers() Server Action call    | WIRED    | Line 4 import, line 95 call in useEffect                              |
| `lib/chat/actions.js`                       | `lib/tools/mcp-servers.js`      | import loadMcpServers                 | WIRED    | Line 335: `const { loadMcpServers } = await import('../tools/mcp-servers.js')` |
| `lib/chat/components/settings-layout.jsx`   | `templates/app/settings/mcp/page.js` | TABS href /settings/mcp          | WIRED    | Line 11 in layout; page.js exists at matching route path              |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                           | Status    | Evidence                                                                    |
|-------------|-------------|-------------------------------------------------------------------------------------------------------|-----------|-----------------------------------------------------------------------------|
| MCP-01      | 27-01       | Each instance has MCP_SERVERS.json config with name, command, args, env, tool subset                 | SATISFIED | `instances/noah/config/MCP_SERVERS.json` schema verified; `templates/config/MCP_SERVERS.json` scaffold exists |
| MCP-02      | 27-01       | loadMcpServers() reads and validates instance MCP config, resolving {{AGENT_LLM_*}} template vars    | SATISFIED | `lib/tools/mcp-servers.js:9-17` (load) + `buildMcpConfig:33-46` (template resolution) |
| MCP-03      | 27-02       | Job containers receive MCP server configs via --mcp-config flag; MCP servers available to Claude Code | SATISFIED | `entrypoint.sh:26-38,431-436` — config written to `/tmp/mcp-config.json`, passed via `--mcp-config` |
| MCP-04      | 27-02       | Workspace containers receive the same MCP server configs as job containers                            | SATISFIED | `lib/tools/docker.js:532-539` — identical env var injection in `ensureWorkspaceContainer` |
| MCP-05      | 27-01       | Tool subset curation restricts which MCP tools are in --allowedTools whitelist per instance           | SATISFIED | `buildMcpConfig` generates `mcp__name__tool` fragments; `entrypoint.sh:418-420` appends to ALLOWED_TOOLS |
| MCP-06      | 27-02       | MCP health check at container start; logs clear error with mcp_startup failure stage on failure       | SATISFIED | `entrypoint.sh:267-292` — health check with `timeout 60`, logs `mcp_startup`, clears MCP_FLAGS |
| MCP-07      | 27-03       | Operator can view configured MCP servers and their tool subsets in read-only settings page            | SATISFIED | `lib/chat/components/settings-mcp-page.jsx` + `/settings/mcp` route + MCP Servers nav tab |
| MCP-08      | 27-02       | Pre-run MCP context hydration executes specified tools before claude -p, appends to job prompt        | SATISFIED | `entrypoint.sh:294-327,406-415` — hydration block, output prepended as `## MCP Context` |
| MCP-09      | 27-01, 27-03 | MCP credentials never stored in git; template vars resolve from environment at container start       | SATISFIED | Config files use `{{AGENT_LLM_*}}` only; `getMcpServers()` omits `env` from client response |

All 9 requirements satisfied. No orphaned requirements detected.

### Anti-Patterns Found

No anti-patterns detected in reviewed files.

- No TODO/FIXME/PLACEHOLDER comments in any phase files
- No stub implementations (return null, return {}, empty handlers)
- No literal credentials in config files
- All MCP env values use `{{AGENT_LLM_*}}` template variable pattern

### Human Verification Required

#### 1. MCP Server Health Check Behavior

**Test:** Configure a real MCP server in `config/MCP_SERVERS.json`, dispatch a job, observe container logs
**Expected:** `[mcp] Config written to /tmp/mcp-config.json`, `[mcp] Configured servers: <name>`, `[mcp] Health check passed` in container output
**Why human:** Health check requires a running Docker container with Claude Code CLI and a real MCP server process

#### 2. Graceful Degradation on MCP Failure

**Test:** Configure an MCP server with an invalid command, dispatch a job, observe container logs and job completion
**Expected:** `[mcp] WARNING: MCP health check failed`, `[mcp] Failure stage: mcp_startup`, job completes successfully without MCP tools
**Why human:** Requires live container execution to verify the job continues rather than aborts

#### 3. Settings Page UI Rendering

**Test:** Navigate to `/settings/mcp` in a running instance with MCP servers configured
**Expected:** Server cards showing name, command+args, and allowed tool names with `mcp__name__tool` format; no env/credential values visible
**Why human:** Visual rendering and absence of credential leakage require browser verification

#### 4. Hydration Context Prepend

**Test:** Configure a server with `hydrateTools`, dispatch a job, inspect `logs/{JOB_ID}/claude-output.jsonl`
**Expected:** First user turn contains `## MCP Context` section with hydration output before the job description
**Why human:** Requires live execution with a functioning MCP server that responds to tool calls

### Gaps Summary

No gaps. All automated checks pass. Phase goal is fully achieved.

The MCP tool layer is end-to-end wired:
- Config files exist with template variable placeholders (no literal credentials)
- `loadMcpServers()` and `buildMcpConfig()` form a solid data layer with correct format transforms
- `lib/ai/tools.js` calls `buildMcpConfig()` fresh before each job and workspace dispatch
- `lib/tools/docker.js` injects `MCP_CONFIG_JSON`, `MCP_ALLOWED_TOOLS`, and `MCP_HYDRATION_STEPS` into both container types
- `templates/docker/job/entrypoint.sh` consumes those env vars to write config, run health check with graceful degradation, run hydration, and pass `--mcp-config` to `claude -p`
- The settings UI provides a read-only view of configured servers with env values stripped before client delivery

All 6 task commits from all 3 plans are present in git history (a5c8363, dfc8e15, 30cfe69, 48bc15a, eb248de, 8faa0da).

---

_Verified: 2026-03-12T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
