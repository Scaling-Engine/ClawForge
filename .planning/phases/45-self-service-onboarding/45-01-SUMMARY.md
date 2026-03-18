---
phase: 45-self-service-onboarding
plan: 01
subsystem: onboarding
tags: [onboarding, sqlite, middleware, server-component]
dependency_graph:
  requires: []
  provides: [onboarding_state table, onboarding state module, onboarding redirect guard, onboarding page shell]
  affects: [lib/auth/middleware.js, lib/db/schema.js, api/superadmin.js]
tech_stack:
  added: []
  patterns: [singleton-row sqlite, drizzle-orm synchronous query, edge-runtime env-var guard, server-component completion check]
key_files:
  created:
    - lib/onboarding/state.js
    - lib/chat/components/onboarding-wizard.jsx
    - templates/app/onboarding/page.js
  modified:
    - lib/db/schema.js
    - lib/auth/middleware.js
    - api/superadmin.js
    - lib/chat/components/index.js
decisions:
  - "Singleton onboarding row uses id='singleton' — only one onboarding state per instance"
  - "Middleware uses env var only (ONBOARDING_ENABLED) — no DB import allowed in Edge Runtime"
  - "Page-level Server Component does the real completion check (state.completedAt) to break redirect loop"
  - "Wizard stub is .jsx source so esbuild compiles it — .js output gitignored per project convention"
metrics:
  duration: ~8 min
  completed: "2026-03-17"
  tasks_completed: 2
  files_changed: 6
requirements: [ONB-01, ONB-02]
---

# Phase 45 Plan 01: Onboarding Foundation Summary

**One-liner:** SQLite singleton onboarding_state table with synchronous CRUD module, Edge Runtime env-var redirect guard, and Server Component completion check to prevent redirect loops.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Schema + state module + superadmin endpoint | a65569a | lib/db/schema.js, lib/onboarding/state.js, api/superadmin.js |
| 2 | Middleware redirect + onboarding page shell | c12ae40 | lib/auth/middleware.js, templates/app/onboarding/page.js, lib/chat/components/onboarding-wizard.jsx |

## What Was Built

### onboarding_state table (lib/db/schema.js)
Singleton row table with `id='singleton'` pattern. Columns track wizard position (`current_step`), per-step status (`github_connect`, `docker_verify`, `channel_connect`, `first_job`), and completion timestamp (`completed_at` as nullable ISO string).

### State module (lib/onboarding/state.js)
Synchronous better-sqlite3/Drizzle functions:
- `getOnboardingState()` — returns singleton row or null
- `upsertOnboardingStep(step, status)` — creates row on first call, advances `current_step` when step completes
- `markOnboardingComplete()` — sets `completed_at` ISO timestamp
- `resetOnboardingState()` — deletes singleton (testing/re-onboarding)

### Middleware redirect guard (lib/auth/middleware.js)
Fires only when `ONBOARDING_ENABLED === 'true'` and user is authenticated. Excludes `/onboarding` and `/api` paths. No DB imports — Edge Runtime safe.

### Onboarding page shell (templates/app/onboarding/page.js)
Server Component that calls `getOnboardingState()` and redirects to `/` when `completedAt` is set — this is the loop-breaker. Renders `<OnboardingWizard>` stub otherwise.

### Wizard stub (lib/chat/components/onboarding-wizard.jsx)
Minimal `'use client'` component returning a loading placeholder. Replaced by full wizard UI in Plan 02.

### Superadmin endpoint (api/superadmin.js)
Added `case 'onboarding'` to the switch — returns `{ onboarding: getOnboardingState() }` via dynamic import pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wizard component source file extension**
- **Found during:** Task 2 commit
- **Issue:** Plan specified creating `lib/chat/components/onboarding-wizard.js` but `lib/chat/components/*.js` is gitignored (esbuild output directory). Creating a `.js` file there would be ignored by git.
- **Fix:** Created `onboarding-wizard.jsx` as the source file (tracked by git), added export to `index.js`, updated template page import to use `index.js`. Esbuild compiles `.jsx` → `.js` at build time.
- **Files modified:** lib/chat/components/onboarding-wizard.jsx (created), lib/chat/components/index.js (export added), templates/app/onboarding/page.js (import updated)
- **Commit:** c12ae40

## Self-Check: PASSED

Files verified:
- lib/onboarding/state.js: FOUND
- lib/chat/components/onboarding-wizard.jsx: FOUND
- templates/app/onboarding/page.js: FOUND

Commits verified:
- a65569a: FOUND (Task 1 — schema + state + superadmin)
- c12ae40: FOUND (Task 2 — middleware + page shell + wizard stub)

Build: PASSED (exit 0)
