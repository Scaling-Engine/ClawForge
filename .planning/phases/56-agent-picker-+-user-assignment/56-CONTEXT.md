# Phase 56: Agent Picker + User Assignment - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Smart discuss (grey areas presented, all accepted)

<domain>
## Phase Boundary

After login, users see a card grid of their assigned agents with live status. Superadmin can assign users to agents with per-agent roles. Users with no assignments see an empty state. Selected agent persists via cookie.

</domain>

<decisions>
## Implementation Decisions

### D-01: Agent Picker Layout
Card grid layout (2-3 cards per row) matching existing superadmin dashboard pattern. Each card shows: agent name, status badge (online/offline), last job timestamp, open PR count, active workspace count. Cookie-based persistence (`lastAgent`, 30-day TTL).

### D-02: Empty State
Centered message "No agents assigned yet. Contact your admin." with muted icon. No redirect.

### D-03: User-Agent Assignment UI
New `/admin/users/[id]` detail page with agent checkboxes and role dropdown (viewer/operator/admin) per agent. Assignment takes effect immediately on save via Server Action.

### D-04: Agent Health Data
Reuse `queryAllInstances()` → `/api/superadmin/health` — already proven, 30s cache. Offline agents shown as greyed cards with "Offline" badge, still clickable.

### D-05: Agent Card Click Action
Click navigates to `/agent/[slug]/chat` — chat is the primary interaction.

### Claude's Discretion
Implementation details for the picker page component, admin detail page, and Server Actions. Follow existing codebase patterns (SuperadminDashboard for cards, AdminUsersPage for user management).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/chat/components/superadmin-dashboard.jsx` — Instance/Agent cards with health data, status badges, stat numbers
- `lib/chat/components/admin-users-page.jsx` — User management table with role editing
- `lib/superadmin/client.js` — `queryAllInstances()`, health endpoint queries
- `lib/db/hub-users.js` — Hub user CRUD functions (from Phase 53)
- `lib/auth/edge-config.js` — JWT with `assignedAgents` claim (from Phase 53)

### Established Patterns
- Server Actions for form submissions in admin pages
- Admin layout with sidebar navigation
- Cards grid with status badges in superadmin dashboard
- User role editing via dropdown in users page

### Integration Points
- `lib/auth/edge-config.js` — session.user.assignedAgents for filtering visible agents
- `lib/proxy/http-proxy.js` — /agent/[slug]/* routing (from Phase 55)
- `lib/auth/middleware.js` — /agents/* route guard (from Phase 53)
- `templates/app/admin/users/[id]/page.js` — New page route for user detail
- `templates/app/agents/page.js` — New page route for agent picker

</code_context>

<specifics>
## Specific Ideas

No additional specific requirements.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
