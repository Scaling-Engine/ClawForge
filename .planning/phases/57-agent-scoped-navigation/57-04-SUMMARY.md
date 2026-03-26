---
phase: 57-agent-scoped-navigation
plan: "04"
subsystem: navigation
tags: [navigation, sidebar, agent-scoped, chat-history, filtering]
dependency_graph:
  requires: [57-01, 57-02, 57-03]
  provides: [agent-context-sidebar, agent-filtered-chat-history]
  affects:
    - lib/chat/components/app-sidebar.jsx
    - lib/chat/components/sidebar-history.jsx
tech_stack:
  added: []
  patterns: [conditional rendering, client-side filtering, prop drilling]
key_files:
  created: []
  modified:
    - lib/chat/components/app-sidebar.jsx
    - lib/chat/components/sidebar-history.jsx
decisions:
  - "Editing .jsx source files (not the gitignored .js esbuild output) — esbuild rebuilds .js from .jsx on npm run build"
  - "SidebarHistory filters client-side only: chats without agentSlug (legacy) are shown in all agent contexts (graceful degradation)"
  - "agentSlug added to useEffect dependency array in SidebarHistory so history reloads when user switches agents"
metrics:
  duration: "2 minutes"
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_changed: 2
---

# Phase 57 Plan 04: Sidebar Agent Context and Chat History Filtering Summary

**One-liner:** AppSidebar now accepts agentSlug prop and shows agent name as a clickable /agents link with scoped nav URLs; SidebarHistory filters to the selected agent's chats with graceful legacy fallback.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Update AppSidebar with agent context header and scoped nav links | f21cf97 | lib/chat/components/app-sidebar.jsx |
| 2 | Update SidebarHistory with agent filtering | 817942a | lib/chat/components/sidebar-history.jsx |

## What Was Built

### Task 1: AppSidebar Agent Context Header and Scoped Nav Links

`lib/chat/components/app-sidebar.jsx` — updated to accept `{ user, agentSlug }`:

1. **Function signature** updated from `{ user }` to `{ user, agentSlug }`
2. **Header** — when `agentSlug` is set, renders agent name as a `<button>` that navigates to `/agents` picker with a small `↗` switch indicator; falls back to plain text span with version when `agentSlug` is not set
3. **Nav link scoping** — Chats, Jobs, Subagents, and Pull Requests all use `/agent/${agentSlug}/...` URLs when `agentSlug` is present, otherwise fall back to global un-scoped routes (`/chats`, `/swarm`, `/clusters`, `/pull-requests`)
4. **SidebarHistory** render call updated: `<SidebarHistory agentSlug={agentSlug} />`

### Task 2: SidebarHistory Agent Filtering

`lib/chat/components/sidebar-history.jsx` — updated to accept `{ agentSlug }`:

1. **Function signature** updated from no params to `{ agentSlug }`
2. **Client-side filter** in `loadChats`: `agentSlug ? result.filter((c) => !c.agentSlug || c.agentSlug === agentSlug) : result` — includes chats without agentSlug (legacy/unscoped data) in all contexts
3. **useEffect dependency** updated from `[activeChatId]` to `[activeChatId, agentSlug]` — history reloads automatically when switching agents

## Decisions Made

1. **Edit .jsx source files:** The `.js` files in `lib/chat/components/` are gitignored esbuild output. The actual tracked sources are `.jsx` files — edit those, run `npm run build` to regenerate `.js` output.
2. **Client-side filtering:** The chats table may not have an `agentSlug` column yet. Filtering client-side is a safe approach that degrades gracefully — chats without the field are shown everywhere, not hidden.
3. **Legacy chat inclusion:** Chats with `!c.agentSlug` are included in agent-scoped views — this prevents existing users from losing chat history after deploying this change.

## Deviations from Plan

**1. [Rule 1 - Bug] Edited .jsx source instead of .js built output**
- **Found during:** Task 1 commit attempt
- **Issue:** Plan's IMPORTANT note says "Edit them directly" referring to `.js` files, but these are gitignored esbuild output — commits would fail
- **Fix:** Applied all changes to `.jsx` source files instead; `npm run build` regenerates the `.js` output correctly
- **Files modified:** `lib/chat/components/app-sidebar.jsx`, `lib/chat/components/sidebar-history.jsx`
- **Commit:** f21cf97, 817942a

## Known Stubs

None — all functional changes are wired through. The agentSlug filtering is live (client-side); once the chats table gains an `agentSlug` column, filtering will be meaningful without any further code changes.

## Self-Check

- [x] `lib/chat/components/app-sidebar.jsx` has `agentSlug` in function signature
- [x] `lib/chat/components/app-sidebar.jsx` links to `/agents` when agentSlug set
- [x] `lib/chat/components/app-sidebar.jsx` has scoped nav URLs for Chats, Jobs, Subagents, Pull Requests
- [x] `lib/chat/components/app-sidebar.jsx` passes `agentSlug` to `SidebarHistory`
- [x] `lib/chat/components/sidebar-history.jsx` has `agentSlug` in function signature
- [x] `lib/chat/components/sidebar-history.jsx` filters chats by `agentSlug`
- [x] `lib/chat/components/sidebar-history.jsx` has `agentSlug` in useEffect dependency array
- [x] `npm run build` succeeds
- [x] Commits f21cf97 and 817942a exist

## Self-Check: PASSED
