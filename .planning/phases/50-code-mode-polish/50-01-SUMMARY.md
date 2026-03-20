---
phase: 50-code-mode-polish
plan: 01
subsystem: chat-ui, code-workspace
tags: [feature-flags, mobile, dnd, code-mode, polish]
dependency_graph:
  requires: [49-02]
  provides: [codeWorkspace-feature-flag, mobile-dnd-tabs]
  affects: [lib/chat/components/chat.jsx, templates/app/code/[id]/code-page.jsx]
tech_stack:
  added: []
  patterns: [useFeature hook, canUseCode derived boolean, TouchSensor DnD]
key_files:
  created:
    - templates/config/FEATURES.json
  modified:
    - lib/chat/components/chat.jsx
    - config/FEATURES.json
    - templates/app/code/[id]/code-page.jsx
decisions:
  - "canUseCode = isAdmin && codeWorkspaceEnabled — single boolean gates both onToggleCode and onLaunchInteractive props"
  - "codeWorkspace: true in config/FEATURES.json — existing deployment unaffected (opt-out for new instances)"
  - "TouchSensor delay 250ms — standard threshold prevents scroll-vs-drag conflict on mobile"
  - "KeyboardSensor added alongside TouchSensor — accessibility requirement, zero extra cost"
metrics:
  duration: ~8 minutes
  completed: "2026-03-20T03:30:13Z"
  tasks: 2
  files: 4
---

# Phase 50 Plan 01: Code Mode Polish Summary

**One-liner:** Feature-flag gate on Code mode via `codeWorkspace` flag + TouchSensor/KeyboardSensor for mobile DnD tabs.

## What Was Built

### Task 1 — codeWorkspace Feature Flag Gate

Added `useFeature('codeWorkspace')` to `chat.jsx` and derived `canUseCode = isAdmin && codeWorkspaceEnabled`. Replaced both occurrences of the old `isAdmin`-only gate with `canUseCode` on both `onToggleCode` and `onLaunchInteractive` props. Since `chat-input.jsx` already gates on `onToggleCode` being defined, no changes were needed downstream.

Updated `config/FEATURES.json` to add `"codeWorkspace": true` (current deployment unaffected). Created `templates/config/FEATURES.json` with `"codeWorkspace": false` so new instances scaffolded via `npx thepopebot init` get Code mode disabled by default.

### Task 2 — Mobile DnD Support

Added `TouchSensor` (250ms delay, 5px tolerance) and `KeyboardSensor` to the `useSensors` call in `templates/app/code/[id]/code-page.jsx`. Both sensors are already available in the installed `@dnd-kit/core` package — no new dependencies. The 250ms touch delay prevents accidental drag-initiation when the user is scrolling on mobile.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | e236751 | feat(50-01): gate Code mode behind codeWorkspace feature flag |
| 2 | a73e856 | feat(50-01): add TouchSensor and KeyboardSensor to code page DnD tabs |

## Decisions Made

1. **`canUseCode` single boolean:** Rather than repeating `isAdmin && codeWorkspaceEnabled` at each prop site, derive once at component top. Cleaner and ensures both props always stay in sync.
2. **Opt-in for new instances:** New deployments default to `codeWorkspace: false`. Operators explicitly enable when they have the workspace infrastructure configured. This prevents confusion for users who haven't set up Docker workspace containers.
3. **TouchSensor 250ms delay:** Standard DnD-kit recommendation for mobile — long enough to distinguish intentional drag from scroll, short enough not to feel sluggish.
4. **KeyboardSensor added at same time:** Zero additional complexity, adds accessibility for free.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

| Claim | Status |
|-------|--------|
| `useFeature` import in chat.jsx | FOUND |
| `canUseCode` (5 occurrences: import call, derivation, 2x onToggleCode, 2x onLaunchInteractive... wait, 5 total) | FOUND |
| `codeWorkspace: true` in config/FEATURES.json | FOUND |
| `codeWorkspace: false` in templates/config/FEATURES.json | FOUND |
| No old `onToggleCode={isAdmin` pattern in chat.jsx | CONFIRMED ABSENT |
| `TouchSensor` in code-page.jsx | FOUND |
| `delay: 250` in code-page.jsx | FOUND |
| Build passes | PASS |
| Commit e236751 | EXISTS |
| Commit a73e856 | EXISTS |

## Self-Check: PASSED
