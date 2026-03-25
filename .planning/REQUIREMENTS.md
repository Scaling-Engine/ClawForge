# Requirements: ClawForge v4.0 Multi-Tenant Agent Platform

**Defined:** 2026-03-24
**Core Value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results

## v1 Requirements

Requirements for v4.0. Each maps to roadmap phases.

### Auth

- [x] **AUTH-01**: User can log in once at clawforge.scalingengine.com and access all assigned agents without re-authenticating
- [x] **AUTH-02**: Hub maintains a central user registry (hub SQLite DB) separate from per-instance user tables
- [x] **AUTH-03**: Hub session JWT includes `assignedAgents` claim listing agent slugs the user can access
- [x] **AUTH-04**: All instance containers share a standardized AUTH_SECRET for cross-instance token validation
- [x] **AUTH-05**: Instance containers are not directly accessible from the internet (no host port bindings in production)

### Proxy

- [ ] **PROXY-01**: HTTP requests to `/agent/[slug]/*` are proxied to the correct instance container with hub auth token
- [ ] **PROXY-02**: Browser URL stays on clawforge.scalingengine.com for all navigation — no redirects to instance subdomains
- [ ] **PROXY-03**: WebSocket connections for terminal sessions are proxied through the hub to the correct instance container
- [ ] **PROXY-04**: SSE streams for job log streaming work through the proxy layer
- [ ] **PROXY-05**: Spoke instances accept hub Bearer token on all API routes (not just /api/superadmin/*)

### Picker

- [ ] **PICK-01**: After login, user sees an agent picker dashboard showing all agents they're assigned to
- [ ] **PICK-02**: Each agent card shows status (online/offline), last job timestamp, open PR count, and active workspace count
- [ ] **PICK-03**: User can dispatch a job directly from the agent picker without navigating into the agent
- [ ] **PICK-04**: Selected agent persists across page loads — refresh returns to the same agent context

### Users

- [ ] **USER-01**: Superadmin can assign users to specific agents via the admin UI
- [ ] **USER-02**: Superadmin can set per-agent roles (viewer/operator/admin) for each user-agent assignment
- [ ] **USER-03**: Users with no agent assignments see an empty state directing them to contact their admin

### Scope

- [ ] **SCOPE-01**: Sidebar navigation is scoped to the selected agent (agent name at top, that agent's resources listed)
- [ ] **SCOPE-02**: Chat page is scoped to the selected agent's conversation history and job dispatch
- [ ] **SCOPE-03**: PRs page shows pull requests from the selected agent only (by default)
- [ ] **SCOPE-04**: Workspaces page shows workspaces from the selected agent only (by default)
- [ ] **SCOPE-05**: Sub-agents page shows sub-agent definitions from the selected agent only (by default)
- [ ] **SCOPE-06**: "All Agents" aggregate view shows PRs across all assigned agents with an agent column
- [ ] **SCOPE-07**: "All Agents" aggregate view shows workspaces across all assigned agents with an agent column
- [ ] **SCOPE-08**: "All Agents" aggregate view shows sub-agents across all assigned agents with an agent column

### Terminology

- [x] **TERM-01**: All user-facing UI text uses "agents" instead of "instances" (sidebar, headings, buttons, labels)
- [ ] **TERM-02**: URL paths use `/agent/[slug]/` structure instead of instance-specific subdomains

## Future Requirements

### Self-Service

- **SELF-01**: Users can request access to an agent (pending superadmin approval)
- **SELF-02**: Users can create their own agent instances (requires billing integration)

### SSE Optimization

- **SSE-01**: Real-time cross-agent feed multiplexing SSE streams from all assigned instances

## Out of Scope

| Feature | Reason |
|---------|--------|
| Shared SQLite DB across all instances | SQLite doesn't support concurrent writes from multiple processes; API proxy pattern is proven |
| iframe embedding of instance UIs | Breaks xterm.js terminal, WebSocket, keyboard shortcuts |
| Subdomain-per-agent routing | Defeats the purpose of single-URL product |
| Automatic user provisioning across all instances | Creates ghost users, violates least privilege |
| Schema/filesystem rename of "instance" identifiers | Breaking change to running containers; UI-only rename in v4.0 |
| Self-service agent creation | Requires billing integration; superadmin-only for now |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 53 | Complete |
| AUTH-02 | Phase 53 | Complete |
| AUTH-03 | Phase 53 | Complete |
| AUTH-04 | Phase 53 | Complete |
| AUTH-05 | Phase 53 | Complete |
| PROXY-01 | Phase 55 | Pending |
| PROXY-02 | Phase 55 | Pending |
| PROXY-03 | Phase 58 | Pending |
| PROXY-04 | Phase 55 | Pending |
| PROXY-05 | Phase 55 | Pending |
| PICK-01 | Phase 56 | Pending |
| PICK-02 | Phase 56 | Pending |
| PICK-03 | Phase 59 | Pending |
| PICK-04 | Phase 56 | Pending |
| USER-01 | Phase 56 | Pending |
| USER-02 | Phase 56 | Pending |
| USER-03 | Phase 56 | Pending |
| SCOPE-01 | Phase 57 | Pending |
| SCOPE-02 | Phase 57 | Pending |
| SCOPE-03 | Phase 57 | Pending |
| SCOPE-04 | Phase 57 | Pending |
| SCOPE-05 | Phase 57 | Pending |
| SCOPE-06 | Phase 59 | Pending |
| SCOPE-07 | Phase 59 | Pending |
| SCOPE-08 | Phase 59 | Pending |
| TERM-01 | Phase 54 | Complete |
| TERM-02 | Phase 54 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 — traceability complete (27/27 mapped to phases 53-59)*
