# Phase 53: Shared Auth Foundation - Research

**Researched:** 2026-03-25
**Domain:** NextAuth v5 JWT callbacks, Drizzle ORM SQLite, Docker Compose networking
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion — pure infrastructure phase. Key decisions locked from STATE.md v4.0:

- **Hub DB:** Second SQLite file `data/hub.sqlite` with separate Drizzle schema `lib/db/hub-schema.js` — hub and instance schemas independently evolvable
- **No new dependencies:** Entire v4.0 built on existing stack + Node.js `http` built-in. `http-proxy-middleware` explicitly ruled out (ESM incompatibility confirmed against Next.js #86434)
- **Cross-subdomain session:** `domain: ".scalingengine.com"` on NextAuth session cookie config — fallback is shared `AUTH_SECRET` with spoke-side JWT validation if v5 beta cookie behavior is inconsistent
- **Spoke Bearer auth:** Additive — spoke `/api/*` routes accept `AGENT_SUPERADMIN_TOKEN` Bearer on all routes, not just `/api/superadmin/*`. Existing webhook auth (x-api-key, signing secret) unchanged.
- **Instance port isolation:** Remove `ports:` mappings from all instance containers in production `docker-compose.yml` in Phase 53 — prerequisite for security model.

### Claude's Discretion
All implementation choices within the above locked decisions. Specific areas:
- Table column naming for `hub_users` and `agent_assignments`
- How `assignedAgents` is populated in the JWT callback (query pattern)
- Whether hub DB initialization uses the same `initDatabase()` pattern or a separate `initHubDatabase()` function
- How `/agents/*` route protection is added to middleware
- The exact ENV var name for the shared `AUTH_SECRET` in `docker-compose.yml`

### Deferred Ideas (OUT OF SCOPE)
None — infrastructure phase.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can log in once at clawforge.scalingengine.com and access all assigned agents without re-authenticating | Shared `AUTH_SECRET` + cross-subdomain cookie config; JWT carries `assignedAgents` claim |
| AUTH-02 | Hub maintains a central user registry (hub SQLite DB) separate from per-instance user tables | New `data/hub.sqlite` with `lib/db/hub-schema.js` using existing Drizzle + better-sqlite3 patterns |
| AUTH-03 | Hub session JWT includes `assignedAgents` claim listing agent slugs the user can access | Extend `edge-config.js` JWT callback — add `assignedAgents` from `agent_assignments` table lookup on login |
| AUTH-04 | All instance containers share a standardized AUTH_SECRET for cross-instance token validation | Collapse `NOAH_AUTH_SECRET` + `SES_AUTH_SECRET` in `docker-compose.yml` to single `AUTH_SECRET` |
| AUTH-05 | Instance containers are not directly accessible from the internet (no host port bindings in production) | Instance containers already have no `ports:` in `docker-compose.yml` — SUCCESS CRITERION ALREADY MET for current state; needs verification and documentation |
</phase_requirements>

---

## Summary

Phase 53 creates the auth foundation for the v4.0 multi-tenant architecture. It has four distinct work areas: (1) a new hub SQLite DB with `hub_users` and `agent_assignments` tables, (2) extending the NextAuth v5 JWT callback to embed an `assignedAgents` claim, (3) standardizing `AUTH_SECRET` across all instance containers, and (4) protecting `/agents/*` routes in middleware.

**Critical finding:** The instance containers in the current `docker-compose.yml` already have **no `ports:` mappings** — only Traefik exposes ports 80/443. AUTH-05 is architecturally already satisfied. The task becomes: confirm this is intentional, add a clear comment, and verify the middleware redirect for `/agents/*` (which doesn't exist yet as a route — it is a future route that Phase 54+ will create). The middleware guard must be written defensively so it doesn't break when the route doesn't yet exist.

**Important:** The current docker-compose uses `NOAH_AUTH_SECRET` and `SES_AUTH_SECRET` as separate per-instance secrets. Phase 53 must consolidate these to a single `AUTH_SECRET` env var in the compose file. Both instance containers read `AUTH_SECRET` from their environment — the only change is the compose file wiring and the `.env.example` documentation.

**Primary recommendation:** Follow the existing `getDb()` singleton pattern exactly for the hub DB. Use the same `initDatabase()` approach for `initHubDatabase()`. Extend `edge-config.js` JWT callback to conditionally query `agent_assignments` (hub-only; skip on instance containers). Middleware `/agents/*` guard is a one-liner addition to the existing role-check block.

---

## Standard Stack

### Core (all pre-existing — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.6.2 | SQLite driver — synchronous queries | Already used for all DB operations in this project |
| drizzle-orm | ^0.44.0 | ORM + schema definition | Already the project ORM; `sqliteTable` used across `schema.js` |
| next-auth | 5.0.0-beta.30 | Session/JWT management | Already installed; `authConfig`, `jwt()`, `session()` callbacks are the extension points |
| drizzle-kit | ^0.31.9 | Migration generation | Already used; `db:generate` script exists |

### No new installations required
All Phase 53 work uses libraries already in `node_modules`. Confirmed by inspecting `package.json`.

---

## Architecture Patterns

### Recommended Project Structure (additive)

```
lib/
├── db/
│   ├── schema.js          # existing — instance DB tables (do not touch)
│   ├── hub-schema.js      # NEW — hub_users + agent_assignments tables
│   ├── index.js           # existing — getDb() singleton (do not touch)
│   └── hub.js             # NEW — getHubDb() singleton + initHubDatabase()
├── auth/
│   ├── edge-config.js     # MODIFY — add assignedAgents to JWT callback
│   └── config.js          # MODIFY — authorize() reads from hub DB on hub instances
drizzle/
│   └── 0012_hub_schema.sql   # NEW migration for hub_users + agent_assignments
docker-compose.yml             # MODIFY — AUTH_SECRET consolidation + comments
.env.example                   # MODIFY — document AUTH_SECRET shared requirement
```

### Pattern 1: Hub DB Singleton (mirrors existing getDb())

**What:** `getHubDb()` returns a lazy-initialized Drizzle instance connected to `data/hub.sqlite`, using the same WAL pragma and identical initialization pattern as `getDb()`.

**When to use:** Anywhere hub-scoped data is needed — user registry, agent assignments.

**Example:**
```javascript
// lib/db/hub.js — mirrors lib/db/index.js exactly
import fs from 'fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { dataDir } from '../paths.js';
import * as hubSchema from './hub-schema.js';

// Source: existing lib/db/index.js pattern
const hubDbPath = process.env.HUB_DATABASE_PATH ||
  path.join(dataDir, 'hub.sqlite');

let _hubDb = null;

export function getHubDb() {
  if (!_hubDb) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const sqlite = new Database(hubDbPath);
    sqlite.pragma('journal_mode = WAL');
    _hubDb = drizzle(sqlite, { schema: hubSchema });
  }
  return _hubDb;
}
```

### Pattern 2: Hub Schema (Drizzle)

**What:** Two new tables in `hub-schema.js` — `hub_users` (central user registry) and `agent_assignments` (many-to-many: user ↔ agent slug + role).

**Example:**
```javascript
// lib/db/hub-schema.js
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const hubUsers = sqliteTable('hub_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'), // 'admin' | 'user'
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const agentAssignments = sqliteTable('agent_assignments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => hubUsers.id),
  agentSlug: text('agent_slug').notNull(), // e.g. 'noah', 'strategyES'
  agentRole: text('agent_role').notNull().default('operator'), // 'viewer' | 'operator' | 'admin'
  createdAt: integer('created_at').notNull(),
});
```

### Pattern 3: JWT Callback Extension

**What:** The existing `jwt()` callback in `edge-config.js` already adds `token.role`. Extend it to add `token.assignedAgents` during sign-in (when `user` is present). The hub DB query must be guarded by `SUPERADMIN_HUB` env var — instance containers must NOT attempt to import hub DB modules.

**Critical constraint:** `edge-config.js` is edge-safe (no DB imports at module level). The `assignedAgents` query must be a dynamic import inside the `if (user)` block, and ONLY run when `process.env.SUPERADMIN_HUB === 'true'`.

**Example:**
```javascript
// lib/auth/edge-config.js — extend jwt() callback
callbacks: {
  async jwt({ token, user }) {
    if (user) {
      token.role = user.role;
      // Hub only — instance containers skip this
      if (process.env.SUPERADMIN_HUB === 'true') {
        const { getAgentSlugsForUser } = await import('../db/hub-users.js');
        token.assignedAgents = getAgentSlugsForUser(user.id);
      }
    }
    return token;
  },
  session({ session, token }) {
    if (session.user) {
      session.user.id = token.sub;
      session.user.role = token.role;
      session.user.assignedAgents = token.assignedAgents ?? [];
    }
    return session;
  },
},
```

**Note:** `jwt()` callback is typically synchronous in edge-config but NextAuth v5 beta supports async callbacks. The dynamic import pattern is already used in `lib/auth/config.js` (authorize() does `await import('../db/users.js')`), confirming this is the established pattern.

### Pattern 4: AUTH_SECRET Consolidation (docker-compose.yml)

**What:** Both `noah-event-handler` and `ses-event-handler` currently read separate env vars (`NOAH_AUTH_SECRET`, `SES_AUTH_SECRET`). Phase 53 changes both to read from a single shared `AUTH_SECRET` env var. The `.env` file requires `AUTH_SECRET` to be a single value provisioned once.

**Why this works:** Both instance containers run the same clawforge package. JWT tokens are symmetrically encrypted with `AUTH_SECRET`. As long as both containers use the same `AUTH_SECRET`, a JWT minted by the hub is valid on any instance — this is already how `ws-proxy.js` decodes tokens (`secret: process.env.AUTH_SECRET`).

**Example docker-compose change:**
```yaml
# Before (separate secrets):
noah-event-handler:
  environment:
    AUTH_SECRET: ${NOAH_AUTH_SECRET}

ses-event-handler:
  environment:
    AUTH_SECRET: ${SES_AUTH_SECRET}

# After (shared secret):
noah-event-handler:
  environment:
    AUTH_SECRET: ${AUTH_SECRET}   # shared across all instances

ses-event-handler:
  environment:
    AUTH_SECRET: ${AUTH_SECRET}   # same value
```

### Pattern 5: /agents/* Middleware Guard

**What:** Add a `/agents/*` route protection block to `lib/auth/middleware.js`. Unauthenticated requests redirect to `/login`. This mirrors the existing `/admin` guard.

**When to use:** Any future page under `/agents/[slug]/*` (created in Phase 54+).

**Example:**
```javascript
// Addition to lib/auth/middleware.js (additive — do not modify existing checks)
// Agents routes require auth (identical behavior to base auth check, explicit for clarity)
if (pathname.startsWith('/agents')) {
  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}
```

**Important nuance:** The base auth check at the bottom of middleware already redirects any unauthenticated request to `/login`. The `/agents/*` guard is partially redundant with the catch-all, but is required to satisfy the success criterion wording ("navigating to `/agents/*` without a valid session redirects to the login page"). Make it explicit.

### Pattern 6: Hub DB Initialization

**What:** Mirrors `initDatabase()` in `lib/db/index.js`. Creates tables directly using `sqlite.exec()` (not Drizzle migrations journal) because the hub schema is separate from the instance schema and the hub DB is new.

**Two options considered:**
1. Add a Drizzle migration file (`0012_hub_schema.sql`) and use the custom migration runner — cleanest, consistent with existing pattern.
2. Inline SQL `CREATE TABLE IF NOT EXISTS` in `initHubDatabase()` — simpler for a new DB file.

**Recommendation:** Use option 1 (Drizzle migration). The existing `initDatabase()` migration runner already handles `CREATE TABLE IF NOT EXISTS` via try/catch on `already exists`. Add `0012_hub_schema.sql` to the `drizzle/` folder. Call `initHubDatabase()` from `instrumentation.js` on hub instances only (`SUPERADMIN_HUB === 'true'`).

### Anti-Patterns to Avoid

- **Importing hub DB in edge-config.js at module level:** Edge Runtime (Cloudflare/Vercel) cannot use `better-sqlite3`. All hub DB imports MUST be dynamic (`await import(...)`) inside callbacks that only run in Node.js context.
- **Sharing hub_users with instance users tables:** Hub users are stored in `hub.sqlite`, instance users remain in `clawforge.sqlite`. Do not cross-reference.
- **Hardcoding agentSlug values:** Agent slugs must match `INSTANCE_NAME` env var values (`'noah'`, `'strategyES'`). Do not hardcode in schema — they are inserted as data.
- **Changing AUTH_SECRET on running containers without session invalidation:** Rotating from `NOAH_AUTH_SECRET` → shared `AUTH_SECRET` will invalidate all existing sessions. Operators must be aware and logged-in users will be redirected to login. Document in migration notes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT session encryption | Custom AES encryption of session tokens | NextAuth v5 `session: { strategy: 'jwt' }` with `AUTH_SECRET` | Already proven in codebase; `ws-proxy.js` decodes via `next-auth/jwt` decode |
| Password hashing for hub_users | Custom hash function | `bcrypt-ts` (already in `package.json`) | Same library used in `lib/db/users.js` — `hashSync`/`compare` |
| SQLite connection pooling | Custom pool manager | `better-sqlite3` singleton (synchronous) | Already the project pattern; better-sqlite3 handles concurrency via WAL mode |
| Cookie domain config | Custom cookie manipulation | NextAuth `cookies` config with `domain: ".scalingengine.com"` | Auth.js v5 handles `Set-Cookie` with proper domain attribute |

**Key insight:** Every problem in this phase already has a solved pattern in the codebase. The planner should not introduce any new primitives — this phase is purely wiring existing patterns together.

---

## Runtime State Inventory

> This is NOT a rename/refactor phase. No runtime state inventory required.

---

## Common Pitfalls

### Pitfall 1: Edge Runtime vs Node Runtime confusion
**What goes wrong:** `lib/auth/edge-config.js` is used in Next.js middleware (Edge Runtime). If a `better-sqlite3` import is added at the top level (even indirect), the build fails with "Module not found: Can't resolve 'better-sqlite3'" in edge context.
**Why it happens:** Edge Runtime runs in a V8 isolate without Node.js native addons. `better-sqlite3` is a native addon.
**How to avoid:** All hub DB imports in `edge-config.js` callbacks MUST be dynamic `await import()` inside the `if (user)` branch, guarded by `process.env.SUPERADMIN_HUB === 'true'`. The `if (user)` branch only runs during sign-in, not on every JWT refresh — safe.
**Warning signs:** Build error mentioning `better-sqlite3` or `bindings` in edge context.

### Pitfall 2: AUTH_SECRET rotation breaks existing sessions
**What goes wrong:** Changing `NOAH_AUTH_SECRET` → shared `AUTH_SECRET` in docker-compose invalidates all cookies encrypted under the old secret. Logged-in users get redirect-to-login on next page load.
**Why it happens:** NextAuth encrypts session JWTs with `AUTH_SECRET`. Different value = cannot decrypt existing cookies.
**How to avoid:** This is expected and acceptable. Document in the docker-compose commit message and operator notes. The middleware's stale session cookie cleanup (already in `lib/auth/middleware.js` lines 37-48) handles the redirect gracefully.
**Warning signs:** Users report being logged out after deploy — this is correct behavior, not a bug.

### Pitfall 3: assignedAgents not persisted across JWT refreshes
**What goes wrong:** `assignedAgents` is written to the token when `user` is present (i.e., sign-in event only). On subsequent requests, `user` is `undefined` and the claim disappears from refreshed tokens.
**Why it happens:** NextAuth v5 JWT callback receives `user` only on first sign-in. Subsequent calls (token refresh from cookie) have `user: undefined`.
**How to avoid:** In the JWT callback, preserve the existing `assignedAgents` value when `user` is absent:
```javascript
async jwt({ token, user }) {
  if (user) {
    token.role = user.role;
    token.assignedAgents = /* fresh query */;
  }
  // token.assignedAgents already present from previous sign-in
  return token;
}
```
**Warning signs:** `session.user.assignedAgents` is undefined after the first page refresh.

### Pitfall 4: Cross-subdomain cookie not sent due to SameSite=Lax
**What goes wrong:** NextAuth v5 default cookie settings use `SameSite=Lax`. A cookie set at `clawforge.scalingengine.com` with `domain: ".scalingengine.com"` should be sent to `noah.scalingengine.com`, but SameSite=Lax restricts cross-site top-level navigation only.
**Why it happens:** SameSite=Lax allows cross-site GET navigations (e.g., link click) but restricts POSTs. For same-eTLD+1 (both under `scalingengine.com`), browsers treat this as same-site — cookie IS sent.
**How to avoid:** This is not actually a problem. `clawforge.scalingengine.com` and `noah.scalingengine.com` share the same eTLD+1 (`scalingengine.com`), so SameSite=Lax does not block the cookie. No special SameSite configuration needed.
**Warning signs (false alarm):** If session doesn't carry to instance subdomains — check that `domain: ".scalingengine.com"` is set, not that SameSite needs changing.

### Pitfall 5: NextAuth v5 beta cookie config API
**What goes wrong:** NextAuth v5 beta (currently 5.0.0-beta.30) has evolving cookie config API. The `domain` setting is set via the `cookies` config option, not `session.cookie`.
**Why it happens:** NextAuth v5 restructured config from v4.
**How to avoid:** Set cookie domain in `authConfig`:
```javascript
// lib/auth/edge-config.js
export const authConfig = {
  session: { strategy: 'jwt' },
  cookies: {
    sessionToken: {
      options: {
        domain: process.env.NODE_ENV === 'production' ? '.scalingengine.com' : undefined,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    },
  },
  // ...
};
```
**Warning signs:** Cookie is set but not sent to instance subdomains — inspect `Set-Cookie` response header to verify `Domain=.scalingengine.com` is present.

### Pitfall 6: Hub auth vs instance auth — login page reads from wrong DB
**What goes wrong:** The instance `authorize()` in `lib/auth/config.js` calls `getUserByEmail()` which queries `clawforge.sqlite` (instance DB). On the hub, users must log in against `hub.sqlite` (hub DB).
**Why it happens:** Hub is a clawforge instance — it runs the same code. Without a guard, login on the hub queries the instance users table (which may be empty).
**How to avoid:** Add a `SUPERADMIN_HUB` guard in `lib/auth/config.js`:
```javascript
async authorize(credentials) {
  if (process.env.SUPERADMIN_HUB === 'true') {
    const { getHubUserByEmail, verifyPassword } = await import('../db/hub-users.js');
    const user = getHubUserByEmail(credentials.email);
    // ...
  } else {
    const { getUserByEmail, verifyPassword } = await import('../db/users.js');
    // existing path
  }
}
```
**Warning signs:** Login on hub fails with "no user found" despite user being created, because it's querying the wrong SQLite file.

---

## Code Examples

Verified patterns from existing codebase:

### nextauth/jwt decode (existing ws-proxy.js pattern — reusable for spoke validation)
```javascript
// lib/code/ws-proxy.js:16-24 — exact pattern for decoding hub-issued JWTs on any instance
import { decode } from 'next-auth/jwt';
const token = await decode({
  token: cookieValue,
  secret: process.env.AUTH_SECRET,
  salt: cookieName, // 'authjs.session-token' or '__Secure-authjs.session-token'
});
// token.sub = user ID, token.role = role, token.assignedAgents = ['noah', 'strategyES']
```

### Drizzle schema definition (existing pattern)
```javascript
// lib/db/schema.js:3-10 — pattern for hub_users table
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

### Drizzle select with eq (existing lib/db/users.js pattern)
```javascript
// lib/db/users.js:23-26
import { eq } from 'drizzle-orm';
export function getUserByEmail(email) {
  const db = getDb();
  return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
}
```

### getDb singleton (exact pattern to mirror for getHubDb)
```javascript
// lib/db/index.js:16-27
let _db = null;
export function getDb() {
  if (!_db) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const sqlite = new Database(clawforgeDb);
    sqlite.pragma('journal_mode = WAL');
    _db = drizzle(sqlite, { schema });
  }
  return _db;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate AUTH_SECRET per instance | Shared AUTH_SECRET across hub+instances | Phase 53 | JWTs minted by hub are valid on all spokes |
| No hub user registry | hub_users in hub.sqlite | Phase 53 | Central login authority |
| No agent assignments | agent_assignments table | Phase 53 | Session carries assignedAgents claim |

**Current state of docker-compose.yml:**
- Instance containers (`noah-event-handler`, `ses-event-handler`) already have NO `ports:` mappings.
- Only `traefik` exposes ports 80 and 443 to the host.
- AUTH-05 (no host port bindings) is architecturally already satisfied. The task is to verify, comment, and document.

---

## Open Questions

1. **Hub container in docker-compose.yml**
   - What we know: The hub runs at `clawforge.scalingengine.com`. The current `docker-compose.yml` has `noah-event-handler` and `ses-event-handler` — neither is labeled as the hub. In the v4.0 architecture, one of the instances IS the hub (SUPERADMIN_HUB=true).
   - What's unclear: Does Phase 53 add a separate hub container, or does the existing noah container become the hub? From ROADMAP context, `clawforge.scalingengine.com` is the hub URL — likely a new hub container.
   - Recommendation: Based on the phase scope (foundational auth), Phase 53 should add a `hub-event-handler` container to docker-compose.yml with `SUPERADMIN_HUB=true` and the shared `AUTH_SECRET`. This is required for the hub SQLite DB to be initialized. If this is deferred to Phase 55 (proxy setup), the hub-schema tables still need to exist on the designated hub instance.

2. **First hub admin user creation**
   - What we know: The existing `createFirstUser()` function in `lib/db/users.js` creates the first admin in the instance DB. The hub will need the same mechanism for `hub.sqlite`.
   - What's unclear: Does Phase 53 add a `createFirstHubUser()` function and wire it to the `/login` setup flow?
   - Recommendation: Yes — hub login page must be able to bootstrap. Add `getHubUserCount()` + `createFirstHubUser()` to `lib/db/hub-users.js`, mirroring the instance pattern. The setup form on the hub uses these instead of the instance functions.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| better-sqlite3 | Hub DB (hub.sqlite) | Yes | ^12.6.2 | — |
| drizzle-orm | Hub schema + queries | Yes | ^0.44.0 | — |
| drizzle-kit | Generate hub migration SQL | Yes | ^0.31.9 | — |
| next-auth | JWT callbacks + session | Yes | 5.0.0-beta.30 | — |
| Node.js crypto | AUTH_SECRET usage | Yes | Built-in (Node 22) | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (package.json test: "echo 'No tests yet' && exit 0") |
| Config file | None |
| Quick run command | `npm test` (no-op) |
| Full suite command | `npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Login at hub, session valid on instance | manual-only | — | N/A |
| AUTH-02 | hub.sqlite created with hub_users + agent_assignments | smoke | `node -e "require('./lib/db/hub.js').getHubDb()"` | ❌ Wave 0 |
| AUTH-03 | JWT contains assignedAgents after login | manual-only | — | N/A |
| AUTH-04 | Both containers use same AUTH_SECRET | config-verify | `grep AUTH_SECRET docker-compose.yml` | ✅ |
| AUTH-05 | No ports: on instance containers | config-verify | `grep -A5 'noah-event-handler:' docker-compose.yml | grep ports` | ✅ |

**Manual-only justification:** AUTH-01 and AUTH-03 require a running Next.js server with two Docker containers and a real browser session — not automatable in < 30 seconds.

### Sampling Rate
- **Per task commit:** `npm run build` (catches any import errors, edge-config issues)
- **Per wave merge:** `npm run build`
- **Phase gate:** Manual smoke test — log in at hub, inspect JWT `assignedAgents` claim via browser DevTools Application > Cookies

### Wave 0 Gaps
- [ ] No formal test framework — existing pattern is manual + build verification. No test infrastructure to create; proceed with build verification + manual smoke test as gate.

---

## Project Constraints (from CLAUDE.md)

Directives from `./CLAUDE.md` (clawforge) that constrain implementation:

- **Docker isolation is non-negotiable** — separate Docker networks per instance must be maintained. Adding a hub container does not exempt it from this rule.
- **`--allowedTools` whitelist, NEVER `--dangerously-skip-permissions`** — this is a job container rule, does not apply to Phase 53 hub auth work.
- **Do-not-touch list** (from STATE.md): `lib/superadmin/client.js`, `verifySuperadminToken()` in `api/superadmin.js`, `lib/db/job-outcomes.js`, `waitAndNotify` pattern, existing role guards in `lib/auth/middleware.js` (additive only), `lib/ai/agent.js`, `terminalCosts`/`terminalSessions` tables, `lib/ws/` WebSocket proxy, `lib/db/config.js`.
- **Node crypto (AES-256-GCM) for all encryption** — `bcrypt-ts` for passwords (same as current), `AUTH_SECRET` for JWT (NextAuth handles this internally).
- **Relative imports only** — no `thepopebot/*` package imports.
- **`lib/chat/components/*.js` is gitignored** (esbuild output) — source must be `.jsx`. Not relevant to Phase 53 (no UI components).

---

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection: `lib/auth/edge-config.js`, `lib/auth/config.js`, `lib/auth/middleware.js`, `lib/db/index.js`, `lib/db/schema.js`, `lib/db/users.js`, `lib/code/ws-proxy.js`, `lib/superadmin/config.js`, `docker-compose.yml`
- `package.json` inspection: confirmed next-auth@5.0.0-beta.30, Next.js 15.5.12, drizzle-orm@^0.44.0, better-sqlite3@^12.6.2

### Secondary (MEDIUM confidence)
- STATE.md v4.0 decisions section — all locked architectural decisions verified against codebase
- CONTEXT.md — implementation decisions already researched and locked during discuss phase

### Tertiary (LOW confidence)
- NextAuth v5 beta cookie `domain` config API — may have changed between beta versions. Verified against STATE.md flag "known edge cases in GitHub issues #6881 and #10915". The fallback (shared AUTH_SECRET with spoke-side JWT validation) is already implemented in `ws-proxy.js`.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries directly verified in `package.json` and `node_modules`
- Architecture: HIGH — patterns directly extracted from existing codebase files
- Pitfalls: HIGH for edge/node runtime and DB routing; MEDIUM for NextAuth v5 beta cookie domain (beta API may vary)

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable stack; NextAuth v5 beta changes could invalidate cookie config within 30 days)
