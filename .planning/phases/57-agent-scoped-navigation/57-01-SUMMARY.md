---
phase: 57-agent-scoped-navigation
plan: "01"
subsystem: routing
tags: [navigation, routing, middleware, agent-scoped, layout]
dependency_graph:
  requires: [56-agent-picker-+-user-assignment]
  provides: [agent-scoped-route-group, legacy-route-redirects]
  affects: [templates/app/agent/[slug], lib/auth/middleware.js, templates/app/page.js]
tech_stack:
  added: []
  patterns: [Next.js route group layout, server-component auth validation, client-wrapper pattern]
key_files:
  created:
    - templates/app/agent/[slug]/layout.js
    - lib/chat/components/agent-layout-client.jsx
  modified:
    - lib/chat/components/index.js
    - lib/auth/middleware.js
    - templates/app/page.js
decisions:
  - "Agent layout uses server + client split: server component handles auth/redirect, AgentLayoutClient handles ChatNavProvider + SidebarProvider (cannot pass server-defined functions as React context values)"
  - "hasAccess check: !isHubMode || isAdmin || assignedAgents.includes(slug) — spoke-mode instances (no SUPERADMIN_HUB) grant access to all slugs by default"
  - "LEGACY_AGENT_ROUTES inserted before admin guard in middleware — matches /chat, /pull-requests, /workspace, /clusters, /code, /chats and their sub-paths"
metrics:
  duration: "48 seconds"
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_changed: 5
---

# Phase 57 Plan 01: Agent-Scoped Navigation Foundation Summary

**One-liner:** Server-component route group layout at `/agent/[slug]/` validates assignedAgents and redirects unauthorized access; legacy un-scoped routes and root `/` redirect to `/agents` picker.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create agent route group layout with access validation | 705cdd2 | templates/app/agent/[slug]/layout.js, lib/chat/components/agent-layout-client.jsx, lib/chat/components/index.js |
| 2 | Update middleware + root page for legacy route redirects | c453554 | lib/auth/middleware.js, templates/app/page.js |

## What Was Built

### Task 1: Route Group Layout

`templates/app/agent/[slug]/layout.js` — async Server Component that:
1. Awaits `params` to extract `slug` (Next.js 15 pattern)
2. Calls `auth()` to get session
3. Validates access: admins bypass the check; spoke-mode instances (no `SUPERADMIN_HUB`) allow all slugs; hub-mode users must be in `assignedAgents`
4. Redirects unauthorized access to `/agents`
5. Renders `AgentLayoutClient` with `agentSlug` and `user`

`lib/chat/components/agent-layout-client.jsx` — `'use client'` component that:
1. Defines agent-scoped `navigateToChat(id)` using `/agent/${agentSlug}/chat/${id}`
2. Wraps children in `ChatNavProvider` + `SidebarProvider` + `AppSidebar` + `SidebarInset`
3. Passes `agentSlug` to `AppSidebar` for future agent-aware sidebar work

`lib/chat/components/index.js` — added `AgentLayoutClient` export.

### Task 2: Legacy Route Redirects

`lib/auth/middleware.js` — added `LEGACY_AGENT_ROUTES` block before admin guard. Redirects `/chat`, `/pull-requests`, `/workspace`, `/clusters`, `/code`, `/chats` (and sub-paths) to `/agents`.

`templates/app/page.js` — replaced `ChatPage` render with `redirect('/agents')`. Root `/` no longer renders the chat directly; users must select an agent first.

## Decisions Made

1. **Server + client split for layout:** Server component cannot pass functions as React context values — client wrapper pattern is required. `AgentLayoutClient` is the client boundary.
2. **Hub-mode guard logic:** `hasAccess = !isHubMode || isAdmin || assignedAgents.includes(slug)` — spoke instances (SUPERADMIN_HUB not set) allow all agent slugs, so they continue working as single-agent deployments.
3. **Legacy route list:** Includes `/chats` (plural) as well as `/workspace` (singular) to cover all known un-scoped routes.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no hardcoded empty values or placeholder data in new files.

## Self-Check

- [x] `templates/app/agent/[slug]/layout.js` exists
- [x] `lib/chat/components/agent-layout-client.jsx` exists with `'use client'`
- [x] `lib/chat/components/index.js` exports `AgentLayoutClient`
- [x] `lib/auth/middleware.js` contains `LEGACY_AGENT_ROUTES` redirect to `/agents`
- [x] `templates/app/page.js` redirects to `/agents`, no longer imports `ChatPage`
- [x] Commits 705cdd2 and c453554 exist
