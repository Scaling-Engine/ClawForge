# Phase 30: New Pages - Research

**Researched:** 2026-03-13
**Domain:** Next.js page routing, GitHub REST API (PRs + Runners), NextAuth session, React sidebar extension
**Confidence:** HIGH

## Summary

Phase 30 adds three new upstream UI pages (Pull Requests, Runners, Profile) and extends the existing ClawForge sidebar to link to them. The work is purely additive — no existing ClawForge logic is modified, only extended. The cherry-pick guide classifies all three page components as "Safe Copy" and the sidebar as "Careful Merge."

ClawForge already has the full pattern for adding new pages: a page component in `lib/chat/components/`, an export in `lib/chat/components/index.js`, and a thin Next.js route file in `templates/app/{route}/page.js`. The sidebar (`app-sidebar.jsx`) already handles badge counts for notifications — the same pattern applies to PR badge count. The GitHub API is already wired via `lib/tools/github.js`'s `githubApi()` helper, and new GitHub REST endpoints (PRs, runners) can be added there or called inline from new Server Actions in `lib/chat/actions.js`.

**Primary recommendation:** Write the three page components from scratch informed by upstream patterns, add three Server Actions for the data fetching, create three route files following the exact `templates/app/{route}/page.js` pattern, and merge only the sidebar — adding three menu items and a PR badge count.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PAGES-01 | `/pull-requests` page shows pending PRs from allowed repos with approve/reject actions | GitHub REST API endpoints for listing and reviewing PRs; `githubApi()` helper in `lib/tools/github.js`; pattern from `clusters-page.jsx` for data fetching via Server Actions |
| PAGES-02 | `/runners` page shows GitHub Actions runner status (online/offline/busy) | GitHub REST API `/repos/{owner}/{repo}/actions/runners` endpoint; same Server Action + `githubApi()` pattern |
| PAGES-03 | `/profile` page shows current user info with login settings | NextAuth `session.user` object (id, email, role); `auth()` server function already used on every page route |
| PAGES-04 | Sidebar navigation includes new page links with active state and PR badge count | `app-sidebar.jsx` already handles notification badge; same pattern applies to PR count; sidebar imports from `./icons.js` for inline SVG icons |
</phase_requirements>

---

## Standard Stack

### Core (already present, no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js (App Router) | ^14 | Page routing via `templates/app/` | Already established pattern |
| NextAuth v5 | ^5.0.0-beta.30 | Session auth (`auth()`) | Already used on all pages |
| `lib/tools/github.js` `githubApi()` | ClawForge internal | GitHub REST calls with GH_TOKEN | Established pattern — used for branches, swarm, workflow dispatch |
| `lib/chat/actions.js` | ClawForge internal | Server Actions with `requireAuth()` guard | Every data fetch uses this pattern |
| `lib/chat/components/page-layout.js` | ClawForge internal | Sidebar + content wrapper | Used by all non-chat pages |

### No New Dependencies

Phase 30 requires zero new npm packages. All GitHub API calls use native `fetch` wrapped by `githubApi()`. All UI primitives exist in `lib/chat/components/ui/`.

---

## Architecture Patterns

### Established Page Pattern (MUST follow exactly)

Every ClawForge page follows this three-file pattern:

**1. Component file** — `lib/chat/components/{name}-page.jsx`

```jsx
// Source: clusters-page.jsx, notifications-page.jsx, swarm-page.jsx
'use client';
import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { getXxx } from '../actions.js';

export function XxxPage({ session }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getXxx().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <PageLayout session={session}>
      {/* page content */}
    </PageLayout>
  );
}
```

**2. Server Action** — added to `lib/chat/actions.js`

```js
// Source: actions.js pattern (getSwarmStatus, getClusterRuns, etc.)
export async function getPendingPullRequests() {
  await requireAuth();
  const { githubApi } = await import('../tools/github.js');
  // fetch from GitHub REST API
}
```

**3. Route file** — `templates/app/{route}/page.js`

```js
// Source: templates/app/clusters/page.js (identical pattern)
import { auth } from '../../lib/auth/index.js';
import { XxxPage } from '../../lib/chat/components/index.js';

export default async function XxxRoute() {
  const session = await auth();
  return <XxxPage session={session} />;
}
```

**4. Export in index** — `lib/chat/components/index.js`

```js
export { XxxPage } from './xxx-page.js';
```

### Recommended Project Structure for New Files

```
lib/chat/components/
├── pull-requests-page.jsx   # PAGES-01: new file
├── runners-page.jsx          # PAGES-02: new file
├── profile-page.jsx          # PAGES-03: new file
└── app-sidebar.jsx           # PAGES-04: careful merge (add 3 items)

templates/app/
├── pull-requests/
│   └── page.js              # PAGES-01: thin route file
├── runners/
│   └── page.js              # PAGES-02: thin route file
└── profile/
    └── page.js              # PAGES-03: thin route file
```

### Sidebar Merge Pattern (PAGES-04)

The existing `app-sidebar.jsx` already has a badge count pattern for notifications (lines 28, 166-174). The PR badge follows the same pattern:

```jsx
// Source: app-sidebar.jsx lines 28-43 (notification count), 152-183 (badge render)
const [pendingPRCount, setPendingPRCount] = useState(0);

useEffect(() => {
  getPendingPRCount()
    .then((count) => setPendingPRCount(count))
    .catch(() => {});
}, []);

// In sidebar menu item:
{!collapsed && (
  <span className="flex items-center gap-2">
    Pull Requests
    {pendingPRCount > 0 && (
      <span className="inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground">
        {pendingPRCount}
      </span>
    )}
  </span>
)}
{collapsed && pendingPRCount > 0 && (
  <span className="absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
    {pendingPRCount}
  </span>
)}
```

New sidebar items insert AFTER the existing Clusters item and BEFORE Notifications. The three additions are: Pull Requests (with badge), Runners, Profile.

### Icon Strategy

New icons for PR, Runners, and Profile must be added to `lib/chat/components/icons.jsx`. The file already has 25+ inline SVG icons following a consistent `{ size = 16 }` prop pattern. Add:

- `GitPullRequestIcon` — PR icon (two circles with branching lines, standard GitHub PR icon)
- `ServerIcon` — Runners (server/computer icon)
- `UserIcon` — Profile (person silhouette)

---

## GitHub API Endpoints Required

### Pull Requests (PAGES-01)

**List open PRs across allowed repos:**

```
GET /repos/{owner}/{repo}/pulls?state=open&per_page=50
```

Response fields needed: `number`, `title`, `user.login`, `head.ref`, `base.ref`, `html_url`, `created_at`, `draft`

**Approve a PR:**
```
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
Body: { "event": "APPROVE" }
```

**Request changes (reject):**
```
POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
Body: { "event": "REQUEST_CHANGES", "body": "Changes requested" }
```

**Get PR count (for badge):**
Returns count of open non-draft PRs across allowed repos.

### Runners (PAGES-02)

**List self-hosted runners:**
```
GET /repos/{owner}/{repo}/actions/runners
```

Response fields: `id`, `name`, `status` (online/offline), `busy`, `labels[].name`

**Note:** The `GH_TOKEN` already in ClawForge needs `repo` scope to read runners. Self-hosted org-level runners may also need the org endpoint:
```
GET /orgs/{org}/actions/runners
```

### Profile (PAGES-03)

Profile page is purely local — no GitHub API call needed. It reads from `session.user` (NextAuth) which provides `id`, `email`, and `role` (already set in `lib/auth/config.js` line 23: `return { id: user.id, email: user.email, role: user.role }`).

The profile page may also offer a password change form, calling an existing or new Server Action that calls `verifyPassword` and `updateUserPassword` from `lib/db/users.js`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub REST calls | Custom fetch with manual auth headers | `githubApi()` in `lib/tools/github.js` | Already handles GH_TOKEN, error handling, headers |
| Auth guard on Server Actions | Ad-hoc session checks | `requireAuth()` at top of every Server Action | Established pattern, calls `unauthorized()` correctly |
| Page layout (sidebar + content) | Custom sidebar wiring | `PageLayout` component from `page-layout.js` | Already handles SidebarProvider, SidebarInset, ChatNavProvider |
| Badge count UI | Custom badge component | Copy the inline span pattern from notification badge | Already styled, consistent with existing design system |
| Icon components | Import from lucide-react | Add to `icons.jsx` as inline SVG | Project uses custom inline SVGs, not lucide (no lucide-react in production bundle for these icons) |

**Key insight:** The project has lucide-react as a dep but `icons.jsx` uses custom inline SVGs. Follow the inline SVG pattern to stay consistent.

---

## Common Pitfalls

### Pitfall 1: Using `window.location.href` vs `router.push`
**What goes wrong:** Sidebar items use `window.location.href` for navigation (not Next.js router). If new items use router.push or Link, behavior is inconsistent.
**Why it happens:** This is intentional — the sidebar closes the mobile nav with `setOpenMobile(false)` before navigating.
**How to avoid:** Copy the exact `onClick={() => { window.location.href = '/route'; }}` pattern from existing sidebar items.

### Pitfall 2: Forgetting to export from index.js
**What goes wrong:** Route file imports `XxxPage` from `../../lib/chat/components/index.js` but it's not exported — build fails.
**How to avoid:** Add export to `lib/chat/components/index.js` for every new page component.

### Pitfall 3: Fetching PRs from all repos vs only allowed repos
**What goes wrong:** Pulling PRs from `GH_OWNER/GH_REPO` only misses PRs on cross-repo targets. The PR page should respect the allowed repos list.
**How to avoid:** Use `loadAllowedRepos()` (same as `getRepos()` action) to iterate over all configured repos and fetch PRs from each. This is what the `getRepos()` Server Action already exposes.

### Pitfall 4: Runners endpoint requires admin scope
**What goes wrong:** Standard `repo` scope on GH_TOKEN does not list self-hosted runners. The runners endpoint returns 403 if scopes are insufficient.
**Why it happens:** GitHub requires `admin:org` scope for org-level runners, and the fine-grained PAT setup is already a known open concern in STATE.md.
**How to avoid:** Gracefully handle 403/empty response — show "No runners configured" rather than crashing. Document the required scope in the UI.

### Pitfall 5: Profile page password change not guarded
**What goes wrong:** Password update Server Action doesn't verify the current password before setting a new one.
**How to avoid:** Always call `verifyPassword(user, currentPassword)` before updating. Follow the same pattern as `lib/auth/config.js` authorize handler.

### Pitfall 6: Sidebar `app-sidebar.jsx` is source JSX, not the compiled `.js`
**What goes wrong:** Both `app-sidebar.jsx` (source) and `app-sidebar.js` (compiled) exist in `lib/chat/components/`. Edits must be made to the `.jsx` source, not the compiled `.js` file.
**How to avoid:** Always edit `.jsx` files in `lib/chat/components/`. The esbuild step compiles them to `.js`. Check CLAUDE.md / build scripts for the compile step.

---

## Code Examples

### Server Action pattern for PR data

```js
// Source: lib/chat/actions.js — getSwarmStatus pattern
export async function getPendingPullRequests() {
  await requireAuth();
  const { loadAllowedRepos } = await import('../tools/repos.js');
  const { githubApi } = await import('../tools/github.js');
  try {
    const repos = loadAllowedRepos();
    const results = await Promise.all(
      repos.map(async (repo) => {
        try {
          const prs = await githubApi(`/repos/${repo.owner}/${repo.slug}/pulls?state=open&per_page=50`);
          return Array.isArray(prs) ? prs.map(pr => ({ ...pr, _repo: `${repo.owner}/${repo.slug}` })) : [];
        } catch {
          return [];
        }
      })
    );
    return results.flat();
  } catch (err) {
    console.error('Failed to fetch pull requests:', err);
    return [];
  }
}
```

### Server Action for PR count (sidebar badge)

```js
export async function getPendingPRCount() {
  await requireAuth();
  try {
    const prs = await getPendingPullRequests();
    return prs.filter(pr => !pr.draft).length;
  } catch {
    return 0;
  }
}
```

### Server Action for runners

```js
export async function getRunners() {
  await requireAuth();
  const { githubApi } = await import('../tools/github.js');
  const { GH_OWNER, GH_REPO } = process.env;
  try {
    const data = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/actions/runners`);
    return data.runners || [];
  } catch (err) {
    console.error('Failed to fetch runners:', err);
    return [];
  }
}
```

### Approve/reject PR actions

```js
export async function approvePullRequest(owner, repo, prNumber) {
  await requireAuth();
  const { githubApi } = await import('../tools/github.js');
  return githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'APPROVE' }),
  });
}

export async function requestChanges(owner, repo, prNumber, body = 'Changes requested') {
  await requireAuth();
  const { githubApi } = await import('../tools/github.js');
  return githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'REQUEST_CHANGES', body }),
  });
}
```

### Route file (exact pattern to copy)

```js
// Source: templates/app/clusters/page.js
import { auth } from '../../lib/auth/index.js';
import { PullRequestsPage } from '../../lib/chat/components/index.js';

export default async function PullRequestsRoute() {
  const session = await auth();
  return <PullRequestsPage session={session} />;
}
```

---

## Build Process Note

ClawForge uses esbuild to compile `.jsx` files in `lib/chat/components/` to `.js`. After editing `.jsx` source files, the build step must run to produce the `.js` counterparts. The route files in `templates/app/` import from the compiled `.js` paths (via `index.js`). The planner must include a build step in the plan or note that the dev server handles compilation automatically.

Check for the build script:

```bash
npm run build  # or the esbuild watch script
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Upstream uses `thepopebot/*` package imports | ClawForge uses relative imports | Every file copied from upstream needs import path conversion |
| Upstream `pull-requests-page.jsx` may use its own GitHub API client | ClawForge uses `githubApi()` from `lib/tools/github.js` | Must adapt any upstream GitHub calls to use ClawForge's helper |
| Upstream `profile-page.jsx` may use upstream auth patterns | ClawForge uses `auth()` from `lib/auth/index.js` | Simpler — just read `session.user` which already has `{id, email, role}` |

---

## Open Questions

1. **Does upstream `pull-requests-page.jsx` include inline PR approval UI or just list?**
   - What we know: Cherry-pick guide says "approve/reject actions" are part of PAGES-01
   - What's unclear: Whether upstream implemented this with a review modal or inline buttons
   - Recommendation: Build inline approve/reject buttons; a modal is optional polish

2. **GH_TOKEN scope for runners endpoint**
   - What we know: The `/repos/{owner}/{repo}/actions/runners` endpoint requires specific token scopes
   - What's unclear: Whether the fine-grained PAT already configured has runner read access
   - Recommendation: Add graceful 403 handling in `getRunners()` with a user-visible message

3. **Profile page: password change feature scope**
   - What we know: PAGES-03 says "shows current user info with login settings"
   - What's unclear: Whether "login settings" means just display or editable password change
   - Recommendation: Include a basic password change form (matches upstream pattern) using existing `verifyPassword`/update from `lib/db/users.js`

---

## Sources

### Primary (HIGH confidence)
- `lib/chat/components/app-sidebar.jsx` — Sidebar structure, badge pattern, icon imports
- `lib/chat/components/clusters-page.jsx` — Page component pattern (client, useEffect, PageLayout)
- `lib/chat/components/page-layout.js` — Layout wrapper used by all pages
- `lib/chat/actions.js` — Server Action pattern, `requireAuth()`, existing `githubApi` usage
- `lib/tools/github.js` — `githubApi()` helper, existing GitHub REST patterns
- `lib/auth/config.js` — `session.user` shape `{id, email, role}`
- `lib/chat/components/index.js` — Export registry for all page components
- `templates/app/clusters/page.js` — Canonical route file template
- `.planning/references/cherry-pick-merge-guide.md` — Phase 30 file-by-file instructions
- `.planning/references/upstream-feature-inventory.md` — Classification (safe copy vs. careful merge)

### Secondary (MEDIUM confidence)
- GitHub REST API docs — PR endpoints, review actions, runners endpoint (standard public API, stable)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all dependencies already present, patterns directly observed in codebase
- Architecture: HIGH — three-file pattern is unambiguous, observed in 5+ existing pages
- GitHub API endpoints: MEDIUM — standard GitHub REST API, well-documented, but runner scope requirements need validation at runtime
- Pitfalls: HIGH — sourced from direct codebase observation (sidebar compiled/source dual files, window.location pattern)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable stack, no fast-moving libraries involved)
