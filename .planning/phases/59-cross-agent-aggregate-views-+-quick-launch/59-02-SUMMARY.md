---
phase: 59-cross-agent-aggregate-views-+-quick-launch
plan: "02"
subsystem: superadmin-aggregate-layer
tags: [superadmin, aggregate-views, quick-launch, agent-picker, cross-agent]
dependency_graph:
  requires: [getAllAgentPullRequests, getAllAgentWorkspaces, getAllAgentClusters, dispatchAgentJob, PageLayout, AgentPickerPage]
  provides: [AllAgentsPRsPage, AllAgentsWorkspacesPage, AllAgentsClustersPage, QuickLaunchModal, /agents/all/* route shells]
  affects: [lib/chat/components/index.js, lib/chat/components/agent-picker-page.jsx]
tech_stack:
  added: []
  patterns: [useCallback+useEffect data loading, stale indicator pattern, modal with backdrop click-away, stopPropagation on nested button in card]
key_files:
  created:
    - lib/chat/components/all-agents-page.jsx
    - templates/app/agents/all/pull-requests/page.js
    - templates/app/agents/all/workspaces/page.js
    - templates/app/agents/all/clusters/page.js
  modified:
    - lib/chat/components/agent-picker-page.jsx
    - lib/chat/components/index.js
decisions:
  - "Components accept session prop — PageLayout requires session.user; route shells fetch auth() and pass session"
  - "QuickLaunchModal scoped per-card per D-05 — stopPropagation prevents card navigation on button click"
  - "Route shells import at five levels deep (../../../../../lib/...) matching templates/app/agents/all/*/page.js depth"
metrics:
  duration_seconds: 174
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_modified: 6
---

# Phase 59 Plan 02: Aggregate Views + Quick Launch UI Summary

**One-liner:** Three cross-agent aggregate page components (PRs, Workspaces, Sub-Agents) with stale banners for offline agents, plus QuickLaunchModal on each agent picker card dispatching jobs via dispatchAgentJob.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create all-agents-page.jsx with three aggregate components | cc2fd4c | lib/chat/components/all-agents-page.jsx |
| 2 | Add QuickLaunchModal to AgentPickerPage + wire route shells + update index.js | 705d189 | lib/chat/components/agent-picker-page.jsx, lib/chat/components/index.js, templates/app/agents/all/{pull-requests,workspaces,clusters}/page.js |

## What Was Built

### Task 1: Three Aggregate View Components

`lib/chat/components/all-agents-page.jsx` with three exported components:

- **`AllAgentsPRsPage`**: Table with Agent/Title/Repo/Status/Updated columns. State filter tabs (open/closed/all). Calls `getAllAgentPullRequests(state)`. `StaleBanner` shown for offline agents (yellow border, Stale badge, error message).
- **`AllAgentsWorkspacesPage`**: Table with Agent/Repo/Status/Last Active columns. Calls `getAllAgentWorkspaces()`. Same stale banner pattern.
- **`AllAgentsClustersPage`**: Run list (div rows) with Agent slug prefix, status dot/conclusion badge, workflow name, timeAgo, View link. Calls `getAllAgentClusters()`. Same stale banner pattern.

All three share `StaleBanner` component, `timeAgo` utility, and the `useCallback`+`useEffect` loading pattern.

### Task 2: QuickLaunchModal + Route Shells + Index

**QuickLaunchModal** added to `agent-picker-page.jsx`:
- Overlay modal with backdrop click-away (`e.target === e.currentTarget`)
- Textarea for job description + Launch/Cancel buttons
- Calls `dispatchAgentJob(agentName, description)` on submit
- On success: `router.push('/agent/' + agentName + '/chat')` + `onClose()`
- On failure: displays error message inline

**AgentCard** updated:
- Added `onQuickLaunch` prop
- Footer row now `flex items-center justify-between` with Last job text + New Job button
- `e.stopPropagation()` on New Job button prevents card click from also navigating

**AgentPickerPage** updated:
- `quickLaunchAgent` state (null when closed)
- `setQuickLaunchAgent` passed as `onQuickLaunch` to each AgentCard
- QuickLaunchModal rendered below grid when `quickLaunchAgent !== null`

**index.js**: Added `AllAgentsPRsPage, AllAgentsWorkspacesPage, AllAgentsClustersPage` export line.

**Route shells** (templates/app/agents/all/*/page.js): Each fetches `session = await auth()` and renders the corresponding component with `session` prop.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added session prop to aggregate components and route shells**
- **Found during:** Task 1 (reading page-layout.jsx)
- **Issue:** Plan showed `<PageLayout title="...">` without a `session` prop. `PageLayout` passes `session.user` to `AppSidebar` — would throw `Cannot read properties of undefined (reading 'user')` at runtime.
- **Fix:** Added `session` prop to all three components. Route shells fetch `session = await auth()` and pass it. Consistent with existing pattern (e.g., `templates/app/pull-requests/page.js`).
- **Files modified:** `lib/chat/components/all-agents-page.jsx`, all three route shells
- **Commits:** cc2fd4c, 705d189

**2. [Rule 2 - Missing pattern] Title rendered as h1 inside PageLayout children (not as prop)**
- **Found during:** Task 1 (reading page-layout.jsx source)
- **Issue:** Plan referenced `<PageLayout title="All Agents — Pull Requests">` but PageLayout only accepts `session` + `children` — no `title` prop.
- **Fix:** Rendered `<h1>` heading inside the children div, consistent with how other pages work.
- **Files modified:** `lib/chat/components/all-agents-page.jsx`
- **Commit:** cc2fd4c

## Known Stubs

None. All three components call real Server Actions from Wave 1 (`getAllAgentPullRequests`, `getAllAgentWorkspaces`, `getAllAgentClusters`). QuickLaunchModal calls `dispatchAgentJob`. No hardcoded or placeholder data.

## Self-Check: PASSED

- `lib/chat/components/all-agents-page.jsx` — exists, 3 exports at lines 41, 143, 222
- `lib/chat/components/agent-picker-page.jsx` — QuickLaunchModal at line 35, dispatchAgentJob import at line 5, New Job button at line 156
- `lib/chat/components/index.js` — AllAgents* export at line 49
- `templates/app/agents/all/pull-requests/page.js` — exists
- `templates/app/agents/all/workspaces/page.js` — exists
- `templates/app/agents/all/clusters/page.js` — exists
- `npm run build` — succeeded, `all-agents-page.js` (13.2kb) compiled without errors
- Commit cc2fd4c — Task 1 (all-agents-page.jsx)
- Commit 705d189 — Task 2 (agent-picker-page.jsx, index.js, route shells)
