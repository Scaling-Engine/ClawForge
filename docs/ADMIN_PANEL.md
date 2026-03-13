# Admin Panel Architecture — ClawForge

## Overview

Admin panel at `/admin/*` replaces the simpler `/settings/` structure. Provides operator-level management of GitHub secrets, user roles, instance configuration, voice settings, and webhook management.

## Route Structure

```
/admin/
├── general          # Instance name, LLM model, general config
├── github           # GitHub token, repo access, webhook URLs
├── users            # User role management (admin/user)
├── secrets          # GitHub secrets CRUD (AGENT_* convention)
├── voice            # AssemblyAI config, voice toggle
├── chat             # Chat settings, code mode defaults
└── webhooks         # Incoming/outgoing webhook management
```

## Auth & Roles

- `role` column on users table with `admin` (full access) and `user` (chat only) values
- Admin middleware checks role before rendering `/admin/*` pages
- Non-admin users redirected to `/forbidden` boundary page
- NextAuth session includes role claim for client-side conditional rendering
- API-key-protected routes (Slack events, Telegram webhooks) bypass role checks

## Config Storage

- DB-backed key-value config table via `lib/db/config.js`
- `getConfig(key)` / `setConfig(key, value)` — typed accessors
- Config values cached per-request, not globally (config changes apply on next dispatch)
- GitHub secrets managed via `lib/github-api.js` wrapper around GitHub REST API

## GitHub Secrets Management

- `lib/github-api.js` wraps GitHub REST API for secrets/variables CRUD
- Secrets encrypted with Node `crypto` (AES-256-GCM) before storage
- UI shows masked values (last 4 characters) — never full secret
- AGENT_* prefix convention enforced: AGENT_ (container-only), AGENT_LLM_ (LLM-accessible)
- Deletion requires confirmation modal with secret name re-entry

## Migration Path (v2.1)

The `/settings/` → `/admin/` migration happens in Phase 33:
1. Create `/admin/` layout with sidebar navigation
2. Move existing settings pages to new routes
3. Add new pages (users, secrets, webhooks)
4. Redirect `/settings/*` → `/admin/*` for backwards compat
5. Remove redirects after transition period
