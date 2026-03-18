---
phase: 45-self-service-onboarding
plan: 03
subsystem: ui
tags: [react, tailwind, empty-states, tooltips, ux, admin-panel]

# Dependency graph
requires: []
provides:
  - AGENT_* prefix tooltip on secrets page name input
  - Container/Container+LLM badges on existing AGENT_* secrets in list
  - Actionable empty states with CTA buttons on repos, secrets, and MCP pages
affects: [onboarding, admin-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Actionable empty state pattern: emoji + heading + description + CTA button"
    - "title attribute tooltips for inline field help on admin forms"
    - "AGENT_* badge pattern: blue for Container, purple for Container+LLM"

key-files:
  created: []
  modified:
    - lib/chat/components/settings-secrets-page.jsx
    - lib/chat/components/admin-repos-page.jsx
    - lib/chat/components/settings-mcp-page.jsx

key-decisions:
  - "MCP page CTA toggles setup instructions panel (not a form) — MCP servers are file-based config, no UI add form exists"
  - "JS files are gitignored build artifacts — only JSX source files committed; npm run build regenerates JS from JSX"
  - "title attribute used for tooltips (no new dependency) — lightweight, browser-native, consistent with plan spec"

patterns-established:
  - "Actionable empty state: emoji icon + h3 heading + description p + blue CTA button (bg-blue-600)"
  - "AGENT_ badge: text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded"
  - "AGENT_LLM_ badge: same but purple (bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300)"

requirements-completed: [ONB-05, ONB-06]

# Metrics
duration: 8min
completed: 2026-03-18
---

# Phase 45 Plan 03: UX Improvements — Tooltips and Actionable Empty States Summary

**AGENT_* prefix tooltip + container access badges on secrets page, actionable empty states with CTA buttons on repos/secrets/MCP pages**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-18T02:48:00Z
- **Completed:** 2026-03-18T02:56:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Secrets page name input now has a tooltip (title attribute + info icon) explaining AGENT_* prefix convention
- Existing AGENT_* secrets in the list show "Container" badge (blue); AGENT_LLM_* secrets show "Container + LLM" badge (purple)
- Repos page empty state upgraded from plain text to emoji + heading + description + "Add First Repository" CTA button
- Secrets page GitHub Secrets empty state upgraded to emoji + heading + description + "Add First Secret" CTA button
- MCP page empty state upgraded to emoji + heading + description + "Add First MCP Server" CTA button (reveals setup instructions panel on click)

## Task Commits

Each task was committed atomically:

1. **Task 1: Tooltips on AGENT_* fields in secrets page** - `9cffd3c` (feat)
2. **Task 2: Actionable empty states on repos, secrets, and MCP pages** - `2eac9bd` (feat)

## Files Created/Modified

- `lib/chat/components/settings-secrets-page.jsx` - Added info icon + title tooltip on Name input, added AGENT_* container access badges in secrets list, upgraded empty state
- `lib/chat/components/admin-repos-page.jsx` - Replaced minimal empty text with actionable empty state and CTA button
- `lib/chat/components/settings-mcp-page.jsx` - Replaced minimal empty state with actionable empty state, CTA button, and toggle-able setup instructions panel

## Decisions Made

- **MCP CTA behavior:** The "Add First MCP Server" button toggles a setup instructions panel instead of a form, because MCP servers are configured via JSON file (`instances/[name]/config/MCP_SERVERS.json`), not a UI form. This is the correct UX for file-based config.
- **JS files are gitignored:** The `.js` files in `lib/chat/components/` are build artifacts compiled by esbuild from JSX sources. They are gitignored — only the `.jsx` source files are committed. Running `npm run build` regenerates them.
- **title attribute tooltips:** Used the lightweight `title` attribute approach (no new dependencies) per plan spec. Added an inline `(i)` icon with matching tooltip text.

## Deviations from Plan

None - plan executed exactly as written. The only note is that the MCP CTA toggles a setup instructions panel rather than a form (since MCP is file-based), which is consistent with the existing page behavior and the plan's intent of providing an actionable next step.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three admin pages now have actionable empty states — new operators get clear guidance on what to do first
- AGENT_* badge system makes it visually clear which secrets are accessible in containers vs. LLM vs. neither
- Ready for Phase 45 completion (onboarding wizard plans)
