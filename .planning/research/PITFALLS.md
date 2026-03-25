# Pitfalls Research

**Domain:** Adding multi-tenancy, auth consolidation, request proxying, and terminology migration to an existing per-instance agent platform (ClawForge v4.0)
**Researched:** 2026-03-24
**Confidence:** HIGH (codebase inspection + verified against current auth/proxy implementation) / MEDIUM (community patterns verified against official docs) / LOW (flagged where applicable)

---

> **Note:** This file supersedes prior PITFALLS.md files (v2.0–v3.0). Prior pitfalls are valid preconditions — do not regress them. This file focuses exclusively on v4.0 feature areas: shared auth layer, agent picker dashboard, request proxy, single-URL routing, cross-agent views, and terminology migration. Pitfalls are ordered by severity within each area.

---

## Critical Pitfalls

### Pitfall 1: Hub Auth Secret Must Match Instance Auth Secrets — JWT Decoding Fails Silently

**What goes wrong:**
ClawForge instances decode NextAuth JWT tokens directly in `lib/code/ws-proxy.js` using `decode({ token, secret: process.env.AUTH_SECRET, salt: name })`. When v4.0 adds a hub that issues tokens and instances that validate them, both sides must share the same `AUTH_SECRET`. If the hub and each instance have different `AUTH_SECRET` values (the natural state from per-instance `.env` files), JWT decode returns `null` — not an error, just `null`. The WebSocket auth check in `isAuthenticated()` returns `null`, the upgrade is rejected with `401 Unauthorized`, and the operator sees a blank terminal with no error message.

The failure mode is silent: the decode does not throw, the logs say "rejected: unauthenticated upgrade", and the developer spends time debugging the wrong layer (WebSocket, Next.js, Docker network) instead of identifying the secret mismatch.

**Why it happens:**
Developers generate fresh `AUTH_SECRET` values for each instance. The existing v2.2 superadmin proxy uses `AGENT_SUPERADMIN_TOKEN` for M2M auth between hub and instances — a separate secret. When hub-issued user tokens need to be validated by instances (a new requirement in v4.0), the shared `AUTH_SECRET` requirement for JWT validation is not obvious. The M2M and user-facing auth paths look separate but the JWT library uses the same secret for both.

**How to avoid:**
Define a single `AUTH_SECRET` for the entire platform — all hub and instance containers use the same value. This is not a security regression: the secret protects token integrity, not token isolation. User-to-agent assignment (who can talk to which agent) is enforced by the hub's authorization layer, not by different signing keys per instance. Document this explicitly in `.env.example` for every instance with a comment: "Must match the hub's AUTH_SECRET — all instances share this value."

**Warning signs:**
- Per-instance `AUTH_SECRET` values differ across instances in Docker Compose
- `isAuthenticated()` in `lib/code/ws-proxy.js` returning `null` on valid-looking cookies
- WebSocket terminal connects fine when browser is on the instance's own subdomain but not when routed through the hub proxy

**Phase to address:**
Shared auth layer phase — decide and document secret sharing strategy before any proxy code is written

---

### Pitfall 2: WebSocket Proxy Through Hub Breaks ttyd's Binary Frame Protocol

**What goes wrong:**
The existing `lib/ws/proxy.js` proxies binary frames directly between client and ttyd using `upstream.send(data, { binary: isBinary })`. This works because the proxy is in the same Docker network as the container. When v4.0 routes WebSocket connections through a hub proxy (browser → hub → instance server → ttyd), two additional relay hops are added. Each hop must faithfully preserve frame type (binary vs text) and not buffer or re-encode frames.

The concrete failure: if any proxy layer passes binary frames as text frames (or vice versa), xterm.js receives malformed data and renders garbage characters or freezes. The session appears to connect (WebSocket handshake succeeds) but the terminal is unusable. This is particularly insidious because a text-mode proxy test ("can I echo hello?") passes while real Claude Code output (which uses binary frames for terminal control sequences) fails.

A second failure mode: ttyd requires the `['tty']` subprotocol in the WebSocket handshake (`new WebSocket(url, ['tty'])`). The hub proxy must forward the `Sec-WebSocket-Protocol` header. If the hub creates a new WebSocket connection to the instance without forwarding the protocol header, ttyd rejects the upstream connection or negotiates a different subprotocol, and the terminal hangs after connection.

**Why it happens:**
Hub proxy implementations often use `http-proxy` or `http-proxy-middleware`, which handle standard HTTP well but treat WebSocket as a transparent pipe without understanding the `tty` subprotocol. The proxy works for general WebSockets (SSE, chat streaming) but fails for ttyd-specific binary protocol requirements.

**How to avoid:**
Do not route ttyd WebSocket connections through a generic HTTP proxy. Instead, have the hub redirect the client's WebSocket connection directly to the target instance's WebSocket endpoint after auth validation. The redirect approach: hub validates the session cookie, determines the target instance, and returns a WebSocket redirect URL (with a short-lived signed token) that the browser connects to directly. The browser then makes a direct WebSocket connection to the instance — no multi-hop relay.

If a relay is required (direct instance access not possible from browser), the hub relay must: (1) forward `Sec-WebSocket-Protocol: tty` on the upstream connection, (2) relay `message` events with `{ binary: isBinary }` preserved, and (3) not buffer frames (no `perMessageDeflate`). The existing `ws-proxy.js` sets `perMessageDeflate: false` — this setting must carry forward to any hub relay.

**Warning signs:**
- Hub WebSocket proxy created with `http-proxy-middleware` without explicit `ws: true` and `changeOrigin: true` configuration
- `Sec-WebSocket-Protocol` header missing from upstream connection in proxy
- Terminal connects but renders garbled output or freezes after 2-3 characters
- Binary frame test passes but real Claude Code session fails

**Phase to address:**
Request proxy phase — WebSocket routing strategy decided before implementing HTTP proxy

---

### Pitfall 3: Hub Session Cookie Domain Locks Users to Hub Origin — Instance Direct Access Breaks

**What goes wrong:**
The current per-instance setup issues NextAuth session cookies scoped to each instance's domain (e.g., `clawforge.scalingengine.com`, `strategyes.scalingengine.com`). When v4.0 moves users to a single hub URL, the hub issues cookies scoped to that URL. Instances continue running their own Next.js servers and validating cookies. An instance-issued cookie is not valid on the hub domain, and a hub-issued cookie is not valid on a per-instance subdomain.

The failure: if any part of the UI makes a direct API call to an instance URL (bypassing the hub proxy), that request will not carry the hub session cookie and will be rejected with 401. This breaks any hardcoded instance URLs in the frontend — job status polling, SSE stream endpoints, workspace API calls — that were built when each user had their own subdomain.

The complementary failure: setting a cookie domain to `.scalingengine.com` (with leading dot, enabling subdomain sharing) causes the hub session cookie to be sent on all subdomain requests, including third-party services on subdomains that the user visits. If the auth session cookie has `SameSite=Lax`, this is mostly safe, but any instance that checks `Origin` header against `APP_URL` will reject cross-origin requests even with a valid cookie.

**Why it happens:**
Per-subdomain auth is designed to be isolated — that's the existing v2.2 model. Consolidating to a hub requires a deliberate choice between: (a) all instances accept hub-issued tokens via shared `AUTH_SECRET`, or (b) hub proxy all API calls so instances never receive direct requests. Neither is the default state.

**How to avoid:**
Choose option (a): shared `AUTH_SECRET` so instances accept hub-issued tokens. This is simpler than proxying all API traffic. Configure the hub's NextAuth cookie with `domain: process.env.COOKIE_DOMAIN` (e.g., `.scalingengine.com`) so the hub cookie is valid on instance subdomains during any transition period where direct instance access still exists. Once all traffic routes through the hub proxy, remove the broad cookie domain and scope it to the hub URL only.

Do not use `SameSite=None; Secure` for the session cookie during development — this requires HTTPS and introduces CSWSH risk. Use `SameSite=Lax` (the Auth.js default) and rely on Origin validation at the WebSocket layer.

**Warning signs:**
- Frontend code with hardcoded instance URLs making direct API calls (search for `strategyes.scalingengine.com` or `clawforge.scalingengine.com` in component files)
- `APP_URL` in `lib/ws/server.js` CSWSH check pointing to an instance URL after hub routing is in place
- Session cookie with no `domain` attribute (defaults to exact host) failing on cross-subdomain requests

**Phase to address:**
Shared auth layer phase — cookie strategy decided before any frontend routing changes

---

### Pitfall 4: Per-Instance SQLite Databases Cannot Be Queried Cross-Agent From the Hub

**What goes wrong:**
Every ClawForge instance runs its own SQLite database on local filesystem. The v4.0 "All Agents" cross-agent views (all PRs, all workspaces, all sub-agents) require aggregating data from multiple instances. The existing superadmin approach uses HTTP API calls to each instance's `/api/superadmin/*` endpoint. This works for the health dashboard (low frequency, 30-second polling, tolerates partial results) but fails for real-time features like "all workspaces" that need live status or "all active jobs" that need sub-second freshness.

The failure mode: the hub issues `Promise.allSettled()` calls to N instances. If one instance is slow or offline, the aggregated view shows stale data for that instance without any indication of staleness age. A workspace that crashed 10 minutes ago still shows as "running" in the "All Agents" view because the instance's `/api/superadmin/workspaces` endpoint returned a 200 with cached data before it went offline.

A second failure: the hub's cross-agent job search requires full-text search across job descriptions stored in per-instance SQLite databases. HTTP API search is slow (one round trip per instance, sequential) and non-composable (cannot sort or paginate across instances).

**Why it happens:**
The v2.2 superadmin cross-instance design was built for an admin health dashboard, not for user-facing real-time views. The `Promise.allSettled()` + 5s timeout pattern is appropriate for a health check page. It is not appropriate for a workspace list that a user expects to load in under 500ms.

**How to avoid:**
For real-time cross-agent views, use the existing `queryAllInstances()` pattern but add explicit staleness metadata to every response: `{ data: [...], fetchedAt: timestamp, instanceName }`. The UI renders stale data with a visible "last updated X seconds ago" indicator per agent. Never show cross-agent views without staleness context.

For job search across agents, implement search at the instance level (each instance exposes `/api/superadmin/jobs?q=` and handles its own search) and merge results in the hub by fetchedAt timestamp. Accept that cross-agent search is eventually consistent, not real-time. Document this as a design constraint, not a bug.

Do not attempt to centralize the SQLite databases into a single shared database — this invalidates the Docker isolation model and creates a shared write bottleneck.

**Warning signs:**
- "All Agents" view that loads without a per-agent timestamp showing when data was fetched
- Hub implementing a join or sort across instance data in memory (memory grows with instance count and job volume)
- User-facing latency SLO on cross-agent views that assumes all instances respond in under 200ms

**Phase to address:**
Cross-agent views phase — establish staleness-aware data model before building any aggregated UI

---

### Pitfall 5: Terminology Migration That Renames DB Columns Mid-Milestone Breaks Running Containers

**What goes wrong:**
The v4.0 goal includes renaming "instances" to "agents" in all user-facing UI. The current schema uses `instance_name` columns in `code_workspaces`, `cluster_runs`, `cluster_agent_runs`, `usage_events`, and `billing_limits` tables. The superadmin config uses `INSTANCE_NAME` env var and `getLocalInstanceName()`. Job containers read `INSTANCE_NAME` from their environment. SOUL.md, AGENT.md, and REPOS.json files live in `instances/{name}/` directories.

If the rename is done in stages — UI first, then schema, then filesystem — there will be a period where running containers have `INSTANCE_NAME=noah` but the DB schema expects `agent_name`. DB writes fail silently (wrong column) or with a constraint error. Running workspace containers using the old naming convention cannot be found by the new API.

**Why it happens:**
"Rename instances to agents" sounds like a UI-only change. Developers update labels and strings first. They discover the schema and env var dependencies later, mid-migration. At that point a partial migration exists in production, and rollback is complicated.

**How to avoid:**
Treat terminology migration as a two-layer change: (1) UI/user-facing strings only (labels, page titles, API response fields), and (2) internal identifiers (DB column names, env vars, directory names, config keys). Execute these as separate, sequential, complete phases.

Layer 1 (safe, ship anytime): Update all displayed strings. API responses can return both `instance_name` and `agent_name` fields in parallel for backward compatibility. No schema migration required.

Layer 2 (requires migration, do last): Rename DB columns, env vars, directory structure. Do this as a single migration with a well-tested rollback script. Do it when zero containers are running (maintenance window). Never do it mid-milestone.

For v4.0, only Layer 1 is necessary to meet the UX goal. Layer 2 is internal cleanup that can defer to a future milestone.

**Warning signs:**
- Migration that renames `instance_name` column while instances are running in production
- Component searching `instances/` directory in filesystem after directory rename to `agents/`
- Running containers have `INSTANCE_NAME` env var that no longer matches the hub's expected `agent_name` parameter

**Phase to address:**
Terminology migration phase — must be last; starts with UI-only strings, defers schema rename

---

### Pitfall 6: Hub Proxy Strips or Rewrites Headers That Instance Auth Logic Depends On

**What goes wrong:**
The existing `lib/ws/server.js` CSWSH defense checks `req.headers.origin` against `process.env.APP_URL`. The `lib/code/ws-proxy.js` reads session cookies directly from `req.headers.cookie`. If a hub proxy forwards WebSocket upgrade requests to an instance, the `Origin` header on the forwarded request will be the hub's URL, not the browser's origin. The instance's CSWSH check (`origin !== appUrl`) will reject all proxied connections with 403 because `APP_URL` on the instance is its own URL, not the hub's URL.

For HTTP requests: if the hub proxy rewrites the `Host` header, Next.js on the instance generates incorrect absolute URLs (redirects, NEXTAUTH_URL-dependent callbacks) pointing to the instance's domain instead of the hub. NextAuth redirect callbacks become `https://instance.url/login` instead of `https://hub.url/login`, breaking the post-login redirect flow.

**Why it happens:**
Instance servers were written assuming they are accessed directly. Their CSWSH checks, `APP_URL` comparisons, and NextAuth URL resolution all use environment variables set for direct access. A proxy layer in front of them is an architectural change that those checks were not designed for.

**How to avoid:**
When the hub forwards WebSocket upgrades to instances, it must set `x-forwarded-host` and a custom `x-proxy-origin` header, and instances must be updated to trust proxied origin values. The cleanest approach: update the CSWSH check in `lib/ws/server.js` to accept the hub's URL as a trusted origin (via `TRUSTED_PROXY_ORIGIN` env var). This is a one-line change per instance but must be explicit.

For HTTP proxying, configure the hub to pass `X-Forwarded-Host` and set `NEXTAUTH_URL` on instances to point to the hub URL, not the instance URL. This change affects post-auth redirects — test the full login → redirect → protected page → logout flow on every instance after changing `NEXTAUTH_URL`.

**Warning signs:**
- WebSocket connections through hub rejected with 403 (CSWSH check failing)
- NextAuth redirect after login sends user to `https://instance.url/` instead of `https://hub.url/`
- `APP_URL` on instances still set to per-instance subdomain after hub proxy is active

**Phase to address:**
Request proxy phase — header forwarding strategy defined before proxy implementation

---

### Pitfall 7: User-to-Agent Assignment Stored in Hub but Not Propagated to Instance — Enforced in Only One Place

**What goes wrong:**
The hub knows which users are assigned to which agents. An instance does not know this — it trusts that the hub only routes authorized users to it. If a user with a valid hub session cookie guesses or discovers an instance's URL and makes direct API calls (bypassing the hub proxy), the instance accepts those calls because the shared `AUTH_SECRET` makes the session token valid, and the instance has no user-to-agent assignment data.

This is a cross-tenant data exposure: a user assigned to Agent A can access Agent B's jobs, workspaces, and chat history by making direct calls to Agent B's API endpoint.

**Why it happens:**
Authorization at the hub layer feels complete because all normal user flows pass through it. Direct API access to instances is assumed to be blocked by network policy or obscurity. In a Docker Compose deployment on a VPS, instances often have their ports directly accessible (port 3001, 3002, etc.) for debugging purposes. Obscurity is not security.

**How to avoid:**
Instance servers must validate that the requesting user is authorized for this specific instance, not just that they have a valid session. The mechanism: hub includes a signed `x-agent-token` header on every proxied request, containing the user ID and the agent name they are authorized for. Instance middleware verifies this header before processing any authenticated request.

Alternatively, bind instance containers to Docker internal networks only — no host port exposure. Instances are only reachable through the hub proxy network, not directly. This is a Docker Compose network configuration change that is simpler than adding per-request authorization headers.

Preferred approach for v4.0: bind instance servers to Docker internal networks (no `ports:` mapping in `docker-compose.yml` for instance services), and route all traffic through the hub proxy. Instances become unreachable except through the hub.

**Warning signs:**
- Instance containers with `ports: "3001:3000"` host binding in production Docker Compose
- Instance middleware that only checks session validity (valid token = authorized) without checking which agent the user is assigned to
- No network policy preventing direct instance access from browser

**Phase to address:**
Shared auth layer phase — network isolation strategy decided before user-agent assignment is implemented

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Per-instance `AUTH_SECRET` values (existing state) | Instance isolation, secret rotation per instance | Hub-issued tokens not valid on instances; WebSocket auth fails silently | Never for v4.0 multi-tenant; must standardize before proxy is built |
| Generic `http-proxy-middleware` for WebSocket relay | Single library for HTTP + WebSocket | Does not forward `Sec-WebSocket-Protocol: tty`; binary frame type not preserved | For HTTP API proxying only; never for ttyd WebSocket relay |
| Rename DB columns in same PR as UI string changes | "Complete" migration in one PR | Running containers break when schema is deployed; no rollback path | Never; keep UI string changes and schema renames as separate, sequential PRs |
| Direct browser-to-instance API calls from hub frontend | No proxy latency for some requests | Cookie domain issues; bypasses hub authorization; breaks when instance URL changes | Never for user-facing features; acceptable for internal health checks from server-side hub code only |
| Cross-agent views without per-instance staleness metadata | Cleaner UI with no "last updated" indicators | Stale data shown as current; workspace crashes invisible in aggregated view | Never for production; staleness metadata is a safety requirement not a UX option |
| Agent assignment enforced only at hub routing layer | Simple implementation | Direct instance API access bypasses assignment; cross-tenant data exposure | MVP-acceptable if and only if instance ports are bound to Docker internal network (not host) |

---

## Integration Gotchas

Common mistakes when connecting hub to instances.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| NextAuth JWT across hub + instances | Different `AUTH_SECRET` per instance | Single `AUTH_SECRET` for entire platform; document in all `.env.example` files |
| WebSocket proxy (hub → instance → ttyd) | Generic proxy without `Sec-WebSocket-Protocol` forwarding | Pass `['tty']` subprotocol on upstream connection; preserve binary frame flag; disable perMessageDeflate |
| NextAuth `NEXTAUTH_URL` after proxy | Instance `NEXTAUTH_URL` points to instance subdomain | Set instance `NEXTAUTH_URL` to hub URL after proxy is active; test full auth redirect flow |
| CSWSH origin check after proxy | Instance checks `origin === APP_URL`; hub URL fails check | Add `TRUSTED_PROXY_ORIGIN` env var to instances; check against both `APP_URL` and `TRUSTED_PROXY_ORIGIN` |
| `queryAllInstances()` for real-time views | No staleness metadata on API responses | Add `fetchedAt` timestamp to every instance API response; UI renders staleness per agent |
| Superadmin `INSTANCE_NAME` env var during terminology migration | Renamed to `AGENT_NAME` mid-migration breaks running containers | UI strings only in v4.0; env var and schema rename deferred to post-v4.0 cleanup |
| Cross-agent job search | Hub joins query results from all instances in memory | Each instance handles its own search; hub merges by `fetchedAt`; accept eventual consistency |
| Docker Compose network isolation | Instance `ports:` mapping exposes instance to host network | Remove `ports:` from instance services after hub proxy is configured; bind to internal network only |

---

## Performance Traps

Patterns that work at 2-agent scale but fail as agents are added.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Hub proxy adds a relay hop for every WebSocket frame | Terminal latency increases (keystrokes feel delayed) | Use WebSocket redirect (not relay) so browser connects directly to instance after auth; relay only when direct access impossible | Perceptible at >50ms added latency; will affect interactive terminals |
| `queryAllInstances()` with 5-second timeout in user-facing views | "All Agents" page takes 5+ seconds to load when any instance is slow | Set 1-second timeout for user-facing views; use 5-second timeout for health dashboard only | With 3+ instances if any are slow to respond |
| Hub fetching cross-agent data on every page render | Hub becomes bottleneck as agents scale; instance API calls stack | Cache cross-agent aggregated data at hub (30-second TTL); invalidate on job/workspace events via instance webhook | With 5+ agents making simultaneous requests to hub UI |
| Terminology migration via `grep -r 'instance' | sed` | Renames variables in generated files, node_modules references, comments with different semantics | Use explicit list of files to update; never use global search-replace for identifier renames | Immediately — produces broken code on first attempt |
| Per-agent scoped UI rebuilding agent context on every navigation | User switching between agent views re-fetches full agent config each time | Cache selected agent context in React context or Zustand store; only refetch on explicit agent switch | With 10+ rapid navigations in agent-scoped views |

---

## Security Mistakes

Domain-specific security issues for v4.0 additions.

| Mistake | Risk | Prevention |
|---------|------|------------|
| User-to-agent assignment bypassed via direct instance URL | Cross-tenant data exposure: User A reads Agent B's jobs, workspaces, chat history | Bind instance containers to Docker internal network; no host port exposure in production `docker-compose.yml` |
| Hub session cookie with `SameSite=None; Secure` to enable cross-subdomain access | WebSocket connections are not covered by `SameSite` at all; CSWSH risk increases with `SameSite=None` | Use `SameSite=Lax` (Auth.js default) + Origin validation in WS upgrade handler; scope cookie to hub domain, not `.scalingengine.com` |
| Forwarding hub session cookie to upstream instance API calls (server-side proxy) | Cookie captured in proxy layer logs | Server-side proxy uses `AGENT_SUPERADMIN_TOKEN` Bearer auth for instance API calls, not forwarded user cookies |
| Shared `AUTH_SECRET` stored in git repository `.env.example` | Rotated secrets in example file create false sense of security | `.env.example` shows `AUTH_SECRET=REPLACE_WITH_STRONG_RANDOM` placeholder only; actual value in 1Password, never in git |
| Hub exposing all instances' superadmin endpoints to any authenticated hub user | Any hub user can query health, jobs, and secrets of all instances | Superadmin endpoints on hub require `superadmin` role; regular `user` role cannot access cross-agent API routes |
| SSE streaming endpoint on hub proxied without auth check | Unauthenticated user subscribes to another agent's job stream | Hub proxy validates session and agent assignment before opening SSE proxy connection; not just at WebSocket layer |

---

## UX Pitfalls

Common user experience mistakes in multi-tenant agent dashboards.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Agent picker shows all agents to all users | Users see agents they cannot access; confusion about which to choose | Agent picker shows only agents the logged-in user is assigned to; admin sees all |
| "All Agents" view without per-agent freshness indicators | Stale workspace or job data presented as current; user acts on wrong state | Show "last updated Xs ago" per agent row; dim rows where instance is unreachable |
| Switching agents resets all UI state (selected repo, chat history) | Users lose context every time they switch agents; frustrating for multi-agent workflows | Persist per-agent UI state in localStorage keyed by `{userId}:{agentName}`; restore on agent switch |
| Terminology migration that renames "Instances" to "Agents" in admin panel but not in Slack notifications | Operators learn "agents" in UI but see "instance: noah" in Slack; inconsistent mental model | Update Slack notification format in same PR as UI rename; treat notification copy as part of the UI |
| Agent picker as a separate page requiring navigation before any action | Users land on agent picker, must navigate to agent, navigate to chat — three navigations to start working | Remember last-selected agent; auto-navigate to it on login; agent picker only shown when user has multiple agents |
| "Agents" page that shows Docker container status without explaining what it means | Operators see "running / stopped / error" and don't know what to do | Translate container status to operator-meaningful language: "Active", "Sleeping" (idle-stopped), "Needs attention" (error) with one-click actions |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but have missing critical pieces.

- [ ] **Auth consolidation:** Hub login works — verify that session cookie issued by hub is accepted by instances' WebSocket auth (`isAuthenticated()` in `lib/code/ws-proxy.js` returns non-null for hub-issued tokens)
- [ ] **Auth consolidation:** Single `AUTH_SECRET` documented — verify all `docker-compose.yml` files for all instances use the same `AUTH_SECRET` value, not per-instance generated values
- [ ] **Proxy:** WebSocket terminal connects — verify that binary frames preserve type through any relay; test with real Claude Code session (not just `echo hello`), specifically look for garbled xterm output
- [ ] **Proxy:** `Sec-WebSocket-Protocol: tty` forwarded — verify hub-to-instance WebSocket upgrade includes `['tty']` subprotocol; missing this causes silent terminal failure
- [ ] **Proxy:** CSWSH check updated — verify that `lib/ws/server.js` origin check on instances accepts hub URL, not just instance URL
- [ ] **Proxy:** `NEXTAUTH_URL` updated — verify post-login redirect sends users to hub URL, not instance URL; test the full login → auth callback → redirect flow
- [ ] **Network isolation:** Instance ports not exposed — verify production `docker-compose.yml` has no `ports:` mapping for instance containers; instances reachable only via hub proxy
- [ ] **User assignment:** Agent picker scoped — verify a user assigned only to Agent A cannot access Agent B's chat, workspaces, or jobs by navigating directly to `/agent/b/*` URLs
- [ ] **Cross-agent views:** Staleness metadata present — verify "All Agents" views show per-agent "last updated" timestamp; verify view renders gracefully when one instance is offline (partial results, not blank page)
- [ ] **Terminology migration:** Notification copy updated — verify Slack and Telegram notifications say "agent" not "instance" after UI migration; check Noah's existing Slack automations still match notification format
- [ ] **Terminology migration:** Internal identifiers unchanged — verify DB columns still use `instance_name`, `INSTANCE_NAME` env vars still work in all containers, `instances/` directory structure unchanged
- [ ] **Existing operators:** No regression — verify Noah's existing Archie session (clawforge.scalingengine.com) and StrategyES/Epic session still work after hub proxy is in place; existing chat threads accessible

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Mismatched `AUTH_SECRET` blocking WebSocket auth on instances | LOW | Update `AUTH_SECRET` in instance `.env` to match hub value; restart instance container; test WebSocket terminal connection |
| ttyd terminal garbled after WebSocket relay added | MEDIUM | Switch from relay to WebSocket redirect model; hub returns signed redirect URL; browser connects directly to instance; relay code removed |
| Cross-tenant access via direct instance URL discovered | HIGH | Immediately remove `ports:` mapping from instance containers in `docker-compose.yml`; restart with `docker compose up -d`; audit access logs for unauthorized queries; no data migration required |
| Terminology migration broke running containers mid-way | HIGH | Revert schema migration only (UI string changes are safe to keep); use `db.run('ALTER TABLE code_workspaces RENAME COLUMN agent_name TO instance_name')` emergency revert; restore from schema backup; re-run migration with running containers stopped |
| `NEXTAUTH_URL` change broke auth redirect loop | MEDIUM | Revert `NEXTAUTH_URL` on affected instance; clear stale session cookies (the existing middleware cookie-clearing code handles this); confirm redirect URL before re-applying |
| Cross-agent "All Agents" view blank because one offline instance blocks render | LOW | Add `Promise.allSettled()` error handling that renders partial results instead of blocking; ship in hotfix; offline instance shows "unreachable" label, not blank row |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Mismatched `AUTH_SECRET` across hub + instances | Shared auth layer phase | `isAuthenticated()` in `ws-proxy.js` returns non-null for hub-issued session token |
| WebSocket binary frame protocol broken in relay | Request proxy phase | Real Claude Code terminal session (not echo test) works through proxy with no garbled output |
| `Sec-WebSocket-Protocol: tty` not forwarded | Request proxy phase | ttyd accepts upstream connection without hanging; verify with `wscat` subprotocol flag |
| Cookie domain locks users to hub origin | Shared auth layer phase | Hub-issued cookie accepted on instance subdomain WebSocket upgrade |
| CSWSH check blocking proxied connections | Request proxy phase | Hub URL accepted by instance CSWSH origin check; no 403 on proxied WebSocket upgrade |
| `NEXTAUTH_URL` mismatch breaks redirect | Request proxy phase | Full login → callback → redirect → protected page flow tested end-to-end |
| Cross-tenant access via direct instance URL | Shared auth layer phase | Instance containers have no host `ports:` binding in production; direct browser access returns connection refused |
| User-to-agent assignment bypass | Shared auth layer phase | User assigned to Agent A cannot access `/agent/b/*` routes; tested with two test users |
| Per-instance SQLite not queryable cross-agent | Cross-agent views phase | "All Agents" view shows staleness metadata per agent; renders with partial results when one instance offline |
| Terminology migration breaks running containers | Terminology migration phase (last) | UI strings changed; DB columns and env vars unchanged; all existing containers still start and operate normally |
| Terminology migration: notification format inconsistency | Terminology migration phase | Slack notifications say "agent"; existing Noah automations confirmed not broken |
| Header stripping in hub proxy | Request proxy phase | `x-forwarded-host` present on proxied requests; instances generate hub-relative URLs in redirects |

---

## Sources

- Codebase inspection: `lib/ws/proxy.js`, `lib/ws/server.js`, `lib/code/ws-proxy.js`, `lib/auth/middleware.js`, `lib/auth/edge-config.js`, `lib/superadmin/client.js`, `lib/superadmin/config.js`, `lib/db/schema.js`
- NextAuth v5 multi-tenant cookie domain issues: GitHub nextauthjs/next-auth issue #6881 (session token cookie with domain for subdomain support) — [https://github.com/nextauthjs/next-auth/issues/6881]
- NextAuth v5 proxy and subdomain TRUST_HOST: GitHub nextauthjs/next-auth issue #10915 (inconsistent v4/v5 behavior with subdomains) — [https://github.com/nextauthjs/next-auth/issues/10915]
- NextAuth multi-domain discussion: GitHub nextauthjs/next-auth discussion #9785 (dynamic NEXTAUTH_URL for multi-tenant) — [https://github.com/nextauthjs/next-auth/discussions/9785]
- WebSocket proxy Node.js gotchas: http-proxy-middleware documentation — WebSocket requires explicit `ws: true` and manual upgrade subscription — [https://github.com/chimurai/http-proxy-middleware]
- IPv4/IPv6 proxy resolution: Node.js 17+ DNS resolution change breaking `localhost` proxy targets — [https://github.com/http-party/node-http-proxy/issues/576]
- Cross-site WebSocket hijacking (CSWSH) in 2025: Include Security Research Blog — SameSite=None + missing Origin check prerequisites — [https://blog.includesecurity.com/2025/04/cross-site-websocket-hijacking-exploitation-in-2025/]
- OWASP WebSocket Security: Origin header validation as primary CSWSH defense — [https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html]
- Multi-tenant data leakage: "Cross-Tenant Data Leaks (CTDL)" Dana Epp's Blog — single missed WHERE clause in tenant-scoped query — [https://danaepp.com/cross-tenant-data-leaks-ctdl-why-api-hackers-should-be-on-the-lookout]
- Multi-tenant Row Level Security failure modes: Medium/InstaTunnel — RLS bypass via optimizer statistics side-channel (CVE-2025–8713) — [https://medium.com/@instatunnel/multi-tenant-leakage-when-row-level-security-fails-in-saas-da25f40c788c]
- OWASP Multi-Tenant Security Cheat Sheet — [https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html]
- Architecture Key Decisions table: `.planning/PROJECT.md` — superadmin API proxy pattern, queryAllInstances with Promise.allSettled, AGENT_SUPERADMIN_TOKEN M2M auth, custom HTTP server for WS upgrade, ticket-based WS auth

---
*Pitfalls research for: ClawForge v4.0 Multi-Tenant Agent Platform (auth consolidation, request proxy, single-URL routing, cross-agent views, terminology migration)*
*Researched: 2026-03-24*
