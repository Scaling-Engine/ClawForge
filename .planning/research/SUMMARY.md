# Project Research Summary

**Project:** ClawForge v4.0 Multi-Tenant Agent Platform
**Domain:** Multi-tenant AI agent gateway — shared auth, request proxying, agent picker UI, per-agent scoped navigation
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

ClawForge v4.0 transforms the existing per-instance architecture (each agent at its own subdomain, separate login, separate session) into a single-URL multi-tenant product. The core insight from architecture research is that this does not require a new gateway service — the Noah instance already functions as a hub via the superadmin pattern (`SUPERADMIN_HUB=true`, `queryAllInstances()`, M2M Bearer auth via `AGENT_SUPERADMIN_TOKEN`). The v4.0 work extends that hub into a user-facing gateway by adding a central user registry, cross-subdomain session cookie, HTTP/WebSocket proxy layer, and an agent picker UI.

The recommended approach is additive: no new dependencies, no new containers, no migration to PostgreSQL. A second SQLite file (`data/hub.sqlite`) holds the central user registry and agent assignments. The existing custom `server.js` HTTP server extends to proxy requests to spoke instances. NextAuth gains a single cookie domain config change. All existing instance infrastructure (separate SQLite DBs, Docker networks, job containers) stays untouched. The superadmin `queryAllInstances()` pattern that already exists gets reused for the agent picker dashboard and cross-agent aggregate views.

The primary risk is the auth consolidation step. Every other feature depends on a single `AUTH_SECRET` across hub and all instances, cross-subdomain cookie scoping, and instances accepting the hub's M2M Bearer token on all `/api/*` routes (not just `/api/superadmin/*`). If this foundation is mishandled — different secrets per instance, cookie domain not set, CSWSH origin checks blocking proxied requests — WebSocket terminals fail silently and the proxy breaks in ways that are hard to debug. The WebSocket proxy also requires specific care: the `tty` subprotocol must be forwarded and binary frame type must be preserved, or the terminal renders garbage. These are well-understood problems with known solutions; the risk is execution, not design.

## Key Findings

### Recommended Stack

No new dependencies are required for v4.0. The entire milestone is achievable with existing stack components plus Node.js built-ins. A second `better-sqlite3` file (`data/hub.sqlite`) with a separate Drizzle schema (`lib/db/hub-schema.js`) holds the central user registry — this keeps hub and instance schemas independently evolvable. The raw Node.js `http` module handles all proxying via `http.request()` + `pipe()`, which is preferable to `http-proxy-middleware` (confirmed ESM incompatibility with `"type": "module"` in vercel/next.js #86434) or `node-http-proxy` (maintenance-mode since 2022). Cross-subdomain sessions require one config change to `lib/auth/edge-config.js`: add `domain: ".scalingengine.com"` on the session token cookie in production.

One forward-looking migration to address during v4.0: Next.js 16.0.0 renames `middleware.ts` to `proxy.ts` and the export from `middleware` to `proxy`. A codemod is available (`npx @next/codemod@canary middleware-to-proxy .`). Addressing this now prevents coupling a breaking upgrade to a future feature milestone.

**Core technologies:**
- **better-sqlite3 + Drizzle ORM** (existing): Central user registry via second DB file — no new install, clean schema separation between hub and per-instance tables
- **NextAuth v5** (existing): Cross-subdomain session via single cookie domain config change — no second NextAuth instance on spokes
- **Node.js `http` built-in**: Request proxying and SSE streaming — avoids ESM-incompatible proxy libraries
- **zod + bcrypt-ts + uuid** (existing): Input validation, password hashing, and ID generation for hub user table — no changes needed

### Expected Features

Research identified a clear P1/P2/P3 structure. The critical path runs through shared auth to agent picker to proxy to scoped navigation. All other features depend on this foundation.

**Must have (P1 — table stakes):**
- Shared auth layer with central user registry — everything else blocks on this
- Agent picker dashboard (post-login landing page with assigned agent cards) — primary UX
- User-agent assignment in superadmin UI — without this, picker shows nothing
- Request proxy for HTTP routes — required for single URL
- Per-agent scoped navigation (`/agent/[slug]/...`) — required for single URL
- Terminology migration ("Instances" to "Agents" in UI strings only) — low cost, do early

**Should have (P2 — add after core validation):**
- WebSocket proxy for terminal — more complex than HTTP; validate HTTP proxy first
- Cross-agent aggregate views (All PRs, All Workspaces) — reuses `queryAllInstances()` pattern
- Per-agent role differentiation (viewer/operator/admin per agent) — validate basic assignment model first
- Agent status cards with recent activity — enriches picker

**Defer (v4.x+):**
- Agent quick-launch from picker — power user shortcut; not day-1 essential
- SSE proxy for job log streaming — complex; direct agent navigation is acceptable short-term
- Self-service agent creation — requires billing integration (v3.0 entitlement layer)

**Anti-features to avoid:** iframe embedding (breaks terminal/WebSocket), subdomain-per-agent routing (defeats the v4.0 goal), shared SQLite DB across instances (SQLite cannot handle concurrent multi-process writes), real-time cross-agent SSE hub (high ops complexity relative to value).

### Architecture Approach

v4.0 extends the existing hub-spoke pattern rather than introducing new infrastructure. Noah's instance becomes the user-facing gateway — it already has all the machinery needed (`SUPERADMIN_HUB=true`, `queryAllInstances()`, `AGENT_SUPERADMIN_TOKEN`, Docker `proxy-net` connecting all containers). Four architectural patterns govern the implementation: (1) Hub-side proxy with spoke-side M2M auth — all browser requests go through hub, hub re-signs with Bearer token, spokes remain unaware of multi-tenancy. (2) Stateless agent context via URL path — `/agents/[slug]/...` keeps selected agent in the URL, no client-side state store needed. (3) Component reuse without iframe — existing `lib/chat/components/` imported directly with proxied data. (4) Ticket-mediated WebSocket relay — spoke issues terminal ticket, hub relays it to browser, browser opens WS through hub, hub relays upgrade to spoke.

**Major components:**
1. **Hub DB (`lib/db/hub-schema.js`)** — `hub_users` and `agent_assignments` tables in `data/hub.sqlite`; owned by hub, invisible to spokes
2. **HTTP proxy (`lib/proxy/http-proxy.js`)** — forwards REST + SSE requests to spoke containers with M2M Bearer auth injection
3. **WebSocket proxy (`lib/proxy/ws-proxy.js`)** — relays WS upgrades with `tty` subprotocol forwarding and binary frame preservation
4. **Agent picker (`templates/app/agents/page.js`)** — post-login dashboard; reads session `assignedAgents[]`, queries health via existing `queryAllInstances()`
5. **Agent-scoped layout (`templates/app/agents/[agent]/layout.js`)** — assignment gate, validates user has access to selected agent before rendering children
6. **Agent assignments admin (`templates/app/admin/users/`)** — superadmin UI for assigning users to agents; lives entirely on hub, no proxy needed

### Critical Pitfalls

1. **Mismatched `AUTH_SECRET` across hub and instances** — JWT decode returns `null` silently; WebSocket terminal rejected with 401 but no error message. Prevention: single `AUTH_SECRET` for all containers, documented in every `.env.example` with explicit comment. Must resolve before any proxy code is written.

2. **WebSocket relay breaks ttyd binary frame protocol** — If hub relay does not forward `Sec-WebSocket-Protocol: tty` or re-encodes binary frames as text, terminal appears to connect but renders garbage. Prevention: forward `['tty']` subprotocol on upstream WS connection; preserve `{ binary: isBinary }` on all frame relays; set `perMessageDeflate: false`. Alternatively, use WS redirect (hub returns signed redirect URL, browser connects directly to instance) to eliminate multi-hop relay entirely.

3. **Instance CSWSH check blocks hub-proxied connections** — `lib/ws/server.js` checks `origin === APP_URL`; hub URL fails this check with 403. Prevention: add `TRUSTED_PROXY_ORIGIN` env var to instances; check against both `APP_URL` and `TRUSTED_PROXY_ORIGIN`. One-line change per instance but must be explicit before proxy is live.

4. **Terminology migration breaks running containers if schema renamed mid-milestone** — `instance_name` columns exist in `code_workspaces`, `cluster_runs`, `cluster_agent_runs`, `usage_events`, `billing_limits`. Prevention: layer 1 (UI strings only, safe anytime) separate from layer 2 (DB columns + env vars + directories, requires maintenance window, defer to post-v4.0). Never in the same PR.

5. **User-to-agent assignment enforced only at hub — direct instance access bypasses it** — User assigned to Agent A can access Agent B's data by calling instance URLs directly if ports are exposed. Prevention: remove `ports:` mapping from instance containers in production `docker-compose.yml`; bind to Docker internal network only.

## Implications for Roadmap

Research identifies a clear dependency chain that drives phase order. Shared auth is the critical path gate — nothing else is deliverable without it. The build order from architecture research (10 internal steps) maps to 8 roadmap phases when related steps are grouped.

### Phase 1: Shared Auth Foundation
**Rationale:** Every other feature depends on the central user registry and session containing `assignedAgents[]`. Decide and lock in `AUTH_SECRET` sharing strategy, cookie domain config, and Docker network isolation before writing any UI code. This is the only phase that affects production security posture before any new features are visible.
**Delivers:** Hub SQLite with `hub_users` + `agent_assignments` tables; `lib/db/agent-assignments.js` query helper; NextAuth session extended with `assignedAgents[]`; `/agents/*` routes auth-guarded; instance containers bound to Docker internal network (no `ports:` exposure); `TRUSTED_PROXY_ORIGIN` env var on all instances
**Addresses:** Shared auth layer, user-to-agent assignment data model, persistent agent context
**Avoids:** Mismatched `AUTH_SECRET` (Pitfall 1), cookie domain issues (Pitfall 3), cross-tenant access (Pitfall 5)

### Phase 2: Terminology Migration (UI Strings Only)
**Rationale:** No dependencies, low cost, sets vocabulary for all subsequent UI work. Doing it early prevents accumulating new "instance" language during v4.0 development. UI strings only — no DB column or env var renames. Layer 2 (internal identifiers) deferred to post-v4.0.
**Delivers:** "Agents" everywhere user-facing in existing UI; "Instances" removed from nav, page titles, admin labels; Slack notification copy updated in same change
**Addresses:** Terminology migration feature
**Avoids:** Partial migration confusion (Pitfall 4 — layer 1 done cleanly before layer 2 is ever considered)

### Phase 3: HTTP Proxy Layer
**Rationale:** Required before any agent-scoped UI pages can work. Spoke `api/index.js` gets additive Bearer token acceptance on all `/api/*` routes. Hub gets `lib/proxy/http-proxy.js`. CSWSH origin and `NEXTAUTH_URL` changes verified. This phase is purely infrastructure — no user-visible features.
**Delivers:** Hub can proxy any REST API call to any spoke; spoke `api/index.js` accepts `AGENT_SUPERADMIN_TOKEN` Bearer on all routes; `NEXTAUTH_URL` on instances updated to hub URL; full login-to-redirect flow tested end-to-end
**Addresses:** Request proxy (HTTP), per-agent scoped navigation
**Avoids:** CSWSH check blocking proxied connections (Pitfall 3), `NEXTAUTH_URL` redirect breaking auth flow (Pitfall 6)

### Phase 4: Agent Picker UI + User Assignment Admin
**Rationale:** Depends only on Phase 1 (hub DB + auth). No proxy dependency — uses existing `queryAllInstances('health')`. Delivers the entire user-facing value proposition: users can log in, see their agents, and navigate to one. These two sub-features share the same data model and can ship together.
**Delivers:** `/agents` post-login dashboard with agent cards and status; superadmin assignment UI at `/admin/users`; empty state for unassigned users; agent-scoped layout with assignment gate at `/agents/[agent]/layout.js`
**Addresses:** Agent picker dashboard, user-agent assignment, agent status cards with recent activity
**Avoids:** Agent picker showing all agents to all users (UX pitfall); three-navigation-to-start-working flow by auto-navigating to last-selected agent

### Phase 5: Agent-Scoped Pages — Chat
**Rationale:** Largest single phase. Chat is the primary feature — proves the proxy layer end-to-end with streaming, job dispatch, and notification polling all routed through Phase 3's HTTP proxy. All other agent-scoped pages depend on the layout and pattern established here.
**Delivers:** `/agents/[slug]/chat` fully functional through hub proxy; chat streaming, job dispatch, and SSE polling all proxied; component reuse pattern established (import existing `lib/chat/components/`, supply data via proxy — no iframe)
**Addresses:** Per-agent scoped navigation for primary feature, request proxy for chat
**Avoids:** Hardcoded instance URLs in frontend components (scan for `strategyes.scalingengine.com` before starting)

### Phase 6: WebSocket Proxy (Terminal)
**Rationale:** Higher complexity than HTTP; isolated to its own phase after HTTP proxy is validated. Two options exist — relay (hub-to-instance-to-ttyd) or redirect (hub validates, returns signed WS URL, browser connects directly). Decision should be made at phase start based on measured latency of relay path.
**Delivers:** Terminal workspaces accessible through hub URL; `Sec-WebSocket-Protocol: tty` forwarded correctly on upstream connection; binary frame type preserved; `perMessageDeflate: false` confirmed; ticket relay flow verified (spoke issues ticket, hub relays to browser, browser connects through hub)
**Addresses:** WebSocket proxy for terminal
**Avoids:** ttyd binary frame protocol breaking (Pitfall 2)

### Phase 7: Remaining Agent-Scoped Pages
**Rationale:** Depends on Phase 3 (HTTP proxy). Read-heavy list views — lower complexity than chat. PRs, workspaces, sub-agents all reuse the component and proxy pattern proven in Phase 5.
**Delivers:** `/agents/[slug]/pull-requests`, `/agents/[slug]/workspace`, `/agents/[slug]/swarm` all functional through hub
**Addresses:** Full per-agent scoped navigation

### Phase 8: Cross-Agent Aggregate Views
**Rationale:** Reuses `queryAllInstances()` from Phase 1 foundation. Builds on all proxied pages being functional. Must include staleness metadata per agent — never ship aggregate views without "last updated" indicators.
**Delivers:** `/agents/all` with tabs for All PRs, All Workspaces, All Sub-Agents; staleness indicators per agent; graceful partial results when any instance is offline; 1-second timeout for user-facing views (vs. 5-second for health dashboard)
**Addresses:** Cross-agent aggregate views, per-agent role differentiation
**Avoids:** Per-instance SQLite not queryable cross-agent (Pitfall 4); stale data shown as current without freshness indicators

### Phase Ordering Rationale

- Phase 1 gates everything: auth consolidation must be complete before any proxy or UI work begins
- Phase 2 (terminology) is independent but done early to prevent vocabulary drift during development
- Phases 3 and 4 are parallelizable after Phase 1 — proxy layer and picker/assignment UI have no dependency on each other
- Phase 5 (chat) is the integration test for Phase 3 — validates the full proxy stack end-to-end before adding more pages
- Phase 6 (WebSocket) is intentionally isolated — WS proxy complexity should not block HTTP proxy delivery
- Phase 8 (cross-agent) comes last because it requires all agent-scoped pages to be working first

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Shared Auth):** Cross-subdomain NextAuth v5 beta cookie behavior has known edge cases (GitHub issues #6881 and #10915 document inconsistencies). Test `domain: ".scalingengine.com"` in staging before locking in approach. If it fails, fallback is shared `AUTH_SECRET` with spoke-side JWT validation (already the WS auth pattern).
- **Phase 6 (WebSocket Proxy):** Relay vs. redirect decision requires profiling actual latency impact on terminal UX. Relay adds two extra hops; redirect eliminates them but requires signed token infrastructure on hub. Decide at phase start with a measured prototype, not upfront.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Terminology):** Pure string replacement; use explicit file list, not global search-replace
- **Phase 3 (HTTP Proxy):** Raw `http.request()` + `pipe()` is well-documented; the pattern is already proven in `server.js` WS handling
- **Phase 4 (Agent Picker):** Reuses `queryAllInstances()` pattern exactly — no new machinery
- **Phases 7 and 8:** Extend patterns proven in Phases 5 and 6

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations are existing stack + Node.js built-ins; verified against live codebase; no speculative dependencies; ESM incompatibility of proxy libraries confirmed against official Next.js GitHub |
| Features | MEDIUM | Feature priorities derived from analogous SaaS products (Vercel, GitHub, Linear, Botpress); no direct reference implementation for this exact model; dependency graph is solid based on codebase inspection |
| Architecture | HIGH | Primary sources are live codebase archaeology of `lib/ws/`, `lib/superadmin/`, `lib/auth/`, `docker-compose.yml`; build order derived from actual dependency graph; integration points verified against real code |
| Pitfalls | HIGH | Critical pitfalls verified against specific code paths in `lib/code/ws-proxy.js`, `lib/ws/server.js`, `lib/auth/edge-config.js`; community sources cross-referenced with official docs |

**Overall confidence:** HIGH

### Gaps to Address

- **NextAuth v5 beta cross-subdomain cookie behavior:** The `domain` cookie option is documented but v5 is still in beta; behavior may differ from v4. Validate in staging with real hub-to-instance session before committing. Fallback: shared `AUTH_SECRET` with spoke-side JWT validation.
- **WebSocket relay vs. redirect decision:** Both approaches are viable. Relay is simpler to implement but adds latency per frame. Redirect eliminates multi-hop but requires signed token infrastructure. Make the call explicitly at Phase 6 start based on measured latency.
- **Spoke `api/index.js` Bearer token scope:** Adding Bearer token acceptance to all `/api/*` routes (not just `/api/superadmin/*`) is additive. Confirm this does not conflict with existing `x-api-key` webhook auth for Slack/Telegram/GitHub endpoints — those should remain key-protected regardless of Bearer presence.

## Sources

### Primary (HIGH confidence)
- Codebase: `lib/ws/server.js`, `lib/ws/proxy.js`, `lib/ws/tickets.js` — WebSocket proxy patterns
- Codebase: `lib/superadmin/client.js`, `lib/superadmin/config.js` — existing hub-spoke HTTP proxy pattern
- Codebase: `lib/auth/middleware.js`, `lib/auth/edge-config.js`, `lib/auth/config.js` — auth stack
- Codebase: `lib/db/schema.js` — full data model
- Codebase: `docker-compose.yml` — container topology, shared proxy-net
- Codebase: `api/superadmin.js` — M2M auth pattern with AGENT_SUPERADMIN_TOKEN
- [Next.js proxy.js file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) — middleware renamed to proxy in v16.0.0
- [NextAuth.js options documentation](https://next-auth.js.org/configuration/options) — `cookies.sessionToken.options.domain` config key
- [http-proxy-middleware ESM issue](https://github.com/vercel/next.js/issues/86434) — ESM incompatibility confirmed
- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html) — CSWSH origin validation

### Secondary (MEDIUM confidence)
- [NextAuth v5 cross-subdomain cookie discussion](https://github.com/nextauthjs/next-auth/issues/2414) — cookie domain approach
- [NextAuth v5 subdomain issues #6881](https://github.com/nextauthjs/next-auth/issues/6881), [#10915](https://github.com/nextauthjs/next-auth/issues/10915) — beta behavior edge cases
- [WorkOS: Developer's Guide to SaaS Multi-Tenant Architecture](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture) — auth patterns, tenant isolation
- [Next.js Multi-Zones Guide](https://nextjs.org/docs/pages/guides/multi-zones) — path-based routing across multiple Next.js apps
- [Vercel Team Management Docs](https://vercel.com/docs/rbac/managing-team-members) — org/team switcher, role assignment patterns

### Tertiary (LOW confidence)
- [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html) — general multi-tenant principles
- Analogical platform analysis (Vercel, GitHub, Linear, Botpress) — UI patterns for agent/workspace picker; not direct implementations

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
