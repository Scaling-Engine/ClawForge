---
phase: 53-shared-auth-foundation
plan: "02"
subsystem: auth
tags: [jwt, session, nextauth, hub, docker-compose, middleware]
dependency_graph:
  requires: ["53-01"]
  provides: ["hub-jwt-claims", "hub-aware-login", "shared-auth-secret", "agents-route-guard"]
  affects: ["lib/auth/edge-config.js", "lib/auth/config.js", "lib/auth/middleware.js", "docker-compose.yml"]
tech_stack:
  added: []
  patterns: ["SUPERADMIN_HUB env guard", "dynamic import in jwt callback", "shared AUTH_SECRET across containers"]
key_files:
  created: []
  modified:
    - lib/auth/edge-config.js
    - lib/auth/config.js
    - lib/auth/middleware.js
    - docker-compose.yml
decisions:
  - "Dynamic import for hub-users.js inside jwt callback keeps edge-config.js Edge Runtime safe"
  - "assignedAgents defaults to [] on token if undefined — prevents undefined leaking to server components"
  - "SUPERADMIN_HUB guard in both config.js and edge-config.js — orthogonal code paths, both need the gate"
  - "Shared AUTH_SECRET replaces per-instance NOAH_AUTH_SECRET/SES_AUTH_SECRET — hub-minted tokens valid on all instances"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-25"
  tasks: 2
  files_modified: 4
  commits: 2
---

# Phase 53 Plan 02: JWT Session Claims, Hub-Aware Login, and Route Protection Summary

JWT callback extended with hub agent assignments, cross-subdomain cookie configured, hub login path wired to hub_users table, shared AUTH_SECRET consolidated in docker-compose.yml, and /agents/* middleware guard added.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend JWT callback with assignedAgents claim and cross-subdomain cookie | ed0e194 | lib/auth/edge-config.js |
| 2 | Hub-aware authorize, middleware guard, and docker-compose AUTH_SECRET | aed3daa | lib/auth/config.js, lib/auth/middleware.js, docker-compose.yml |

## What Was Built

### Task 1 — lib/auth/edge-config.js

- `jwt` callback made `async` (required for dynamic import at sign-in)
- On sign-in (`user` is defined): queries `getAgentSlugsForUser(user.id)` and sets `token.assignedAgents` — guarded by `SUPERADMIN_HUB === 'true'` to prevent hub DB access on instance containers
- On JWT refresh (`user` is undefined): `token.assignedAgents` falls through unchanged (persists across refreshes)
- `session` callback: sets `session.user.assignedAgents = token.assignedAgents ?? []`
- `cookies` config: `domain: '.scalingengine.com'` in production, `undefined` in development — cross-subdomain session sharing for the hub-to-instance navigation pattern
- The dynamic import `await import('../db/hub-users.js')` is ONLY inside `if (user) { if (SUPERADMIN_HUB) }` — never at module level (Edge Runtime safety)

### Task 2 — Three files

**lib/auth/config.js:** `authorize()` now branches on `SUPERADMIN_HUB`:
- Hub path: `getHubUserByEmail` + `verifyHubPassword` from `../db/hub-users.js`
- Instance path: original `getUserByEmail` + `verifyPassword` from `../db/users.js` (unchanged behavior)

**lib/auth/middleware.js:** Added `/agents/*` guard before the admin guard block. Intentionally explicit (redundant with catch-all) to satisfy AUTH-05 requirement criterion and remain in place when /agents/* routes are built in Phase 54+.

**docker-compose.yml:**
- `AUTH_SECRET: ${NOAH_AUTH_SECRET}` → `AUTH_SECRET: ${AUTH_SECRET}` on noah-event-handler
- `AUTH_SECRET: ${SES_AUTH_SECRET}` → `AUTH_SECRET: ${AUTH_SECRET}` on ses-event-handler
- Added comment explaining shared secret semantics
- Added AUTH-05 comments above each instance service (no `ports:` mapping — only Traefik exposes 80/443)

## Verification Results

All 6 plan verification checks pass:
1. `grep -c "assignedAgents" lib/auth/edge-config.js` → 3 (token assignment + passthrough comment + session assignment)
2. `SUPERADMIN_HUB` guard in both `lib/auth/config.js` and `lib/auth/edge-config.js`
3. `AUTH_SECRET: ${AUTH_SECRET}` present on both instances
4. `NOAH_AUTH_SECRET` / `SES_AUTH_SECRET` count in docker-compose.yml → 0
5. `pathname.startsWith('/agents')` in middleware.js
6. `npm run build` → succeeds in 25ms

## Decisions Made

1. **Dynamic import placement:** The `await import('../db/hub-users.js')` must be inside `if (user) { if (SUPERADMIN_HUB) }` — not at module level. Edge Runtime cannot execute better-sqlite3. The dynamic import path only executes during sign-in on the Node.js runtime.

2. **assignedAgents defaults to []:** `token.assignedAgents ?? []` in the session callback prevents `undefined` from leaking to server components when the hub path is inactive.

3. **Both files get SUPERADMIN_HUB guard:** `edge-config.js` (jwt callback) and `config.js` (authorize) are independent code paths executed at different points in the auth lifecycle — both need the guard.

4. **Shared AUTH_SECRET via single env var:** All containers now reference `${AUTH_SECRET}` from `.env`. A JWT minted by the hub at login decodes successfully on any instance container, enabling cross-subdomain session reuse.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no placeholder data or hardcoded values introduced.

## Self-Check: PASSED

Files exist:
- lib/auth/edge-config.js: FOUND
- lib/auth/config.js: FOUND
- lib/auth/middleware.js: FOUND
- docker-compose.yml: FOUND

Commits exist:
- ed0e194: FOUND (feat(53-02): extend JWT callback)
- aed3daa: FOUND (feat(53-02): hub-aware authorize)
