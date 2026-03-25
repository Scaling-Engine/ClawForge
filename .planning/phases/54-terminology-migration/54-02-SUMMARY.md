---
phase: 54-terminology-migration
plan: "02"
subsystem: admin-ui
tags: [terminology, routing, url-migration, admin-panel, redirect]
dependency_graph:
  requires: [54-01]
  provides: [TERM-02]
  affects: [admin-layout, templates-app-admin-agents, templates-app-admin-instances]
tech_stack:
  added: []
  patterns: [next-redirect, app-router-page, esbuild-compile]
key_files:
  created:
    - templates/app/admin/agents/page.js
  modified:
    - templates/app/admin/instances/page.js
    - lib/chat/components/admin-layout.jsx
decisions:
  - "id: 'instances' JS key preserved in ADMIN_NAV — only href changed (code identifier, not user-facing text)"
  - "Compiled admin-layout.js is gitignored — only .jsx source committed; build regenerates at deploy time"
  - "Merged worktree-agent-ad240331 (54-01 changes) before executing to get correct starting state"
metrics:
  duration: "~5 minutes"
  completed: "2026-03-25"
  tasks: 2
  files: 3
---

# Phase 54 Plan 02: Terminology Migration — URL Routes Summary

**One-liner:** Wired /admin/agents as the canonical agent list route, updated admin sidebar nav href, and added /admin/instances redirect for backward compatibility — eliminating all /admin/instances hrefs from source.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create /admin/agents page and redirect /admin/instances | 98601e2 | templates/app/admin/agents/page.js, templates/app/admin/instances/page.js |
| 2 | Update admin nav href to /admin/agents; rebuild | bfe1ea2 | lib/chat/components/admin-layout.jsx |

## Changes Made

### templates/app/admin/agents/page.js (new)
- New Next.js App Router page at /admin/agents
- Imports and renders `AdminInstancesPage` — the renamed agents list component (renamed in plan 01)
- `AdminAgentsRoute` is the export function name

### templates/app/admin/instances/page.js (replaced)
- Replaced `AdminInstancesPage` render with `redirect('/admin/agents')` from `next/navigation`
- Backward compatibility preserved — bookmarks/links to /admin/instances silently redirect

### lib/chat/components/admin-layout.jsx
- ADMIN_NAV entry line 17: `href: '/admin/instances'` → `href: '/admin/agents'`
- `id: 'instances'` and `label: 'Agents'` left unchanged (id is code-only; label changed in plan 01)

## Verification Results

```
# No /admin/instances hrefs in source
grep -rn "href.*\/admin\/instances" lib/chat/components/*.jsx
→ CLEAN — no matches

# New agents route exists
ls templates/app/admin/agents/page.js
→ FOUND

# Old instances route is redirect
grep "redirect" templates/app/admin/instances/page.js
→ redirect('/admin/agents') found

# Build passes
npm run build
→ Done in 21ms — no errors
```

## Deviations from Plan

**Pre-execution merge:** The worktree for this plan (worktree-agent-a8361b3d) had diverged from the 54-01 execution worktree (worktree-agent-ad240331). Fast-forward merged `worktree-agent-ad240331` into this branch to bring in the 54-01 label changes before executing 54-02. This is expected behavior for parallel worktree execution — not a plan deviation.

**Compiled .js not committed:** Task 2 acceptance criterion mentions `grep "href: '/admin/agents'" lib/chat/components/admin-layout.js` (compiled output). The compiled file is gitignored per project convention (confirmed in 54-01 SUMMARY). Only the .jsx source is committed; the compiled output is regenerated at build/deploy time. The build was verified to pass and produce the correct compiled output locally.

## Known Stubs

None. All changes are routing wiring — no data sources or placeholder content.

## Self-Check: PASSED

- templates/app/admin/agents/page.js — FOUND (created)
- templates/app/admin/instances/page.js — FOUND (modified)
- lib/chat/components/admin-layout.jsx — FOUND (modified)
- Commit 98601e2 — FOUND
- Commit bfe1ea2 — FOUND
