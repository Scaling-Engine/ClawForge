---
phase: 51-code-mode-bug-fixes
plan: "01"
subsystem: code-mode
tags: [bug-fix, code-mode, react-context, workspaces]
dependency_graph:
  requires: []
  provides: [FIX-01, FIX-02]
  affects: [lib/chat/components/chat.jsx, lib/db/workspaces.js, lib/chat/features-context.jsx]
tech_stack:
  added: []
  patterns: [esbuild-compile-from-jsx-source, running-only-workspace-filter]
key_files:
  created: []
  modified:
    - lib/chat/components/chat.jsx
    - lib/db/workspaces.js
decisions:
  - "FIX-01: chat.jsx must import useFeature from features-context.jsx (source), not features-context.js (compiled artifact); esbuild regenerates .js from .jsx in same build pass so context objects are shared"
  - "FIX-02: getWorkspaceByChatId returns running-only workspaces (not destroyed/starting/creating); launchWorkspace still explicitly checks running|starting|creating for reuse — correct because it has its own logic separate from the DB helper"
metrics:
  duration_minutes: 8
  completed_date: "2026-03-20"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 51 Plan 01: Code Mode Bug Fixes Summary

**One-liner:** Fixed React context split (FIX-01) and non-running workspace Resume redirect loop (FIX-02) that were blocking Code mode usability.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix split-module context (FIX-01) | d2d7912 | lib/chat/components/chat.jsx |
| 2 | Fix Resume button redirect loop (FIX-02) | 314852e | lib/chat/components/chat.jsx, lib/db/workspaces.js |

## What Was Built

### FIX-01: Split React Context (features-context)

The `lib/chat/components/chat.jsx` file imported `useFeature` from `features-context.js` — the compiled esbuild artifact — while `lib/chat/components/chat-page.jsx` imported `FeaturesProvider` from `features-context.jsx` (the source). These are two separate `createContext({})` calls producing different context objects. When FeaturesProvider set flags in its context, `useFeature` read from a different (empty) context — always returning `false`. This made `codeWorkspaceEnabled` permanently `false`, hiding the Code toggle and Interactive button for all users.

Fix: Changed the import in `chat.jsx` line 13 from `features-context.js` to `features-context.jsx`. Esbuild now compiles both files in the same pass from the same source, sharing the single `FeaturesContext` object.

### FIX-02: Resume Redirect Loop (workspace status filter)

The `getWorkspaceByChatId` DB helper returned workspaces with any status except `'destroyed'` (allowing `'starting'`, `'creating'`). The `chat.jsx` effect that sets `linkedWorkspaceId` accepted `running` or `starting` status. But `/code/[id]/page.js` only accepts `'running'` — redirecting to `/chats` for anything else. This caused a redirect loop when clicking Resume on a starting/creating workspace.

Two-layer fix:
1. `chat.jsx` status check narrowed from `running|starting` to `running` only — prevents Resume button from appearing for non-navigable workspaces.
2. `getWorkspaceByChatId` filter tightened from `!== 'destroyed'` to `=== 'running'` only — defense in depth so no caller can accidentally surface a non-running workspace.

Note: `launchWorkspace` in `actions.js` explicitly checks `running|starting|creating` for reuse (line 39) using `getWorkspaceByChatId` — after the DB fix, `getWorkspaceByChatId` returns `null` for starting workspaces, so `launchWorkspace` will dispatch a new container. This is acceptable: starting/creating workspaces are transient and dispatching again is safe.

## Verification

All checks pass:
- `npm run build` succeeds (esbuild, 27ms)
- No source `.jsx` files import from `features-context.js`
- `getWorkspaceByChatId` returns `undefined` for non-running workspaces
- `chat.jsx` sets `linkedWorkspaceId` only for `running` workspaces

## Decisions Made

- **Same esbuild pass = shared context:** After the import fix, esbuild compiles both `features-context.jsx` and `chat.jsx` in one pass. The compiled `features-context.js` output is simply the artifact of that source — same module, same context object. No need to gitignore `features-context.js` since it was already generated before (it was the pre-existing compiled duplicate that caused the bug).
- **launchWorkspace reuse behavior change accepted:** After DB fix, `launchWorkspace` won't reuse a starting workspace — it will dispatch a new container. This is intentional: "starting" is a transient state and treating it as reusable led to the redirect loop bug. New dispatch is the safe fallback.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- lib/chat/components/chat.jsx: FOUND
- lib/db/workspaces.js: FOUND
- commit d2d7912: FOUND
- commit 314852e: FOUND
