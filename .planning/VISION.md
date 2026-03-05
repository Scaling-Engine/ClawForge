# ClawForge Vision: Stripe-Level Coding Agent Platform

## The Target

Stripe ships 1,000+ AI-authored PRs per week with their "minions" system. ClawForge should reach feature parity with that architecture while remaining simpler to operate (no AWS, no k8s — Docker Compose on a single box or small VPS fleet).

## What Stripe Has That We Need

| Stripe Capability | ClawForge Today | Gap |
|---|---|---|
| Multiple entry points (Slack, CLI, web, embedded buttons) | Slack, Telegram, Web Chat | Minimal — add embedded triggers |
| Pre-warmed "devboxes" (10s startup, code pre-loaded) | Cold-start containers (clone every time) | **Large** — need persistent volumes |
| 400+ MCP tools via internal "Toolshed" | `--allowedTools` whitelist, no MCP | **Large** — need MCP tool layer |
| Fork of Block's "goose" + deterministic git/lint/test | Claude Code CLI + deterministic entrypoint | Close — enhance entrypoint |
| Coding rule files (conditional by subdirectory) | SOUL.md + AGENT.md per instance | Close — add repo-level rules |
| Local heuristic feedback (<5s) before CI | No pre-CI checks | **Medium** — add lint/typecheck step |
| At most 2 CI runs for test feedback | No test feedback loop | **Medium** — add CI-aware retry |
| Interactive + headless modes | Headless only (one-shot jobs) | **Large** — need code workspaces |
| Multi-agent clusters (coordinated workers) | Single-agent instances | **Large** — future milestone |
| Human-reviewed PRs (no auto-merge for complex) | Auto-merge by path, manual for instances/ | Close — extend merge policies |

## What thepopebot Already Built That We Can Pull

| Feature | Upstream Status | Pull Difficulty | Priority |
|---|---|---|---|
| Docker Engine API (Unix socket) | Production | Medium — replace GH Actions dispatch | High |
| Code Workspaces (interactive containers + xterm.js) | Production | Large — new feature surface | High |
| Shared named volumes (persistent workspace state) | Production | Small — volume config change | High |
| Headless code containers (ephemeral task runners) | Production | Medium — parallel to our jobs | High |
| Container recovery (inspect/restart/recreate) | Production | Small — add to docker.js | Medium |
| Skills system (plugin directories) | Production | Medium — new abstraction | Medium |
| Clusters (multi-agent coordination) | UI/DB only, no runtime | Large — build runtime ourselves | Future |
| Voice input (Whisper) | Production | Small — already have OpenAI | Low |
| `exec-in-container` | Production | Small — Docker API call | Medium |
| Binary WebSocket frames for terminal | Production | Small — perf optimization | Low |
| NPM package architecture | Production | N/A — we keep our fork model | Skip |

## Architecture Evolution

### Current: GitHub Actions Pipeline
```
Message -> Event Handler -> push job/* branch -> GH Actions -> Docker container -> clone repo -> claude -p -> commit -> PR -> notification
```

**Pros:** Simple, auditable, free for public repos
**Cons:** Cold start (~60s), Actions minutes cost, no interactive mode, no volume persistence

### Target: Hybrid Docker Engine + Actions
```
Message -> Event Handler -> Docker Engine API -> container (volume-mounted repo) -> claude -p -> commit -> PR -> notification
                         -> OR: GH Actions (for repos needing CI integration)

Interactive: Web UI -> Event Handler -> persistent container -> xterm.js terminal -> Claude Code interactive
```

**Pros:** 10s warm start, persistent state, interactive + headless, no Actions cost for simple jobs
**Cons:** Requires Docker socket access on host, more infrastructure to manage

### Future: MCP-Enriched Agents
```
Same as Target, plus:
- Per-instance MCP server configs (curated tool subsets)
- Pre-run MCP tools on context links before job starts
- Repo-level .clawforge/ rule files (conditional by path)
- CI feedback loop (run tests, get results, retry once)
```

---

## Milestone Map

### v1.3 Instance Generator (In Progress)
Finish what's started — Archie creates instances via conversation.
Phases 13-17. No architecture changes.

### v1.4 Docker Engine Foundation
Replace GitHub Actions dispatch with direct Docker Engine API for job execution. Pull `lib/tools/docker.js` pattern from thepopebot. Keep GH Actions as fallback for CI-integrated repos.

**Why first:** Everything else (workspaces, volumes, headless mode) depends on having Docker Engine API access. This is the infrastructure unlock.

**Key pulls from thepopebot:**
- `dockerApi()` — Unix socket HTTP client
- `createHeadlessCodeContainer()` — ephemeral task runner
- `inspectContainer()`, `startContainer()`, `removeContainer()`
- `detectNetwork()` — auto-detect Docker network
- Volume management (`volumeName()`, shared binds)

### v1.5 Persistent Workspaces
Named Docker volumes per repo so containers start warm (code already cloned). Interactive code workspaces via xterm.js + WebSocket proxy. This is the "devbox" equivalent.

**Key pulls from thepopebot:**
- `lib/code/` — full workspace module (actions, terminal-view, ws-proxy)
- `lib/tools/docker.js` — `createCodeWorkspaceContainer()`
- Container recovery logic (`ensureCodeWorkspaceContainer`)
- WebSocket auth proxy (JWT cookie validation → container proxy)

### v1.6 MCP Tool Layer
Per-instance MCP server configuration. Agents get curated tool access beyond just Claude Code built-ins. This is the "Toolshed" equivalent.

**What to build (no thepopebot equivalent):**
- Instance-level `MCP_SERVERS.json` config
- MCP server lifecycle in containers (start/stop with container)
- Tool subset curation per instance
- Pre-run MCP tools on context links (hydrate before job starts)

### v1.7 Smart Execution
Pre-CI quality gates (lint, typecheck), CI-aware test feedback loop (at most 2 runs), and configurable merge policies per repo.

**What to build:**
- Entrypoint phases: creative work → deterministic checks → CI submit
- CI result polling and retry (configurable max runs)
- Per-repo merge policy config in REPOS.json
- Local heuristic checks (<5s: lint, type errors, import resolution)

### v1.8 Multi-Agent Clusters (Future)
Coordinated agent groups with role-based task distribution. Pull cluster DB schema from thepopebot, build our own runtime.

**Key pulls from thepopebot:**
- Cluster/worker/role DB schema
- Trigger config model (cron, file_watch, webhook)

**What to build:**
- Cluster runtime (dispatch tasks to workers)
- Inter-worker communication
- Result aggregation and conflict resolution

---

## Decision Log

| Decision | Rationale |
|---|---|
| Keep fork model, don't adopt NPM package | We need full control over the codebase; our instance isolation model diverges from thepopebot's single-user design |
| Docker Engine API before workspaces | Workspaces require Docker API; doing it in order prevents rework |
| MCP before clusters | Individual agents need to be more capable before coordination adds value |
| Skip AWS/k8s | Docker Compose on VPS is sufficient for our scale; complexity not justified |
| Pull docker.js patterns, not wholesale | Our entrypoint flow differs; adapt the Docker API client, not the full module |
| GH Actions as fallback, not replacement | Some repos need CI integration that only Actions provides |

---
*Created: 2026-03-04*
*Sources: Stripe minions blog (stripe.dev/blog/minions), thepopebot upstream (stephengpope/thepopebot commits through 2026-03-05)*
