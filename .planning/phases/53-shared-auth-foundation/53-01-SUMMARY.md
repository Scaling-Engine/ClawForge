---
phase: 53-shared-auth-foundation
plan: "01"
subsystem: hub-db
tags: [hub, sqlite, drizzle, auth, multi-tenant]
dependency_graph:
  requires: []
  provides: [hub-sqlite-db, hub-user-crud, hub-db-init]
  affects: [53-02, instrumentation]
tech_stack:
  added: []
  patterns: [drizzle-singleton, create-table-if-not-exists, bcrypt-ts-password-hashing]
key_files:
  created:
    - lib/db/hub-schema.js
    - lib/db/hub.js
    - lib/db/hub-users.js
  modified:
    - lib/paths.js
    - config/instrumentation.js
decisions:
  - "Hub DB uses CREATE TABLE IF NOT EXISTS (not migration journal) — hub.sqlite is brand new with no legacy migrations, simpler and idempotent"
  - "initHubDatabase closes its own sqlite connection and nulls _hubDb to force clean singleton re-creation on first getHubDb() call"
  - "Hub init guarded by SUPERADMIN_HUB=true env var — non-hub instances skip hub DB entirely"
metrics:
  duration_minutes: 8
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_modified: 5
---

# Phase 53 Plan 01: Hub SQLite DB Foundation Summary

Hub SQLite database foundation created — second SQLite file (`data/hub.sqlite`) with `hub_users` and `agent_assignments` tables, Drizzle singleton, full user CRUD, and server startup wiring guarded by `SUPERADMIN_HUB=true`.

## What Was Built

Two new tables in a separate `hub.sqlite` file:
- `hub_users` — central user registry (id, email, password_hash, role, timestamps)
- `agent_assignments` — maps users to agent slugs with per-agent roles

Three new lib files:
- `lib/db/hub-schema.js` — Drizzle table definitions
- `lib/db/hub.js` — `getHubDb()` singleton + `initHubDatabase()` using `CREATE TABLE IF NOT EXISTS`
- `lib/db/hub-users.js` — `getHubUserCount`, `getHubUserByEmail`, `createFirstHubUser`, `verifyHubPassword`, `getAgentSlugsForUser`

One path export added to `lib/paths.js`:
- `hubDb = process.env.HUB_DATABASE_PATH || path.join(PROJECT_ROOT, 'data', 'hub.sqlite')`

Server startup wired in `config/instrumentation.js` after existing `initDatabase()` call.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Hub DB schema, singleton, user functions | 4e6eea5 | lib/db/hub-schema.js, lib/db/hub.js, lib/db/hub-users.js, lib/paths.js |
| 2 | Wire hub DB init into server startup | 227a67b | config/instrumentation.js |

## Verification Results

- `getHubUserCount()` returns 0 on empty DB
- `createFirstHubUser()` creates admin user with hashed password
- `getHubUserByEmail()` retrieves user by email
- `getAgentSlugsForUser()` returns empty array for user with no assignments
- `npm run build` succeeds without errors

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all functions fully implemented.

## Self-Check: PASSED

- lib/db/hub-schema.js — FOUND
- lib/db/hub.js — FOUND
- lib/db/hub-users.js — FOUND
- lib/paths.js (hubDb export) — FOUND
- config/instrumentation.js (SUPERADMIN_HUB guard) — FOUND
- Commit 4e6eea5 — FOUND
- Commit 227a67b — FOUND
