# Phase 33: Admin Panel - Research

**Researched:** 2026-03-13
**Domain:** Next.js page routing, layout restructuring, admin panel UI
**Confidence:** HIGH

## Summary

Phase 33 migrates the existing `/settings/*` pages to `/admin/*` with a new layout structure, adds two new pages (users, webhooks), and sets up backwards-compatible redirects. The codebase already has all the infrastructure needed: Phase 32 added the admin middleware guard on `/admin/*` routes, the sidebar already links to `/admin`, and the `ForbiddenPage` component exists for non-admin access attempts.

The current settings structure uses a tab-based layout (`SettingsLayout`) with 4 tabs (crons, triggers, secrets, MCP). The admin panel needs a sidebar-based layout instead (per `docs/ADMIN_PANEL.md`) with 7 sub-pages: general, github, users, secrets, voice, chat, webhooks. Of these, crons/triggers/secrets/MCP already have working components; general, github, users, chat, voice, and webhooks are new.

**Primary recommendation:** Create `templates/app/admin/` route tree with a new `AdminLayout` component using sidebar navigation. Reuse existing page components (CronsPage, TriggersPage, SettingsSecretsPage, SettingsMcpPage) under new routes. Add new UsersPage and WebhooksPage components with CRUD via new server actions. Convert `/settings/*` pages to redirect to `/admin/*`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ADMIN-01 | `/admin/` layout with sidebar navigation listing all admin sub-pages | New `AdminLayout` component replaces `SettingsLayout`; uses sidebar nav pattern matching existing `PageLayout` |
| ADMIN-02 | Existing settings pages (general, github, chat) accessible under `/admin/*` | Reuse `CronsPage`, `TriggersPage`, `SettingsSecretsPage`, `SettingsMcpPage` components; create new thin page shells under `templates/app/admin/` |
| ADMIN-03 | New admin pages (users, webhooks) with CRUD operations | New `UsersPage` component with user listing + role update; new `WebhooksPage` showing configured webhooks from TRIGGERS.json |
| ADMIN-04 | `/settings/*` routes redirect to `/admin/*` for backwards compatibility | Replace existing settings page.js files with `redirect()` calls to `/admin/*` equivalents |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 14 | App Router with server/client split | Already in use |
| Drizzle ORM | latest | SQLite DB operations | Already used for users, settings tables |
| NextAuth v5 | latest | Session auth + role in JWT | Phase 32 established admin role |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next/navigation | - | `redirect()` for backwards compat | `/settings/*` redirect pages |
| bcrypt-ts | - | Password hashing | Already used in `lib/db/users.js` |

### No New Dependencies
This phase requires zero new npm packages. Everything needed is already installed.

## Architecture Patterns

### Current Settings Structure
```
templates/app/settings/
├── layout.js           # Server shell → SettingsLayout (tab-based)
├── page.js             # redirect('/settings/crons')
├── crons/page.js       # → CronsPage component
├── triggers/page.js    # → TriggersPage component
└── mcp/page.js         # → SettingsMcpPage component
```

Note: `/settings/secrets` has the component (`SettingsSecretsPage`) but NO route page file yet.

### Target Admin Structure
```
templates/app/admin/
├── layout.js           # Server shell → AdminLayout (sidebar-based)
├── page.js             # redirect('/admin/crons') — default sub-page
├── crons/page.js       # → CronsPage (reuse)
├── triggers/page.js    # → TriggersPage (reuse)
├── secrets/page.js     # → SettingsSecretsPage (reuse)
├── mcp/page.js         # → SettingsMcpPage (reuse)
├── users/page.js       # → UsersPage (NEW)
└── webhooks/page.js    # → WebhooksPage (NEW)
```

### Pattern 1: Server Page Shell (Established Pattern)
**What:** Thin Next.js page files that import and render a client component
**When to use:** Every page in this project follows this pattern
**Example:**
```javascript
// templates/app/admin/crons/page.js
import { CronsPage } from '../../../lib/chat/components/index.js';

export default function AdminCronsRoute() {
  return <CronsPage />;
}
```

### Pattern 2: Layout with Server Auth (Established Pattern)
**What:** Layout fetches session server-side, passes to client layout component
**When to use:** Every layout in this project
**Example:**
```javascript
// templates/app/admin/layout.js
import { auth } from '../../lib/auth/index.js';
import { AdminLayout } from '../../lib/chat/components/index.js';

export default async function Layout({ children }) {
  const session = await auth();
  return <AdminLayout session={session}>{children}</AdminLayout>;
}
```

### Pattern 3: Redirect for Backwards Compat (Established Pattern)
**What:** `redirect()` from old route to new route
**When to use:** Existing pattern at `/crons` → `/settings/crons`, `/triggers` → `/settings/triggers`
**Example:**
```javascript
// templates/app/settings/page.js (modified)
import { redirect } from 'next/navigation';

export default function SettingsRedirect() {
  redirect('/admin/crons');
}
```

### Pattern 4: Admin Sidebar Layout (New Component)
**What:** New `AdminLayout` component with vertical sidebar nav instead of tabs
**When to use:** Replaces `SettingsLayout` for the admin panel
**Example:**
```jsx
'use client';
import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { ClockIcon, ZapIcon, KeyIcon, WrenchIcon, UserIcon, SettingsIcon } from './icons.js';

const ADMIN_NAV = [
  { id: 'crons', label: 'Crons', href: '/admin/crons', icon: ClockIcon },
  { id: 'triggers', label: 'Triggers', href: '/admin/triggers', icon: ZapIcon },
  { id: 'secrets', label: 'Secrets', href: '/admin/secrets', icon: KeyIcon },
  { id: 'mcp', label: 'MCP Servers', href: '/admin/mcp', icon: WrenchIcon },
  { id: 'users', label: 'Users', href: '/admin/users', icon: UserIcon },
  { id: 'webhooks', label: 'Webhooks', href: '/admin/webhooks', icon: ZapIcon },
];

export function AdminLayout({ session, children }) {
  const [activePath, setActivePath] = useState('');
  useEffect(() => { setActivePath(window.location.pathname); }, []);

  return (
    <PageLayout session={session}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin</h1>
      </div>
      <div className="flex gap-6">
        {/* Sidebar nav */}
        <nav className="w-48 shrink-0">
          <ul className="flex flex-col gap-1">
            {ADMIN_NAV.map((item) => {
              const isActive = activePath === item.href || activePath.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <a href={item.href}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                      isActive ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    }`}>
                    <Icon size={14} />
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </PageLayout>
  );
}
```

### Anti-Patterns to Avoid
- **Moving component files:** Do NOT rename/move existing component files like `crons-page.jsx`. Just import them from new routes.
- **Duplicating components:** Do NOT copy existing page components for admin routes. Reuse them directly.
- **Breaking settings links:** Existing bookmarks and links to `/settings/*` must continue working via redirects.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Route redirects | Custom middleware | `redirect()` from next/navigation | Already established pattern in codebase |
| Auth guards | Per-page auth checks | Existing middleware in `lib/auth/middleware.js` | Phase 32 already handles `/admin/*` guard |
| User role display | Custom auth parsing | `session.user.role` from NextAuth | Already in JWT via Phase 32 |

## Common Pitfalls

### Pitfall 1: Settings Layout Still Rendering Under /admin
**What goes wrong:** If `templates/app/settings/layout.js` wraps `/admin/*` routes (Next.js layout nesting), you get double layouts
**Why it happens:** `/admin/` has its own layout, but if mistakenly nested under `/settings/`, both would apply
**How to avoid:** Admin routes are at `templates/app/admin/` (top-level, NOT under settings). This is already correct by design.
**Warning signs:** Double headers, double navigation

### Pitfall 2: Redirect Loops
**What goes wrong:** `/settings/` redirects to `/admin/`, but `/admin/` root also redirects to `/admin/crons`, causing chain redirects
**Why it happens:** Multiple redirect hops
**How to avoid:** `/settings/page.js` should redirect directly to `/admin/crons` (not `/admin/`). Each settings sub-route should redirect to its exact admin equivalent.
**Warning signs:** Browser shows "too many redirects" or unnecessary redirect chains

### Pitfall 3: Missing Auth in New Server Actions
**What goes wrong:** New server actions for users/webhooks CRUD don't check auth
**Why it happens:** Forgetting `await requireAuth()` at the top of each action
**How to avoid:** Every new server action in `lib/chat/actions.js` must start with `await requireAuth()` — the established pattern
**Warning signs:** Unauthenticated users can modify user roles

### Pitfall 4: Forgetting to Export New Components
**What goes wrong:** New components created but not exported from `lib/chat/components/index.js`
**Why it happens:** Index file is the barrel export, easy to forget
**How to avoid:** For every new `.jsx` file, add a corresponding export line to `index.js`
**Warning signs:** Import errors in page shells

### Pitfall 5: Sidebar Admin Link Already Points to /admin
**What goes wrong:** The sidebar already has an Admin link (Phase 32) pointing to `/admin`. If the default admin page redirects somewhere unexpected, clicking Admin goes to wrong place.
**Why it happens:** Phase 32 added `window.location.href = '/admin'` in sidebar
**How to avoid:** Ensure `/admin/page.js` redirects to `/admin/crons` (reasonable default). The sidebar link is already correct.

## Code Examples

### Server Action for User Listing (New)
```javascript
// In lib/chat/actions.js
export async function getUsers() {
  await requireAuth();
  const { getDb } = await import('../db/index.js');
  const { users } = await import('../db/schema.js');
  const db = getDb();
  const allUsers = db.select({
    id: users.id,
    email: users.email,
    role: users.role,
    createdAt: users.createdAt,
  }).from(users).all();
  return allUsers;
}
```

### Server Action for Role Update (New)
```javascript
// In lib/chat/actions.js
export async function updateUserRole(userId, newRole) {
  await requireAuth();
  if (!['admin', 'user'].includes(newRole)) throw new Error('Invalid role');
  const { getDb } = await import('../db/index.js');
  const { users } = await import('../db/schema.js');
  const { eq } = await import('drizzle-orm');
  const db = getDb();
  db.update(users).set({ role: newRole, updatedAt: Date.now() }).where(eq(users.id, userId)).run();
}
```

### DB Users Module Extension (New functions needed)
```javascript
// In lib/db/users.js — add getAllUsers and updateUserRole
export function getAllUsers() {
  const db = getDb();
  return db.select({
    id: users.id,
    email: users.email,
    role: users.role,
    createdAt: users.createdAt,
  }).from(users).all();
}

export function updateUserRole(userId, role) {
  const db = getDb();
  db.update(users).set({ role, updatedAt: Date.now() }).where(eq(users.id, userId)).run();
}
```

### Redirect Pattern for Settings Backwards Compat
```javascript
// templates/app/settings/crons/page.js (modified)
import { redirect } from 'next/navigation';
export default function SettingsCronsRedirect() {
  redirect('/admin/crons');
}

// templates/app/settings/triggers/page.js (modified)
import { redirect } from 'next/navigation';
export default function SettingsTriggersRedirect() {
  redirect('/admin/triggers');
}

// templates/app/settings/mcp/page.js (modified)
import { redirect } from 'next/navigation';
export default function SettingsMcpRedirect() {
  redirect('/admin/mcp');
}

// templates/app/settings/page.js (modified)
import { redirect } from 'next/navigation';
export default function SettingsRedirect() {
  redirect('/admin/crons');
}
```

## Existing Component Inventory

Components that can be reused as-is under admin routes:

| Component | File | Current Route | Admin Route |
|-----------|------|---------------|-------------|
| `CronsPage` | `crons-page.jsx` | `/settings/crons` | `/admin/crons` |
| `TriggersPage` | `triggers-page.jsx` | `/settings/triggers` | `/admin/triggers` |
| `SettingsSecretsPage` | `settings-secrets-page.jsx` | (no route yet) | `/admin/secrets` |
| `SettingsMcpPage` | `settings-mcp-page.jsx` | `/settings/mcp` | `/admin/mcp` |

New components needed:

| Component | File | Admin Route | Purpose |
|-----------|------|-------------|---------|
| `AdminLayout` | `admin-layout.jsx` | (layout) | Sidebar navigation, replaces tab layout |
| `UsersPage` | `admin-users-page.jsx` | `/admin/users` | User listing, role CRUD |
| `WebhooksPage` | `admin-webhooks-page.jsx` | `/admin/webhooks` | Webhook config display |

## Available Icons (already in icons.js)

| Icon | Available | Use For |
|------|-----------|---------|
| `ClockIcon` | Yes | Crons |
| `ZapIcon` | Yes | Triggers, Webhooks |
| `KeyIcon` | Yes | Secrets |
| `WrenchIcon` | Yes | MCP Servers |
| `UserIcon` | Yes | Users |
| `ShieldIcon` | Yes | Admin header/badge |
| `SettingsIcon` | Yes | General settings |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/settings/*` tab layout | `/admin/*` sidebar layout | Phase 33 | Better scalability for many sub-pages |
| No role-gated pages | Admin middleware guard | Phase 32 | Admin pages protected server-side |

## Open Questions

1. **Webhooks page scope**
   - What we know: ADMIN-03 mentions "webhooks" as a new admin page with CRUD. TRIGGERS.json already has webhook-type triggers.
   - What's unclear: Is the webhooks page just a filtered view of triggers with webhook actions, or is it for incoming webhook URL management?
   - Recommendation: Make it a display page for configured webhook triggers (read from TRIGGERS.json), consistent with how CronsPage and TriggersPage work. True webhook CRUD (incoming webhook URL management) is more Phase 34/API territory.

2. **Settings layout removal**
   - What we know: `SettingsLayout` component exists and is used by `/settings/layout.js`
   - What's unclear: Should `SettingsLayout` be deleted or kept for the redirect path?
   - Recommendation: Keep `settings/layout.js` and `SettingsLayout` as-is, but change the settings sub-page files to just `redirect()`. The layout won't render because `redirect()` short-circuits rendering. Can be cleaned up later.

## Sources

### Primary (HIGH confidence)
- Codebase files examined directly:
  - `templates/app/settings/` (all page files)
  - `lib/chat/components/settings-layout.jsx` (current tab layout)
  - `lib/chat/components/crons-page.jsx`, `triggers-page.jsx`, `settings-secrets-page.jsx`, `settings-mcp-page.jsx` (existing page components)
  - `lib/chat/components/app-sidebar.jsx` (admin link from Phase 32)
  - `lib/auth/middleware.js` (admin route guard from Phase 32)
  - `lib/db/users.js` (user CRUD operations)
  - `lib/db/schema.js` (table schemas)
  - `lib/chat/actions.js` (server actions)
  - `lib/chat/components/index.js` (barrel exports)
  - `docs/ADMIN_PANEL.md` (upstream admin panel design)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - everything already in the project
- Architecture: HIGH - follows established patterns exactly
- Pitfalls: HIGH - identified from direct codebase analysis
- New components: MEDIUM - users/webhooks page specifics depend on exact scope

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable internal patterns)
