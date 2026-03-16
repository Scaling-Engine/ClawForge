# Project Research Summary

**Project:** ClawForge v2.2 Smart Operations
**Domain:** Multi-channel AI agent platform — programmatic Claude Code execution, superadmin control plane, UI operations parity, smart CI execution
**Researched:** 2026-03-16
**Confidence:** HIGH

## Executive Summary

ClawForge v2.2 adds four capability areas to the production v2.1 platform: interactive Claude Code terminal chat mode (operators watch live tool calls and file edits in the browser), a superadmin portal with instance switching, full UI operations parity (all SSH/CLI tasks become browser actions), and smart execution policies (pre-CI quality gates with self-correcting agent feedback loops). The research consistently shows this is an evolutionary build — not a greenfield effort — and that every v2.2 capability can be integrated using existing infrastructure with minimal new dependencies. The single new npm package required is `@anthropic-ai/claude-agent-sdk@^0.2.76` (renamed from `@anthropic-ai/claude-code` SDK); everything else is application-layer configuration, new Server Actions, and workflow extensions.

The recommended approach treats each v2.2 area as a thin layer over established v2.1 patterns. Terminal chat mode extends the existing `createUIMessageStream` path in `lib/chat/api.js` rather than adding a new WebSocket server. Superadmin is a proxy-based aggregation layer using API key auth (`AGENT_SUPERADMIN_TOKEN`) rather than cross-instance session sharing. UI operations use the established Server Action + dockerode pattern with mandatory `requireAdmin()` guards. Smart execution lives in GitHub Actions workflows with event-driven corrective job dispatch through the existing webhook handler. The build order is driven by architectural dependencies: smart execution gates ship first (hours, no UI work), job cancel/retry second (quick wins that establish the `requireAdmin()` pattern), terminal chat mode third (largest build, 3-4 days), repo CRUD and admin UI fourth, superadmin portal fifth.

The key risks are transport and isolation mistakes. Using the wrong streaming transport for terminal mode (the correct answer is extending the existing AI SDK UIMessageStream, not a new WebSocket), sharing `AUTH_SECRET` across instances for superadmin (never acceptable — use the `AGENT_SUPERADMIN_TOKEN` API key proxy pattern), and skipping `requireAdmin()` role checks on destructive Server Actions (the Docker socket is fully exposed; one unguarded action is a container host escape). The research identified nine critical pitfalls and provided concrete prevention patterns for each; several are confirmed by GitHub issues with the Claude Agent SDK (spawn ENOENT in Docker, `settingSources` credential override, streaming/thinking mutual exclusion).

## Key Findings

### Recommended Stack

The v2.2 stack requires exactly one new npm dependency: `@anthropic-ai/claude-agent-sdk@^0.2.76`. This is the renamed package previously known as `@anthropic-ai/claude-code` (importable SDK — distinct from the `claude` CLI binary). It runs as an async generator (`query()`) inside the existing Next.js Event Handler process and yields structured `SDKMessage` objects — far cleaner than parsing CLI stdout. The SDK supports session continuity (`sessionId` maps to ClawForge `chatId`), interrupt and cancel (`q.interrupt()`, `q.close()`, `AbortController`), configurable working directories (`options.cwd`), and cost budgets (`options.maxBudgetUsd`). Always set `settingSources: []` in containers to prevent `~/.claude/settings.json` from overriding injected API keys.

All other v2.2 features — superadmin, UI operations parity, smart execution — are implemented entirely with already-installed packages: NextAuth v5 `update()` for session mutation, Drizzle ORM for the new `terminal_sessions` table, existing dockerode for job cancel/retry, and Node.js `fs` for REPOS.json operations.

**Core technologies (new additions only):**
- `@anthropic-ai/claude-agent-sdk@^0.2.76`: Programmatic Claude Code execution — the only correct way to embed interactive Claude Code in a Node.js server; CLI stdout parsing is unreliable for real-time UI
- NextAuth v5 `update()` (already installed): Session mutation for superadmin instance context — no re-authentication required to switch instance views
- `AGENT_SUPERADMIN_TOKEN` (new GitHub secret): API key for hub-to-instance proxying — never share `AUTH_SECRET` across instances
- Node.js `readline` interface (built-in): Required wrapper for JSONL parsing from subprocess stdout — prevents partial-line JSON parse failures on long Claude Code sessions
- New `terminal_sessions` Drizzle table: Persists Agent SDK session IDs, cost, status, and message history for resume and cost visibility

### Expected Features

**Must have (table stakes) — v2.2 launch:**
- Streaming Claude Code text and tool calls in real time in chat UI — without this, terminal mode has no value
- Live tool call visualization (tool name, inputs, results inline as they arrive)
- File edit visibility (diff-style display of what Claude changed)
- Job cancel via UI — missing from any serious ops platform; 4-hour build using existing dockerode
- Job retry via UI — requires `originalPrompt` column migration; unblocks operators from re-typing failed jobs
- Repo CRUD in admin panel — operators currently edit REPOS.json via SSH
- Superadmin role with instance switcher — single login for multi-instance operators
- Pre-CI quality gates in job container — highest ROI, entrypoint.sh extension only
- Self-correction feedback loop (1 iteration max) — agent sees its own test failures and fixes them

**Should have — v2.2 follow-on phases:**
- Merge policy config per repo (extend REPOS.json + `auto-merge.yml`)
- Interrupt/resume in Claude Code chat mode (initial release uses cancel + restart)
- Full job log viewer page (initial release links to GitHub Actions)
- `instanceId` DB migration for cross-instance queries (enables superadmin aggregate views)
- Config editing in admin panel (audit missing `setConfig()` keys)
- Gate result visibility surfaced in chat response text

**Defer to v2.3+:**
- Tool call approval mode (requires TypeScript SDK `onBeforeToolCall` callback; architecture change)
- Shell mode alongside chat mode (complex dual-mode session handling)
- Branch protection rule sync (manual setup is fine at 2-instance scale)
- Superadmin impersonation (security-sensitive, not needed for 2 instances)
- Bulk job operations (low volume does not justify complexity)

### Architecture Approach

v2.2 extends the existing two-layer architecture (LangGraph Event Handler + Docker job containers) with four integration patterns, each mapping to established v2.1 precedents. Terminal chat mode is the headless job streaming pattern without PR creation: extending `lib/chat/api.js` with a `terminalMode` branch that calls `dispatchTerminalJob()` instead of LangGraph, and pipes the Docker log stream through the existing `parseLineToSemanticEvent()` into the AI SDK UIMessageStream writer. Superadmin is a proxy pattern where the hub instance reads other instances via `AGENT_SUPERADMIN_TOKEN`-authenticated status endpoints. UI operations are Server Actions with `requireAdmin()` guards routing through existing dockerode and `createJob()` primitives. Smart execution splits responsibility: pre-CI gates run in GitHub Actions workflows; CI failure feedback runs in the Event Handler via webhook dispatch of corrective jobs.

One architectural disagreement between research files: STACK.md recommends running the Agent SDK in-process in the Event Handler (no new container, sub-second response start). ARCHITECTURE.md recommends a dedicated Docker container per terminal session (`dispatchTerminalJob()`, new image) for filesystem isolation. This is the most consequential design decision in v2.2 and must be resolved before Phase 3 planning begins (see Gaps below).

**Major components:**
1. **Terminal container** (`templates/docker/claude-code-terminal/`) — new Docker image; runs `claude -p` with `--output-format stream-json`; no git push, no PR creation; shares warm-start volume pattern with job containers
2. **`lib/chat/api.js` terminalMode branch** — new execution path alongside LangGraph; `dispatchTerminalJob()` + Docker log stream piped through `parseLineToSemanticEvent()` + AI SDK UIMessageStream writer
3. **`lib/jobs/actions.js`** — new Server Actions: `cancelJob()`, `retryJob()`; delegate to existing dockerode and `createJob()` primitives; all guarded by `requireAdmin()`
4. **`lib/repos/actions.js`** — REPOS.json CRUD via git job dispatch (audit trail via PR; no direct filesystem writes to instance config)
5. **`lib/superadmin/`** — cross-instance Server Actions; reads instance status via `x-superadmin-token` API proxy; writes go through GitHub API (`lib/github-api.js`)
6. **`auto-merge.yml` + `notify-job-failed.yml` extensions** — quality gate status checks, CI failure webhook with test output, `ci_failure` event handler in `api/index.js`
7. **`terminal_sessions` Drizzle table** — tracks Agent SDK session IDs, cost, status, message history

### Critical Pitfalls

1. **Wrong transport for terminal mode** — attempting to reuse the ttyd WebSocket or headless SSE endpoint for Claude Code terminal chat. ttyd uses binary frame protocol; SSE is unidirectional. Correct approach: extend the existing AI SDK UIMessageStream via the `POST /stream/chat` path. Zero new server infrastructure.

2. **Claude Agent SDK ENOENT in Docker** — the SDK spawns `node cli.js` internally (not the `claude` binary). Workspace containers without a full Node.js installation fail with `spawn node ENOENT`. Verify `node --version` is accessible inside any container hosting the SDK. Always set `settingSources: []` to prevent `~/.claude/settings.json` from overriding container-injected API keys.

3. **Superadmin breaks per-instance auth isolation** — sharing `AUTH_SECRET` across instances allows a compromised session on one instance to authenticate on all. Use `AGENT_SUPERADMIN_TOKEN` for narrow API key proxying between hub and managed instances. Session tokens never cross instance boundaries.

4. **Unguarded destructive Server Actions** — adding browser-accessible cancel/retry/destroy Server Actions without explicit role checks in the function body. Middleware guards page routes, not POST requests to Server Actions. Every dockerode call must start with `requireAdmin()`. The Docker socket is fully writable; one unguarded action is a full host escape.

5. **Streaming and extended thinking are mutually exclusive** — if `maxThinkingTokens` is set on the Agent SDK, `StreamEvent` messages are not emitted. Never set `maxThinkingTokens` as default for terminal chat mode; it makes the UI appear frozen for the entire duration.

6. **Pre-CI gates bypass Docker dispatch path** — gates added to `run-job.yml` only apply to Actions-dispatched jobs. `dispatchDockerJob()` runs immediately without waiting for any workflow. Gates for Docker-dispatched jobs must be synchronous checks inside `lib/ai/tools.js` before `dispatchDockerJob()` is called.

7. **`auto-merge.yml` condition not wired to new gate** — adding a gate step without updating the `Merge PR` step's `if:` condition creates a silent bypass. Structure the workflow with a single aggregation step; `Merge PR` references only that boolean.

## Implications for Roadmap

Based on research, suggested phase structure reflecting architectural dependencies and ROI order:

### Phase 1: Smart Execution Gates
**Rationale:** Highest ROI per hour of work. Entirely in `entrypoint.sh` and GitHub Actions workflows — zero UI, zero schema changes, zero new containers. Independent of all other v2.2 areas. Can ship and protect existing jobs before any other v2.2 work lands.
**Delivers:** Pre-CI quality gates in job containers (`qualityGates` array in REPOS.json), one-iteration self-correction feedback loop (agent sees test failures and fixes them), merge policy config per repo, gate failure surfaced in chat notification via `summarizeJob()`
**Addresses:** Area 4 P1 features (quality gates, feedback loop, merge policy)
**Avoids:** Pitfall 6 (unlimited correction iterations — hard max of 1); Pitfall 8 (gates must cover both Docker and Actions dispatch paths)
**Research flag:** Standard CI/CD patterns — skip additional research. Verify during implementation that Docker dispatch path is covered alongside Actions path.

### Phase 2: Job Control UI (Cancel and Retry)
**Rationale:** Quick wins (hours each) that close the most glaring operational gap. Establishes the `requireAdmin()` helper pattern that all subsequent UI operation phases depend on. Cancel follows the existing `stopWorkspace()` dockerode pattern exactly.
**Delivers:** Cancel button in JobStreamViewer (stops running container, preserves branch), retry button on failed jobs, `originalPrompt` column DB migration, `lib/jobs/actions.js` Server Actions module
**Addresses:** Area 3 P1 features (job cancel, job retry)
**Avoids:** Pitfall 7 (Docker socket exposure — `requireAdmin()` as first line of every destructive Server Action; never accept `containerId` from client input)
**Research flag:** Standard dockerode patterns — skip research. The `stopWorkspace()` pattern in `lib/tools/docker.js` is the exact template.

### Phase 3: Claude Code Terminal Chat Mode
**Rationale:** The flagship v2.2 feature and the largest single build (3-4 days). Benefits from cancel pattern established in Phase 2 for `cancelTerminalJob()`. Must come before superadmin because the terminal session infrastructure is referenced by instance management UI.
**Delivers:** Interactive Claude Code in chat UI with streaming tool calls and file edits, interrupt/cancel, new terminal container Docker image, `terminal_sessions` DB table, session cost tracking
**Addresses:** Area 1 P1 features (streaming text + tool calls, file edit visibility, token/cost tracking)
**Avoids:** Pitfall 1 (correct transport: AI SDK UIMessageStream extension, not new WebSocket); Pitfall 2 (SDK ENOENT — verify Node on PATH in container before UI build); Pitfall 3 (never embed xterm canvas inside chat bubble message components); Pitfall 4 (readline wrapper for JSONL — one-line fix that must be in place before integration testing); Pitfall 5 (never set `maxThinkingTokens` as default)
**Research flag:** Needs phase research. Resolve the in-process vs container execution model disagreement first (see Gaps). Verify container environment before building UI. Agent SDK has confirmed sharp edges that require pre-implementation validation.

### Phase 4: Repo CRUD and Admin UI Operations
**Rationale:** Depends on `requireAdmin()` pattern from Phase 2. REPOS.json mutations go through git job dispatch (established in v1.3 instance generator), which leverages Phase 3's terminal job infrastructure. Closes the last SSH-required workflow.
**Delivers:** Repo CRUD admin page, REPOS.json changes via git PR for audit trail, persona file editing (SOUL.md, AGENT.md, EVENT_HANDLER.md) via git PR, config key audit and expansion in `/admin/general`, instance management page
**Addresses:** Area 3 P1 features (repo CRUD, config editing); Area 3 P2 features (instance management page)
**Avoids:** Direct filesystem writes for REPOS.json and persona files — must go through git PR for durability and rollback; `loadAllowedRepos()` must re-read from disk after write with cache-bust
**Research flag:** Standard patterns — skip research. Git job dispatch for config mutations is established in the v1.3 instance generator.

### Phase 5: Superadmin Portal
**Rationale:** Independent of Phases 1-3 architecturally (could run in parallel), positioned here because Phase 4 establishes instance management admin pages that the superadmin portal aggregates. Auth model (API key proxying, not session sharing) must be locked in before any superadmin UI code is written.
**Delivers:** Superadmin role in users table middleware, `/superadmin/*` route guard, `config/instances.json` instance registry, `/api/superadmin/status` endpoint with `x-superadmin-token` auth, cross-instance health dashboard, instance switcher UI
**Addresses:** Area 2 P1 features (single login, instance switcher, instance health overview)
**Avoids:** Pitfall 6 (per-instance auth isolation — `AGENT_SUPERADMIN_TOKEN` for API proxying, never shared `AUTH_SECRET`); superadmin portal running its own LangGraph instance (use UI-only aggregation; writes go through GitHub API)
**Research flag:** Auth isolation model is confirmed — skip research on auth approach. Document `AGENT_SUPERADMIN_TOKEN` rotation procedure in ops runbook before shipping.

### Phase 6: v2.2 Follow-On (Interrupt/Resume, instanceId Migration, Merge Policy UI)
**Rationale:** Deferred items requiring core infrastructure from Phases 1-5 to be stable first. `instanceId` DB migration is backward-compatible but touches many tables and should be validated against production data before merging.
**Delivers:** Session interrupt/resume in terminal chat mode, `instanceId` column on core tables for cross-instance queries, merge policy config UI in admin panel, full job log viewer page, gate result visibility in chat
**Addresses:** Area 1 P2 (interrupt/resume); Area 2 P2 (`instanceId` migration); Area 3 P2 (log viewer, merge policy UI); Area 4 P2 (gate result visibility)
**Avoids:** Performance trap: never add Claude Code terminal output to LangGraph thread state / SQLite checkpointer; serialize only on session close
**Research flag:** `instanceId` migration needs planning — flag for phase research given schema impact across `chats`, `job_outcomes`, `cluster_runs`, `code_workspaces`, `notifications`.

### Phase Ordering Rationale

- **Smart execution first** — prerequisite-free, highest ROI per hour, immediately protects all existing jobs with no UI work
- **Job control before terminal mode** — establishes `requireAdmin()` guard pattern required by all subsequent UI phases; `cancelTerminalJob()` in Phase 3 follows the Phase 2 pattern
- **Terminal mode before superadmin** — terminal session management infrastructure is referenced by instance management UI built in Phase 4-5
- **Area 4 (smart execution) is the only fully independent area** — confirmed in FEATURES.md dependency analysis; can be built entirely in parallel with Areas 1-3
- **`instanceId` migration last** — high schema impact, backward-compat nullable approach, should be validated against stable production data

### Research Flags

Needs phase research before planning:
- **Phase 3 (Terminal Chat Mode):** Resolve in-process vs container execution model disagreement (STACK.md vs ARCHITECTURE.md give different answers — see Gaps). Verify SDK container environment before writing UI code. Agent SDK has confirmed GitHub issues that must be reproduced and validated in the ClawForge container environment.
- **Phase 6 (`instanceId` migration):** Schema change touches multiple core tables. Needs migration plan and backward-compat validation before any implementation begins.

Phases with standard patterns (skip research):
- **Phase 1 (Smart Execution Gates):** Standard CI/CD quality gate pattern; entrypoint.sh extension follows existing template variable patterns.
- **Phase 2 (Job Control UI):** Dockerode cancel/retry follows existing `stopWorkspace()` pattern exactly.
- **Phase 4 (Repo CRUD):** Git job dispatch for config mutations is established in v1.3 instance generator.
- **Phase 5 (Superadmin):** API key proxy architecture is confirmed; primarily UI and endpoint work.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Anthropic SDK docs and npm registry verified 2026-03-16; single new dependency confirmed; all other tech verified by direct codebase inspection of `package.json`, `lib/db/schema.js`, `lib/tools/docker.js` |
| Features | HIGH | Feature gaps confirmed by direct codebase inspection — `lib/db/schema.js` (no `instanceId`, no `originalPrompt`), admin page listing (no repo CRUD page), `lib/tools/docker.js` (no UI cancel). v2.1 shipped state confirmed against component files. |
| Architecture | HIGH | Integration patterns derived from direct inspection of all referenced files; confirmed against established v2.0/v2.1 build decisions in `.planning/PROJECT.md`. One disagreement between research files flagged explicitly. |
| Pitfalls | HIGH | 9 critical pitfalls confirmed via GitHub issues (`#4383`, `#6775`), official SDK docs (streaming/thinking incompatibility documented), direct code inspection (Docker socket exposure pattern, partial-line JSONL behavior) |

**Overall confidence:** HIGH

### Gaps to Address

- **In-process vs container execution model for terminal chat mode:** STACK.md recommends running `@anthropic-ai/claude-agent-sdk` in-process in the Event Handler (sub-second response start, no Docker overhead). ARCHITECTURE.md recommends a dedicated Docker container per terminal session (`dispatchTerminalJob()`, new image) for filesystem isolation matching v2.1's security model. These are architecturally incompatible. **Resolve during Phase 3 planning before writing any code.** Key tradeoff: in-process has lower latency (~0ms start vs ~9s) but Claude Code has filesystem access to the ClawForge server process. Container approach matches existing security posture but adds startup overhead.

- **CI failure webhook payload size:** `notify-job-failed.yml` must include test output for the corrective feedback loop. Full Jest/test output can be 50-200KB. GitHub Actions has webhook payload limits. **Validate during Phase 1** — may need to store test output as a GitHub Actions artifact and reference by URL rather than inline in the webhook body.

- **REPOS.json mutation durability model:** ARCHITECTURE.md recommends dispatching a git job to commit REPOS.json changes (full audit trail). FEATURES.md describes direct `fs.writeFile` Server Action (immediate effect). The git-job approach creates a PR that must be merged before config takes effect — an awkward UX for routine repo management. **Decide during Phase 4 planning.** Recommendation: git PR for persona files (SOUL.md, AGENT.md — high-stakes) and direct write for REPOS.json (routine config — immediate effect is more valuable).

- **`AGENT_SUPERADMIN_TOKEN` rotation procedure:** New shared secret that must exist on all instances. Rotation procedure is not documented. **Address during Phase 5 planning** — add to ops runbook before shipping superadmin to production.

## Sources

### Primary (HIGH confidence)
- `@anthropic-ai/claude-agent-sdk` npm registry — version 0.2.76, verified 2026-03-16
- `@anthropic-ai/claude-code` npm registry — version 2.1.76 (CLI), verified 2026-03-16
- Anthropic Agent SDK docs — `query()` interface, `SDKMessage` union type, streaming/thinking incompatibility, `settingSources` default, interrupt/close/abort patterns
- `code.claude.com/docs/en/headless` — `--output-format stream-json`, `--include-partial-messages`, `--resume` session continuity
- ClawForge codebase (direct inspection): `lib/chat/api.js`, `lib/tools/log-parser.js`, `lib/tools/stream-manager.js`, `lib/jobs/stream-api.js`, `lib/tools/docker.js`, `lib/auth/middleware.js`, `lib/auth/config.js`, `lib/ws/server.js`, `lib/db/schema.js`, `lib/db/config.js`, `lib/db/users.js`, `.planning/PROJECT.md`, `docs/ARCHITECTURE.md`, `package.json`, `instances/noah/config/REPOS.json`
- GitHub issues: `anthropics/claude-code#4383` (spawn node ENOENT in Docker), `anthropics/claude-code#6775` (SDK hangs in Node.js test environments)

### Secondary (MEDIUM confidence)
- NextAuth v5 docs — `update()` session mutation pattern, confirmed in multiple sources
- Multi-tenant SaaS superadmin patterns — MakerKit, Microsoft 365 admin center — instance switcher UX
- Docker management UI patterns — Dockhand, Portainer, Dozzle — cancel/retry/logs operations
- CI/CD quality gate patterns — sequential gate execution, max retry limits, feedback loops

### Tertiary
- Community: "Common Pitfalls with the Claude Agent SDK" — SDK ENOENT, `settingSources` override, packaging path issues (corroborated by official GitHub issues)

---
*Research completed: 2026-03-16*
*Ready for roadmap: yes*
