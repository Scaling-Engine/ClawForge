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

| Feature | Upstream Status | Pull Difficulty | Priority | ClawForge Status |
|---|---|---|---|---|
| Docker Engine API (Unix socket) | Production | Medium | High | **Shipped v1.4** (via dockerode) |
| Code Workspaces (interactive containers + xterm.js) | Production | Large | High | **Shipped v1.5** |
| Shared named volumes (persistent workspace state) | Production | Small | High | **Shipped v1.4** |
| Headless code containers (ephemeral task runners) | Production | Medium | High | **Shipped v1.4** |
| Container recovery (inspect/restart/recreate) | Production | Small | Medium | **Shipped v1.4** |
| Skills system (plugin directories) | Production | Medium | Medium | **Shipped v1.3** (GSD skills) |
| Clusters (multi-agent coordination) | UI/DB only | Large | Future | **Shipped v2.0** (full runtime) |
| Voice input (AssemblyAI) | Production | Small | Medium | **v2.1 Wave 3** (Phase 35) |
| `exec-in-container` | Production | Small | Medium | **Shipped v1.4** |
| Binary WebSocket frames for terminal | Production | Small | Low | **Shipped v1.5** |
| NPM package architecture | Production | N/A | Skip | N/A — fork model kept |
| Admin panel (`/admin/*`) | Production | Medium | Medium | **v2.1 Wave 2** (Phase 33) |
| Auth roles (admin/user) | Production | Medium | Medium | **v2.1 Wave 2** (Phase 32) |
| GitHub secrets management | Production | Medium | Medium | **v2.1 Wave 2** (Phase 34) |
| PR approvals page | Production | Small | High | **v2.1 Wave 1** (Phase 30) |
| Runners status page | Production | Small | High | **v2.1 Wave 1** (Phase 30) |
| Profile page | Production | Small | Medium | **v2.1 Wave 1** (Phase 30) |
| File upload in chat | Production | Medium | Medium | **v2.1 Wave 1** (Phase 31) |
| Enhanced code workspaces (DnD tabs, search, file tree) | Production | Medium | Medium | **v2.1 Wave 3** (Phase 36) |
| Cluster detail views | Production | Medium | Medium | **v2.1 Wave 3** (Phase 37) |
| Setup wizard + CLI | Production | Small | Low | **v2.1 Wave 3** (Phase 38) |

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

### v1.3 Instance Generator — SHIPPED
Archie creates instances via conversation. Phases 13-17.

### v1.4 Docker Engine Foundation — SHIPPED
Docker Engine API via dockerode replaces GitHub Actions dispatch. Persistent volumes, container lifecycle management.

### v1.5 Persistent Workspaces — SHIPPED
Named Docker volumes per repo (warm start). Interactive code workspaces via xterm.js + WebSocket proxy.

### v1.6 MCP Tool Layer — SHIPPED (v2.0 Phase 27)
Per-instance MCP server configuration. `MCP_SERVERS.json`, tool subset curation, pre-run hydration, health checks.

### v2.0 Full Platform — SHIPPED (Phases 25-28)
Headless streaming (SSE, filtered logs, Slack updates), Web UI (auth, repo selector, feature flags), MCP tool layer, Multi-agent clusters (full runtime with label-based routing, safety limits, per-agent Docker volumes).

### v2.1 Upstream Feature Sync — IN PROGRESS (Phases 29-38)
Cherry-pick all missing upstream features from thepopebot without breaking ClawForge-specific systems.

**Wave 1 (Low Risk, UI Additions):** Foundation & Config (29), New Pages (30), Chat Enhancements (31)
**Wave 2 (Medium Risk, Auth & Admin):** Auth Roles (32), Admin Panel (33), GitHub Secrets (34)
**Wave 3 (Higher Effort, Advanced):** Voice Input (35), Code Workspaces V2 (36), Cluster Detail Views (37), Developer Experience (38)

### v2.2 Smart Execution — FUTURE
Pre-CI quality gates, CI-aware test feedback loop, configurable merge policies per repo.

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
