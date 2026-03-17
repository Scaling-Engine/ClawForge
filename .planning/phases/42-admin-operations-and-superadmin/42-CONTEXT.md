# Phase 42: Admin Operations and Superadmin — Context

## Phase Goal

All remaining SSH-required operations are available via the web UI, and a superadmin can manage all instances from a single login.

## Requirements

- **OPS-03**: Repo CRUD via admin UI form (add/edit/delete repos without touching REPOS.json over SSH)
- **OPS-04**: Config editing — all platform config keys editable from admin general page
- **OPS-05**: Instance management — view all instances with status, repos, active jobs
- **SUPER-01**: Single authenticated session across all instances with superadmin role
- **SUPER-02**: Instance switcher UI without re-authentication
- **SUPER-03**: Superadmin landing page with instance health overview
- **SUPER-04**: Data tables scoped by instanceId for cross-instance isolation
- **SUPER-05**: Cross-instance job search by repo, status, or keyword

## Architecture Decisions

### Instance Isolation Model

Each ClawForge instance runs as a separate Docker container with its own SQLite DB (noah-data, ses-data volumes). Instances do NOT share a database. This means:

1. **Superadmin uses API proxy pattern**: The superadmin portal calls each instance's API with `AGENT_SUPERADMIN_TOKEN` to aggregate data. No shared DB migration needed.
2. **SUPER-04 (instanceId scoping)**: Instead of adding instanceId columns to local tables, each instance already has natural isolation. The superadmin API response includes instance name as metadata. Each instance exposes a `/api/superadmin/*` set of endpoints that return its own data tagged with its INSTANCE_NAME.
3. **SUPER-01 (single login)**: Extend NextAuth with a `superadmin` role. Superadmin token is verified at the API level — the hub instance authenticates once, then proxies to child instances.

### Repo CRUD (OPS-03)

Currently `config/REPOS.json` is a static file read by `lib/tools/repos.js:loadAllowedRepos()`. For web-based CRUD:
- Move repo storage to the `settings` table (type: `repos`) using the existing config system
- `loadAllowedRepos()` reads from DB first, falls back to file for backward compat
- Admin UI provides form-based CRUD with validation (slug uniqueness, required fields)

### Config Editing (OPS-04)

Existing `lib/db/config.js` has `getConfigValue()`/`setConfigValue()` plus encrypted secrets. The admin general page needs:
- A form showing all known config keys grouped by category
- Each key shows current value with edit capability
- Sensitive keys use masked input + `setConfigSecret()`

### Superadmin Hub

One instance acts as "hub" (determined by `SUPERADMIN_HUB=true` env var). It:
- Reads `SUPERADMIN_INSTANCES` env var (JSON array of `{name, url, token}`)
- Exposes `/admin/superadmin/*` routes only when hub mode is enabled
- Proxies to each instance's `/api/superadmin/*` endpoints
- Aggregates responses for dashboard, job search, instance overview

## Existing Patterns

- **Admin layout**: Sidebar in `lib/chat/components/admin-layout.jsx`, nav items array, `/admin/*` routes
- **Server Actions**: `requireAdmin()` guard, async functions in `lib/chat/actions.js`
- **Page shells**: Thin wrappers in `templates/app/admin/*/page.js` importing from `lib/chat/components/index.js`
- **Config storage**: `lib/db/config.js` with `getConfigValue`/`setConfigValue`/`getConfigSecret`/`setConfigSecret`
- **Component patterns**: `useState`/`useEffect` for data fetching, card-based layouts, loading skeletons
