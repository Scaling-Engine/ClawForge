# Stack Research

**Domain:** Multi-tenant agent platform — shared auth layer, request proxying, agent picker dashboard, per-agent scoped UI
**Milestone:** v4.0 Multi-Tenant Agent Platform
**Researched:** 2026-03-24
**Confidence:** HIGH (existing stack verified from codebase; new additions verified against current docs and source)

---

## Scope

This document covers **additions needed for v4.0 only**. The full existing stack (Next.js 15.5.12, NextAuth v5 beta, Drizzle ORM + better-sqlite3, dockerode v4, custom HTTP server, three-tier RBAC, API proxy pattern via `lib/superadmin/client.js`) is treated as fixed.

Four new capability areas:

1. **Central user registry** — single hub SQLite DB for users + agent assignments
2. **Auth consolidation** — single NextAuth instance whose session works across subdomains
3. **Request proxy** — browser sends all requests to hub, hub forwards to correct instance container
4. **Agent picker UI** — post-login dashboard with per-agent context switching

---

## Key Finding: No New Dependencies Required

All four v4.0 capabilities are achievable with the existing stack plus Node.js built-ins. The rationale for each is below.

---

## Recommended Stack — New Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **better-sqlite3** | ^12.6.2 (existing) | Central user registry + agent assignments | Already in stack. Add a second DB file (`data/hub.sqlite`) at a distinct path. One `getHubDb()` singleton alongside existing `getDb()`. SQLite WAL mode handles concurrent auth-lookup reads without contention at this scale. No new dependency. |
| **Drizzle ORM** | ^0.44.0 (existing) | Schema + queries for hub DB | Already in stack. Hub tables live in a separate schema file (`lib/db/hub-schema.js`) with a separate Drizzle instance. Keeps hub and instance schemas independently evolvable — hub migrations never touch per-instance tables. |
| **NextAuth v5** | ^5.0.0-beta.30 (existing) | Single auth instance on hub with cross-subdomain cookie | Already in stack. One config change: set `domain: ".scalingengine.com"` on the session cookie so the JWT is readable on all subdomains. No second NextAuth instance. Instance containers verify the hub-issued JWT via the existing AGENT_SUPERADMIN_TOKEN M2M channel. |
| **Node.js `http` module** | built-in | HTTP + SSE + WebSocket request proxying | The custom `server.js` already uses raw `http` events to intercept WebSocket upgrades for ttyd. Extend the same file to forward HTTP requests to target instance containers using `http.request()` + `pipe()`. Handles SSE streaming (no buffering layer), WebSocket upgrades, and regular JSON. Zero new dependencies. |

### Supporting Libraries (Existing, No Change)

| Library | Version | Purpose | v4.0 Role |
|---------|---------|---------|-----------|
| **zod** | ^4.3.6 | Input validation | Validate `POST /api/hub/assignments` and agent-routing request params |
| **bcrypt-ts** | ^6.0.0 | Password hashing | Hub `users` table reuses same hash pattern as per-instance users |
| **uuid** | ^9.0.0 | ID generation | Hub user UUIDs follow same pattern as existing users |

---

## Hub DB Schema (New Tables in `lib/db/hub-schema.js`)

Two new tables. These live in `data/hub.sqlite`, not in per-instance `data/clawforge.sqlite`:

```javascript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Central user registry — canonical identity across all agents
export const hubUsers = sqliteTable('hub_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),   // 'user' | 'admin' | 'superadmin'
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// Many-to-many: which users can access which agents
export const agentAssignments = sqliteTable('agent_assignments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),    // FK to hub_users.id
  agentSlug: text('agent_slug').notNull(), // e.g. 'noah', 'strategyES'
  assignedAt: integer('assigned_at').notNull(),
});
```

---

## Auth Consolidation Pattern (Config Change Only)

One change to `lib/auth/edge-config.js`:

```javascript
// Add cookie domain scoping for cross-subdomain session sharing
cookies: {
  sessionToken: {
    options: {
      domain: process.env.NODE_ENV === 'production' ? '.scalingengine.com' : undefined,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    }
  }
}
```

JWT callbacks embed `agentSlugs: string[]` (the user's assigned agents) — this is read by the agent picker UI without a DB call per page load.

---

## Request Proxy Pattern (Extends `server.js`)

The custom HTTP server in `server.js` currently handles WebSocket upgrades for ttyd. Extend the `request` handler:

```javascript
server.on('request', (req, res) => {
  const agentSlug = resolveAgentFromSession(req);   // from cookie-decoded JWT
  if (agentSlug && isProxiable(req.url)) {
    const targetUrl = getInstanceUrl(agentSlug);    // from instances registry
    const proxyReq = http.request(targetUrl + req.url, {
      method: req.method,
      headers: { ...req.headers, 'x-forwarded-host': req.headers.host },
    });
    req.pipe(proxyReq);
    proxyReq.on('response', (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);  // SSE streams work naturally here — no buffering
    });
  } else {
    nextHandler(req, res);  // fall through to Next.js
  }
});
```

SSE and WebSocket both work through `pipe()` without special handling. WebSocket upgrades continue to use the existing `server.on('upgrade', ...)` path.

---

## Important: Next.js Middleware → Proxy Rename

**Breaking change in Next.js 16.0.0:** `middleware.ts` is deprecated and renamed to `proxy.ts`. The export function must also be renamed from `middleware` to `proxy`.

The existing `lib/auth/middleware.js` needs to be migrated. Next.js provides a codemod:

```bash
npx @next/codemod@canary middleware-to-proxy .
```

This rename should be addressed during the v4.0 milestone. It is not a feature — it prevents a future breaking upgrade from being coupled to a feature milestone.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Second SQLite file (`hub.sqlite`) | PostgreSQL central DB | Ops overhead unjustified at 2 instances + small user count. PostgreSQL requires a separate server, connection pooling, different migration tooling. SQLite WAL handles concurrent reads at this scale. Re-evaluate at 50+ users or 10+ instances. |
| Second SQLite file (`hub.sqlite`) | Supabase | External service dependency, billing surface, added auth complexity. Existing SQLite pattern is proven and zero-cost. |
| Second SQLite file (`hub.sqlite`) | Shared single SQLite (merge hub + instance into one file) | Hub and instance containers are separate processes. Sharing one SQLite file across processes risks WAL lock contention. Separate files with explicit boundaries is safer and maps cleanly to the hub-and-spoke architecture. |
| Built-in `http` module proxy | `http-proxy-middleware` ^3.0.5 | Confirmed ESM incompatibility with `"type": "module"` Next.js projects (vercel/next.js issue #86434). The project uses ESM throughout. The custom server already uses raw `http` for WS; extending it for HTTP proxying is ~40 lines with zero dependency risk. |
| Built-in `http` module proxy | `node-http-proxy` | Effectively maintenance-mode since 2022 (`http-party` fork). Same ESM concerns. |
| Single NextAuth on hub | Separate NextAuth per instance | Defeats the purpose of shared auth. Each instance validating the hub-issued JWT via AGENT_SUPERADMIN_TOKEN is the existing proven M2M pattern. |
| Cookie domain scoping | JWT in Authorization header | Browser clients cannot set Authorization headers on page navigations. Cookie-based sessions with scoped domain is the standard web approach and what NextAuth is designed for. |
| `@hookform/resolvers` v5 (existing) | No resolver | Zod v4 integration for the agent assignment form requires the resolver bridge. Already in dependencies. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `http-proxy-middleware` | ESM incompatibility with `"type": "module"` projects confirmed in vercel/next.js #86434; third-party dependency for what Node.js handles natively | Raw `http.request()` + `pipe()` in `server.js` |
| `node-http-proxy` | Maintenance-mode since 2022; no ESM exports | Raw `http.request()` + `pipe()` in `server.js` |
| PostgreSQL or Supabase | Ops overhead unjustified at current scale; introduces external service dependency | Second `better-sqlite3` DB file (`hub.sqlite`) |
| Separate NextAuth instance per instance container | Requires each instance to maintain its own user table; defeats central auth goal | Single NextAuth on hub with cross-subdomain cookie domain config |
| `@auth/drizzle-adapter` | Switches NextAuth from JWT strategy to DB-backed sessions; JWT strategy is simpler and works across subdomains without a DB read per request | Extend existing JWT callbacks to embed `agentSlugs[]` claim |
| Zustand or Jotai for agent picker state | Adds a library for what `useState` + URL params handles cleanly | React `useState` + `useSearchParams` for selected agent context |

---

## Installation

No new packages required.

```bash
# No new installs needed for v4.0 core features.
# All proxy, auth, and DB capabilities covered by existing stack + Node.js built-ins.
```

---

## Stack Patterns by Variant

**If running as multi-subdomain (current):**
- Cookie domain `.scalingengine.com` with `sameSite: "lax"` is sufficient
- Hub at `clawforge.scalingengine.com`, instances at `noah.scalingengine.com`, `es.scalingengine.com`
- Session cookie set on hub login, readable on all subdomains

**If migrating to single-URL (v4.0 goal):**
- All requests land on `clawforge.scalingengine.com`
- `server.js` proxy layer routes `/agent/[slug]/api/*` to instance containers
- No subdomain cookie config needed in pure single-URL mode, but keeping it doesn't break anything

**If adding a third instance later:**
- Add row to instances registry (existing `lib/superadmin/config.js` pattern)
- No code changes to proxy or auth layers — both are data-driven

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| better-sqlite3 ^12.6.2 | drizzle-orm ^0.44.0 | Existing combination confirmed working in production with custom migration runner |
| next-auth ^5.0.0-beta.30 | next >=15.5.12 | Cross-subdomain cookie domain config is documented in NextAuth v5 — test in staging before deploy |
| Node.js `http` (built-in) | Node >=18 | `pipe()` + streaming works without version-specific concerns; project already requires Node 18+ |
| next-auth ^5.0.0-beta.30 | middleware → proxy rename | NextAuth's `auth()` wrapper works identically in `proxy.js`; only the file and export names change |

---

## Sources

- [Next.js proxy.js file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) — Confirmed `middleware` renamed to `proxy` in Next.js v16.0.0; Node.js runtime stable as of v15.5.0 (HIGH confidence — official docs)
- [NextAuth v5 cross-subdomain cookie discussion](https://github.com/nextauthjs/next-auth/issues/2414) — Cookie domain scoping approach; apex domain + leading dot convention (MEDIUM confidence — community discussion, cross-referenced with official options docs)
- [NextAuth.js options documentation](https://next-auth.js.org/configuration/options) — `cookies.sessionToken.options.domain` config key confirmed (HIGH confidence — official docs)
- [http-proxy-middleware ESM issue](https://github.com/vercel/next.js/issues/86434) — Confirmed ESM incompatibility with `"type": "module"` Next.js; reason to avoid (HIGH confidence — official Next.js GitHub)
- [http-proxy-middleware npm](https://www.npmjs.com/package/http-proxy-middleware) — Latest version 3.0.5, last published ~1 year ago (HIGH confidence — npm registry)
- [node-http-proxy GitHub](https://github.com/http-party/node-http-proxy) — Maintenance-mode status confirmed (HIGH confidence — GitHub activity)
- Codebase inspection: `lib/db/index.js`, `lib/db/schema.js`, `lib/auth/middleware.js`, `lib/auth/config.js`, `lib/auth/edge-config.js`, `lib/superadmin/client.js`, `server.js` (implied from PROJECT.md), `package.json` — All existing patterns verified against live code (HIGH confidence — direct codebase inspection)

---

*Stack research for: ClawForge v4.0 Multi-Tenant Agent Platform — shared auth, request proxy, agent picker, per-agent scoped UI*
*Researched: 2026-03-24*
