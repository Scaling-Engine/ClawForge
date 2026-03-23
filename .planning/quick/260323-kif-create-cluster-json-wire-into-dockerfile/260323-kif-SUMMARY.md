---
phase: quick
plan: 260323-kif
subsystem: clusters
tags: [cluster-config, docker, admin-ui, crud]
key-files:
  created:
    - config/CLUSTER.json
    - lib/chat/components/admin-clusters-page.jsx
    - templates/app/admin/clusters/page.js
  modified:
    - lib/paths.js
    - lib/cluster/config.js
    - lib/chat/actions.js
    - lib/chat/components/admin-layout.jsx
    - lib/chat/components/index.js
    - instances/noah/Dockerfile
    - instances/strategyES/Dockerfile
decisions:
  - "defaultClusterFile added to paths.js alongside defaultReposFile — same defaults/ pattern"
  - "loadClusterConfig falls back to defaults/CLUSTER.json only when no filePath override given — preserves test isolation"
  - "saveClusterConfig is async (fs.promises.writeFile) — consistent with loadClusterConfig async pattern"
  - "Admin cluster CRUD writes directly to config/CLUSTER.json (file-based, matches repos pattern)"
  - "CLUSTER.json shared across instances (in config/ not instance-specific) — both Dockerfiles copy from same source"
metrics:
  duration: 12
  completed: "2026-03-23"
  tasks: 2
  files: 9
---

# Quick Task 260323-kif: Cluster Config + Admin UI Summary

**One-liner:** Default CLUSTER.json with CTO/Security/UI-UX/Developer roles baked into Docker defaults/, with admin CRUD page at /admin/clusters.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create CLUSTER.json, wire defaults/ fallback, update Dockerfiles | 1685fae |
| 2 | Add cluster CRUD server actions and admin page | ed91c17 |

## What Was Built

### Task 1: CLUSTER.json + Infrastructure

- `config/CLUSTER.json` — default cluster with 4 roles (CTO, Security, UI/UX, Developer) matching upstream PopeBot pattern
- `lib/paths.js` — added `defaultClusterFile` export pointing to `defaults/CLUSTER.json`
- `lib/cluster/config.js` — updated `loadClusterConfig` to fall back to `defaultClusterFile` on ENOENT; added `saveClusterConfig` async function
- `instances/noah/Dockerfile` + `instances/strategyES/Dockerfile` — both now copy `config/CLUSTER.json` to `./defaults/CLUSTER.json` (alongside the existing REPOS.json pattern)

### Task 2: Admin CRUD Page

- `lib/chat/actions.js` — added `saveClusterConfigAction`, `saveClusterAction`, `deleteClusterAction` (all admin-only, use dynamic imports)
- `lib/chat/components/admin-clusters-page.jsx` — full CRUD UI: cluster list cards with role badges, ClusterForm with inline role management (add/remove roles, name/systemPrompt/allowedTools per role), delete with confirmation
- `lib/chat/components/admin-layout.jsx` — added Clusters nav entry after Repos, imported ClusterIcon
- `lib/chat/components/index.js` — added AdminClustersPage export
- `templates/app/admin/clusters/page.js` — route shell following repos page pattern

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `loadClusterConfig()` returns default cluster with 4 roles (CTO, Security, UI/UX, Developer): PASS
- `defaultClusterFile` export present in paths.js: PASS
- Both Dockerfiles contain CLUSTER.json defaults/ copy line: PASS
- admin-layout.jsx has Clusters nav entry: PASS
- `npm run build` passes cleanly (esbuild, 29ms, no errors): PASS

## Self-Check: PASSED

Files confirmed present:
- config/CLUSTER.json: FOUND
- lib/chat/components/admin-clusters-page.jsx: FOUND
- templates/app/admin/clusters/page.js: FOUND

Commits confirmed:
- 1685fae: FOUND
- ed91c17: FOUND
