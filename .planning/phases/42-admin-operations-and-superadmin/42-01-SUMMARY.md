---
phase: 42-admin-operations-and-superadmin
plan: 01
subsystem: admin
tags: [drizzle, sqlite, server-actions, react, admin-ui, crud]

# Dependency graph
requires:
  - phase: 33-admin-panel
    provides: admin layout, requireAdmin guard, settings table schema
provides:
  - DB-backed repo CRUD (lib/db/repos.js) replacing file-only REPOS.json
  - Server Actions for repo management, config editing, instance overview
  - Admin Repos page with full CRUD form UI
  - Admin General page with grouped config editing
  - Admin Instances page with status and job overview
affects: [42-02-superadmin, job-dispatch, repo-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns: [settings-table-json-storage, lazy-file-to-db-migration, per-field-save-config-ui]

key-files:
  created:
    - lib/db/repos.js
    - lib/chat/components/admin-repos-page.jsx
    - lib/chat/components/admin-general-page.jsx
    - lib/chat/components/admin-instances-page.jsx
    - templates/app/admin/repos/page.js
    - templates/app/admin/general/page.js
    - templates/app/admin/instances/page.js
  modified:
    - lib/tools/repos.js
    - lib/chat/actions.js
    - lib/chat/components/admin-layout.jsx
    - lib/chat/components/icons.jsx
    - lib/chat/components/index.js
    - templates/app/admin/page.js

key-decisions:
  - "Repos stored as JSON array in settings table (type='repos', key='all') rather than a dedicated repos table"
  - "Lazy auto-migration from REPOS.json file to DB on first getRepos() call with _migrated flag"
  - "Config allowlist pattern: only CONFIG_ALLOWLIST keys can be updated via updateConfigAction"
  - "Secret keys (ASSEMBLYAI_API_KEY, BRAVE_API_KEY) masked in getConfigValues response (last 4 chars only)"

patterns-established:
  - "Settings table JSON storage: type+key to store structured data as JSON in the settings table"
  - "Per-field save pattern: each config field has its own save button with success/error feedback"
  - "File-to-DB lazy migration: check DB first, migrate from file on first access if DB empty"

requirements-completed: [OPS-03, OPS-04, OPS-05]

# Metrics
duration: 25min
completed: 2026-03-17
---

# Phase 42 Plan 01: Admin Operations Summary

**DB-backed repo CRUD, platform config editing UI, and instance overview with lazy REPOS.json migration**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-17T03:00:00Z
- **Completed:** 2026-03-17T03:25:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Full repo CRUD via admin UI backed by settings table with transparent migration from REPOS.json
- Platform config editing page with grouped sections (LLM, Execution, Integrations, Slack) and per-field save
- Instance overview page showing name, status, repos, and active job count
- Three new admin nav items (General, Repos, Instances) wired into admin layout

## Task Commits

Each task was committed atomically:

1. **Task 1: Repo DB layer + Server Actions + loadAllowedRepos migration** - `2881291` (feat)
2. **Task 2: Admin UI pages -- Repos, General, Instances + navigation wiring** - `51e49f3` (feat)

Additional fix commit:
3. **Icons source fix** - `3ccf63a` (fix) - Added DatabaseIcon and SettingsSliderIcon to icons.jsx source

## Files Created/Modified
- `lib/db/repos.js` - DB-backed repo CRUD using settings table (getRepos, addRepo, updateRepo, deleteRepo, migrateReposFromFile)
- `lib/tools/repos.js` - Modified loadAllowedRepos to read from DB first with file fallback
- `lib/chat/actions.js` - Added 7 Server Actions (repo CRUD, config values, config update, instances overview)
- `lib/chat/components/admin-repos-page.jsx` - Repo list with inline add/edit form and delete confirmation
- `lib/chat/components/admin-general-page.jsx` - Grouped config editing with per-field save and secret masking
- `lib/chat/components/admin-instances-page.jsx` - Instance cards with status, repos list, active job count
- `lib/chat/components/admin-layout.jsx` - Added General, Repos, Instances nav items with icons
- `lib/chat/components/icons.jsx` - Added DatabaseIcon and SettingsSliderIcon
- `lib/chat/components/index.js` - Added exports for three new page components
- `templates/app/admin/repos/page.js` - Page shell for AdminReposPage
- `templates/app/admin/general/page.js` - Page shell for AdminGeneralPage
- `templates/app/admin/instances/page.js` - Page shell for AdminInstancesPage
- `templates/app/admin/page.js` - Redirect changed from /admin/crons to /admin/general

## Decisions Made
- **Settings table JSON storage**: Stored repos as a JSON array in the settings table (type='repos', key='all') rather than creating a new table. This avoids a schema migration and reuses existing infrastructure.
- **Lazy migration**: File-to-DB migration happens automatically on first `getRepos()` call if DB is empty. The `_migrated` flag prevents repeated file reads.
- **Config allowlist**: `updateConfigAction` validates keys against a hardcoded allowlist to prevent arbitrary config writes.
- **Secret masking**: `getConfigValues` returns only last 4 chars for secret keys, with a "Set" indicator if configured.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Icons added to compiled output instead of source**
- **Found during:** Task 2 (admin UI pages)
- **Issue:** DatabaseIcon and SettingsSliderIcon were initially added to `icons.js` (compiled output, gitignored) instead of `icons.jsx` (source file)
- **Fix:** Added both icons to `icons.jsx` source file following existing patterns
- **Files modified:** `lib/chat/components/icons.jsx`
- **Verification:** `npm run build` passes, compiled output regenerated correctly
- **Committed in:** `3ccf63a`

**2. [Rule 3 - Blocking] ESM require() in tools/repos.js**
- **Found during:** Task 1 (loadAllowedRepos migration)
- **Issue:** Initially used `require('../db/repos.js')` which fails in ESM project
- **Fix:** Changed to static `import { getRepos as getDbRepos } from '../db/repos.js'` with try/catch in function body
- **Files modified:** `lib/tools/repos.js`
- **Verification:** Build passes, no require() calls
- **Committed in:** `2881291` (part of Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- Gitignored compiled .js files were initially staged for Task 2 commit; resolved by removing them and only committing .jsx source files.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin operations foundation complete with repo CRUD, config editing, and instance overview
- Ready for Phase 42 Plan 02 (Superadmin cross-instance management)
- `loadAllowedRepos()` callers (agent tools, job dispatch) continue working unchanged via DB-first fallback

## Self-Check: PASSED

All 7 created files verified on disk. All 3 commit hashes (2881291, 51e49f3, 3ccf63a) verified in git log.

---
*Phase: 42-admin-operations-and-superadmin*
*Completed: 2026-03-17*
