# Feature Research: v4.0 Multi-Tenant Agent Platform

**Domain:** Multi-tenant AI agent platform — shared auth, agent picker dashboard, request proxying, per-agent scoped UI, cross-agent aggregate views, user-agent assignment, terminology migration
**Researched:** 2026-03-24
**Confidence:** MEDIUM (patterns derived from analogous SaaS products — Vercel, Linear, Botpress, Voiceflow — and multi-tenant architecture guides; no direct reference implementation for this exact problem)
**Scope:** NEW features only for v4.0. Everything through v2.2/v3.0 is shipped and not re-researched.

---

## Context: What Is Being Built

Today, each ClawForge instance runs at a separate subdomain (clawforge.scalingengine.com, strategyes.scalingengine.com). Each has its own auth (NextAuth v5, SQLite users table), its own UI, and its own URL. Users bookmark different subdomains for different agents. The superadmin portal (v2.2) provides cross-instance visibility but requires a separate login and is admin-only.

v4.0 collapses this into a single-URL product:

- One login at one URL
- Post-login: user sees a dashboard of their assigned agents (the "agent picker")
- User selects an agent → all UI (chat, PRs, workspaces, sub-agents) scopes to that agent
- The browser never leaves the central URL — requests are proxied to the correct instance container
- Superadmin can assign users to agents and see cross-agent aggregate views
- "Instances" renamed to "Agents" everywhere in the user-facing UI

**What is confirmed shipped (do not rebuild):**

| Capability | Location |
|-----------|----------|
| Three-tier RBAC: user/admin/superadmin | `lib/auth/middleware.js`, users table role column |
| Superadmin portal: instance switching, health dashboard, cross-instance job search | `app/superadmin/`, API proxy pattern |
| Per-instance auth (NextAuth v5, SQLite users per instance) | `app/api/auth/`, each instance runs independently |
| Instance management page in admin panel | `app/admin/instances/` |
| API proxy pattern for cross-instance queries | `queryAllInstances()` with `Promise.allSettled` |
| AGENT_SUPERADMIN_TOKEN M2M auth between hub and instances | Bearer token validation |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Agent picker dashboard** | Any multi-tenant product shows a user their assigned resources after login. Without this, users don't know what they have access to or where to start. This is the primary post-login experience. Every product with organization/workspace switching (GitHub, Vercel, Linear, Notion) has a picker UI. | MEDIUM | Post-login landing page at `/` (or `/agents`). Queries the central user registry for `userId → [agentIds]` mapping. For each assigned agent, shows: agent name (from SOUL.md), status indicator (online/offline), last activity timestamp. Click → navigate to `/agent/[slug]/chat`. Cards or list view. Empty state for users with no assignments: "Contact your admin to get access." Reuses `queryAllInstances()` API proxy pattern from superadmin portal. |
| **Shared auth layer with single login** | Users should not need separate credentials per agent. One login, one session, all assigned agents accessible. Industry standard: GitHub users don't have separate passwords per org. | HIGH | Central user registry (new `users` table in hub SQLite DB) separate from per-instance users tables. On login, hub authenticates user and issues a session with `userId` and `assignedAgents: [slug]`. Request proxy reads `agentSlug` from URL path, forwards request to correct instance with hub session token. Per-instance auth can be removed or bypass-proxied. This is the highest-complexity piece of the milestone — all other features depend on it. |
| **Per-agent scoped navigation** | Once a user selects an agent, all navigation (sidebar, links, breadcrumbs) must stay within that agent's context. Switching agents should require an intentional action, not happen accidentally. | MEDIUM | URL structure: `/agent/[slug]/chat`, `/agent/[slug]/prs`, `/agent/[slug]/workspaces`, `/agent/[slug]/subagents`. Sidebar scoped to selected agent — shows agent name at top, lists that agent's resources. Persistent agent context in session (cookie or URL path). "Switch agent" affordance visible but not prominent — typically a top-left logo area or dropdown showing current agent name. |
| **Request proxy (single URL, routed to instances)** | Users must stay at one URL. The browser should not redirect to per-instance subdomains. All existing instance API routes must continue working. | HIGH | Next.js middleware rewrites: `middleware.js` intercepts `/agent/[slug]/*` requests, maps `slug → instance URL`, proxies to that instance's API/pages. For API routes: `fetch(instanceUrl + path, { headers: { Authorization: hub-token } })`. For page routes: could use Next.js Multi-Zones (separate Next.js apps sharing a domain via rewrites) OR iframe-based embedding OR server-side proxy rendering. Multi-Zones is the cleanest approach (each instance remains a standalone Next.js app). iframes are problematic for terminal/WebSocket. Full server-side proxy is the most work but the most seamless. |
| **User-agent assignment (superadmin assigns users)** | Admins must be able to control which users see which agents. Without this, every user sees every agent (privacy concern) or no users see any agents (no product). | MEDIUM | New `user_agent_assignments` table in hub DB: `(userId, agentSlug, role)`. Superadmin UI: assignment page where superadmin selects a user, then checks which agents they can access. Alternatively: per-agent user list (select users → assign to this agent). Both views needed. Role field allows per-agent granularity: `viewer` (chat only) vs `operator` (chat + workspaces + admin panel). |
| **"Agents" terminology throughout UI** | The word "instances" is internal/technical. Users of a multi-tenant platform see "agents" (or "bots" in consumer products). Mismatched terminology creates friction at every touchpoint. | LOW | Purely a rename: update all user-facing strings. Create a terminology map: instances → agents, instance management → agent management, instanceId → agentId in UI labels. Backend variable names (instanceId, instance slug) do not need to change — only UI text. Risk: grep for `instance` in all page/component files and distinguish user-facing strings from code identifiers. |
| **Persistent agent context across page loads** | If a user is working in agent "Archie" and refreshes the page, they should return to Archie — not be dropped to the picker. | LOW | Store `lastSelectedAgent` in the session (cookie or JWT claim). On load: if valid agent in session → navigate directly. If no agent in session → show picker. URL-based routing (`/agent/[slug]/...`) provides this naturally when users bookmark deep links. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Cross-agent aggregate views** | Superadmins and multi-agent users want to see all PRs, all active workspaces, all running sub-agents in one view without switching contexts. This is the "all inboxes" view of agent platforms. | MEDIUM | New `/agents/overview` page: tabs for All PRs, All Workspaces, All Sub-Agents. Each tab queries all assigned instances via `queryAllInstances()`, merges results, renders unified list with an "Agent" column showing which agent each item belongs from. Reuses the existing API proxy + `Promise.allSettled` pattern from the superadmin health dashboard. Filter by agent (multiselect). Superadmin sees all; regular users see only their assigned agents. |
| **Agent status card with recent activity** | The agent picker dashboard is more useful if each agent card shows recent activity: last job, last PR, active workspace count. Makes the picker functional, not just navigational. | MEDIUM | Each agent card fetches summary data from that instance: last job timestamp + status, open PR count, active workspace count. These are available via the existing superadmin API proxy (`/api/superadmin/health`). Cached 30s (same as health dashboard). Adds meaningful signal without requiring new APIs. |
| **Agent quick-launch from picker** | Users with repetitive tasks should be able to initiate a job directly from the agent picker without navigating into the agent. "Run a job on Archie" from the dashboard. | MEDIUM | Each agent card has a "Start job" button that opens a modal: pre-filled with the agent's default repo, a text area for the job prompt, dispatch button. Submits via the existing `createJob` API proxied to that agent. This is the "power user" shortcut — most users don't need it, but it's a strong retention feature for operators who dispatch many jobs. |
| **Per-agent role differentiation** | A user might be an `operator` on one agent (full access including workspaces and admin) but only a `viewer` on another (chat only). This enables shared agents where some users are read-only. | MEDIUM | The `user_agent_assignments.role` field (from table stakes) is the foundation. Middleware checks the user's role for the selected agent and adjusts navigation accordingly: `viewer` sees Chat, PRs; `operator` sees Chat, PRs, Workspaces, Sub-Agents; `admin` sees all including Admin panel. Role-gating reuses existing `isAdmin()` / `isSuperAdmin()` middleware pattern, adding a new `getAgentRole(userId, agentSlug)` function. |
| **Agent onboarding state on picker card** | If an agent hasn't been fully onboarded (from v3.0 onboarding wizard), the picker card shows an "incomplete setup" warning so the operator knows it's not ready for users. | LOW | Add `onboardingComplete: boolean` to the agent card data (read from instance health endpoint). If false: render a yellow "Setup incomplete" badge on the card, linking to the admin setup page for that agent. Adds context without requiring new infrastructure — the v3.0 onboarding step table already tracks this. |

### Anti-Features (Commonly Requested, Often Problematic)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Subdomain-per-agent routing (keep as-is)** | "It's simpler to keep separate subdomains" | Users must maintain separate bookmarks, separate logins, separate sessions. The entire value of v4.0 is collapsed into a single URL. Keeping subdomains defeats the purpose. | Path-based routing (`/agent/[slug]/`) at the central domain. Subdomains can 301-redirect to the central URL for backwards compatibility. |
| **Full iframe embedding of instance UIs** | "Each instance is already a working Next.js app — why not just iframe it?" | iframes break xterm.js terminal (clipboard, focus, resize events don't work correctly). WebSocket proxying through iframes is unreliable. Browser security policies restrict cross-origin iframes. Postmessage-based auth is fragile. Keyboard shortcuts stop working. | Server-side request proxying (Next.js middleware rewrites or Multi-Zones). The terminal/WebSocket paths need special handling regardless — iframes make this worse, not better. |
| **Shared SQLite DB across all instances** | "One database would simplify cross-agent queries" | SQLite is file-based and does not support concurrent writes from multiple processes. Merging per-instance SQLite DBs would require a migration to PostgreSQL or a separate cross-instance aggregation DB — a major infrastructure change. Each instance must retain its own SQLite DB for isolation. | API proxy pattern: hub queries each instance via HTTP, aggregates results. Already proven in v2.2 superadmin portal (`queryAllInstances()`). No DB migration required. |
| **Real-time cross-agent feed (SSE/WebSocket at hub level)** | "Show live job events from all agents in the aggregate view" | Multiplexing SSE streams from N instances at the hub level requires persistent connections to all instances simultaneously. Under any instance downtime, the hub connection pool degrades. Operational complexity is high relative to the use case. | Polling at 30s intervals (same as the health dashboard). For live job streaming, users are already on the per-agent view where SSE works directly. The aggregate view is a summary, not a real-time monitor. |
| **Automatic user provisioning across all instances on hub sign-up** | "When a user registers, auto-create them in every instance" | Creates ghost users with no access in instances they were never assigned. Makes the `user_agent_assignments` table meaningless. Violates the principle of least privilege. | Superadmin explicitly assigns users to agents. Users see only assigned agents. Start with no access, grant as needed. |
| **Deep link preservation through proxy (initially)** | "When proxying, every query param, hash, and state should be preserved perfectly" | Deep link preservation through a request proxy is complex and error-prone, especially for WebSocket upgrade paths, SSE connections, and terminal sessions that use custom headers. Getting 90% right is fast; getting 100% right takes 3x longer. | Build for the common paths first (chat, PRs, workspaces). Flag known-complex paths (terminal WS, SSE streaming) for explicit handling in a follow-up phase. Ship working proxy for the standard HTTP paths. |

---

## Feature Dependencies

```
Shared Auth Layer (central user registry)
    └──required by──> Agent Picker Dashboard
    └──required by──> User-Agent Assignment UI
    └──required by──> Request Proxy (auth forwarding)
    └──required by──> Per-Agent Role Differentiation

Request Proxy
    └──required by──> Per-Agent Scoped Navigation (URL routing)
    └──required by──> Cross-Agent Aggregate Views (API proxying)

User-Agent Assignment
    └──required by──> Agent Picker Dashboard (what to show each user)
    └──required by──> Per-Agent Role Differentiation (what role to show)

Agent Picker Dashboard
    └──enhanced by──> Agent Status Cards with Recent Activity
    └──enhanced by──> Agent Onboarding State Indicator

Terminology Migration (instances → agents)
    └──independent of all features──> Can be done in any phase
    └──recommended in──> First phase (sets vocabulary for all subsequent UI work)
```

### Dependency Notes

- **Shared auth layer must ship first:** Every other v4.0 feature either requires central auth or is blocked by the absence of it. This is the critical path. If shared auth is descoped or delayed, nothing else in v4.0 is deliverable.
- **Request proxy complexity depends on scope:** A simple HTTP proxy for API routes is achievable quickly. Proxying WebSocket connections (terminal) and SSE streams (job log streaming) requires per-path handling. Scope the proxy incrementally: HTTP first, then WS, then SSE.
- **Cross-agent aggregate views reuse existing infrastructure:** `queryAllInstances()`, `Promise.allSettled`, API proxy with `AGENT_SUPERADMIN_TOKEN` are all shipped in v2.2. The aggregate view feature is mostly a new UI layer on top of existing machinery.
- **User-agent assignment is a superadmin operation:** Regular users do not assign themselves to agents. The assignment UI lives in the superadmin portal or admin panel — not the user-facing UI. This keeps the permission model clean.
- **Terminology migration does not block any feature:** But doing it early prevents accumulating new uses of "instance" in UI strings during v4.0 development. Do it in phase 1 or 2.

---

## MVP Definition

### Launch With (v4.0)

Minimum viable product — what's needed to make the single-URL product usable.

- [ ] **Shared auth layer** — Without this, nothing else works. Users cannot have one login across agents.
- [ ] **Agent picker dashboard** — Post-login experience. Users must see their agents and be able to navigate to one.
- [ ] **User-agent assignment in superadmin UI** — Without this, no user sees any agents in the picker.
- [ ] **Request proxy for HTTP routes** — Standard page navigation (chat, PRs, workspaces) must work through the proxy.
- [ ] **Per-agent scoped navigation (URL routing)** — The `/agent/[slug]/...` URL structure that keeps users in agent context.
- [ ] **Terminology migration** — "Agents" everywhere user-facing. Low cost, high polish.

### Add After Validation (v4.x)

Features to add once core is working.

- [ ] **WebSocket proxy for terminal** — Terminal access through the proxy. More complex than HTTP; validate HTTP proxy first.
- [ ] **Cross-agent aggregate views** — Useful for power users and superadmin; not needed for day-1 usability.
- [ ] **Per-agent role differentiation** — Viewer vs operator vs admin per agent. Validate the basic assignment model first.
- [ ] **Agent status cards with recent activity** — Enriches the picker; not required for basic navigation.

### Future Consideration (v4.x+)

Features to defer until the multi-tenant model is validated with users.

- [ ] **Agent quick-launch from picker** — Power user shortcut; most users will navigate into the agent first.
- [ ] **SSE proxy for job log streaming** — Complex; direct agent navigation for log-intensive workflows is acceptable short-term.
- [ ] **Self-service agent creation** — Users requesting their own agent instances; requires billing integration (v3.0 entitlement layer).

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Shared auth layer | HIGH | HIGH | P1 — critical path |
| User-agent assignment | HIGH | MEDIUM | P1 — required for picker |
| Agent picker dashboard | HIGH | MEDIUM | P1 — primary UX |
| Request proxy (HTTP) | HIGH | HIGH | P1 — required for single URL |
| Per-agent scoped navigation | HIGH | MEDIUM | P1 — required for single URL |
| Terminology migration | MEDIUM | LOW | P1 — low cost, do early |
| WebSocket proxy (terminal) | HIGH | HIGH | P2 — required but complex, phase 2 |
| Cross-agent aggregate views | MEDIUM | MEDIUM | P2 — superadmin/power user |
| Per-agent role differentiation | MEDIUM | MEDIUM | P2 — requires assignment to validate first |
| Agent status cards (activity) | MEDIUM | MEDIUM | P2 — enriches picker |
| Agent onboarding state on card | LOW | LOW | P3 — nice-to-have |
| Agent quick-launch from picker | MEDIUM | MEDIUM | P3 — power user shortcut |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Analogous Platform Analysis

This is not a direct competitor analysis (no direct competitor matches ClawForge's specific model), but these products solve adjacent problems and inform the expected user flows.

| Feature Pattern | How Analogues Do It | ClawForge Approach |
|---------|--------------|--------------|
| **Org/workspace picker** | GitHub: org picker at `github.com` before navigating to repos. Vercel: team switcher in left sidebar, persists selected team in session. Linear: workspace switcher at top-left, changes all navigation context. | Agent picker as post-login landing page. Selected agent stored in session. Sidebar shows current agent name with a "change" link. |
| **Per-tenant scoped navigation** | Vercel: all navigation (projects, deployments, settings) scoped to selected team; team slug in URL (`/[team-slug]/[project]`). Linear: all views filter to current workspace. | URL-based: `/agent/[slug]/chat`, `/agent/[slug]/prs`. Slug in URL makes bookmarking work naturally. Sidebar links use current agent slug. |
| **Cross-tenant aggregate views** | GitHub: `/pulls` shows all PRs across repos. Vercel: activity feed across all projects. Slack: "all unreads" across channels. | `/agents/overview` with tabs for All PRs, All Workspaces. Queries all assigned instances, merges results with agent column. |
| **User-to-tenant assignment** | Vercel: team admin invites users by email, assigns roles (Owner/Member). GitHub: org admin adds members, assigns repo access. Botpress: workspace admin assigns roles per agent. | Superadmin assigns users to agents via `user_agent_assignments` table. Per-agent role (viewer/operator/admin). No self-service invite (yet). |
| **Request routing (single domain)** | Vercel Multi-Zones: multiple Next.js apps at different paths under one domain via rewrites. Netlify: path-based routing to different services. | Next.js middleware rewrites: `middleware.js` maps `/agent/[slug]/*` to instance URL. Multi-Zones pattern if instances remain standalone apps. |
| **Terminology migration** | Slack renamed "channels" to "canvases" for some features. Linear consistently uses "workspace" not "organization." Naming consistency builds mental model. | "Instances" → "Agents" in all UI text. Backend variable names unchanged. Grep-and-replace on user-facing strings. |

**Confidence note:** These are analogical patterns, not confirmed implementations. The specific request proxy approach (middleware rewrites vs Multi-Zones vs full server proxy) needs a feasibility check against ClawForge's WebSocket and SSE requirements before committing to one pattern. MEDIUM confidence.

---

## Sources

- [WorkOS: Developer's Guide to SaaS Multi-Tenant Architecture](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture) — auth patterns, tenant isolation, "never infer tenant without explicit intent"
- [Logto: Build a Multi-Tenant SaaS Application](https://logto.medium.com/build-a-multi-tenant-saas-application-a-complete-guide-from-design-to-implementation-d109d041f253) — user identity management across tenants
- [Next.js Multi-Zones Guide](https://nextjs.org/docs/pages/guides/multi-zones) — path-based routing across multiple Next.js apps under one domain
- [Next.js Multi-Tenant Application (Kavanagh)](https://johnkavanagh.co.uk/articles/building-a-multi-tenant-application-with-next-js/) — tenant detection patterns (subdomain, path, domain)
- [Botpress: Complete AI Agent Platform](https://botpress.com/en) — fully isolated runtime per agent, RBAC, enterprise workspace model
- [Sendbird: RBAC for AI Agents](https://sendbird.com/blog/ai-agent-role-based-access-control) — role-based access patterns for agent platforms
- [Vercel Team Management Docs](https://vercel.com/docs/rbac/managing-team-members) — org/team switcher, role assignment patterns
- [Auth0: Multi-Tenant App Best Practices](https://auth0.com/docs/get-started/auth0-overview/create-tenants/multi-tenant-apps-best-practices) — tenant isolation, user assignment
- [Next.js App Router team switching discussion](https://github.com/vercel/next.js/discussions/61719) — implementation patterns for team context in App Router

---

*Feature research for: v4.0 Multi-Tenant Agent Platform*
*Researched: 2026-03-24*
