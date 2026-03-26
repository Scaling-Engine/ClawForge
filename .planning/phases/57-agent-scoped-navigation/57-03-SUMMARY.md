---
phase: 57-agent-scoped-navigation
plan: "03"
subsystem: routing
tags: [navigation, routing, agent-scoped, page-shells, clusters, pull-requests, workspaces]
dependency_graph:
  requires: [57-01, 57-02]
  provides: [agent-scoped-pull-requests, agent-scoped-workspaces, agent-scoped-clusters]
  affects:
    - templates/app/agent/[slug]/pull-requests/page.js
    - templates/app/agent/[slug]/workspaces/page.js
    - templates/app/agent/[slug]/clusters/page.js
    - templates/app/agent/[slug]/clusters/[id]/page.js
    - templates/app/agent/[slug]/clusters/[id]/console/page.js
    - templates/app/agent/[slug]/clusters/[id]/logs/page.js
    - templates/app/agent/[slug]/clusters/[id]/role/[roleId]/page.js
tech_stack:
  added: []
  patterns: [Next.js 15 async params, server component page shells, agentSlug prop forwarding]
key_files:
  created:
    - templates/app/agent/[slug]/pull-requests/page.js
    - templates/app/agent/[slug]/workspaces/page.js
    - templates/app/agent/[slug]/clusters/page.js
    - templates/app/agent/[slug]/clusters/[id]/page.js
    - templates/app/agent/[slug]/clusters/[id]/console/page.js
    - templates/app/agent/[slug]/clusters/[id]/logs/page.js
    - templates/app/agent/[slug]/clusters/[id]/role/[roleId]/page.js
  modified: []
decisions: []
metrics:
  duration: "103 seconds"
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_changed: 7
---

# Phase 57 Plan 03: Agent-Scoped PRs, Workspaces, and Clusters Page Shells Summary

**One-liner:** Seven agent-scoped page shells under `/agent/[slug]/` forwarding agentSlug to PullRequestsPage, SwarmPage, ClustersPage, ClusterDetailPage, ClusterConsolePage, ClusterLogsPage, and ClusterRolePage.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create PRs and workspaces scoped page shells | e3fc070 | templates/app/agent/[slug]/pull-requests/page.js, templates/app/agent/[slug]/workspaces/page.js |
| 2 | Create clusters scoped pages (index + all sub-routes) | debffbe | templates/app/agent/[slug]/clusters/page.js + 4 sub-route pages |

## What Was Built

### Task 1: PRs and Workspaces Page Shells

`templates/app/agent/[slug]/pull-requests/page.js` — async Server Component that:
1. Awaits `params` to extract `slug` (Next.js 15 pattern)
2. Calls `auth()` to get session
3. Renders `PullRequestsPage` with `session` and `agentSlug={slug}`

`templates/app/agent/[slug]/workspaces/page.js` — async Server Component that:
1. Awaits `params` to extract `slug`
2. Calls `auth()` to get session
3. Renders `SwarmPage` with `session` and `agentSlug={slug}` (SwarmPage is the Docker workspace runner list component)

Both files use `../../../../lib/` relative path (4 levels deep from templates/app/agent/[slug]/page/).

### Task 2: Cluster Page Shells (5 files)

All 5 cluster pages mirror the existing un-scoped cluster pages but add `agentSlug={slug}`:

- `clusters/page.js` → `ClustersPage` with agentSlug (4 levels: `../../../../lib/`)
- `clusters/[id]/page.js` → `ClusterDetailPage` with runId + agentSlug (5 levels: `../../../../../lib/`)
- `clusters/[id]/console/page.js` → `ClusterConsolePage` with runId + agentSlug (6 levels: `../../../../../../lib/`)
- `clusters/[id]/logs/page.js` → `ClusterLogsPage` with runId + agentSlug (6 levels: `../../../../../../lib/`)
- `clusters/[id]/role/[roleId]/page.js` → `ClusterRolePage` with runId + roleId + agentSlug (7 levels: `../../../../../../../lib/`)

## Decisions Made

None — straightforward replication of existing patterns with agentSlug added.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — these are thin wiring shells. The actual data filtering by agentSlug will be implemented when the underlying components consume the prop in a future plan.

## Self-Check

- [x] `templates/app/agent/[slug]/pull-requests/page.js` exists with `agentSlug={slug}`
- [x] `templates/app/agent/[slug]/workspaces/page.js` exists with `agentSlug={slug}`
- [x] `templates/app/agent/[slug]/clusters/page.js` exists with `agentSlug={slug}`
- [x] `templates/app/agent/[slug]/clusters/[id]/page.js` exists with `agentSlug={slug}`
- [x] `templates/app/agent/[slug]/clusters/[id]/console/page.js` exists with `agentSlug={slug}`
- [x] `templates/app/agent/[slug]/clusters/[id]/logs/page.js` exists with `agentSlug={slug}`
- [x] `templates/app/agent/[slug]/clusters/[id]/role/[roleId]/page.js` exists with `agentSlug={slug}`
- [x] Commits e3fc070 and debffbe exist
- [x] `grep -r "agentSlug" templates/app/agent/` returns 10 matches (9+ required)

## Self-Check: PASSED
