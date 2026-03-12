# Research Summary: ClawForge v2.0 Full Platform

**Project:** ClawForge v2.0 — Web UI, Multi-Agent Clusters, Headless Job Streaming, MCP Tool Layer
**Domain:** Multi-channel AI agent gateway with Docker job execution and multi-tenant isolation
**Researched:** 2026-03-12
**Confidence:** HIGH (stack + features + pitfalls via direct codebase inspection); MEDIUM (novel architectural patterns for clusters and MCP)

---

## Executive Summary

ClawForge v2.0 extends a proven two-layer architecture (LangGraph event handler + Claude Code CLI in Docker) with four capability areas cherry-picked from the PopeBot v1.2.73 upstream — plus one capability with no upstream precedent at all (per-instance MCP configs). The research shows that approximately 60% of the listed Web UI work is already shipped in v1.5 — the remaining Web UI items are two modest additions (code mode toggle, repo/branch selector) plus DnD tabs which should be deferred. The real v2.0 work is infrastructure: headless log streaming, MCP Tool Layer, and multi-agent cluster runtime.

The build order is dictated by hard dependencies. MCP must come before clusters because cluster role definitions reference `mcpServers` in their config — a Security agent role that requires a security-scanner MCP tool cannot be fully defined without MCP infrastructure in place. Headless streaming is prerequisite-free and the highest operator-impact addition (replaces "waiting..." with live feedback), so it should come first. Web UI enhancements are additive and independent, but the auth boundary between existing API-key-protected routes and new NextAuth session-protected Server Actions must be established early and correctly — it is extremely hard to retrofit. The cluster runtime is built last because it carries the most complexity, the most safety mechanisms, and depends on both MCP and ideally streaming for progress visibility.

The critical risks are not technical complexity but operational correctness: infinite cluster delegation loops that burn $50-$200 in API spend before detection; cross-agent shared volume corruption in concurrent cluster runs; and the dual-auth boundary between API routes and Server Actions. The cluster shared-volume corruption risk is particularly insidious — it is caused by the v1.5 warm-start optimization (per-repo named volumes) which breaks when two cluster agents operate on the same repo concurrently. The fix is mandatory and non-negotiable: per-cluster-agent volumes, never shared per-repo volumes for concurrent agents.

---

## Key Findings

### Recommended Stack

The v1.5 stack is complete for v2.0. Three new npm packages are needed: `chokidar@^5.0.0` (cluster file-watch triggers; pure ESM, compatible with `"type": "module"`), `@dnd-kit/core@^6.3.1` and `@dnd-kit/sortable@^10.0.0` (DnD tabs — defer to v2.1). Three additional xterm.js addons (search, serialize, web-links) require version verification before install (`npm list @xterm/xterm` — our v6 install may need different addon versions than PopeBot's v5.5 references). Headless streaming requires zero new dependencies — it uses existing dockerode and native `ReadableStream`.

PopeBot uses `libsodium-wrappers` for encrypted config storage. Research recommends Node.js built-in `crypto` instead: identical AES-256-GCM + PBKDF2 capability, zero added dependency, no WASM initialization overhead.

**New DB tables required:**
- `clusters` — with `instanceName` column (PopeBot has no such column; multi-tenant requirement)
- `cluster_roles`
- `cluster_sessions`
- `settings` table already exists — add `type: 'mcp_config'` records per instance; no schema migration needed

**Core technologies (new additions only):**
- `chokidar@^5.0.0` — file-watch triggers for cluster runtime
- Node `crypto` built-in — AES-256-GCM encryption for MCP config at rest (replaces libsodium-wrappers)
- `ReadableStream` + SSE — headless log streaming (zero new dependency; native Next.js 15 support)
- `dockerode` (already installed) — extended with `streamJobLogs()`, `runClusterWorkerContainer()`

### Expected Features

**Must have (P1 — v2.0 launch):**
- MCP_SERVERS.json config schema + `loadMcpServers()` loader — unblocks cluster role definitions
- MCP lifecycle injection in job container entrypoint (`--mcp-config` flag to `claude -p`)
- MCP lifecycle injection in workspace container entrypoint — same pattern, piggybacks on job MCP work
- Container log streaming to web chat via SSE — highest operator impact; replaces "waiting..."
- Code mode toggle in chat input — 2-hour UI addition, immediate quality-of-life
- Repo/branch selector in chat header — removes repetitive "run on repo X" prefix from every message
- Cluster config schema (CLUSTER.json) + coordinator runtime — first-agent dispatch, label routing, shared volume
- Cluster DB tracking (`cluster_runs`, `cluster_agent_runs`) — required for cluster observability
- `create_cluster_job` LangGraph tool — conversational cluster launch

**Should have (P2 — v2.x after validation):**
- Cancel job tool (`cancel_job`) — 30-minute timeout handles most cases today
- Streaming to Slack with single edited message (not per-chunk spam) — format upgrade, not new capability
- Cluster management UI page (`/clusters`) following swarm-page pattern
- MCP startup health check logging — add when misconfiguration becomes a real support issue
- MCP config read-only view in settings page

**Defer (v3+):**
- DnD tab interface — HIGH complexity for LOW operator count at 2-instance scale
- Parallel agent dispatch within clusters — sequential covers most use cases; adds coordinator complexity
- Pre-run MCP context hydration — requires MCP client in entrypoint; defer to specific demand
- Shared MCP servers across cluster agents (sidecar container pattern)

**Already shipped in v1.5 (confirmed, no work needed):**
- Message history/chats page, file upload, tool call visibility, notifications feed, swarm/job status view, settings/API key management, chat title auto-generation, starred chats, sidebar history

### Architecture Approach

All four v2.0 capability areas extend existing abstractions rather than replacing them. Headless streaming extends `collectLogs()` (batch, post-hoc) with `streamJobLogs()` (real-time Docker attach), routes through a new `stream-registry.js` consumer Map, and surfaces via SSE — not WebSocket, because log streaming is unidirectional and SSE works through Next.js API routes without the custom HTTP server wrapper. MCP injection extends `entrypoint.sh` with a config-generation block before the `claude -p` call, using the same `{{AGENT_LLM_*}}` template variable pattern as `resolveTemplate()` in `lib/triggers.js`. Clusters extend the `create_job` + `target.json` sidecar pattern with a new `lib/cluster/` module. Web UI additions are props/state on existing components.

**New components:**
1. `lib/cluster/` (dispatch, roles, state-machine, shared-fs) — cluster lifecycle and coordination
2. `lib/ws/stream-registry.js` — Map of jobId → active SSE consumers; consumer lifecycle management
3. `lib/tools/mcp.js` — MCP config loading, template variable resolution, validation
4. `lib/chat/components/stream-viewer.jsx` — live log display consuming SSE endpoint
5. `lib/chat/components/repo-selector.jsx` — repo selection dropdown in chat header
6. `templates/docker/cluster-worker/` — Dockerfile + entrypoint for cluster worker containers

**Modified components:**
- `lib/tools/docker.js` — add `streamJobLogs()`, `dispatchClusterJob()`, `runClusterWorkerContainer()`
- `lib/ai/tools.js` — add `createClusterTool`, `getClusterStatusTool`
- `templates/docker/job/entrypoint.sh` — add MCP config generation block before `claude -p`
- `lib/db/schema.js` — add clusters, cluster_roles, cluster_sessions tables
- `lib/chat/components/chat-page.jsx` + `chat-header.jsx` + `chat-input.jsx` — repo selector, code mode, stream viewer

**PopeBot fork strategy:**
- FORK `lib/ai/headless-stream.js` — pure parsing utility, zero instance assumptions
- ADAPT `lib/cluster/actions.js`, `runtime.js`, `execute.js`, `stream.js` — add instance scoping
- FORK `lib/chat/components/features-context.jsx` — 15-line context boilerplate
- BUILD-NEW: MCP config storage and lifecycle (no upstream precedent)

### Critical Pitfalls

1. **Infinite cluster delegation loop** — clusters cycle between agents burning $50-$200 in API spend before detection. Hard iteration limit (5 per agent, 15 total) + cycle detection on `(agent_type, label_in)` pairs + cost budget envelope required in first `dispatch.js`. Non-negotiable.

2. **Cross-agent shared volume corruption** — concurrent cluster agents on the same repo corrupt each other's git state via the shared per-repo named volume. Per-cluster-agent volumes mandatory (`clawforge-{instance}-{slug}-cluster-{clusterid}-{agentid}`). Never reuse warm-start volumes for concurrent agents.

3. **Server Action auth boundary** — NextAuth session-cookie auth on web pages must not leave Server Actions callable without server-side auth checks. `useSession()` is client-side only; `auth()` from NextAuth v5 must be called server-side at the top of every Server Action. API-key-protected routes stay unchanged.

4. **`--dangerously-skip-permissions` in cherry-picked PopeBot code** — PopeBot is single-tenant and uses bypass mode. Importing cluster entrypoint fragments verbatim silently removes ClawForge's `--allowedTools` whitelist. Audit all cherry-picked files; zero matches required before merge.

5. **Log stream memory leak on consumer disconnect** — Docker log stream continues emitting when browser tab closes. Without consumer tracking, Event Handler accumulates 50-200MB per job. `Map<jobId, Set<WebSocket>>` consumer tracking + pause/destroy on empty consumer set + 500-line ring buffer for reconnection replay are all required in the first streaming implementation.

6. **MCP version mismatch silently removes tools** — MCP protocol version incompatibility between pinned server packages and Claude Code CLI produces no error; tools simply disappear. Pin both versions together; log MCP connection results explicitly at entrypoint startup.

---

## Implications for Roadmap

### Phase 1: Headless Log Streaming

**Rationale:** Streaming infrastructure is foundational and prerequisite-free. Web UI monitoring (stream-viewer) and cluster progress reporting both build on it. It has the smallest surface area of the four capability areas. FORK `lib/ai/headless-stream.js` from PopeBot directly — zero instance assumptions.

**Delivers:** Live Docker log output piped to chat UI; ANSI-stripped filtered log forwarding; job abort capability (`cancel_job` tool); stream-viewer component

**Implements:** `lib/ws/stream-registry.js`, `docker.js:streamJobLogs()`, `/api/stream/:jobId` SSE endpoint, `stream-viewer.jsx`, `waitAndNotify()` streaming integration, `NO_COLOR=1` in job container env

**Avoids:** Log stream memory leak (Pitfall 4) — consumer tracking + ring buffer built in from day one; raw ANSI in chat (Pitfall 11) — `NO_COLOR=1` or `strip-ansi` applied at consumer

**Research flag:** Standard patterns. No deeper research needed. SSE + dockerode log streaming is well-documented.

---

### Phase 2: Web UI — Auth Boundary + Repo Selector + Code Mode

**Rationale:** Pure UI work using existing data flows, but establishes the critical auth boundary between API-key-protected routes (existing) and session-protected Server Actions (new). This boundary must be established before cluster Server Actions are added in Phase 4.

**Delivers:** Hybrid App Router + Pages Router setup verified; `auth()` server-side pattern enforced in all Server Actions; repo/branch selector; code mode toggle; stream-viewer integrated into chat panel

**Implements:** `repo-selector.jsx`, `chat-header.jsx` modification, `chat-page.jsx` code mode state, NextAuth v5 `auth()` wrapper for all Server Actions, VERIFICATION-RUNBOOK.md S1-S5 run after merge

**Avoids:** Session auth bypass (Pitfall 1); Web UI breaks API routes (Pitfall 9) — hybrid router tested before cluster complexity is added

**Research flag:** One open question to resolve during implementation (not a full research phase): confirm App Router + Pages Router hybrid compatibility with the existing custom `server.js` WebSocket upgrade handler.

---

### Phase 3: MCP Tool Layer

**Rationale:** MCP is BUILD-NEW with no upstream precedent. It must precede clusters because cluster role definitions reference `mcpServers`. Building MCP in isolation reduces risk — the config loading and container injection pattern can be validated on job containers before cluster complexity is added.

**Delivers:** Per-instance `MCP_SERVERS.json`; `lib/tools/mcp.js` with template resolution (`{{AGENT_LLM_*}}` → env var values); MCP config injection in job entrypoint and workspace entrypoint; encrypted `type: 'mcp_config'` records in `settings` table; MCP startup health check logging

**Implements:** `instances/{name}/config/MCP_SERVERS.json`, `lib/tools/mcp.js`, `lib/paths.js:getMcpConfigPath()`, `entrypoint.sh` MCP block (job + workspace), Node `crypto` AES-256-GCM encryption (not libsodium)

**Avoids:** MCP credentials in git (security mistake) — `{{AGENT_LLM_*}}` template resolved at container start, never stored; MCP tools silently unavailable (Pitfall 6) — startup health check with explicit connection logging

**Research flag:** One verification required before writing Phase 3 entrypoint code: confirm exact `--mcp-config` flag name against current Claude Code CLI docs. This is a 15-minute check, not a research phase. The concept and config schema are correct; the flag spelling needs confirmation.

---

### Phase 4: Multi-Agent Clusters

**Rationale:** Most complex feature. Depends on Phase 3 (MCP) for complete role definitions. Benefits from Phase 1 (streaming) for cluster progress visibility. Safety mechanisms — iteration limits, cycle detection, per-agent volume isolation, per-role allowedTools — are mandatory in the first implementation, not retrofittable.

**Delivers:** CLUSTER.json config schema; cluster coordinator runtime; role-based Docker worker dispatch; shared volume inbox/outbox/reports; label-based state machine routing; cluster run DB tracking; `create_cluster_job` conversational tool; cluster-level Slack notification (one thread, not per-agent messages)

**Implements:** `lib/cluster/` (dispatch, roles, state-machine, shared-fs), `templates/docker/cluster-worker/` Dockerfile + entrypoint, `lib/db/schema.js` cluster tables + Drizzle migration, `lib/ai/tools.js` cluster tools, `executeAction()` extended with `cluster` action type

**Avoids:** Infinite delegation loop (Pitfall 2) — iteration limits + cycle detection in first `dispatch.js`; cross-agent volume corruption (Pitfall 6) — per-cluster-agent volumes; `--dangerously-skip-permissions` cherry-pick (Pitfall 3) — audit all PopeBot cluster code before merge; cluster notification flood (Pitfall 10) — cluster-level summary with thread replies

**Research flag:** Two sub-decisions require resolution during Phase 4 planning: (1) cluster orchestrator process type — Claude Code process (simpler, more expensive ~$1-5/run) vs deterministic Node.js (cheaper, requires hardcoded routing logic); (2) Docker label mutation API behavior — verify whether `dockerode container.update()` supports label changes post-creation; if not, state machine stores worker state as files in the shared volume (`/cluster-shared/{worker-id}.state`). Both questions can be resolved with a 1-hour spike before implementation.

---

### Phase 5: Web UI Polish (DnD Tabs + xterm Addons) — Deferred

**Rationale:** Deferred until core infrastructure is stable and validated. DnD tabs are HIGH complexity for LOW value at 2-instance scale. xterm addons are quality-of-life improvements but not blockers.

**Delivers:** Drag-reorderable tab bar for multi-workspace; in-terminal text search; clickable URLs in terminal output; terminal buffer serialization

**Implements:** `dnd-tabs.jsx` using `@dnd-kit`; xterm addons after version compatibility verified (`npm list @xterm/xterm`)

**Research flag:** Standard patterns. No research phase needed. Verify xterm version before installing addons.

---

### Phase Ordering Rationale

- **Streaming first** — prerequisite-free, highest operator impact, foundational for cluster progress reporting and Web UI monitoring
- **Auth boundary in Phase 2, not Phase 1** — Phase 1 is server-side only; auth boundary only matters when browser-facing pages are added
- **MCP before clusters** — hard dependency; cluster role definitions reference MCP server names; MCP is also simpler (no concurrency risks) and validates the config-injection pattern on job containers before cluster complexity
- **Clusters last** among infrastructure phases — highest complexity, most safety mechanisms, depends on both streaming (Phase 1) and MCP (Phase 3)
- **DnD tabs deferred** — complexity/value ratio does not justify blocking Phase 4 for a UI enhancement serving 2 operators

---

## Feature-to-Requirement Mapping Hints

These groupings should inform how REQUIREMENTS.md organizes requirements:

| Requirement Group | Phase | Source Features | Key Constraints |
|-------------------|-------|----------------|-----------------|
| SSE streaming infrastructure | 1 | Container log streaming, stream-registry, stream-viewer | Consumer lifecycle management mandatory; ring buffer for reconnect replay |
| ANSI/log filtering | 1 | ANSI stripping, semantic event filter, log diff highlighting | `NO_COLOR=1` in container env OR `strip-ansi` at consumer; never forward lines containing `AGENT_`, `TOKEN`, `KEY`, `SECRET` |
| Job abort | 1 | Cancel job tool | Leaves branch for inspection; no PR if nothing committed |
| Auth boundary | 2 | Server Action auth, hybrid router setup | `auth()` server-side in every Server Action; API routes stay on API key auth; VERIFICATION-RUNBOOK.md S1-S5 after each Web UI PR |
| Repo context anchoring | 2 | Repo selector, chat metadata, agent context injection | Stored in chat DB metadata; injected via existing `formatChatContextForInjection()` |
| MCP config schema | 3 | MCP_SERVERS.json, `loadMcpServers()`, template resolution | `{{AGENT_LLM_*}}` syntax only; never stored in git; resolved at container start |
| MCP container lifecycle | 3 | Entrypoint MCP block, health check logging, `--mcp-config` flag | Write config before container starts; log connection results explicitly; proceed without failed servers (don't abort job) |
| MCP encrypted storage | 3 | `type: 'mcp_config'` in settings table, AES-256-GCM | Node built-in `crypto`, not `libsodium-wrappers` |
| Cluster safety | 4 | Iteration limits, cycle detection, cost budget | Required in first `dispatch.js`; not a later patch; hard cap 5/agent 15/run |
| Cluster volume isolation | 4 | Per-cluster-agent volumes, branch naming convention | Never reuse per-repo warm-start volume for concurrent cluster agents; volume name: `clawforge-{instance}-{slug}-cluster-{clusterid}-{agentid}` |
| Cluster permissions | 4 | `--allowedTools` per role, PopeBot audit | Zero `--dangerously-skip-permissions` matches in any cherry-picked code |
| Cluster notifications | 4 | Cluster-level Slack thread, suppress per-agent messages | One thread per cluster run; all agent updates as thread replies |
| Cluster state machine | 4 | Label routing, shared FS inbox/outbox, orchestrator dispatch | State medium (Docker labels vs shared FS files) determined during Phase 4 spike; CLUSTER.json label routing table required |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct npm registry checks + PopeBot package.json inspection + ClawForge package.json baseline. One caveat: xterm addon versions depend on installed xterm major version — verify before Phase 5. |
| Features | HIGH | All 18 chat components inspected (confirmed what is and is not shipped). Cluster/stream/MCP features traced to specific existing ClawForge abstractions. Priority ordering based on actual dependency graph. |
| Architecture | HIGH for extensions of existing patterns; MEDIUM for novel components | SSE streaming, MCP config injection, and repo selector all follow established ClawForge patterns. Cluster state machine storage medium (Docker labels vs shared FS) unverified. Cluster orchestrator process type (Claude Code vs Node.js) is a design decision, not a research gap. |
| Pitfalls | HIGH | All pitfalls grounded in actual ClawForge code (flock mutex, named volume conventions, `waitAndNotify()`, `collectLogs()`) + official docs (NextAuth v5, MCP protocol versioning, Node.js backpressure mechanics). Not speculative. |

**Overall confidence:** HIGH for Phases 1-3. MEDIUM for Phase 4 — two sub-decisions (orchestrator type, Docker label mutation) require implementation-time validation before committing to an approach.

### Gaps to Address

- **`--mcp-config` flag name** — Verify against current Claude Code CLI docs before writing Phase 3 entrypoint code. Concept and schema are correct; flag spelling needs confirmation given knowledge cutoff (August 2025). 15-minute check.

- **Docker label mutation post-creation** — Verify whether `dockerode container.update()` supports label changes. If not, Phase 4 state machine uses shared FS state files (`/cluster-shared/{worker-id}.state`) instead of Docker label mutation. Architecturally equivalent; question is storage medium.

- **Cluster orchestrator process type** — Design decision for Phase 4: Claude Code process (reads task, outputs subtask plan) vs deterministic Node.js (cheaper, hardcoded routing). Recommendation: start with Claude Code orchestrator for flexibility; optimize to Node.js if cost is an issue at scale.

- **xterm addon version compatibility** — Run `npm list @xterm/xterm` before Phase 5. If installed version is 6.x, addon version ranges in STACK.md (targeting 5.x) will differ. Check xterm.js GitHub releases for correct v6 addon versions.

- **Chokidar v5 ESM in Next.js server context** — Chokidar v5 is pure ESM. Confirm it initializes correctly in the Next.js custom server context without `--require` workarounds. Phase 4 file-watch trigger path.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- ClawForge `lib/tools/docker.js` — container lifecycle, named volume conventions, flock mutex (lines 229-284)
- ClawForge `lib/ai/tools.js` — LangGraph tool patterns, `waitAndNotify()`, `createJobTool`
- ClawForge `lib/chat/components/` (18 files) — all UI components inspected; confirmed what is shipped
- ClawForge `lib/triggers.js`, `lib/cron.js`, `lib/actions.js` — `executeAction()` dispatch pattern
- ClawForge `templates/docker/job/entrypoint.sh` — entrypoint structure, permission model, git auth
- ClawForge `lib/db/schema.js` — existing `settings` table, `job_outcomes` pattern
- ClawForge `package.json` — current dependency baseline
- PopeBot `lib/ai/headless-stream.js` — Docker frame parser + JSONL mapper (FORK candidate)
- PopeBot `lib/cluster/` (actions, execute, runtime, stream) — cluster architecture patterns
- PopeBot `lib/code/code-page.jsx` — DnD tab logic (`handleDragEnd` + `arrayMove`)
- PopeBot `lib/db/crypto.js` — AES-256-GCM + PBKDF2 encryption pattern (ADAPT to Node `crypto`)
- PopeBot `package.json` — confirmed @dnd-kit, chokidar, xterm addon, libsodium versions
- npm registry — live version queries: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `chokidar@5.0.0`

### Secondary (MEDIUM confidence — official docs + verified community patterns)

- [Claude Code MCP Docs](https://docs.anthropic.com/claude-code/mcp) — `--mcp-config` flag, server spec format
- [MCP Protocol Versioning](https://modelcontextprotocol.io/specification/versioning) — version negotiation, quarterly release cadence, breaking changes
- [Auth.js v5 Migration](https://authjs.dev/getting-started/migrating-to-v5) — `auth()` server-side function, middleware auth limitations
- [Next.js Auth Guide](https://nextjs.org/docs/pages/building-your-application/authentication) — Server Action auth requirements, middleware bypass risk
- [Node.js Backpressure](https://nodejs.org/en/learn/modules/backpressuring-in-streams) — consumer detection, flow control
- [dockerode GitHub](https://github.com/apocas/dockerode) — `container.logs({ follow: true })` stream API
- [thepopebot SECURITY_TODO.md](https://github.com/stephengpope/thepopebot/blob/main/docs/SECURITY_TODO.md) — upstream known security gaps
- [MCP Hot Reload Feature Request](https://github.com/anthropics/claude-code/issues/17975) — confirms hot-reload not supported

### Tertiary (LOW confidence — single source or inference)

- Docker label mutation via `container.update()` — behavior post-creation unverified; test at Phase 4 start
- Cluster orchestrator API cost estimates ($1-5/run for Claude Code orchestrator) — estimated; validate with actual runs

---

*Research completed: 2026-03-12*
*Ready for roadmap: yes*
