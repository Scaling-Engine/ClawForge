# Technology Stack

**Project:** ClawForge v2.0 Full Platform
**Milestone:** v2.0 — Web UI (chat + code mode), Multi-Agent Clusters, Headless Job Streaming, Per-Instance MCP Tool Configs
**Researched:** 2026-03-12
**Confidence:** HIGH for UI and DnD (PopeBot upstream verified); HIGH for cluster/headless (full source analysis); MEDIUM for MCP config storage (no upstream precedent — build-new required)

---

## Scope

This document covers **additions and changes** needed for v2.0 only. The validated stack from v1.0–v1.5 is NOT re-researched:

**Already in the stack (do not re-add or change):**
- Next.js 15 + React 19 (peer deps in package.json)
- LangGraph ReAct agent with SQLite checkpointing
- Drizzle ORM + better-sqlite3
- dockerode ^4.0.9 for Docker Engine API
- ws ^8.19.0 for WebSocket proxy
- @xterm/xterm ^6.0.0 + @xterm/addon-fit + @xterm/addon-attach (v1.5)
- next-auth ^5.0.0-beta.30
- @ai-sdk/react ^2.0.0 + ai ^5.0.0 (Vercel AI SDK v5)
- grammy, @slack/web-api, @slack/bolt
- lucide-react, tailwindcss ^4, class-variance-authority, clsx, tailwind-merge
- streamdown ^2.2.0

Four new capability areas for v2.0:

1. **Web UI** — chat page with code mode toggle, repo/branch selector, DnD tab management
2. **Multi-Agent Clusters** — role-based teams with cron/file-watch/webhook triggers
3. **Headless Job Streaming** — live Docker log output piped to chat UI during jobs
4. **MCP Tool Layer** — per-instance MCP server configs injected into cluster worker containers

---

## PopeBot Upstream Evaluation

PopeBot v1.2.73 (`stephengpope/thepopebot`) is the reference implementation. It shares the same base stack as ClawForge (forked origin). The evaluation approach:

**Full source analysis via GitHub raw API — not guesswork.**

### What PopeBot Has That We Don't

| Feature | PopeBot Implementation | Our Status |
|---------|----------------------|------------|
| DnD tabs in code mode | `@dnd-kit/core` + `@dnd-kit/sortable` | Missing — need to add |
| xterm.js search/serialize addons | `@xterm/addon-search`, `@xterm/addon-serialize`, `@xterm/addon-web-links` | Missing — only have attach+fit |
| File watching for cluster triggers | `chokidar` | Missing — need for cluster runtime |
| Encrypted DB config | `libsodium-wrappers` (AES-256-GCM via PBKDF2) | We have `settings` table but no encryption |
| Voice input | AssemblyAI `wss://streaming.assemblyai.com/v3/ws` | Out of scope for v2.0 |
| LLM provider registry | `llm-providers.js` static object | We have multi-provider model.js already |
| Headless streaming | `lib/ai/headless-stream.js` (Docker frame parser + JSONL mapper) | Missing — need to build |
| Cluster system | `lib/cluster/` (actions, execute, runtime, stream) | Missing — need to build |
| Feature flags context | `FeaturesContext` React context | Optional — simple to add |
| `@xterm/addon-attach` | Missing in PopeBot — they use custom WS wiring | We have it already from v1.5 |

### What We Have That PopeBot Doesn't

| Capability | Our Implementation | PopeBot |
|------------|-------------------|---------|
| Multi-tenant architecture | Per-instance Docker networks + scoped REPOS.json | Single-tenant |
| Named volumes with flock mutex | Warm starts across jobs | Not present |
| Cross-repo job targeting | Two-phase clone with target.json sidecar | Not present |
| Ticket-based WS auth (single-use, 30s TTL) | In-memory Map | Simpler cookie-based auth |
| Instance generator conversation | Multi-turn intake → PR with 7 artifacts | Not present |

---

## Recommended Stack — New Additions Only

### Web UI: DnD Tab Management

| Library | Version | Purpose | Why | Action |
|---------|---------|---------|-----|--------|
| `@dnd-kit/core` | `^6.3.1` | DnD context provider + sensors | The PopeBot upstream uses this exact library for code-mode tab reordering. `@dnd-kit` is the successor to `react-beautiful-dnd` (now unmaintained). Headless, accessible, works correctly with React 19. No DOM manipulation — pure React. | FORK from PopeBot `lib/code/code-page.jsx` |
| `@dnd-kit/sortable` | `^10.0.0` | `SortableContext` + `horizontalListSortingStrategy` | Companion to core — provides the sortable primitives (`useSortable`) and strategy for horizontal tab lists. The tab reorder handler in PopeBot's code page uses `arrayMove` from this package. | FORK from PopeBot `lib/code/code-page.jsx` |

**PopeBot fork vs adapt vs build-new:** FORK the DnD tab logic from `lib/code/code-page.jsx`. It's a self-contained `handleDragEnd` callback that calls `arrayMove` on dynamic tabs. Our `CodePage` equivalent will need minor adaptation: we use workspace IDs instead of PopeBot's session IDs, and our tab state structure is different.

### Web UI: Additional xterm.js Addons

| Library | Version | Purpose | Why | Action |
|---------|---------|---------|-----|--------|
| `@xterm/addon-search` | `^0.16.0` | In-terminal text search | PopeBot uses this for workspace terminals. Confirmed latest stable via npm. Not in our current install. Low complexity to add. | ADD (new) |
| `@xterm/addon-serialize` | `^0.14.0` | Terminal content serialization | Used by PopeBot for state save. Enables capturing terminal buffer for context injection back into chat. Relevant for our bidirectional context bridging. | ADD (new) |
| `@xterm/addon-web-links` | `^0.12.0` | Clickable URLs in terminal output | PopeBot uses this. Makes URLs in Claude's terminal output clickable. Low effort, high quality-of-life. | ADD (new) |

**xterm.js version compatibility (verified):** All three stable addon versions declare "requires xterm.js v4+" with no strict npm peer dependency range. Verified via `npm view @xterm/addon-search@0.16.0 --json` — peerDependencies field is absent. These addons install cleanly alongside `@xterm/xterm@6.0.0` without peer dep warnings or conflicts. The beta channel (`0.17.0-beta.xxx`) targets a future xterm 7.x and is not needed.

Note: `@xterm/addon-canvas` was present in older xterm.js and is absent in the v6 addon set — do not add it. The default renderer in xterm 6.x is sufficient.

**PopeBot fork vs adapt vs build-new:** ADD new addons. The terminal view implementation (PopeBot's `lib/code/terminal-view.jsx`) is more sophisticated than our xterm usage (adds search UI, web links, serialize). ADAPT the terminal view component to add these addons to our existing `TerminalView`.

### Cluster System: File Watching

| Library | Version | Purpose | Why | Action |
|---------|---------|---------|-----|--------|
| `chokidar` | `^5.0.0` | File system watcher for cluster triggers | PopeBot's cluster runtime uses chokidar to watch file paths and trigger role execution on change. Chokidar v5 is the current major version (pure ESM). We already use ESM throughout. node-cron (already in our stack) handles the cron trigger path — chokidar only needed for file-watch triggers. | ADD (new) |

**PopeBot fork vs adapt vs build-new:** ADAPT. The cluster runtime (`lib/cluster/runtime.js`) can be forked and adapted. Key changes needed: integrate with our per-instance architecture (PopeBot is single-tenant, we need instance scoping on all DB operations and container dispatch). The trigger logic (cron + file watch + webhook) is portable; the execution path needs to call our `dispatchDockerJob` variant.

### Headless Job Streaming: No New Dependencies

The headless streaming system (`lib/ai/headless-stream.js` in PopeBot) has **zero new dependencies**. It uses:

- Node.js built-in `Buffer` — for Docker frame parsing
- Existing `dockerode` — to tail container logs
- Native `ReadableStream` API — for SSE stream to browser

**PopeBot fork vs adapt vs build-new:** FORK `lib/ai/headless-stream.js` directly. It is a pure utility module: Docker multiplexed frame parser → NDJSON line splitter → Claude Code JSONL event mapper. It has no instance-specific assumptions. The `mapLine()` function maps Claude Code stream-json format to `{ type: 'text' | 'tool-call' | 'tool-result', ... }` events. This is 1:1 compatible with our job container output format.

The cluster stream SSE endpoint (`lib/cluster/stream.js`) also uses no new dependencies — SSE via native `ReadableStream`, dockerode log tailing, polling every 3s, keepalive ping every 15s.

**ADAPT** the cluster stream endpoint for multi-tenant: add instance scoping, validate that the requesting user can access the cluster, and gate container inspection to the correct Docker network.

### Encrypted DB Config: libsodium-wrappers vs crypto

| Library | Version | Purpose | Why | Action |
|---------|---------|---------|-----|--------|
| `libsodium-wrappers` | `^0.8.2` | AES-256-GCM encryption for sensitive config values | PopeBot uses this for encrypting LLM API keys and provider secrets stored in the `settings` table. Node.js built-in `crypto` module can do AES-256-GCM identically, but libsodium-wrappers is what PopeBot uses. **Recommendation: use Node's built-in `crypto` instead.** `crypto.createCipheriv('aes-256-gcm', key, iv)` is identical capability with zero added dependencies. PBKDF2 key derivation from `AUTH_SECRET` (same pattern) is in `crypto.pbkdf2Sync`. | BUILD-NEW using `crypto` |

**Rationale for build-new with built-in crypto:** libsodium-wrappers is 1.2MB and requires WASM initialization. Node's `crypto` module is built-in, synchronous, and has no initialization delay. The encryption pattern (AES-256-GCM, PBKDF2 key derivation from `AUTH_SECRET`, IV + ciphertext + auth tag as base64 JSON) is identical. We adopt PopeBot's *algorithm and pattern* but not the library.

**What to store encrypted:** MCP server configs contain API keys (e.g., Brave Search API key, GitHub PAT for MCP servers). These must be encrypted at rest. Store in the existing `settings` table with `type: 'mcp_config'`. Encrypted JSON blob per instance.

### MCP Tool Layer: Per-Instance Config Storage

No new libraries needed. The MCP config system is:

1. **Storage:** Existing `settings` table + encrypted JSON blob via Node `crypto` (see above)
2. **Injection:** Claude Code CLI `--mcp-config` flag accepts a JSON file path or inline JSON string. Write temp config file before container launch, inject path via env var. Use companion `--strict-mcp-config` flag to ignore any inherited MCP configs inside the container, using only the instance-configured servers.
3. **Schema extension:** New `type: 'mcp_config'` records in `settings` — one per instance, keyed by `instanceName`.

**Verified CLI flags (confirmed via `claude --help`):**
- `--mcp-config <configs...>` — Load MCP servers from JSON files or strings (space-separated)
- `--strict-mcp-config` — Only use MCP servers from `--mcp-config`, ignoring all other MCP configurations

Use `--strict-mcp-config` in cluster worker container entrypoints to prevent container-level MCP configs (e.g., from a `~/.claude.json` baked into the image) from interfering with instance-specific configs.

**MCP server transport:** When configuring MCP servers for injection, use `stdio` transport (subprocess) or `http` transport (remote). The older `sse` transport is deprecated in Claude Code as of the current CLI version — do not use `type: "sse"` in MCP config JSON.

**PopeBot fork vs adapt vs build-new:** BUILD-NEW. PopeBot does not have per-instance MCP config. Their cluster roles have a `triggerConfig` JSON field that could theoretically hold MCP config, but the execute.js implementation does not pass MCP config to containers. We need to design this from scratch.

**MCP Config Design (new):**

```
settings table:
  type: 'mcp_config'
  key:  instance name (e.g., 'noah', 'strategyES')
  value: encrypted JSON → { mcpServers: { [serverName]: { command, args, env } } }
```

At cluster role execution, decrypt the instance's MCP config, write to `/tmp/mcp-{uuid}.json`, pass `MCP_CONFIG_PATH=/tmp/mcp-{uuid}.json` env var to container. The container entrypoint passes `--mcp-config $MCP_CONFIG_PATH --strict-mcp-config` to the `claude -p` invocation.

### Feature Flags Context

No new dependencies. PopeBot's `FeaturesContext` is 15 lines of React context boilerplate. We can add it trivially.

**PopeBot fork vs adapt vs build-new:** FORK directly (15 lines, zero dependencies). Used to toggle voice input, code mode, cluster mode per instance config. Useful for our two-instance setup where Epic/StrategyES has different capabilities than Noah/Archie.

---

## Fork vs Adapt vs Build-New Summary

| Component | Decision | Rationale |
|-----------|----------|-----------|
| `lib/ai/headless-stream.js` | **FORK** | Zero instance assumptions, pure parsing utility |
| `lib/cluster/actions.js` | **ADAPT** | Add instance scoping to all DB ops and container dispatch |
| `lib/cluster/runtime.js` | **ADAPT** | Cron/chokidar trigger logic portable; integrate with per-instance config |
| `lib/cluster/execute.js` | **ADAPT** | Change `runClusterWorkerContainer` to use our `dispatchDockerJob` variant; add MCP config injection |
| `lib/cluster/stream.js` | **ADAPT** | Add instance scoping, use our dockerode patterns |
| `lib/code/code-page.jsx` DnD logic | **FORK** | `handleDragEnd` + `@dnd-kit` usage is self-contained |
| `lib/code/terminal-view.jsx` addons | **ADAPT** | Add search/serialize/web-links addons to our existing TerminalView |
| `lib/chat/components/features-context.jsx` | **FORK** | 15-line context boilerplate |
| `lib/db/crypto.js` pattern | **ADAPT** | Use same AES-256-GCM + PBKDF2 algorithm but Node built-in `crypto` instead of libsodium |
| MCP config storage | **BUILD-NEW** | No upstream precedent; design for per-instance architecture |
| `lib/llm-providers.js` | **SKIP** | We already have multi-provider model.js; not a gap |
| Voice input (AssemblyAI) | **SKIP** | Out of scope for v2.0 |

---

## DB Schema Changes Required

New tables and columns for v2.0:

```javascript
// clusters table (new)
export const clusters = sqliteTable('clusters', {
  id: text('id').primaryKey(),
  instanceName: text('instance_name').notNull(),  // multi-tenant addition vs PopeBot
  name: text('name').notNull(),
  systemPrompt: text('system_prompt').notNull().default(''),
  enabled: integer('enabled').notNull().default(1),
  starred: integer('starred').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// cluster_roles table (new)
export const clusterRoles = sqliteTable('cluster_roles', {
  id: text('id').primaryKey(),
  clusterId: text('cluster_id').notNull(),
  roleName: text('role_name').notNull(),
  role: text('role').notNull().default(''),
  triggerConfig: text('trigger_config').notNull().default('{}'),
  maxConcurrency: integer('max_concurrency').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// cluster_sessions table (new — for log tracking)
export const clusterSessions = sqliteTable('cluster_sessions', {
  id: text('id').primaryKey(),
  roleId: text('role_id').notNull(),
  clusterId: text('cluster_id').notNull(),
  containerId: text('container_id'),
  containerName: text('container_name'),
  status: text('status').notNull().default('running'),
  triggerType: text('trigger_type'),  // 'cron' | 'file' | 'webhook' | 'manual'
  logDir: text('log_dir'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// settings table already exists — add mcp_config type records (no schema change needed)
```

**Multi-tenant deviation from PopeBot:** PopeBot's `clusters` table has no `instanceName` column (single-tenant). We must add it. Every cluster DB operation filters by `instanceName` to enforce isolation between Noah/Archie and Epic/StrategyES.

---

## Code Mode Toggle: Chat + Code Integration

No new dependencies. The chat page already exists (`lib/chat/components/chat-page.jsx`). Code mode is a state toggle:

- `mode: 'chat' | 'code'` — stored in state, reflected in URL (e.g., `/chat/{id}` vs `/code/{workspaceId}`)
- Repo/branch selector — uses existing GitHub API tooling (`get_repository_details` tool)
- DnD tabs — `@dnd-kit` (see above)
- `FeaturesContext` gates whether code mode option appears (disabled for Epic instance if desired)

**PopeBot's code page** (`lib/code/code-page.jsx`) is the reference. ADAPT it: replace `listTerminalSessions()` with our `list_workspaces` Server Action, replace `createTerminalSession()` with our `start_coding` tool invocation, and wire `closeTerminalSession()` to our `closeWorkspace` Server Action.

The existing `chat-page.jsx` handles navigation; extend it with a mode toggle that renders either `<Chat>` (current) or `<CodePage>` (new).

---

## Headless Streaming Architecture

How live log output flows from a running cluster worker container to the chat UI:

```
Cluster Worker Container (claude -p running)
  → stdout JSONL → Docker log stream
  → dockerode container.logs({ follow: true, stdout: true })
  → headless-stream.js (frame parser + JSONL mapper)
  → mapLine() → { type: 'text'|'tool-call'|'tool-result', ... }
  → SSE stream via ReadableStream (lib/cluster/stream.js GET endpoint)
  → Browser EventSource → React state update → chat message parts
```

**Why SSE (not WebSocket) for log streaming:**
- Unidirectional (container → browser) — SSE is the correct primitive
- SSE works through Next.js API routes (unlike WebSocket which requires the custom HTTP server)
- Browser `EventSource` auto-reconnects on disconnect
- No additional dependencies

**Why ReadableStream (not node-streams) for SSE:**
- Next.js 15 API routes return `Response` objects; `new Response(new ReadableStream(...))` is the standard pattern
- Avoids the `stream.pipe(res)` pattern which is incompatible with Next.js App Router

---

## Installation

```bash
# DnD kit for tab reordering in code mode
npm install @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0

# Additional xterm.js addons for richer terminal UX
# These addons declare "requires xterm.js v4+" with no strict peer dep range
# — compatible with our @xterm/xterm@6.0.0 install
npm install @xterm/addon-search@^0.16.0 @xterm/addon-serialize@^0.14.0 @xterm/addon-web-links@^0.12.0

# File watching for cluster triggers
npm install chokidar@^5.0.0
```

No new dev dependencies.

**NOT installing (from PopeBot's package.json that we skip):**
- `libsodium-wrappers` — using Node built-in `crypto` instead
- `assembliai` / voice libs — out of scope for v2.0

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| DnD tab management | `@dnd-kit` | `react-beautiful-dnd` | Unmaintained since 2022 (Atlassian archived it). `@dnd-kit` is the community successor. |
| DnD tab management | `@dnd-kit` | Native HTML5 drag-and-drop | No animation, no keyboard accessibility, no touch support. |
| Encrypted config | Node `crypto` (built-in) | `libsodium-wrappers` | libsodium is 1.2MB + WASM init. Identical AES-256-GCM capability in Node's built-in `crypto`. Zero added dependency. |
| Cluster trigger: file watch | `chokidar` | `fs.watch` (built-in) | `fs.watch` is unreliable (missed events, incorrect event types on macOS/Linux). `chokidar` normalizes across platforms and adds debouncing. |
| Cluster trigger: cron | `node-cron` (already installed) | `cron` package | We already have `node-cron`. No reason to add a second cron library. |
| Headless streaming | SSE via `ReadableStream` | WebSocket | WebSocket is bidirectional; log streaming is unidirectional. SSE is simpler, auto-reconnects, works through Next.js API routes. |
| MCP config storage | Encrypted `settings` table record | Separate `mcp_configs` table | Reuses existing table structure. `type: 'mcp_config'` follows established pattern for `type: 'config_secret'`. Fewer migrations. |
| Voice input | SKIP for v2.0 | AssemblyAI (WebSocket streaming) | Out of scope. AssemblyAI is $0.50/hour of audio — relevant cost at scale. Add in a future milestone if operators want voice. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `libsodium-wrappers` | 1.2MB WASM dependency when Node `crypto` does the same | `crypto.createCipheriv('aes-256-gcm', ...)` |
| `react-beautiful-dnd` | Archived/unmaintained since 2022 | `@dnd-kit/core` + `@dnd-kit/sortable` |
| `socket.io` | Overkill; SSE handles unidirectional log streaming | Native `ReadableStream` SSE |
| `assemblyai` npm package | Out of scope for v2.0, cost implications | Skip for now |
| PopeBot's `lib/tools/docker.js` verbatim | PopeBot auto-detects Docker network by inspecting event-handler container — single-tenant assumption. We use explicit per-instance Docker networks. | Extend our existing `lib/tools/docker.js` with cluster worker container support |
| `dockerode` again | Already installed | Extend existing `lib/tools/docker.js` |
| `@xterm/addon-canvas` | Removed in xterm v6; PopeBot (on v5.5) uses it but we're on v6 | Default renderer (WebGL or DOM) |
| MCP server `type: "sse"` transport | SSE transport is deprecated in Claude Code CLI | Use `stdio` (subprocess) or `http` (remote) transport |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@dnd-kit/core@^6.3.1` | React 19 | Confirmed — uses standard React hooks, no deprecated APIs |
| `@dnd-kit/sortable@^10.0.0` | `@dnd-kit/core@^6.x` | Must match major version of core |
| `@xterm/addon-search@^0.16.0` | `@xterm/xterm@^4+` (no strict peer dep) | Verified via npm: no peerDependencies field declared; description says "v4+". Installs cleanly with xterm 6.0.0. |
| `@xterm/addon-serialize@^0.14.0` | `@xterm/xterm@^4+` (no strict peer dep) | Same — no npm peer dep constraint. |
| `@xterm/addon-web-links@^0.12.0` | `@xterm/xterm@^4+` (no strict peer dep) | Same — no npm peer dep constraint. |
| `chokidar@^5.0.0` | Node >=18, pure ESM | chokidar v5 is ESM-only; compatible with our `"type": "module"` package |

**Note on xterm beta channel:** `@xterm/addon-search@0.17.0-beta.xxx` targets `@xterm/xterm@^6.1.0-beta.xxx` — this is a development version for the next major xterm release. Do not use beta addon versions; the stable 0.16.0 works with xterm 6.0.0.

---

## Integration Points with Existing Stack

### dockerode (lib/tools/docker.js)

Add `runClusterWorkerContainer()` function. Key difference from `dispatchDockerJob()`:
- `AutoRemove: true` (ephemeral — exits when Claude Code job completes)
- Mount a named role-specific volume (cluster shared directory)
- Pass `SYSTEM_PROMPT`, `PROMPT`, cluster metadata as env vars
- Network: existing per-instance Docker network (same as job containers)
- No health check needed (exits on its own)

### LangGraph Agent (lib/ai/tools.js)

No new tools needed for v2.0 cluster features. Clusters are managed via the Web UI (Next.js Server Actions), not via the conversational agent. The agent gets a `start_headless_coding` tool that can trigger a cluster-style headless job on a specific repo/branch.

### Drizzle ORM (lib/db/schema.js)

Add `clusters`, `clusterRoles`, and `clusterSessions` tables. Generate new migration:
```bash
npm run db:generate  # after updating schema.js
```

### settings table (existing)

No schema change. Add encrypted MCP configs as `type: 'mcp_config'` records. Decrypt in the cluster execute path before launching containers.

### Chat UI (lib/chat/components/)

Code mode toggle is a new prop/state on `ChatPage`. When `mode === 'code'`, render `CodePage` (new component). When `mode === 'chat'`, render existing `Chat`. The sidebar stays constant. `FeaturesContext` wraps both modes.

### Custom HTTP Server (server.js)

No changes needed for v2.0. Cluster worker containers do not need WebSocket proxying — they are headless (no browser terminal). SSE for log streaming goes through Next.js API routes natively.

---

## Sources

- PopeBot `package.json` raw — confirmed `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`, `chokidar@^5.0.0`, `libsodium-wrappers@^0.8.2`, `@xterm/addon-search/serialize/web-links` (HIGH confidence — direct source inspection)
- PopeBot `lib/cluster/actions.js`, `runtime.js`, `execute.js`, `stream.js` — cluster architecture analysis (HIGH confidence — direct source inspection)
- PopeBot `lib/ai/headless-stream.js` — Docker frame parser + JSONL mapper implementation (HIGH confidence — direct source inspection)
- PopeBot `lib/code/code-page.jsx` — DnD tab management, code page structure (HIGH confidence — direct source inspection)
- PopeBot `lib/code/terminal-view.jsx` — xterm.js addon usage (search, serialize, web-links) (HIGH confidence — direct source inspection)
- PopeBot `lib/code/ws-proxy.js` — WebSocket proxy pattern (HIGH confidence — direct source inspection)
- PopeBot `lib/db/crypto.js` — AES-256-GCM + PBKDF2 encryption pattern (HIGH confidence — direct source inspection)
- PopeBot `lib/db/config.js` — encrypted settings storage pattern (HIGH confidence — direct source inspection)
- PopeBot `lib/tools/docker.js` — cluster worker vs workspace container differences (HIGH confidence — direct source inspection)
- PopeBot `lib/voice/use-voice-input.js` — AssemblyAI WebSocket streaming (HIGH confidence — out-of-scope for v2.0)
- PopeBot `lib/db/schema.js` — confirmed no per-instance scoping in clusters table (HIGH confidence — direct source inspection)
- `npm info @dnd-kit/core version` → `6.3.1` (HIGH confidence — live npm registry)
- `npm info @dnd-kit/sortable version` → `10.0.0` (HIGH confidence — live npm registry)
- `npm view @xterm/addon-search@0.16.0 --json` → no peerDependencies, description "requires xterm.js v4+" (HIGH confidence — live npm registry, verified)
- `npm view @xterm/addon-serialize@0.14.0 --json` → no peerDependencies, description "requires xterm.js v4+" (HIGH confidence — live npm registry, verified)
- `npm view @xterm/addon-web-links@0.12.0 --json` → no peerDependencies, description "requires xterm.js v4+" (HIGH confidence — live npm registry, verified)
- `npm view @xterm/addon-search@"0.17.0-beta.192" peerDependencies` → `{ '@xterm/xterm': '^6.1.0-beta.192' }` — confirms beta track targets next xterm major, not stable 6.0 (HIGH confidence — live npm registry)
- `npm info chokidar version` → `5.0.0` (HIGH confidence — live npm registry)
- `claude --help` output — confirmed `--mcp-config <configs...>` and `--strict-mcp-config` flags exist (HIGH confidence — local CLI verification)
- ClawForge `package.json` — current dependency baseline (HIGH confidence — direct codebase inspection)
- ClawForge `lib/db/schema.js` — existing `settings` table structure (HIGH confidence — direct codebase inspection)
- ClawForge `lib/chat/components/chat-page.jsx`, `chat.jsx` — existing chat UI patterns (HIGH confidence — direct codebase inspection)

---

*Stack research for: ClawForge v2.0 Full Platform (Web UI, Clusters, Headless Streaming, MCP Tool Layer)*
*Researched: 2026-03-12*
