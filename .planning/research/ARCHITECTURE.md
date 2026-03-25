# Architecture Research

**Domain:** Multi-tenant agent platform — adding shared auth, request proxy, agent picker, and per-agent scoped UI to an existing multi-instance ClawForge deployment
**Researched:** 2026-03-24
**Confidence:** HIGH (primary sources: codebase archaeology, existing patterns in lib/ws/, lib/superadmin/, lib/auth/, docker-compose.yml)

---

## Existing Architecture Baseline

Before documenting what's new, the integration must be grounded in what already exists.

### Current System

```
Browser                     Traefik (proxy)              Instance Containers
─────────────────────────────────────────────────────────────────────────────
User at clawforge.example.com → Traefik → clawforge-noah  (Next.js + server.js)
User at strategyes.example.com → Traefik → clawforge-ses  (Next.js + server.js)

Each container:
  ┌─────────────────────────────────────────────────────────────────┐
  │  PM2 runs server.js (custom HTTP server wrapping Next.js)        │
  │                                                                  │
  │  server.js                                                       │
  │  ├── HTTP → handle(req, res)  [Next.js request handler]          │
  │  ├── WS /ws/terminal/*        [ticket-based, proxies to ttyd]    │
  │  └── WS /code/*/ws            [session-cookie auth, proxies ttyd]│
  │                                                                  │
  │  Next.js App                                                     │
  │  ├── lib/auth/        [NextAuth v5, JWT strategy, bcrypt users]  │
  │  ├── lib/db/          [Drizzle ORM, SQLite, isolated per inst]   │
  │  ├── lib/ai/          [LangGraph ReAct agent, LLM dispatch]      │
  │  ├── lib/superadmin/  [HTTP client, instance registry from env]  │
  │  └── api/superadmin.js [M2M endpoint, AGENT_SUPERADMIN_TOKEN]   │
  └─────────────────────────────────────────────────────────────────┘

Each instance has completely separate:
  - SQLite database (data volume: noah-data, ses-data)
  - Auth session secrets (AUTH_SECRET per instance)
  - User table (users log in to their instance, not a shared pool)
  - Docker network (noah-net, strategyES-net)
```

### Superadmin Pattern (Already Exists)

The hub-spoke pattern for cross-instance queries is already built:

```
Noah instance (hub, SUPERADMIN_HUB=true)
  lib/superadmin/client.js
    ├── Local instance: calls handleSuperadminEndpoint() directly
    └── Remote instances: fetch /api/superadmin/{endpoint} with Bearer token

Each instance exposes:
  GET /api/superadmin/health
  GET /api/superadmin/stats
  GET /api/superadmin/jobs
  GET /api/superadmin/usage
  GET /api/superadmin/onboarding
  → Auth: timingSafeEqual check on AGENT_SUPERADMIN_TOKEN
```

---

## v4.0 Integration Architecture

### Core Insight: One Container Becomes the Hub

The existing hub-spoke superadmin pattern answers the gateway question definitively.
**Noah's instance is already the hub.** It already:
- Has SUPERADMIN_HUB=true
- Knows all other instances via SUPERADMIN_INSTANCES env
- Can query any instance via HTTP with Bearer token
- Serves the superadmin dashboard at /admin/superadmin/

v4.0 extends this: the hub becomes the single entry point for users. Traefik continues routing `clawforge.scalingengine.com → noah container`. The other instance URLs (`strategyes.scalingengine.com`) can be kept as direct access for backward compat, but all new multi-tenant users go through the hub.

No new container needed. No separate gateway service. The hub IS the gateway.

### System Overview (v4.0 Target State)

```
                        Browser (single URL)
                               │
                               ▼
                  clawforge.scalingengine.com
                               │
                        Traefik (TLS termination)
                               │
                               ▼
              ┌────────────────────────────────────┐
              │   Noah Container (Hub + Gateway)     │
              │                                     │
              │  Next.js App                        │
              │  ├── /login          [shared auth]  │
              │  ├── /agents         [agent picker] │
              │  ├── /agents/[name]/* [scoped UI]   │
              │  │     ├── /chat                    │
              │  │     ├── /pull-requests            │
              │  │     ├── /workspace                │
              │  │     └── /swarm (clusters)         │
              │  ├── /agents/all/*   [cross-agent]  │
              │  └── /admin/*        [existing]     │
              │                                     │
              │  lib/proxy/          [NEW]           │
              │  ├── http-proxy.js   [REST → inst]  │
              │  └── ws-proxy.js     [WS → inst]    │
              │                                     │
              │  lib/auth/           [MODIFIED]      │
              │  └── Added: agentAssignments table  │
              └────────────────────────────────────┘
                    │                    │
          HTTP proxy                 WS proxy
          + Bearer token             + ticket relay
                    │                    │
        ┌───────────┘         ┌──────────┘
        ▼                     ▼
  clawforge-ses container   clawforge-ses container
  (port 80, internal)       (port 80, ws upgrade)
  ├── /api/superadmin/*     ├── /ws/terminal/*
  └── /api/* (proxied)      └── /code/*/ws (proxied)
```

---

## Component Boundaries

### Existing Components (Unchanged)

| Component | Location | Responsibility | Change |
|-----------|----------|----------------|--------|
| Custom HTTP server | `lib/ws/server.js` | HTTP + WS upgrade interception, PM2 entrypoint | No change to server.js — proxy attaches here |
| Ticket auth | `lib/ws/tickets.js` | 30s single-use tokens for terminal WS | No change — proxy relays tickets from spoke |
| Superadmin client | `lib/superadmin/client.js` | Queries all instances via HTTP | Extend: add generic `proxyRequest()` |
| Superadmin config | `lib/superadmin/config.js` | Instance registry from env | No change |
| NextAuth middleware | `lib/auth/middleware.js` | JWT session guard on Next.js routes | Extend: add /agents/* protection, role check |
| Auth edge config | `lib/auth/edge-config.js` | JWT callbacks, session shape | Extend: add `assignedAgents` to token |
| Auth config | `lib/auth/config.js` | Credentials provider, DB lookup | No change |
| Schema | `lib/db/schema.js` | Drizzle SQLite tables | Add: `agent_assignments` table |
| Users DB | `lib/db/users.js` | CRUD + bcrypt | Add: assignment queries |

### New Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| HTTP proxy | `lib/proxy/http-proxy.js` | Forward API requests from hub to spoke instances, inject Bearer token, stream responses |
| WS proxy bridge | `lib/proxy/ws-proxy.js` | Forward WebSocket upgrades (terminal + code) from hub to correct spoke server.js |
| Agent picker page | `templates/app/agents/page.js` | Dashboard showing assigned agents, online status, last activity |
| Agent layout | `templates/app/agents/[agent]/layout.js` | Agent-scoped sidebar, context provider for which agent is selected |
| Agent chat page | `templates/app/agents/[agent]/chat/page.js` | Proxied chat UI for selected agent |
| Agent assignments DB | `lib/db/agent-assignments.js` | CRUD for user-to-agent mapping |
| Agent assignments admin | `templates/app/admin/users/` | Add assignment UI to existing users admin page |
| Cross-agent views | `templates/app/agents/all/page.js` | Aggregate PRs, workspaces, sub-agents across all assigned agents |

---

## Data Flow Changes

### Authentication Flow (Modified)

Current: Each instance validates its own session cookie, `AUTH_SECRET` is per-instance.

v4.0 Hub approach: Hub's `AUTH_SECRET` is used for the shared session. Spoke instances are not directly accessed by browsers for the new UI — the hub proxies on their behalf using M2M auth (`AGENT_SUPERADMIN_TOKEN`). No change to spoke auth needed.

```
Login at /login (hub)
    │
    ▼
Credentials provider → hub's users table
    │
    ▼
JWT token issued (AUTH_SECRET = hub's secret)
Session includes: { id, email, role, assignedAgents: ['noah', 'strategyES'] }
    │
    ▼
/agents page reads session.assignedAgents
    │
    └─► Agent Picker UI
        └─ Card per agent
           Status via queryAllInstances() (existing superadmin client)
```

### Request Proxy Flow (New)

When a user is on `/agents/strategyES/chat` and sends a message:

```
Browser → POST /agents/strategyES/api/chat (hub)
    │
    ▼
lib/proxy/http-proxy.js
├── Extract instance name from path: 'strategyES'
├── Check: user has assignment for 'strategyES'
├── Rewrite path: /api/chat
├── Add header: Authorization: Bearer AGENT_SUPERADMIN_TOKEN
└── fetch() to http://clawforge-ses:80/api/chat
    │
    ▼
Response streamed back to browser
```

Critical detail: The spoke's `/api/index.js` currently validates `x-api-key` for external requests. The proxy should use the existing `AGENT_SUPERADMIN_TOKEN` path — spokes need a new "hub proxy" auth path that accepts Bearer token on all `/api/*` routes, not just `/api/superadmin/*`. This is an additive change in the spoke's api/index.js — check Bearer token before the x-api-key check.

### WebSocket Proxy Flow (New)

Terminal WebSocket connections currently require the browser to connect directly to the instance's WebSocket endpoint. In the multi-tenant model, the browser connects to the hub, which relays to the spoke.

```
Browser → WS upgrade: wss://clawforge.scalingengine.com/proxy/strategyES/ws/terminal/{id}?ticket=xxx
    │
    ▼
hub's server.js (upgrade handler, /proxy/{instance}/ws/* path)
    │
    ▼
lib/proxy/ws-proxy.js
├── Validate: user session has assignment for 'strategyES'
├── Validate: ticket (issued by spoke — hub relays ticket issuance first)
└── WebSocket connect: ws://clawforge-ses:80/ws/terminal/{id}?ticket=xxx
        │
        ▼
Binary frame relay (identical to existing proxyToTtyd pattern)
```

Ticket relay flow: When the hub proxies a "get terminal ticket" Server Action, the spoke issues the ticket in its own memory and returns it. The hub relays it to the browser. The browser opens WS through the hub, which passes the ticket query param to the spoke. The spoke validates and consumes it. Works because ticket validation happens on the spoke side — hub does not touch the ticket's validity.

---

## New vs Modified — Explicit List

### New Files

```
lib/proxy/
├── http-proxy.js           # Generic HTTP proxy: fetch spoke, stream response, auth injection
└── ws-proxy.js             # WebSocket proxy: upgrade relay for /proxy/{instance}/ws/* paths

lib/db/
└── agent-assignments.js    # getUserAssignments(userId), assignUser(userId, agentName),
                            # unassignUser(userId, agentName), getAssignedUsers(agentName)

templates/app/
├── agents/
│   ├── page.js             # Agent picker dashboard (list assigned agents with status)
│   ├── all/
│   │   └── page.js         # Cross-agent views (aggregate PRs, workspaces, sub-agents)
│   └── [agent]/
│       ├── layout.js       # Agent-scoped layout (sidebar context, agent name header)
│       ├── page.js         # Redirect to /agents/[agent]/chat
│       ├── chat/
│       │   └── page.js     # Chat proxied to spoke
│       ├── pull-requests/
│       │   └── page.js     # PRs proxied to spoke
│       ├── workspace/
│       │   └── page.js     # Workspace list proxied to spoke
│       └── swarm/
│           └── page.js     # Clusters proxied to spoke
```

### Modified Files

```
lib/db/schema.js
└── + agent_assignments table: { id, userId, agentName, createdAt }

lib/auth/edge-config.js
└── jwt/session callbacks: add assignedAgents to token (fetch from DB on sign-in via jwt callback)

lib/auth/middleware.js
└── + /agents/* route protection
└── + Superadmin sees all agents, regular users see only assigned ones (enforced in layout, not middleware)

lib/ws/server.js
└── + attachProxyHandler(server) call to register /proxy/* WebSocket paths

api/index.js  (spoke-side change)
└── + Accept AGENT_SUPERADMIN_TOKEN Bearer on all /api/* routes (not just /api/superadmin/*)
    This allows hub to proxy any API call on behalf of an authenticated user

templates/app/admin/users/page.js (or new sub-page)
└── + Agent assignment UI (checkboxes: assign/unassign agents per user)

docker-compose.yml
└── No structural change — hub already knows spoke container names via SUPERADMIN_INSTANCES
```

---

## Architectural Patterns

### Pattern 1: Hub-Side Proxy with Spoke-Side M2M Auth

**What:** All browser requests to spoke functionality go through hub. Hub re-signs requests with `AGENT_SUPERADMIN_TOKEN`. Spoke trusts hub-originated requests unconditionally — no user session needed on spoke.

**When to use:** All proxied API routes (chat, jobs, PRs, workspaces, clusters).

**Trade-offs:**
- Pro: No session synchronization between instances. Spoke remains unaware of multi-tenancy.
- Pro: Single JWT secret (hub only). Spokes need no config change for the auth model.
- Con: Hub is a single point of failure for agent UI. Mitigation: direct spoke URLs remain functional for fallback.
- Con: Spoke needs to accept hub's Bearer token on all API routes. This is a small additive change.

### Pattern 2: Stateless Agent Context via URL Path

**What:** The selected agent is encoded in the URL (`/agents/strategyES/chat`), not in session state. Components read `params.agent` from the URL and pass it down. No global client-side state store needed.

**When to use:** All agent-scoped pages.

**Trade-offs:**
- Pro: Bookmarkable, shareable, browser back/forward works correctly.
- Pro: No React context provider complexity for agent selection.
- Con: Each page must validate the agent name and assignment — handled cleanly in the layout server component.

**Example:**
```javascript
// templates/app/agents/[agent]/layout.js
export default async function AgentLayout({ children, params }) {
  const session = await auth();
  const { agent } = await params;
  const assignments = getUserAssignments(session.user.id);
  if (!assignments.includes(agent)) redirect('/agents');
  return <AgentShell agentName={agent}>{children}</AgentShell>;
}
```

### Pattern 3: Component Reuse Without Iframe

**What:** Agent UI pages do NOT iframe the spoke's Next.js app. Instead, they reuse existing lib/chat/components/ and supply data via the hub's proxy layer.

**When to use:** All agent-scoped pages.

**Why not iframe:** Breaks the single-URL product goal. CSP headers block cross-origin frames. Auth context splits between iframe and parent. History API breaks. No control over iframe URL bar.

**Trade-offs:**
- Pro: Full control over UI, single auth context, works with existing component library.
- Con: Each spoke API route used by the UI must be explicitly proxied. Known set is small: chat streaming, job list, PR list, workspace list, cluster list, and their mutations.

### Pattern 4: Ticket-Mediated WebSocket Relay

**What:** Terminal WebSocket connections use a two-phase protocol. (1) Hub proxies the "get ticket" Server Action to the spoke — spoke issues ticket in its own memory and returns the ticket string. (2) Browser opens WS to hub's `/proxy/{agent}/ws/*` path with the ticket in the query string. Hub relays the upgrade and all frames to the spoke. Spoke validates ticket and proxies to ttyd as normal.

**When to use:** Terminal workspaces (/ws/terminal/*) and code IDE (/code/*/ws) accessed through the hub.

**Trade-offs:**
- Pro: No change to spoke ticket system. Tickets remain spoke-side, in-memory, 30s TTL.
- Pro: No new auth mechanism needed — ticket is the credential.
- Con: Hub's ws-proxy.js must forward all binary frames without interpretation.
- Con: Hub and spoke must share a Docker network for internal WS connections (already true — proxy-net connects all containers).

---

## Build Order

Dependencies drive the order. Each phase must not block on an unbuilt dependency.

### Phase 1: Data Layer (no UI dependency)

Add `agent_assignments` table to schema. Write `lib/db/agent-assignments.js`. Additive table — no existing table changes.

Deliverable: `getUserAssignments(userId)`, `assignUser()`, `unassignUser()`, `getAssignedUsers()`.

### Phase 2: Hub Auth Extension (depends on Phase 1)

Extend `lib/auth/edge-config.js` to include `assignedAgents` in the JWT token (fetch from DB on sign-in via jwt callback). Extend middleware to protect `/agents/*` routes. Add redirect from `/` to `/agents` for users without a default instance configured.

Deliverable: Session contains agent list. `/agents/*` routes are auth-guarded.

### Phase 3: HTTP Proxy Layer (no UI dependency)

Build `lib/proxy/http-proxy.js`. Write a server-side helper that: accepts instance name + path + request context, validates assignment, rewrites to spoke internal URL with Bearer token, streams response. Also extend spoke's `api/index.js` to accept `AGENT_SUPERADMIN_TOKEN` Bearer on all `/api/*` routes.

Deliverable: Hub can proxy any REST API call to any spoke on behalf of an authenticated user.

### Phase 4: Agent Picker UI (depends on Phase 2)

Build `/agents/page.js` — reads assigned agents from session, queries health via existing `queryAllInstances('health')`, renders agent cards. No proxy dependency — uses existing superadmin client.

Deliverable: Users see their agents after login. Superadmin sees all agents.

### Phase 5: Agent-Scoped Pages — Chat (depends on Phase 3 + Phase 4)

Build `/agents/[agent]/layout.js` (assignment gate, agent context header). Build `/agents/[agent]/chat/page.js` — imports existing `ChatPage` component, but all Server Actions must proxy to spoke. This is the largest single-phase effort. Chat streaming, job dispatch, and notification polling all route through the proxy layer.

Deliverable: Chat works end-to-end through the hub for a spoke agent.

### Phase 6: WebSocket Proxy (depends on Phase 3)

Build `lib/proxy/ws-proxy.js`. Wire into `lib/ws/server.js` via `attachProxyHandler(server)`. Update terminal ticket flow: spoke issues ticket → hub relays to browser → browser opens WS to hub → hub relays upgrade to spoke.

Deliverable: Terminal workspaces accessible through hub URL.

### Phase 7: Remaining Agent-Scoped Pages (depends on Phase 3)

Build `/agents/[agent]/pull-requests`, `/agents/[agent]/workspace`, `/agents/[agent]/swarm`. These reuse existing page components with proxied data — lower complexity than chat because they're mostly read-only list views.

Deliverable: Full agent-scoped UI available.

### Phase 8: Admin — User-Agent Assignments (depends on Phase 1)

Extend existing `/admin/users` page with agent assignment UI. Checkboxes per user showing which agents they have access to. Uses `agent-assignments.js` DB module directly — no proxy needed, admin runs on hub.

Deliverable: Superadmin can assign/unassign agents to users.

### Phase 9: Cross-Agent Views (depends on Phases 5–7)

Build `/agents/all/` pages aggregating PRs, workspaces, and sub-agents across all assigned instances. Uses existing `queryAllInstances()` pattern extended with new endpoints.

Deliverable: "All Agents" view shows cross-instance aggregates.

### Phase 10: Terminology Migration

Rename "instances" → "agents" in all user-facing UI strings. Update sidebar, page titles, admin panel labels. Config files and env vars keep existing names (`INSTANCE_NAME` etc.) — backend names are stable identifiers.

Deliverable: Consistent "agents" language in UI.

---

## Integration Points Summary

| Integration Point | Existing Hook | v4.0 Change |
|-------------------|---------------|-------------|
| Traefik routing | `Host(noah_hostname)` → noah container | No change — hub is already noah |
| Auth session | Per-instance JWT, `AUTH_SECRET` per instance | Hub session gains `assignedAgents[]` field |
| Spoke API auth | `x-api-key` header OR superadmin Bearer | Add: accept superadmin Bearer on all `/api/*` |
| Superadmin health queries | `queryAllInstances('health')` | Reused for agent picker status cards |
| WebSocket upgrade | `server.on('upgrade')` in server.js | Add: /proxy/* path handled by ws-proxy.js |
| Ticket system | globalThis._clawforgeTickets in spoke memory | Unchanged — hub relays ticket, spoke validates |
| Docker networks | noah shares proxy-net with ses | Already connected — no new network needed |
| Admin users page | `/admin/users` — CRUD | Add: agent assignment checkboxes |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 2 agents (current) | Hub proxies everything — no bottleneck |
| 5–10 agents | Proxy fanout for "all agents" views may slow; Promise.allSettled timeouts already exist |
| 20+ agents | Cache spoke responses (30s TTL) for dashboard views; still no infra change for Docker Compose |
| 50+ agents | SQLite per instance + Docker Compose becomes the constraint; out of v4.0 scope |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shared Database for Auth + Agent Data

**What people do:** Add Postgres, point all instances at it, use a shared users table.

**Why it's wrong:** Requires migrating every existing SQLite instance, adds Postgres infra, introduces cross-instance data coupling. The existing superadmin HTTP pattern solves the same problem without shared state.

**Do this instead:** Hub's SQLite owns user-to-agent assignments. Spokes remain isolated. Hub queries spokes via HTTP when needed.

### Anti-Pattern 2: Replicating Spoke Session to Hub

**What people do:** When user selects an agent, create a session on the spoke via API call and store spoke session cookie in the hub.

**Why it's wrong:** Two-phase auth is fragile. Spoke session TTL must be managed. CORS and cookie scoping become nightmares. AUTH_SECRET mismatches cause silent failures.

**Do this instead:** Hub session is the only session. Hub proves identity to spoke via AGENT_SUPERADMIN_TOKEN on every proxied request. Spoke trusts the token — no per-user session on spoke needed.

### Anti-Pattern 3: Iframe Embedding Spoke UI

**What people do:** `/agents/[agent]` renders `<iframe src="https://strategyes.scalingengine.com">`.

**Why it's wrong:** Breaks the single-URL product goal. CSP headers block it. Auth context splits between iframe and parent. History API breaks.

**Do this instead:** Import existing shared components from lib/chat/components/ and supply data via the proxy layer.

### Anti-Pattern 4: Syncing Users to Spokes for Multi-Tenancy

**What people do:** Add "user sync" that replicates hub users into spoke databases so spokes can do their own session validation.

**Why it's wrong:** Users are managed on the hub. Syncing creates drift, double writes, and no clear source of truth. Deleted hub users may still authenticate on spokes.

**Do this instead:** Spokes remain unaware of individual users. Hub is the identity authority. All user context flows through the hub's proxy layer with M2M credentials.

---

## Sources

- Codebase: `lib/ws/server.js`, `lib/ws/proxy.js`, `lib/ws/tickets.js` — WebSocket proxy patterns (HIGH confidence)
- Codebase: `lib/superadmin/client.js`, `lib/superadmin/config.js` — existing hub-spoke HTTP proxy pattern (HIGH confidence)
- Codebase: `lib/auth/middleware.js`, `lib/auth/edge-config.js`, `lib/auth/config.js` — auth stack (HIGH confidence)
- Codebase: `lib/db/schema.js` — full data model (HIGH confidence)
- Codebase: `docker-compose.yml` — container topology, shared proxy-net network (HIGH confidence)
- Codebase: `api/superadmin.js` — M2M auth pattern with AGENT_SUPERADMIN_TOKEN (HIGH confidence)
- Project history: `.planning/PROJECT.md` — v4.0 goals, prior milestone decisions (HIGH confidence)

---

*Architecture research for: ClawForge v4.0 Multi-Tenant Agent Platform*
*Researched: 2026-03-24*
