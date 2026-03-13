---
phase: 30-new-pages
plan: "01"
subsystem: web-ui
tags: [pull-requests, server-actions, icons, github-api]
dependency_graph:
  requires: []
  provides: [pull-requests-page, server-actions-phase30, pr-icons]
  affects: [lib/chat/actions.js, lib/chat/components/index.js]
tech_stack:
  added: []
  patterns: [server-actions-dynamic-import, page-component-pattern, optimistic-ui]
key_files:
  created:
    - lib/chat/components/pull-requests-page.jsx
    - templates/app/pull-requests/page.js
  modified:
    - lib/db/users.js
    - lib/chat/actions.js
    - lib/chat/components/icons.jsx
    - lib/chat/components/index.js
decisions:
  - "updatePassword imports auth() via dynamic import to avoid top-level circular dependency"
  - "getPendingPRCount calls getPendingPullRequests internally (reuses logic)"
  - "Optimistic UI on approve/request-changes removes PR from list immediately"
metrics:
  duration: "~2 minutes"
  completed: "2026-03-13"
  tasks_completed: 2
  files_changed: 6
---

# Phase 30 Plan 01: Server Actions, Icons, and Pull Requests Page Summary

**One-liner:** GitHub PR management page with approve/request-changes actions, six new Server Actions, and three new SVG icons.

## What Was Built

### DB Layer
- `updateUserPassword(userId, newPassword)` in `lib/db/users.js` — hashes with bcrypt and updates the user row. All required imports were already present.

### Server Actions (lib/chat/actions.js)
Six new Server Actions added, each starting with `await requireAuth()`:
1. `getPendingPullRequests()` — fetches open PRs across all allowed repos via GitHub API, returns flat array with `_repo` field
2. `getPendingPRCount()` — calls `getPendingPullRequests()`, filters drafts, returns count
3. `approvePullRequest(owner, repo, prNumber)` — POST to GitHub reviews API with `APPROVE` event
4. `requestChanges(owner, repo, prNumber, body)` — POST to GitHub reviews API with `REQUEST_CHANGES` event
5. `getRunners()` — GET runners from configured `GH_OWNER`/`GH_REPO`, returns array
6. `updatePassword(currentPassword, newPassword)` — verifies current password then calls `updateUserPassword`, returns `{success}` or `{error}`

### Icons (lib/chat/components/icons.jsx)
Three new SVG icon components following the `{ size = 16 }` pattern:
- `GitPullRequestIcon` — standard GitHub PR shape (circles + branching path)
- `ServerIcon` — stacked rectangles with status indicator circles
- `UserIcon` — person silhouette (circle head + shoulder arc)

### Pull Requests Page
- `lib/chat/components/pull-requests-page.jsx` — `'use client'` component with PR list, approve/request-changes buttons, optimistic removal on action, draft badge, relative timestamps, refresh button
- `lib/chat/components/index.js` — export added for `PullRequestsPage`
- `templates/app/pull-requests/page.js` — thin route following exact clusters/page.js pattern

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `grep -c "updateUserPassword" lib/db/users.js` → 1
- `grep -c "getPendingPullRequests" lib/chat/actions.js` → 2 (definition + internal call in getPendingPRCount)
- `grep -c "GitPullRequestIcon" lib/chat/components/icons.jsx` → 1
- `test -f templates/app/pull-requests/page.js` → exists
- `grep "PullRequestsPage" lib/chat/components/index.js` → shows export
- `npm run build` → passes (pull-requests-page.js: 7.0kb)

## Commits

- `369940d` feat(30-01): add DB function, Server Actions, and icons
- `c98091a` feat(30-01): build Pull Requests page with route

## Self-Check: PASSED
