# Phase 54: Terminology Migration - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Every user-facing string in the platform says "agent" or "agents" — no user ever reads "instance" in the UI. URL paths use `/agent/[slug]/` structure. Backend variable names, DB column names, env vars, and directory names remain unchanged (UI-only rename per v4.0 decision).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase (string replacement). Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraints from STATE.md v4.0 decisions:
- Terminology layer 1 only: UI strings renamed to "agent/agents" in v4.0
- DB column names (`instance_name`), env var names, and directory names unchanged
- Backend variable names in JS code unchanged — only user-visible text in JSX/templates
- URL paths should use `/agent/[slug]/` structure for agent navigation

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/chat/components/*.jsx` — Chat UI components with user-visible strings
- `templates/app/` — Page templates with headings and labels
- `app/admin/` — Admin panel pages with instance management
- `lib/chat/components/superadmin-dashboard.jsx` — Instance cards in superadmin portal

### Established Patterns
- User-facing strings are inline in JSX (no i18n library)
- Admin panel uses sidebar navigation labels
- Superadmin portal has instance switching UI

### Integration Points
- Sidebar navigation labels
- Page headings and breadcrumbs
- Admin panel menu items
- Superadmin dashboard cards
- Notification messages containing "instance"

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
