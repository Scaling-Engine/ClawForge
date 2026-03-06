# ClawForge — Secure Claude Code Agent Gateway

## What This Is

A multi-channel AI agent platform that connects Claude Code CLI to messaging channels (Slack, Telegram, Web Chat) with strict Docker isolation between instances. Two-layer architecture: Event Handler (LangGraph ReAct agent) dispatches jobs to ephemeral Docker containers running Claude Code CLI with GSD workflows. Agents receive structured prompts with full repo context and prior job history, then operate on any allowed target repo — creating PRs, committing changes, and surfacing results back to the operator via Slack or Telegram.

## Core Value

Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results without operator intervention.

## Current Milestone: v1.4 Docker Engine Foundation

**Goal:** Replace GitHub Actions as the primary job dispatch mechanism with direct Docker Engine API calls. Containers start in seconds instead of minutes. GH Actions retained as fallback for CI-integrated repos.

**Target features:**
- Direct Docker Engine API job dispatch (seconds vs minutes)
- Layer 2 context hydration (STATE.md + ROADMAP.md + git history in job prompt)
- Named volumes for persistent repo state across jobs (warm start)

## Current State (after v1.3)

**Shipped:** v1.0 Foundation + v1.1 Agent Intelligence + v1.2 Cross-Repo + v1.3 Instance Generator
**Codebase:** ~12,694 LOC JavaScript (Next.js + LangGraph + Drizzle ORM)
**Instances:** 2 (Noah/Archie — full access, StrategyES/Epic — scoped to strategyes-lab)

**What works:**
- Full job pipeline for **same-repo and cross-repo jobs**: message → Event Handler → job branch → GitHub Actions → Docker container → Claude Code CLI → PR → notification
- Cross-repo targeting: agent resolves repo from natural language, container performs two-phase clone, PR created on target repo with correct attribution
- Per-instance REPOS.json with `loadAllowedRepos()` + `resolveTargetRepo()` (slug/name/alias matching)
- SOUL.md and AGENT.md baked into Docker image at `/defaults/` — cross-repo jobs have system prompt without clawforge config in working tree
- `target.json` sidecar on job branch carries target metadata; entrypoint reads it at runtime
- Structured 5-section FULL_PROMPT (Target, Docs, Stack, Task, GSD Hint) with CLAUDE.md injection from target repo
- Previous job context: follow-up jobs start warm with prior merged job summary (thread-scoped)
- Failure stage detection: docker_pull/auth/clone/claude surfaced in Slack/Telegram notifications
- Zero-commit PR guard, 30-min timeout, explicit JSONL lookup
- `job_outcomes` table: tracks completions with `target_repo` column; `getJobStatus()` DB overlay returns completed job PR URLs
- VERIFICATION-RUNBOOK.md: operator-executable checklist for 5 regression scenarios (S1-S5)
- All templates byte-for-byte synced with live files
- **Instance creation via conversation**: multi-turn intake → approval → job dispatch → PR with 7 artifacts + operator setup checklist
- **Auto-merge exclusion**: instance PRs blocked from auto-merge regardless of ALLOWED_PATHS
- **Layer 1 context hydration**: `get_project_state` tool fetches STATE.md + ROADMAP.md from target repos via GitHub API

## Requirements

### Validated

- ✓ Job containers run Claude Code CLI via `claude -p` with system prompt injection — v1.0
- ✓ SOUL.md + AGENT.md concatenated into system prompt at runtime — v1.0
- ✓ `--allowedTools` whitelist controls available tools (includes Task, Skill) — v1.0
- ✓ GSD installed globally in job Docker image — v1.0
- ✓ Git-as-audit-trail: every job creates a branch, commits, and opens a PR — v1.0
- ✓ Instance isolation via separate Docker networks and scoped repos — v1.0
- ✓ Preflight diagnostics (HOME, claude path, GSD directory) — v1.0
- ✓ PostToolUse hook for GSD invocation observability — v1.0
- ✓ Test harness for local Docker GSD verification — v1.0
- ✓ Imperative AGENT.md instructions ("MUST use Skill tool") — v1.0
- ✓ Template sync (docker/job/ ↔ templates/docker/job/) — v1.0
- ✓ Pipeline hardening: conditional PRs, failure stage detection, timeouts — v1.1
- ✓ Smart job prompts: CLAUDE.md + package.json injection, GSD routing hints — v1.1
- ✓ Previous job context: thread-scoped merged job summaries — v1.1
- ✓ Notification accuracy: failure stage in messages, explicit JSONL lookup — v1.1
- ✓ Test-production alignment: 5-section prompt, file-redirect delivery — v1.1
- ✓ Allowed repos configuration per instance with REPOS.json and resolver — v1.2
- ✓ Agent selects target repo from natural language (slug/name/alias matching) — v1.2
- ✓ Job containers clone and operate on target repo via two-phase clone — v1.2
- ✓ PRs created on target repo with clawforge/{uuid} branch naming and attribution — v1.2
- ✓ Notifications include correct target repo PR URLs — v1.2
- ✓ gh auth setup-git for all clones; no PAT in clone URLs — v1.2
- ✓ target_repo column in job_outcomes; getJobStatus() DB overlay — v1.2
- ✓ Same-repo (clawforge) jobs continue working without regression — v1.2

- ✓ Archie can create a new ClawForge instance through a multi-turn guided conversation — v1.3
- ✓ Instance scaffolding generates all required files (Dockerfile, SOUL.md, AGENT.md, REPOS.json, .env.example) — v1.3
- ✓ Generated PR includes docker-compose.yml update and operator setup checklist — v1.3
- ✓ Instance PRs excluded from auto-merge, require manual review — v1.3
- ✓ Layer 1 agent can fetch project state (STATE.md, ROADMAP.md) from target repos — v1.3

### Active

- [ ] Job containers start via Docker Engine API in seconds, not minutes via GH Actions
- [ ] Layer 2 context hydration: entrypoint injects STATE.md + ROADMAP.md + recent git history into job prompt
- [ ] Named volumes for persistent repo state across jobs (warm start)

### Out of Scope

- Max subscription auth (switching from API keys) — defer until volume justifies
- Self-improving agents (meta-agent reviewing success/failure) — future milestone
- Agent marketplace / composition — future milestone
- New channel integrations — existing Slack/Telegram/Web sufficient
- OpenTelemetry integration — hooks + committed logs sufficient for 2 instances
- Full repo tree fetch in context — rate limits + noise; CLAUDE.md + package.json only
- Auto-merge on target repos — target repos control their own merge policies
- Dynamic repo discovery via GitHub API — security risk; explicit allowed list is safer
- One PAT with org-wide access — blast radius too large; scoped PATs per instance
- Cross-repo jobs touching multiple repos — requires transaction model; use sequential single-repo jobs
- Installing ClawForge workflows in target repos — creates tight coupling

## Long-Term Vision

**Target:** Stripe-level coding agent platform (1,000+ AI-authored PRs/week) using Docker Compose instead of AWS/k8s.

**Full plan:** `.planning/VISION.md` — gap analysis (Stripe vs ClawForge vs thepopebot), architecture evolution, decision rationale

**Milestone map (v1.4-v1.8):**
- **v1.4 Docker Engine Foundation** — Replace GH Actions dispatch with direct Docker API (pull from thepopebot `lib/tools/docker.js`)
- **v1.5 Persistent Workspaces** — Interactive "devbox" containers with browser terminal (pull from thepopebot `lib/code/`)
- **v1.6 MCP Tool Layer** — Per-instance MCP server configs, curated tool subsets (Stripe "Toolshed" equivalent)
- **v1.7 Smart Execution** — Pre-CI quality gates, test feedback loops, merge policies (Stripe deterministic interleaving)
- **v1.8 Multi-Agent Clusters** — Coordinated agent groups (pull cluster schema from thepopebot, build runtime)

**Sources:** Stripe minions blog (stripe.dev/blog/minions), thepopebot upstream (stephengpope/thepopebot), analyzed 2026-03-04

## Context

- **Codebase mapped**: `.planning/codebase/` has 7 documents covering architecture, stack, conventions, concerns
- **Templates synced**: All docker/ and workflow files byte-for-byte identical with templates/
- **SQLite DB**: job_outcomes table with `target_repo` column tracks completions for prior-context injection and status lookups
- **Prompt architecture**: 5-section structured FULL_PROMPT delivered via /tmp/prompt.txt file redirect; CLAUDE.md read from WORK_DIR (target repo context for cross-repo jobs)
- **VERIFICATION-RUNBOOK.md**: Operator checklist for 5 regression scenarios — must be executed before next significant change
- **Pending operator tasks**: StrategyES REPOS.json content confirmation; PAT scope update per .env.example; OpenAI key for Epic audio transcription

## Constraints

- **Docker isolation**: Changes must work within the existing Docker container model — no host filesystem mounts for GSD
- **GitHub Actions**: Job containers are triggered by Actions workflows, so testing requires either local Docker or a GH Actions run
- **Two instances**: Any changes must work for both Archie (full access) and Epic (scoped to strategyes-lab)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| GSD installed globally in Docker image | Simpler than repo-level install, survives across job repos | ✓ Working in production |
| Template sync via `cp` not manual edit | Eliminates drift risk, byte-for-byte guarantee | ✓ Good — all templates synced |
| Focus on verification before Max subscription | Need to prove current setup works before changing auth model | ✓ Pipeline proven reliable |
| Imperative AGENT.md instructions | Advisory language ~50% reliability; imperative produces consistent invocations | ✓ TEST-02 satisfied |
| SHA-based zero-commit PR guard | Safer than git status with shallow clones | ✓ Prevents empty PRs |
| 30-min hardcoded timeout | Simpler for 2 instances, not configurable | ✓ Prevents runner lock-up |
| Artifact-based failure stage detection | Checks presence of preflight.md/claude-output.jsonl to infer stage | ✓ Accurate categorization |
| CLAUDE.md injection at entrypoint side | Fresher than Event Handler pre-fetch; 8k char cap prevents context bloat | ✓ Smart prompts working |
| GSD hint defaults to 'quick' | Upgrades to 'plan-phase' on complexity keywords | ✓ Routing appropriate |
| job_outcomes with UUID PK | Allows multiple outcomes per job; TEXT column for changedFiles | ✓ Persistence working |
| Thread-scoped prior context lookup | Filters by thread_id for instance isolation, merge_result='merged' gate | ✓ Warm starts working |
| failure_stage in summarizeJob userMessage | Uses existing .filter(Boolean) pattern; no system prompt change needed | ✓ Stage surfaced |
| Cross-repo notification from entrypoint directly | notify-pr-complete.yml cannot observe events in foreign repos | ✓ Notifications firing |
| SOUL.md/AGENT.md baked into Docker image /defaults/ | Cross-repo working tree has no ClawForge config | ✓ System prompt present for cross-repo jobs |
| gh auth setup-git for all clones | PAT never interpolated into clone URLs (Actions log exposure risk) | ✓ No PAT leakage |
| Job branches always live in clawforge | on:create trigger constraint; target.json sidecar carries target metadata | ✓ Clean separation |
| WORK_DIR defaults to /job, set to /workspace only when target.json detected | 100% backward compat for same-repo jobs | ✓ Zero regression |
| DB overlay fires only when jobId provided AND filteredRuns.length === 0 | Live path fully unchanged for in-progress jobs | ✓ getJobStatus() accurate |
| Cross-repo PRs notify at PR creation, same-repo at merge | Semantic difference surfaces in UX language ("open for review" vs "merged") | ✓ Language differentiated |

| Template substitution in JS, not in prompt | Container agent receives exact file content; LLM doesn't interpret template syntax | ✓ Reliable artifact generation |
| Blocked-paths before ALLOWED_PATHS | Even ALLOWED_PATHS=/ cannot bypass instance protection | ✓ Defense in depth |
| --body-file for PR creation | Shell variable expansion corrupts backticks in operator checklists | ✓ Robust PR bodies |
| LLM behavior via EVENT_HANDLER.md injection | No code change needed for intake flow adjustments | ✓ Flexible intake |
| get_project_state via GitHub Contents API | Layer 1 gets project awareness without filesystem access | ✓ Informed dispatching |

- Instance updates/deletion — define creation first, update flows are additive complexity
- Automated deployment — security-sensitive; human review via PR is the right gate
- GitHub secrets auto-provisioning — requires broader infrastructure permissions than appropriate
- Slack app auto-creation — Slack API limitations; manual setup is acceptable

---
*Last updated: 2026-03-06 after v1.3 milestone*
