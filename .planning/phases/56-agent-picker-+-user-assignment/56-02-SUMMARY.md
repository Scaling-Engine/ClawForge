---
phase: 56-agent-picker-+-user-assignment
plan: 02
subsystem: ui
tags: [react, next-js, client-component, agent-picker, cookie-persistence]

# Dependency graph
requires:
  - phase: 56-01
    provides: getAgentPickerData Server Action, hub DB CRUD
provides:
  - AgentPickerPage client component: card grid with StatusBadge, stats, cookie persistence, empty state
  - /agents page shell at templates/app/agents/page.js
affects: [56-03-admin-user-detail-page]

# Tech tracking
tech-stack:
  added: []
  patterns: [use-client-with-useEffect-load, cookie-persistence-on-click, card-grid-with-status-badge]

key-files:
  created:
    - lib/chat/components/agent-picker-page.jsx
    - templates/app/agents/page.js
  modified:
    - lib/chat/components/index.js

key-decisions:
  - "AgentCard is a <button type=button> (not a div) for accessibility — keyboard-navigable card grid"
  - "Offline agents rendered with opacity-60 but remain clickable per D-01 decision"
  - "No polling interval in AgentPickerPage.useEffect — picker is not a live dashboard (load-once pattern)"
  - "lastAgent cookie uses SameSite=Lax (not httpOnly) — must be JS-readable for picker persistence check"

requirements-completed: [PICK-01, PICK-02, PICK-04, USER-03]

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 56 Plan 02: AgentPickerPage Component Summary

**AgentPickerPage client component with card grid (status badge, stat numbers, cookie persistence) and /agents page shell wired to the getAgentPickerData Server Action**

## Performance

- **Duration:** ~2 min
- **Completed:** 2026-03-26T03:08:40Z
- **Tasks:** 2 (both found complete, Task 2 commit issued)
- **Files modified:** 3

## Accomplishments

- Created `lib/chat/components/agent-picker-page.jsx` as a `'use client'` component with:
  - `formatRelativeTime` and `StatusBadge` helpers copied from `superadmin-dashboard.jsx`
  - `AgentCard` rendered as `<button type="button">` for accessibility
  - 3-column stats grid: Active Jobs, Open PRs, Workspaces
  - `onSelect(slug)` sets `lastAgent` cookie with 30-day TTL on card click
  - Empty state: "No agents assigned yet." + "Contact your admin to get access."
  - `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` card layout
  - Load-once pattern (no polling interval) via `useEffect` + `useCallback`
- Added `export { AgentPickerPage } from './agent-picker-page.jsx'` to `lib/chat/components/index.js`
- Created `templates/app/agents/page.js` as a thin page shell rendering `<AgentPickerPage />`

## Task Commits

1. **Task 1: Create AgentPickerPage component** - `31a30b4` (feat, pre-committed)
2. **Task 2: Add export + /agents page shell** - `dbd9a53` (feat)

## Files Created/Modified

- `lib/chat/components/agent-picker-page.jsx` (162 lines) - Full AgentPickerPage with all card, skeleton, and empty-state subcomponents
- `lib/chat/components/index.js` - Added AgentPickerPage export (additive only, existing exports unchanged)
- `templates/app/agents/page.js` - Thin wiring shell, no business logic (follows templates/CLAUDE.md convention)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - AgentPickerPage calls `getAgentPickerData()` on mount which queries live hub DB and instance health endpoints. Data is real, not hardcoded.

## Self-Check: PASSED

- `lib/chat/components/agent-picker-page.jsx` exists: FOUND
- `templates/app/agents/page.js` exists: FOUND
- All acceptance criteria verified: `'use client'`, `export function AgentPickerPage`, `getAgentPickerData`, `lastAgent`, `/agent/.*chat`, `No agents assigned`, `Contact your admin`, `sm:grid-cols-2` — all present
- Build passes: confirmed
- Commits: `31a30b4` (task 1) and `dbd9a53` (task 2) both in git log

---
*Phase: 56-agent-picker-+-user-assignment*
*Completed: 2026-03-26*
