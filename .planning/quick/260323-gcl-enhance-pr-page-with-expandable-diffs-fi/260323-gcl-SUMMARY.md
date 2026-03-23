---
phase: quick
plan: 260323-gcl
subsystem: chat-ui
tags: [pull-requests, diff-view, ui, github]
dependency_graph:
  requires: [diff-view.jsx, icons.jsx, actions.js]
  provides: [getPullRequests(state), getPRFiles(owner,repo,prNumber), filter-tabs, expandable-diff-rows]
  affects: [lib/chat/components/pull-requests-page.jsx, lib/chat/actions.js]
tech_stack:
  added: []
  patterns: [DiffView reuse, getPRFiles lazy-load, tab-state enum]
key_files:
  created: []
  modified:
    - lib/chat/actions.js
    - lib/chat/components/pull-requests-page.jsx
decisions:
  - "Lazy-load PR files on first expand and cache in component state — avoids redundant API calls on re-expand"
  - "showStatusBadge prop on PRRow — Open badge only shown on All tab to avoid redundancy on single-state tabs"
  - "Approve/Request Changes buttons check isOpen (pr.state === open) not activeTab — correct when All tab mixes states"
metrics:
  duration: "~10 min"
  completed: "2026-03-23T15:50:57Z"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 260323-gcl: Enhance PR Page with Expandable Diffs Summary

**One-liner:** PR page gains filter tabs (Open/Approved-Merged/All), expandable rows with per-file diff rendering via existing DiffView component, and closed/merged PR visibility.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add server actions for filtered PRs and PR file diffs | bf90863 | lib/chat/actions.js |
| 2 | Add filter tabs and expandable diff rows to PR page | b8716b2 | lib/chat/components/pull-requests-page.jsx |

## What Was Built

### Task 1: New Server Actions (`lib/chat/actions.js`)

- `getPullRequests(state = 'open')` — fetches PRs across all allowed repos with configurable state (open/closed/all). Validates state param, uses same `loadAllowedRepos` + `githubApi` pattern as `getPendingPullRequests`. Does NOT modify existing `getPendingPullRequests` or `getPendingPRCount`.
- `getPRFiles(owner, repo, prNumber)` — calls `/repos/{owner}/{repo}/pulls/{number}/files?per_page=100`. Returns file objects with `filename`, `status`, `additions`, `deletions`, `changes`, `patch`. Returns empty array on failure.

### Task 2: Filter Tabs + Expandable Diff Rows (`pull-requests-page.jsx`)

**Filter tabs:**
- Three pill tabs: Open / Approved+Merged / All
- Active tab: `bg-accent text-accent-foreground shadow-sm`; inactive: `text-muted-foreground hover:text-foreground`
- Tab switch calls `getPullRequests(apiState)` and refreshes list
- Refresh button reloads current tab's data
- Subtitle adapts: "N open PRs (M ready for review)" / "N closed/merged PRs" / "N total PRs"

**Expandable PR rows:**
- Clicking the row body toggles `expanded` state
- On first expand, calls `getPRFiles(owner, repo, pr.number)` — result cached in local state
- ChevronDownIcon rotates 180deg when expanded (CSS transition)
- Expanded panel shows file count + list of `FileRow` components

**File rows:**
- Each file has a header: filename (font-mono), status badge (added/modified/removed/renamed with color coding), +N/-N counts
- Clicking file header expands/collapses its diff
- Patch rendered via `<DiffView diff={file.patch} />` — reuses existing diff2html integration
- Files without patch show "No diff available"

**Status badges:**
- `merged_at` present → purple "Merged" badge
- `state === 'closed'` and no `merged_at` → red "Closed" badge
- `state === 'open'` → green "Open" badge (only shown on All tab)
- Draft badge preserved from original

**Action buttons:**
- Approve / Request Changes buttons only shown when `pr.state === 'open'` and `!pr.draft`
- Click handlers call `e.stopPropagation()` to prevent toggling expand
- PR title link also stops propagation so clicking title opens GitHub without toggling row

## Decisions Made

1. **Lazy-load PR files on first expand:** `files === null` check means files load once and are cached in component state. Re-expanding uses cached result. Avoids redundant API calls.

2. **`showStatusBadge` prop on PRRow:** Open tab only has open PRs so the Open badge is redundant there. All tab shows mixed states so badges are visible. Closed tab shows merged/closed badges. Controlled via `activeTab === 'all'` in the list component.

3. **`isOpen` check in PRRow for action buttons:** Buttons check `pr.state === 'open'` directly, not the active tab. This correctly handles the All tab where open and non-open PRs coexist.

4. **`diff-view.js` import (not `.jsx`):** The plan specified `./diff-view.js` — the build system resolves `.jsx` source via esbuild, so the import uses the `.js` extension matching the compiled output reference.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `lib/chat/actions.js` — modified, both functions present at lines 723 and 756
- [x] `lib/chat/components/pull-requests-page.jsx` — rewritten with tabs and expandable rows
- [x] `npm run build` — succeeded (pull-requests-page.js: 14.3kb output)
- [x] Task 1 commit: bf90863
- [x] Task 2 commit: b8716b2

## Self-Check: PASSED
