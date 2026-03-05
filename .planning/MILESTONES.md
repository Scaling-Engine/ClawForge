# Milestones

## v1.0 Foundation & Observability (Shipped: 2026-02-24)

**Phases:** 1-4, 6 plans
**Archive:** milestones/v1.0-ROADMAP.md (if exists)

**Key accomplishments:**
- Job containers run Claude Code CLI via `claude -p` with GSD installed globally
- Preflight diagnostics, PostToolUse observability hook, template sync
- Test harness for local Docker GSD verification
- Imperative AGENT.md instructions for consistent GSD invocation

---

## v1.1 Agent Intelligence & Pipeline Hardening (Shipped: 2026-02-25)

**Phases:** 5-8, 7 plans, ~10 tasks
**Timeline:** 24 days (2026-02-01 -> 2026-02-25)
**Files changed:** 45 (+5,023 / -257)
**Archive:** milestones/v1.1-ROADMAP.md, milestones/v1.1-REQUIREMENTS.md

**Key accomplishments:**
- Pipeline hardening: zero-commit PR guard, 30-min runner timeout, failure stage detection (docker_pull/auth/claude)
- Smart job prompts: structured FULL_PROMPT with CLAUDE.md injection (8k cap), package.json stack, GSD routing hints
- Previous job context: follow-up jobs receive prior merged job summary scoped by thread ID
- Notification accuracy: failure stage surfaced in Slack/Telegram, explicit gsd-invocations.jsonl lookup
- Test harness sync: test-entrypoint.sh aligned with production 5-section prompt and file-redirect delivery
- Full template sync: all workflows byte-for-byte identical between live and templates/

---

## v1.2 Cross-Repo Job Targeting (Shipped: 2026-02-27)

**Phases:** 9-12, 10 plans (v1.2 only), 23 total
**Timeline:** 2 days (2026-02-25 -> 2026-02-26)
**Files changed:** 46 files (+5,605 / -93)
**Archive:** milestones/v1.2-ROADMAP.md, milestones/v1.2-REQUIREMENTS.md

**Key accomplishments:**
- Per-instance REPOS.json config with `loadAllowedRepos()` + `resolveTargetRepo()` supporting case-insensitive slug/name/alias matching
- SOUL.md and AGENT.md baked into job Docker image at `/defaults/` so cross-repo jobs have system prompt without clawforge config in working tree
- `target_repo` threaded from LangGraph tool schema -> `create_job()` -> `target.json` sidecar on clawforge job branch
- Two-phase clone in entrypoint: clawforge checkout for metadata, target repo shallow clone as Claude's `WORK_DIR`; backward compatible (no target.json = v1.1 behavior)
- Cross-repo PR creation with `clawforge/{uuid}` branch naming, default branch detection via `gh repo view`, and ClawForge attribution in PR body
- Notification pipeline: nullable `target_repo` column in `job_outcomes`, webhook passthrough, `getJobStatus()` DB overlay returning completed job PR URLs

---

## v1.3 Instance Generator (In Progress)

**Phases:** 13-17
**Archive:** (active)

**Goal:** Archie creates fully-configured ClawForge instances through a guided conversation, generating all files as a PR with operator setup instructions.

**Target features:**
- Multi-turn conversational intake with approval gate and cancellation
- Instance scaffolding templates with all required files
- Claude Code job that generates instance files from gathered configuration
- docker-compose.yml update for new instance included in PR
- PR description with exact setup checklist

---

## v1.4 Docker Engine Foundation (Planned)

**Phases:** 18-21

**Goal:** Replace GitHub Actions dispatch with direct Docker Engine API for job execution. Containers start in seconds, not minutes. GH Actions retained as fallback for CI-integrated repos.

**Why this is next:** Everything downstream (workspaces, volumes, MCP, clusters) requires Docker Engine API access. This is the infrastructure unlock that enables the entire Stripe-level architecture.

**Key source material:** thepopebot `lib/tools/docker.js` — Unix socket Docker API client, container lifecycle management, volume naming, network detection.

**Key capabilities:**
- Direct container creation/start/stop/remove via Docker Engine API (Unix socket)
- Headless ephemeral containers that run claude -p and exit
- Named volume management for persistent repo state
- Dual-dispatch: Docker Engine (fast, cheap) or GH Actions (CI integration)
- Instance-level dispatch config in REPOS.json

---

## v1.5 Persistent Workspaces (Planned)

**Phases:** 22-25

**Goal:** Interactive code workspaces — browser terminal connected to persistent Docker container with repo pre-loaded. Claude Code runs interactively, not just one-shot. The "devbox" experience Stripe achieves with 10-second startup.

**Key source material:** thepopebot `lib/code/` — workspace actions, xterm.js terminal view, WebSocket auth proxy, container recovery logic.

**Key capabilities:**
- Persistent containers with repo volumes (warm start)
- Browser-based terminal via xterm.js + WebSocket proxy
- Headless jobs operate on same workspace volume (shared state)
- Container auto-recovery (inspect -> restart/recreate)
- Feature branch support per workspace

---

## v1.6 MCP Tool Layer (Planned)

**Phases:** 26-28

**Goal:** Per-instance MCP server configuration so agents get curated tool access beyond Claude Code built-ins. Each instance gets the tools relevant to its purpose — the "Toolshed" equivalent.

**Key source material:** Original design. Inspired by Stripe's 400-tool Toolshed via MCP. No thepopebot equivalent.

**Key capabilities:**
- Instance-level MCP_SERVERS.json config
- MCP servers started automatically in job containers
- Claude Code `--mcp-config` integration
- Context hydration: pre-run MCP tools on URLs/references in job prompts

---

## v1.7 Smart Execution (Planned)

**Phases:** 29-31

**Goal:** Quality gates and test feedback. Agents produce higher-quality PRs with fewer human review cycles. Inspired by Stripe's deterministic interleaving and "at most 2 CI runs" policy.

**Key capabilities:**
- Pre-CI quality gates (lint, typecheck) run after Claude Code, before commit
- CI-aware test feedback loop (poll results, feed failures back, retry once)
- Per-repo merge policies (auto, require-review, require-ci, require-approval)
- Configurable via REPOS.json

---

## v1.8 Multi-Agent Clusters (Future)

**Phases:** 32-34

**Goal:** Coordinated agent groups that decompose complex tasks, work in parallel, and merge results. A lead agent distributes work to specialized workers.

**Key source material:** thepopebot cluster DB schema (clusters, cluster_roles, cluster_workers) + trigger config model. Runtime is original — thepopebot has UI/DB only with no execution layer yet.

**Key capabilities:**
- Cluster/role/worker management with DB persistence
- Lead agent task decomposition and dispatch
- Parallel worker execution on shared volumes or separate branches
- Result aggregation and merge conflict resolution

---
*Last updated: 2026-03-04 — added v1.4-v1.8 milestones*
