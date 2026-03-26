---
phase: 59-cross-agent-aggregate-views-+-quick-launch
plan: "01"
subsystem: superadmin-aggregate-layer
tags: [superadmin, server-actions, cross-agent, aggregate-views, quick-launch]
dependency_graph:
  requires: [lib/superadmin/client.js, lib/tools/github.js, lib/db/workspaces.js, lib/tools/repos.js]
  provides: [getAllAgentPullRequests, getAllAgentWorkspaces, getAllAgentClusters, dispatchAgentJob, prs endpoint, workspaces endpoint, clusters endpoint]
  affects: [api/superadmin.js, lib/chat/actions.js]
tech_stack:
  added: []
  patterns: [queryAllInstances pattern, getAgentPickerData filter pattern, dynamic imports in switch cases]
key_files:
  created: []
  modified:
    - api/superadmin.js
    - lib/chat/actions.js
decisions:
  - "Aggregate Server Actions follow getAgentPickerData pattern: isHubAdmin check + assignedSlugs.has(r.instance) filter"
  - "Offline/erroring agents return stale:true + error string, not an exception — partial results always returned"
  - "dispatchAgentJob dispatches locally via createJob for url===null instances, remote via Bearer POST to /api/jobs"
  - "Superadmin endpoint cases use dynamic imports consistent with existing health/stats/jobs pattern"
metrics:
  duration_seconds: 119
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_modified: 2
---

# Phase 59 Plan 01: Cross-Agent Aggregate Data Layer Summary

**One-liner:** Superadmin endpoint cases (prs/workspaces/clusters) plus four Server Actions for cross-agent aggregate views and quick-launch job dispatch using the proven queryAllInstances pattern.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add prs, workspaces, clusters to superadmin endpoint switch | f08fc33 | api/superadmin.js |
| 2 | Add aggregate Server Actions + dispatchAgentJob to actions.js | 8746fa7 | lib/chat/actions.js |

## What Was Built

### Task 1: Superadmin Endpoint Cases

Three new cases added to `handleSuperadminEndpoint` in `api/superadmin.js`:

- **`case 'prs'`**: Iterates `loadAllowedRepos()`, calls `githubApi()` for each repo to collect PRs with `_repo` field. Validates state param against allowlist (`open/closed/all`).
- **`case 'workspaces'`**: Calls `listWorkspaces(instanceName)` and returns the workspace list for this instance.
- **`case 'clusters'`**: Calls `getSwarmStatus(1)` and returns `runs` array. Gracefully returns empty array on error.

All three cases use dynamic imports consistent with the existing `health/stats/jobs` pattern. No top-level imports added.

### Task 2: Four Server Actions

Added to `lib/chat/actions.js` following the `getAgentPickerData` pattern:

- **`getAllAgentPullRequests(state)`**: Queries all instances for PRs, filters to `assignedAgents`, returns per-agent `{ agentSlug, stale, error, prs }` objects.
- **`getAllAgentWorkspaces()`**: Same pattern for workspaces — `{ agentSlug, stale, error, workspaces }`.
- **`getAllAgentClusters()`**: Same pattern for cluster runs — `{ agentSlug, stale, error, runs }`.
- **`dispatchAgentJob(agentSlug, jobDescription)`**: Validates slug and description, verifies caller authorization via `assignedAgents`, dispatches locally (createJob) or remotely (Bearer POST to `/api/jobs`). Returns `{ job_id, branch, agentSlug }` on success or `{ error }`.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. All four Server Actions are fully wired to real data sources via `queryAllInstances`. No hardcoded values.

## Self-Check: PASSED

- `api/superadmin.js` — modified, contains `case 'prs':` at line 58, `case 'workspaces':` at line 74, `case 'clusters':` at line 80
- `lib/chat/actions.js` — modified, exports `getAllAgentPullRequests` at line 1781, `getAllAgentWorkspaces` at line 1806, `getAllAgentClusters` at line 1831, `dispatchAgentJob` at line 1859
- Commit f08fc33 — Task 1 (superadmin.js)
- Commit 8746fa7 — Task 2 (actions.js)
