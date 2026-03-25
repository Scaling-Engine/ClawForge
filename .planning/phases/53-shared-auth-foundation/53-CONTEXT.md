# Phase 53: Shared Auth Foundation - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Users can log in once at the hub and have all their agent assignments embedded in their session — and instance containers are not reachable from the internet. This phase creates the hub SQLite DB (hub_users + agent_assignments tables), extends NextAuth JWT to carry assignedAgents claim, standardizes AUTH_SECRET across all containers, and removes host port bindings from instance containers.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key research decisions already locked (from STATE.md v4.0 decisions):
- Hub DB: Second SQLite file `data/hub.sqlite` with separate Drizzle schema `lib/db/hub-schema.js`
- Cross-subdomain session: `domain: ".scalingengine.com"` on NextAuth session cookie config
- Spoke Bearer auth: Additive — spoke `/api/*` routes accept `AGENT_SUPERADMIN_TOKEN` Bearer on all routes
- Instance port isolation: Remove `ports:` from instance containers in production docker-compose.yml
- No new dependencies — extends existing stack

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/auth/edge-config.js` — Edge-safe auth config with JWT callbacks (token.role, session.user.role)
- `lib/auth/config.js` — NextAuth setup with Credentials provider, imports from edge-config.js
- `lib/db/schema.js` — Drizzle ORM schema (users, chats, messages, settings, etc.)
- `lib/db/index.js` — getDb() singleton pattern for SQLite
- `lib/db/users.js` — getUserByEmail, verifyPassword
- `lib/superadmin/client.js` — queryAllInstances(), SUPERADMIN_INSTANCES parsing
- `lib/superadmin/config.js` — SUPERADMIN_HUB detection
- `api/superadmin.js` — verifySuperadminToken() pattern
- `lib/code/ws-proxy.js` — Decodes NextAuth JWTs using AUTH_SECRET directly

### Established Patterns
- SQLite via better-sqlite3 + Drizzle ORM (synchronous queries)
- JWT session strategy with role claim
- AGENT_SUPERADMIN_TOKEN for M2M auth between hub and instances
- getDb() singleton with lazy initialization
- AES-256-GCM encryption via Node crypto in lib/db/crypto.js

### Integration Points
- `lib/auth/edge-config.js` — JWT callback needs `assignedAgents` claim added
- `lib/auth/config.js` — Credentials authorize() needs to read from hub DB
- `docker-compose.yml` — Instance services need ports removed
- `lib/auth/middleware.js` — Needs `/agents/*` route protection

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
