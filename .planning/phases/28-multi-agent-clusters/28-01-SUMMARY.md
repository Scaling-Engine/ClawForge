---
phase: 28-multi-agent-clusters
plan: 01
subsystem: database
tags: [sqlite, drizzle, docker, cluster, multi-agent]

# Dependency graph
requires: []
provides:
  - lib/cluster/config.js — loadClusterConfig, getCluster, validateClusterConfig with optional filePath override for testability
  - lib/cluster/volume.js — clusterVolumeNameFor, ensureClusterVolume, copyOutboxToInbox
  - lib/db/schema.js — clusterRuns and clusterAgentRuns Drizzle tables
  - lib/db/cluster-runs.js — createClusterRun, updateClusterRun, createAgentRun, updateAgentRun, getClusterRuns, getClusterRunDetail
  - lib/paths.js — clusterFile export
  - drizzle/0006_cluster_tables.sql — migration for production DB
affects: [28-02, 28-03, 28-04, all subsequent cluster plans]

# Tech tracking
tech-stack:
  added: []
  patterns: [node built-in test runner for unit tests, optional filePath override for testable file loaders, clawforge-cluster-{runId}-{agentIndex} naming convention]

key-files:
  created:
    - lib/cluster/config.js
    - lib/cluster/volume.js
    - lib/db/cluster-runs.js
    - drizzle/0006_cluster_tables.sql
    - lib/cluster/config.test.js
    - lib/cluster/volume.test.js
    - lib/db/cluster-runs.test.js
  modified:
    - lib/paths.js
    - lib/db/schema.js
    - drizzle/meta/_journal.json

key-decisions:
  - "loadClusterConfig accepts optional filePath override so tests can point to fixtures without process.cwd() hacks"
  - "clusterVolumeNameFor uses clawforge-cluster-{runId}-{agentIndex} — the 'cluster' segment prevents collision with job volumes (clawforge-{instance}-{slug}) and workspace volumes (clawforge-ws-*)"
  - "Migration file added (0006_cluster_tables.sql) so initDatabase() creates tables in production — plan said no migration needed but that was incorrect for this Drizzle setup"
  - "DB tests use a temp file SQLite DB with manually created tables to avoid migration runner dependency in tests"

patterns-established:
  - "Cluster volume naming: clawforge-cluster-{runId}-{agentIndex}"
  - "Config file loaders: accept optional filePath override for testability without mocking process.cwd()"
  - "DB CRUD modules: follow workspaces.js pattern (getDb singleton, drizzle query builder, no raw SQL)"
  - "Unit tests: node:test built-in runner, no external test framework"

requirements-completed: [CLST-01, CLST-05, CLST-10]

# Metrics
duration: 4min
completed: 2026-03-12
---

# Phase 28 Plan 01: Multi-Agent Cluster Foundation Summary

**CLUSTER.json config loader with validation, per-agent volume naming (clawforge-cluster-{runId}-{n}), and SQLite cluster_runs/cluster_agent_runs tables with full CRUD helpers**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-12T18:20:17Z
- **Completed:** 2026-03-12T18:24:05Z
- **Tasks:** 2
- **Files modified:** 9 (3 created test files, 4 created implementation files, 2 modified)

## Accomplishments
- Config loader reads CLUSTER.json, validates cluster/role structure, returns graceful empty on missing file
- Volume naming utility produces collision-safe names distinguishable from job and workspace volumes
- Two new Drizzle tables (clusterRuns, clusterAgentRuns) with FK relationship and all required columns
- Full CRUD helpers: create/update for both tables, list with ordering, detail with joined agent runs
- 28 unit tests, all passing, using Node built-in test runner

## Task Commits

Each task was committed atomically (TDD = RED + GREEN commits):

1. **Task 1 RED: Cluster config/volume tests** - `5f693e3` (test)
2. **Task 1 GREEN: Config loader, volume naming, paths export** - `76bc51a` (feat)
3. **Task 2 RED: DB CRUD tests** - `078e3f9` (test)
4. **Task 2 GREEN: DB schema tables and CRUD helpers** - `aad9e86` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD tasks have RED (failing tests) + GREEN (implementation) commits_

## Files Created/Modified
- `lib/paths.js` - Added clusterFile export following mcpServersFile pattern
- `lib/cluster/config.js` - loadClusterConfig (with optional path override), getCluster, validateClusterConfig
- `lib/cluster/volume.js` - clusterVolumeNameFor, ensureClusterVolume, copyOutboxToInbox
- `lib/db/schema.js` - Added clusterRuns and clusterAgentRuns table definitions
- `lib/db/cluster-runs.js` - Full CRUD: createClusterRun, updateClusterRun, createAgentRun, updateAgentRun, getClusterRuns, getClusterRunDetail
- `drizzle/0006_cluster_tables.sql` - Migration SQL for production DB initialization
- `drizzle/meta/_journal.json` - Added journal entry for migration 0006
- `lib/cluster/config.test.js` - 13 tests for config loader and validator
- `lib/cluster/volume.test.js` - 6 tests for volume naming
- `lib/db/cluster-runs.test.js` - 11 tests for DB CRUD helpers

## Decisions Made
- **Optional filePath in loadClusterConfig**: Tests need to point to fixture files. Rather than mocking `process.cwd()` or using dynamic imports, added an optional second parameter that overrides the default path from `paths.js`. Keeps tests deterministic and the API clean.
- **`clawforge-cluster-` prefix**: The volume naming segment `-cluster-` unambiguously distinguishes cluster volumes from job volumes (`clawforge-{instance}-{slug}`) and workspace volumes (`clawforge-ws-*`).
- **Migration file added (Rule 2 auto-fix)**: The plan said "No migration SQL needed — Drizzle handles it" but the app's `initDatabase()` uses explicit Drizzle migrations, not auto-create. Added `0006_cluster_tables.sql` and journal entry so the tables exist in production.
- **Temp file for DB tests**: Used a temp SQLite file with manually created tables instead of the app's migration runner, keeping tests self-contained and fast.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added Drizzle migration file for new tables**
- **Found during:** Task 2 (DB schema tables)
- **Issue:** Plan stated "No migration SQL needed — Drizzle handles it" but `initDatabase()` in `lib/db/index.js` runs explicit Drizzle Kit migrations from the `drizzle/` folder. Without a migration file, the `cluster_runs` and `cluster_agent_runs` tables would never be created in production deployments.
- **Fix:** Created `drizzle/0006_cluster_tables.sql` with `CREATE TABLE` statements matching the Drizzle schema, and added the journal entry to `drizzle/meta/_journal.json`.
- **Files modified:** drizzle/0006_cluster_tables.sql (new), drizzle/meta/_journal.json
- **Verification:** Migration SQL matches schema.js column definitions exactly
- **Committed in:** aad9e86 (Task 2 feat commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical)
**Impact on plan:** Essential correctness fix — tables would not exist in production without migration. No scope creep.

## Issues Encountered
- None during implementation. The optional filePath override pattern for `loadClusterConfig` and `getCluster` solved the testability problem cleanly without needing process.cwd() overrides or module mocking.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Config, volume naming, and DB layer are ready for Phase 28-02 (cluster dispatch)
- `CLUSTER.json` config file format is defined but no example file created — next phase can add one
- `copyOutboxToInbox` in volume.js requires Docker to be initialized (calls `getDocker()`) — same pattern as other Docker utilities, no changes needed

## Self-Check: PASSED

All created files confirmed present. All task commits verified in git log:
- `5f693e3` — test(28-01): RED tests for config/volume
- `76bc51a` — feat(28-01): cluster config loader, volume naming, paths export
- `078e3f9` — test(28-01): RED tests for DB CRUD
- `aad9e86` — feat(28-01): DB schema tables and CRUD helpers

---
*Phase: 28-multi-agent-clusters*
*Completed: 2026-03-12*
