# Phase 32: Auth Roles - Research

**Researched:** 2026-03-13
**Domain:** NextAuth v5 JWT roles, Next.js middleware RBAC, Drizzle ORM SQLite
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ROLE-01 | Users table has `role` column (`admin`/`user`); first registered user is auto-admin | Schema already has `role` column with `DEFAULT 'admin'`; `createFirstUser()` already sets `role: 'admin'`; need `createUser()` to default to `'user'` for subsequent users |
| ROLE-02 | Middleware guards `/admin/*` routes; returns 403 for non-admin users | `lib/auth/middleware.js` uses NextAuth v5 edge auth pattern; `req.auth.user.role` is available in middleware via JWT callback already wired in `edge-config.js` |
| ROLE-03 | `/forbidden` page renders with clear messaging when non-admin accesses restricted routes | `templates/app/unauthorized.js` is the precedent; new `forbidden.js` file in same location; no library needed |
| ROLE-04 | Client-side navigation conditionally shows/hides admin links based on session role | `AppSidebar` receives `user` prop with `role` from session; profile-page.jsx already reads `user?.role`; same pattern applies |
</phase_requirements>

---

## Summary

Phase 32 adds role-based access control to ClawForge. The foundational work is almost entirely done — the schema has a `role` column, the JWT/session callbacks propagate `role` through `token.role → session.user.role`, and `createFirstUser()` already assigns `role: 'admin'`. The gap is: (1) `createUser()` hardcodes `role: 'admin'` for ALL users instead of defaulting non-first users to `'user'`, (2) the middleware has no `/admin/*` guard, and (3) no `/forbidden` page or admin nav links exist yet.

The architecture is clear: middleware extends the existing `lib/auth/middleware.js` with an admin check for `/admin/*` paths using `req.auth.user.role`. The `/forbidden` page follows the exact same pattern as `templates/app/unauthorized.js`. Admin sidebar links in `AppSidebar` are conditionally rendered based on `user.role`.

This is the lowest-risk phase in Wave 2. No new libraries. No schema changes (role column already exists in `0000_initial.sql`). The work is purely: fix `createUser()` default, extend middleware, add `/forbidden` page template, and add conditional admin links in sidebar.

**Primary recommendation:** Extend the existing auth middleware, fix the `createUser()` role default, add a `ForbiddenPage` component to `lib/chat/components/`, create `templates/app/forbidden.js`, and gate admin links in `AppSidebar` behind a `user?.role === 'admin'` check.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-auth | ^5.0.0-beta.30 | JWT session management with role claims | Already in use; role already propagated via jwt/session callbacks |
| next | >=15.5.12 | Middleware API, server components, page routing | Already in use |
| drizzle-orm | ^0.44.0 | SQLite schema + query builder | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next/server NextResponse | built-in | Return redirect to `/forbidden` from middleware | Only for the middleware admin check |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Middleware redirect to `/forbidden` | Server component `notFound()` or `unauthorized()` | Middleware is edge-safe and catches the route before the page renders; server component approach requires guard code in every page |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Structure for Phase 32
```
lib/
  auth/
    middleware.js         # Add /admin/* role guard
    edge-config.js        # Already wires role into JWT/session (NO CHANGES)
  db/
    users.js              # Fix createUser() to default role: 'user'
  chat/
    components/
      forbidden-page.jsx  # New: ForbiddenPage component
      app-sidebar.jsx     # Add conditional admin links
      index.js            # Export ForbiddenPage

templates/
  app/
    forbidden.js          # New: thin page shell (same pattern as unauthorized.js)
    admin/                # Phase 33 concern — just reserve the namespace here
```

### Pattern 1: Middleware Role Guard
**What:** Add an `/admin/*` path check inside the existing `auth()` middleware. Read `req.auth.user.role` and redirect to `/forbidden` for non-admins.
**When to use:** All server-enforced route protection. This is the authoritative check — never rely on client-side role checks alone.
**Example:**
```js
// lib/auth/middleware.js — extend the existing auth() callback
export const middleware = auth((req) => {
  const { pathname } = req.nextUrl;

  // ... existing API + static asset + login guards unchanged ...

  // Everything else requires auth
  if (!req.auth) {
    // ... existing redirect to /login + stale cookie cleanup unchanged ...
  }

  // Admin routes require admin role
  if (pathname.startsWith('/admin')) {
    if (req.auth.user?.role !== 'admin') {
      return NextResponse.redirect(new URL('/forbidden', req.url));
    }
  }
});
```

**Critical detail:** `req.auth` is the session object from `NextAuth(authConfig)`. In the edge middleware, `req.auth.user` contains what the `session()` callback returns — including `role` via `session.user.role = token.role`. This is already wired in `edge-config.js`. No changes to edge-config needed.

### Pattern 2: First-User Auto-Admin, Subsequent Users Default to 'user'
**What:** `createFirstUser()` already assigns `role: 'admin'` atomically. `createUser()` must assign `role: 'user'` instead of hardcoding `'admin'`.
**When to use:** Any time a second+ user is created.
**Example:**
```js
// lib/db/users.js — createUser() fix
const user = {
  id: randomUUID(),
  email: email.toLowerCase(),
  passwordHash: passwordHash,
  role: 'user',  // was 'admin' — only createFirstUser() grants admin
  createdAt: now,
  updatedAt: now,
};
```

### Pattern 3: ForbiddenPage Component
**What:** A React component that renders a styled "403 Forbidden" page, exported from `lib/chat/components/`. Follows the same pattern as `ProfilePage`, `RunnersPage`, etc.
**When to use:** When a non-admin hits `/forbidden`.
**Example:**
```jsx
// lib/chat/components/forbidden-page.jsx
'use client';
import { ShieldIcon } from './icons.js';
export function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <ShieldIcon size={48} className="text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Access Denied</h1>
      <p className="text-muted-foreground">You don't have permission to access this page.</p>
      <a href="/" className="text-sm underline text-muted-foreground hover:text-foreground">
        Return home
      </a>
    </div>
  );
}
```

### Pattern 4: Thin Template Page Shell
**What:** `templates/app/forbidden.js` is a server page that renders `ForbiddenPage`. No layout wrapping needed (user may not be authenticated or may be authenticated-but-not-admin — keep it simple, no sidebar required).
**When to use:** Every new page in templates follows this exact pattern.
**Example:**
```js
// templates/app/forbidden.js
import { ForbiddenPage } from '../../lib/chat/components/index.js';
export default function ForbiddenRoute() {
  return <ForbiddenPage />;
}
```

**Critical detail:** The `/forbidden` page must NOT require the user to be an admin to render (it's the page non-admins land on). The middleware must explicitly skip the role check for `/forbidden` — or just check `pathname.startsWith('/admin')` only, which naturally excludes `/forbidden`.

### Pattern 5: Conditional Admin Nav in AppSidebar
**What:** `AppSidebar` receives `user` prop already. Add an "Admin" nav link (with a shield/settings icon) that only renders when `user?.role === 'admin'`.
**When to use:** Any navigation item that should be admin-only.
**Example:**
```jsx
// lib/chat/components/app-sidebar.jsx — add conditional admin nav item
{user?.role === 'admin' && (
  <SidebarMenuItem>
    <SidebarMenuButton
      className={collapsed ? 'justify-center' : ''}
      onClick={() => { window.location.href = '/admin'; }}
    >
      <ShieldIcon size={16} />
      {!collapsed && <span>Admin</span>}
    </SidebarMenuButton>
  </SidebarMenuItem>
)}
```

**Note:** This is defense-in-depth only — the middleware is the authoritative guard. Client-side hiding just improves UX.

### Anti-Patterns to Avoid
- **Checking role only in client components:** A motivated user can call admin API routes directly. Always enforce at middleware level.
- **Making `/forbidden` require auth:** The user may be authenticated but not admin. The page must render without admin role.
- **Checking role in individual page Server Components instead of middleware:** Leads to inconsistent enforcement as more admin pages are added in Phase 33.
- **Adding role check to edge-config callbacks:** `edge-config.js` is shared between middleware and server; it already does what's needed. Don't modify it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Role in JWT | Custom JWT parsing | NextAuth v5 jwt/session callbacks (already wired) | `edge-config.js` already puts `role` in `token` and `session.user` |
| Route protection | Per-page server component checks | Single middleware rule for `/admin/*` | Middleware runs before page renders; scales to Phase 33's many admin pages |
| Forbidden page state | Complex error boundary | Simple static page shell | No dynamic data needed; no server action; pure render |

**Key insight:** The role infrastructure (schema column, JWT propagation, session shape) is already built. This phase is wiring enforcement, not building new plumbing.

---

## Common Pitfalls

### Pitfall 1: `/forbidden` accessible before auth check fires
**What goes wrong:** The middleware redirects unauthenticated users to `/login`. If the admin check runs before the auth check, an unauthenticated request to `/admin/*` would get redirected to `/forbidden` instead of `/login`.
**Why it happens:** Wrong ordering of checks in middleware.
**How to avoid:** Auth check (`if (!req.auth)`) must remain BEFORE the admin role check. Current middleware order: API skip → static skip → login skip → auth check → (new) admin check.
**Warning signs:** Unauthenticated users hitting `/forbidden` instead of `/login`.

### Pitfall 2: `/forbidden` page gets role-gated by the middleware
**What goes wrong:** If admin check is `pathname.startsWith('/admin') || pathname === '/forbidden'`, the forbidden page itself requires admin — infinite redirect loop.
**Why it happens:** Overly broad admin pattern.
**How to avoid:** Only check `pathname.startsWith('/admin')`. The `/forbidden` path does not start with `/admin`.

### Pitfall 3: createUser() still gives everyone admin role
**What goes wrong:** ROLE-01 says first user auto-admin, subsequent users default to `user`. Currently `createUser()` hardcodes `role: 'admin'` for all users. Since ClawForge is currently single-user, this hasn't been noticed.
**Why it happens:** The schema default was set to `'admin'` (correct for solo use), but `createUser()` explicitly overrides with `'admin'` string too.
**How to avoid:** Change `createUser()` to set `role: 'user'`. Only `createFirstUser()` grants admin.

### Pitfall 4: `req.auth.user` vs `req.auth` structure confusion
**What goes wrong:** Accessing `req.auth.role` instead of `req.auth.user.role` in middleware.
**Why it happens:** NextAuth v5 beta — `req.auth` is the session object, `req.auth.user` is the user sub-object populated by `session()` callback.
**How to avoid:** Inspect `edge-config.js` session callback — it sets `session.user.role = token.role`. So the path is `req.auth.user?.role`.

### Pitfall 5: Missing `ForbiddenPage` export in index.js
**What goes wrong:** `templates/app/forbidden.js` can't import `ForbiddenPage` because it wasn't added to `lib/chat/components/index.js`.
**Why it happens:** Forgetting to export new components.
**How to avoid:** Always add new page components to both `index.js` export and verify the import path in the template page shell.

---

## Code Examples

### Current `edge-config.js` session callback (already correct — no changes needed)
```js
// Source: lib/auth/edge-config.js
callbacks: {
  jwt({ token, user }) {
    if (user) {
      token.role = user.role;  // role stored in JWT
    }
    return token;
  },
  session({ session, token }) {
    if (session.user) {
      session.user.id = token.sub;
      session.user.role = token.role;  // role available as session.user.role
    }
    return session;
  },
},
```

### Existing middleware pattern (for reference — extend, don't replace)
```js
// Source: lib/auth/middleware.js
export const middleware = auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api')) return;
  if (/\.(?:svg|png|...)$/i.test(pathname)) return;
  if (pathname === '/login') {
    if (req.auth) return NextResponse.redirect(new URL('/', req.url));
    return;
  }
  if (!req.auth) {
    // redirect to /login + stale cookie cleanup
  }
  // NEW: admin guard goes here, AFTER auth check
});
```

### How PageLayout receives user role (already works)
```jsx
// Source: lib/chat/components/page-layout.jsx
export function PageLayout({ session, children }) {
  return (
    <ChatNavProvider ...>
      <SidebarProvider>
        <AppSidebar user={session.user} />  // session.user.role is already here
        ...
      </SidebarProvider>
    </ChatNavProvider>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Role check per-page | Single middleware guard | Next.js 12+ | Centralized; no per-page boilerplate |
| Next-auth v4 session.role | NextAuth v5 jwt callback → token.role → session.user.role | next-auth v5 beta | Role must go through jwt() first, then session() |

**What's already done (no work needed):**
- Schema: `role` column with `DEFAULT 'admin'` — in `0000_initial.sql`
- JWT propagation: `jwt()` and `session()` callbacks in `edge-config.js`
- First user: `createFirstUser()` sets `role: 'admin'`
- Profile page: Already reads and displays `session.user.role`

---

## Open Questions

1. **Should `/forbidden` use `PageLayout` (with sidebar) or be a bare page?**
   - What we know: `unauthorized.js` in templates is a bare page with inline styles
   - What's unclear: Whether having a sidebar on the forbidden page is better UX
   - Recommendation: Bare page (no sidebar) — matches `unauthorized.js` precedent, avoids requiring full session for layout

2. **Should the Settings nav item in `SidebarUserNav` be renamed/linked to `/admin`?**
   - What we know: Phase 33 will restructure `/settings/*` → `/admin/*`
   - What's unclear: Whether to change the Settings link in Phase 32 already
   - Recommendation: Leave `SidebarUserNav` Settings link pointing to `/settings` unchanged — Phase 33 handles the restructure; Phase 32 only adds the new Admin link in `AppSidebar`

---

## Validation Architecture

`workflow.nyquist_validation` is not explicitly set in `.planning/config.json` — treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected (package.json test script: `echo "No tests yet"`) |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROLE-01 | `createUser()` sets role 'user'; `createFirstUser()` sets role 'admin' | manual-only | N/A — no test framework | N/A |
| ROLE-02 | Non-admin GET /admin/* → 403 redirect to /forbidden | manual-only | N/A | N/A |
| ROLE-03 | /forbidden renders without admin role | manual-only | N/A | N/A |
| ROLE-04 | Admin sidebar link visible when role=admin, hidden otherwise | manual-only | N/A | N/A |

**Note:** Manual-only because no test framework exists in this project. Verification is done via browser inspection after deploy.

### Wave 0 Gaps
None — no test infrastructure to create. All requirements verified manually per existing project pattern.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `lib/auth/middleware.js`, `lib/auth/edge-config.js`, `lib/auth/config.js`
- Direct codebase inspection — `lib/db/schema.js`, `lib/db/users.js`
- Direct codebase inspection — `lib/chat/components/app-sidebar.jsx`, `sidebar-user-nav.jsx`, `profile-page.jsx`
- Direct codebase inspection — `templates/app/unauthorized.js`, `templates/app/profile/page.js`, `templates/app/settings/layout.js`
- Direct codebase inspection — `drizzle/0000_initial.sql` (schema migration history)

### Secondary (MEDIUM confidence)
- NextAuth v5 docs pattern: `req.auth` in edge middleware contains session object with `user.role` from `session()` callback

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, confirmed by package.json and source
- Architecture: HIGH — all patterns observed directly in existing codebase; no guesswork
- Pitfalls: HIGH — identified from direct code inspection of current middleware and auth setup

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (stable stack, 90-day estimate)
