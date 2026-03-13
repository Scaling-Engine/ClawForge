# Upstream Feature Inventory — thepopebot → ClawForge

**Source:** `stephengpope/thepopebot` (analyzed 2026-03-12)
**Purpose:** Full catalog of upstream features with cherry-pick classification

## Classification Key

- **Safe Copy** — File exists only in upstream, no ClawForge equivalent. Copy directly.
- **Careful Merge** — Both sides have the file but diverged. Must preserve ClawForge-specific logic.
- **Never Touch** — ClawForge version is authoritative. Upstream version incompatible.
- **Already Shipped** — Feature already exists in ClawForge (may differ in implementation).

---

## Safe Copy Files (upstream-only, no local equivalent)

| File | Description | Target Phase |
|------|-------------|-------------|
| `lib/config.js` | Centralized DB-backed config helper | 29 |
| `lib/llm-providers.js` | LLM provider listing for settings UI | 29 |
| `lib/github-api.js` | GitHub API wrapper (secrets/vars CRUD) | 34 |
| `lib/chat/components/ui/combobox.jsx` | Searchable dropdown component | 29 |
| `lib/chat/components/tool-names.js` | Tool ID → human-readable name map | 29 |
| `lib/chat/components/pull-requests-page.jsx` | PR approvals page | 30 |
| `lib/chat/components/runners-page.jsx` | GitHub Actions runner status | 30 |
| `lib/chat/components/profile-page.jsx` | User profile page | 30 |
| `lib/chat/components/settings-chat-page.jsx` | Chat settings sub-page | 33 |
| `lib/chat/components/settings-general-page.jsx` | General settings sub-page | 33 |
| `lib/chat/components/settings-github-page.jsx` | GitHub settings sub-page | 33 |
| `lib/chat/components/settings-users-page.jsx` | User management page | 33 |
| `lib/chat/components/settings-secrets-layout.jsx` | Secrets management layout | 34 |
| `lib/chat/components/voice-bars.jsx` | Voice volume visualization | 35 |
| `lib/chat/components/code-mode-toggle.jsx` | Code mode UI toggle | 31 |
| `lib/voice/recorder.js` | AudioWorklet microphone capture | 35 |
| `lib/voice/transcription.js` | AssemblyAI WebSocket client | 35 |
| `lib/voice/config.js` | Voice feature configuration | 35 |
| `lib/code/terminal-view.jsx` | Terminal view with DnD tabs | 36 |
| `lib/code/actions.js` | Workspace CRUD server actions | 36 |
| `lib/code/ws-proxy.js` | Enhanced WebSocket proxy | 36 |
| `lib/db/config.js` | Config table schema + queries | 29 |
| `lib/db/crypto.js` | Encryption helpers (adapt to Node crypto) | 34 |
| `lib/ai/web-search.js` | Brave Search API integration | 38 |
| `lib/cluster/components/*.jsx` | Cluster UI components (6+ files) | 37 |
| `web/app/admin/**` | Admin panel pages (entire tree) | 33 |
| `bin/setup` | Interactive setup wizard | 38 |
| `bin/cli.js` | CLI commands | 38 |
| `setup/` | Setup wizard directory | 38 |

## Careful Merge Files (both sides modified)

| File | Divergence | ClawForge Priority | Notes |
|------|-----------|-------------------|-------|
| `lib/chat/components/app-sidebar.jsx` | Moderate | Keep ClawForge nav (Swarm, MCP) | Add PR/Runners/Profile links, keep existing items |
| `lib/chat/components/chat.jsx` | Moderate | Keep `useRepoChat()` | Add code mode toggle, file upload support |
| `lib/chat/components/message.jsx` | Moderate | Keep job stream rendering | Add enhanced code blocks, image previews |
| `lib/db/schema.js` | Heavy | Keep all ClawForge tables | Add `role` column to users, config table |
| `lib/ai/model.js` | Moderate | Keep ClawForge providers | Merge any new model support |

## Never Touch Files (ClawForge authoritative)

| File | Reason |
|------|--------|
| `lib/ai/tools.js` | 751 lines, 9 custom tools, Docker dispatch via dockerode, MCP injection, Slack status — completely different from upstream's 352-line/5-tool version |
| `lib/ai/agent.js` | `getAgent()` with 9 tools vs upstream's `getJobAgent()`+`getCodeAgent()`. Different architecture. |
| `lib/ai/index.js` | Has `addToThread()`, `summarizeJob()`, `chatStream()` — ClawForge-specific streaming |
| `lib/tools/docker.js` | 1201 lines via dockerode vs upstream's 472-line raw http. Completely different API. |
| `lib/tools/create-job.js` | ClawForge Docker dispatch vs upstream GitHub Actions dispatch |
| `lib/tools/github.js` | ClawForge adds `fetchRepoFile()`, `githubApi()` — different surface area |
| `lib/db/schema.js` (core tables) | Different table structures, ClawForge has cluster tables, MCP config, etc. |
| `lib/paths.js` | Different export names, different directory structure |
| `api/index.js` | 378+ diff lines — completely different route handling |
| `lib/cluster/index.js` | ClawForge has full cluster runtime; upstream has none |
| `lib/cluster/dispatch.js` | ClawForge label-based routing, safety limits, volume isolation |
| `lib/mcp/*.js` | ClawForge-only feature — no upstream equivalent |
| `lib/chat/features-context.js` | ClawForge-only feature flags system |
| `lib/chat/repo-chat-context.js` | ClawForge-only repo/branch selection context |

## Dependency Differences

| ClawForge Only | Upstream Only | Resolution |
|---|---|---|
| `dockerode` | — | Keep (our Docker API client) |
| `@slack/bolt`, `@slack/web-api` | — | Keep (multi-channel support) |
| `next-themes` | — | Keep (theme support) |
| `yaml` | — | Keep (YAML parsing) |
| `@xterm/xterm` v6 | `@xterm/xterm` v5 | Keep v6 |
| — | `chokidar` | Add in Phase 36 (file tree watching) |
| — | `@dnd-kit/core`, `@dnd-kit/sortable` | Add in Phase 36 (tab DnD) |
| — | `@xterm/addon-search` | Add in Phase 36 |
| — | `@xterm/addon-web-links` | Add in Phase 36 |
| — | `@xterm/addon-serialize` | Add in Phase 36 |
| — | `libsodium-wrappers` | Skip — use Node `crypto` instead |

---
*Created: 2026-03-12*
*Source: thepopebot upstream analysis + ClawForge codebase comparison*
