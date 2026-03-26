# Phase 57: Agent-Scoped Navigation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Mode:** Smart discuss (grey areas presented, all accepted)

<domain>
## Phase Boundary

All navigation, sidebar, and data-fetching become agent-scoped. After picking an agent, URLs follow `/agent/[slug]/...` pattern. Sidebar shows agent name + status, filters chat history, and provides switch-agent action. API calls filter by active agent slug from URL.

</domain>

<decisions>
## Implementation Decisions

### D-01: URL Structure
Slug-based: `/agent/[slug]/chat`, `/agent/[slug]/pull-requests`, `/agent/[slug]/workspaces`, `/agent/[slug]/code`, `/agent/[slug]/clusters`. Slug = instance name (e.g., `noah`, `strategyES`). Consistent with Phase 56's D-05 click action.

### D-02: Source of Truth
URL path param is the source of truth for active agent — not cookie, not React context. Cookie (`lastAgent`) is for login redirect only. All components read agent from URL.

### D-03: Unauthorized Agent Access
If user navigates to an agent they aren't assigned to → redirect to `/agents` picker with toast "Agent not available". Reuse existing forbidden/redirect pattern.

### D-04: Legacy Route Handling
Old un-scoped routes (`/chat`, `/pull-requests`, `/workspaces`, etc.) redirect to `/agents` picker. Forces agent selection. Prevents data leaking across agents.

### D-05: Sidebar Scoping
Agent name + status badge in sidebar header. Clickable → goes to `/agents` picker (switch agent). Small switch icon next to agent name. Navigation items scoped to agent routes. Admin section stays global (not scoped).

### D-06: Chat History Filtering
`sidebar-history.js` filters conversations to current agent slug. User only sees chats for the selected agent.

### D-07: Data Filtering
Pass `agentSlug` from URL param to all data-fetching functions. Server Actions accept `agentSlug` param and filter DB queries. PRs filter by instance repos, workspaces by instance, clusters by instance config.

### D-08: Route Group Layout
Next.js route group: `templates/app/agent/[slug]/layout.js` wraps all agent-scoped pages. Reads slug, validates user access, renders sidebar with agent context. Sub-routes: `chat/`, `pull-requests/`, `workspaces/`, `code/`, `clusters/`.

### Claude's Discretion
Implementation details for layout component, redirect middleware, sidebar modifications, and data-fetching refactors. Follow existing codebase patterns.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/chat/components/app-sidebar.js` — Current sidebar, needs agent scoping
- `lib/chat/components/sidebar-history.js` — Chat history, needs agent filtering
- `lib/chat/components/page-layout.js` — Page layout wrapper
- `templates/app/agents/page.js` — Agent picker page (Phase 56)
- `lib/chat/components/agent-picker-page.jsx` — Picker component with cookie write

### Key Routes to Migrate
- `templates/app/chat/` → `templates/app/agent/[slug]/chat/`
- `templates/app/pull-requests/` → `templates/app/agent/[slug]/pull-requests/`
- `templates/app/workspace/` → `templates/app/agent/[slug]/workspaces/`
- `templates/app/code/` → `templates/app/agent/[slug]/code/`
- `templates/app/clusters/` → `templates/app/agent/[slug]/clusters/`

### Existing Patterns
- Instance config in `instances/{name}/config/`
- `queryAllInstances()` for health data
- `getUserAgentAssignments()` Server Action from Phase 56

</code_context>
