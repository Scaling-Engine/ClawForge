# Phase 45: Self-Service Onboarding - Research

**Researched:** 2026-03-17
**Domain:** Next.js App Router wizard UI, SQLite state machine, programmatic infrastructure verification
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 45. All decisions below are drawn from `.planning/STATE.md` accumulated decisions.

### Locked Decisions
- **Onboarding redirect:** Unconditional `ONBOARDING_ENABLED` env var redirect + page-level Server Component completion check. NOT in middleware (Edge Runtime blocks better-sqlite3).
- **Four new tables (Phase 43-44):** `error_log`, `usage_events`, `billing_limits`, `onboarding_state` — all additive, no structural changes to existing tables.
- **`onboarding_state` table:** Declared in Phase 43-44 architecture decisions. Phase 45 implements it.
- **Drizzle ORM + better-sqlite3 synchronous pattern:** All DB functions use `.run()/.get()/.all()` — no async DB calls.
- **Server Actions (not `/api` routes):** All browser-initiated mutations use `'use server'` functions with `requireAuth()`. Per `api/CLAUDE.md`.
- **No hot-reload on config changes:** Config changes take effect on next job dispatch.

### Claude's Discretion
- Wizard step UI framework: react-hook-form + Zod (react-hook-form not yet installed; Zod v4 is already present)
- Tooltip implementation: title attribute vs. Radix Tooltip vs. custom
- Step-by-step vs. single-page layout
- Which admin fields get ONB-05 tooltips first

### Deferred Ideas (OUT OF SCOPE)
- Multi-user onboarding (track per-user completion)
- Onboarding analytics / funnel tracking
- Onboarding video embeds
- Animated transitions between steps
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ONB-01 | DB-persisted onboarding state (table + module) | `onboarding_state` table added to `lib/db/schema.js`; `lib/onboarding/state.js` module follows `lib/db/usage.js` synchronous pattern |
| ONB-02 | Step 1: GitHub PAT verification (call `/user` endpoint) | Reuse `githubApiRaw()` from `lib/github-api.js`; verification returns success/error for wizard display |
| ONB-03 | Step 2: Docker socket verification (dockerode `docker.info()`) | Reuse dockerode instance from `lib/docker.js`; call `docker.info()` synchronously via Server Action |
| ONB-04 | Step 3: Channel connect + first real job dispatch | Reuse `createJob()` from `lib/tools/create-job.js`; first-job completion checked via `getUsageSummary()` from `lib/db/usage.js` |
| ONB-05 | Contextual tooltips on AGENT_* prefix in secrets page | Add tooltip markup to `lib/chat/components/settings-secrets-page.js` |
| ONB-06 | Actionable empty states on repos, secrets, MCP pages | Upgrade empty state in `lib/chat/components/admin-repos-page.js` and `lib/chat/components/settings-mcp-page.js` with CTA buttons |
</phase_requirements>

---

## Summary

Phase 45 adds a self-service onboarding wizard to ClawForge. The wizard guides new operators through GitHub PAT configuration, Docker socket verification, channel connection, and dispatching a real first job — all with DB-persisted progress so they can resume across sessions. Three supporting quality-of-life improvements ship alongside: contextual tooltips on the AGENT_* secret prefix convention, actionable empty states on the repos/secrets/MCP settings pages, and a superadmin visibility endpoint for onboarding status.

The primary architectural constraint is Next.js middleware running in the Edge Runtime: no `better-sqlite3` access means the onboarding redirect must be split across two layers. Middleware does a cheap env var check (`ONBOARDING_ENABLED=true`) and redirects authenticated users to `/onboarding`; the onboarding page Server Component does the real DB completion check and redirects to `/` if complete. This breaks any possible redirect loop — completion is the exit condition.

All verification calls (GitHub PAT, Docker, Slack webhook, first-job) target real infrastructure endpoints, not user self-reporting. The `usageEvents` table from Phase 44 is the source of truth for `first_job` completion — no new polling mechanism needed.

**Primary recommendation:** Build the wizard as a multi-step Client Component (`lib/chat/components/onboarding-wizard.js`) backed by Server Actions for all mutations and verifications. Store wizard state in `onboarding_state` table using the established synchronous better-sqlite3 pattern.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 15.x (existing) | App Router, Server Actions, Server Components | Already installed; wizard page is a standard App Router page |
| better-sqlite3 | existing | `onboarding_state` table reads/writes | Project-wide SQLite pattern; synchronous, no async plumbing |
| drizzle-orm | existing | Schema definition for `onboarding_state` | All ClawForge tables use Drizzle schema |
| zod | ^4.3.6 (existing) | Form validation for PAT/URL input fields | Already in package.json; don't add v3 |
| react-hook-form | ^7.x (NOT installed) | Wizard form state management | Industry standard; Zod resolver already supported |
| @hookform/resolvers | ^3.x (NOT installed) | Connects react-hook-form to Zod schemas | Required companion to react-hook-form |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dockerode | existing | Docker socket verification in ONB-03 | Already used in `lib/docker.js`; no new dep |
| @octokit/* | existing (via lib/github-api.js) | GitHub PAT verification in ONB-02 | `githubApiRaw()` already handles auth |
| next-auth v5 | existing | Session identity in Server Actions | `requireAuth()` guards all mutations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-hook-form | Uncontrolled inputs + useState | react-hook-form handles validation state, dirty tracking, submission — saves ~100 lines of boilerplate per step |
| Zod v4 (existing) | Yup | Zod already installed; don't add a second validation library |
| Server Actions | API routes | `api/CLAUDE.md` explicitly forbids API routes for browser UI mutations |

**Installation (new packages only):**
```bash
npm install react-hook-form @hookform/resolvers
```

---

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── onboarding/
│   ├── state.js          # DB read/write for onboarding_state table
│   └── verify.js         # Verification functions: GitHub PAT, Docker, Slack webhook
├── chat/
│   ├── components/
│   │   ├── onboarding-wizard.js    # Main wizard Client Component
│   │   └── onboarding-steps/
│   │       ├── step-github.js      # Step 1: GitHub PAT
│   │       ├── step-docker.js      # Step 2: Docker socket
│   │       ├── step-channel.js     # Step 3: Channel connect
│   │       ├── step-first-job.js   # Step 4: Dispatch + wait
│   │       └── step-complete.js    # Step 5: Completion screen
│   └── actions.js        # Existing — add onboarding Server Actions here
templates/
└── app/
    └── onboarding/
        └── page.js       # Thin shell — calls auth(), passes session to wizard
```

### Pattern 1: Synchronous SQLite State Module
**What:** All `lib/onboarding/state.js` functions are synchronous, matching existing `lib/db/usage.js` and `lib/billing/enforce.js` patterns.
**When to use:** Any DB operation in this phase. Never use async/await with better-sqlite3.
**Example:**
```javascript
// Source: lib/db/usage.js pattern (Phase 44)
import db from '../db/index.js';

export function getOnboardingState() {
  return db.prepare('SELECT * FROM onboarding_state LIMIT 1').get() ?? null;
}

export function upsertOnboardingStep(step, status) {
  // select-then-update/insert — same pattern as billing upsert
  const existing = db.prepare('SELECT id FROM onboarding_state LIMIT 1').get();
  if (existing) {
    db.prepare(`UPDATE onboarding_state SET ${step} = ?, updated_at = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), existing.id);
  } else {
    db.prepare('INSERT INTO onboarding_state (current_step, updated_at) VALUES (?, ?)')
      .run('github_connect', new Date().toISOString());
  }
}
```

### Pattern 2: Two-Layer Redirect Guard
**What:** Middleware does only env var check; page Server Component does DB completion check.
**When to use:** Any redirect logic that requires DB access — Edge Runtime cannot use better-sqlite3.
**Example:**
```javascript
// lib/auth/middleware.js addition (Edge Runtime safe — env var only):
if (process.env.ONBOARDING_ENABLED === 'true' && session && !pathname.startsWith('/onboarding')) {
  return NextResponse.redirect(new URL('/onboarding', request.url));
}

// templates/app/onboarding/page.js (Server Component — DB access OK):
import { getOnboardingState } from '../../../lib/onboarding/state.js';
export default async function OnboardingPage() {
  const state = getOnboardingState();
  if (state?.completed_at) redirect('/');
  return <OnboardingWizard initialState={state} />;
}
```

### Pattern 3: Server Action for Verification
**What:** Each verification step calls a Server Action that calls the real infrastructure endpoint, records result to DB, returns structured status.
**When to use:** All wizard step verifications (GitHub PAT, Docker, Slack, first job).
**Example:**
```javascript
// lib/chat/actions.js — add alongside existing actions
'use server';
import { requireAuth } from '../auth/middleware.js';
import { githubApiRaw } from '../github-api.js';
import { upsertOnboardingStep } from '../onboarding/state.js';

export async function verifyGithubPat() {
  await requireAuth();
  try {
    const response = await githubApiRaw('GET', '/user');
    upsertOnboardingStep('github_connect', 'complete');
    return { success: true, login: response.login };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
```

### Pattern 4: First-Job Completion Check via usageEvents
**What:** `first_job` step is complete when `usageEvents` table has at least one row — no polling needed, just a point-in-time check.
**When to use:** ONB-04 `first_job` step verification.
**Example:**
```javascript
// lib/onboarding/verify.js
import { getUsageSummary } from '../db/usage.js';

export function checkFirstJobComplete() {
  const summary = getUsageSummary();
  return summary.total > 0;
}
```

### Pattern 5: Drizzle Schema Addition
**What:** New `onboardingState` table added to `lib/db/schema.js` following existing table conventions.
**When to use:** ONB-01 schema migration.
**Example:**
```javascript
// lib/db/schema.js addition (following errorLog/usageEvents pattern from Phase 43-44):
export const onboardingState = sqliteTable('onboarding_state', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  currentStep: text('current_step').notNull().default('github_connect'),
  githubConnect: text('github_connect').notNull().default('pending'),
  instanceConfigure: text('instance_configure').notNull().default('pending'),
  channelConnect: text('channel_connect').notNull().default('pending'),
  firstJob: text('first_job').notNull().default('pending'),
  completedAt: text('completed_at'),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
```

### Pattern 6: Superadmin Endpoint Extension
**What:** Add `onboarding` case to the switch in `handleSuperadminEndpoint()` in `api/superadmin.js`, using dynamic import pattern.
**When to use:** ONB-01 superadmin visibility endpoint.
**Example:**
```javascript
// api/superadmin.js — add case to existing switch:
case 'onboarding': {
  const { getOnboardingState } = await import('../lib/onboarding/state.js');
  return res.json({ onboarding: getOnboardingState() });
}
```

### Anti-Patterns to Avoid
- **DB read in middleware:** Edge Runtime cannot use better-sqlite3. Completion check MUST happen in the page Server Component.
- **Redirect to `/onboarding` when already on `/onboarding`:** Middleware must exclude `/onboarding` from the redirect condition (shown in Pattern 2 above).
- **User self-reporting step completion:** All steps must verify against real infrastructure. No "Mark as done" buttons.
- **`react-hook-form` in Server Components:** It's a client-side library. The wizard must be a `'use client'` component.
- **Importing from `thepopebot/*`:** ClawForge uses relative imports only. Never use package imports.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form state + validation | Custom useState + manual validation | react-hook-form + Zod | Dirty tracking, error display, async validation, submission locking all built in |
| GitHub API calls | Custom fetch wrapper | Existing `githubApiRaw()` in `lib/github-api.js` | Already handles auth headers, base URL, error normalization |
| Docker health check | Raw socket calls | Existing dockerode instance via `lib/docker.js` | `docker.info()` is the established pattern |
| Progress persistence | localStorage / cookies | `onboarding_state` SQLite table | Survives browser refreshes, server restarts, multi-device access |
| Step routing | Custom router | `currentStep` field in DB + wizard state | Single source of truth; no URL-based step routing needed |

**Key insight:** ClawForge already has all infrastructure verification primitives (`github-api.js`, `lib/docker.js`, `lib/db/usage.js`). Onboarding wires them together — it doesn't build new ones.

---

## Common Pitfalls

### Pitfall 1: Edge Runtime Redirect Loop
**What goes wrong:** Middleware redirects all authenticated users to `/onboarding`. Onboarding page also redirects (to `/`). If completion check fires before state is initialized, infinite redirect loop.
**Why it happens:** Middleware runs on every request including the `/onboarding` page itself.
**How to avoid:** Middleware guard must exclude `/onboarding` path: `!pathname.startsWith('/onboarding')`. Page Server Component only redirects to `/` when `completedAt` is non-null.
**Warning signs:** Browser "too many redirects" error on first load with `ONBOARDING_ENABLED=true`.

### Pitfall 2: better-sqlite3 in Edge Runtime
**What goes wrong:** Any import that transitively requires `better-sqlite3` will crash the middleware.
**Why it happens:** Next.js middleware runs in the V8 Isolates Edge Runtime, not Node.js.
**How to avoid:** Middleware ONLY reads `process.env.ONBOARDING_ENABLED`. No DB imports of any kind.
**Warning signs:** Build error "The edge runtime does not support Node.js 'fs' module" or runtime crash on any `/onboarding` navigation.

### Pitfall 3: Zod v3/v4 API Mismatch
**What goes wrong:** react-hook-form resolver imports assume Zod v3 syntax; project uses Zod v4 (`^4.3.6`).
**Why it happens:** `@hookform/resolvers/zod` ships adapters for both; the import path differs.
**How to avoid:** Use `import { zodResolver } from '@hookform/resolvers/zod'` — this works with both v3 and v4 as of @hookform/resolvers ^3.9. Verify with: `npm view @hookform/resolvers version`.
**Warning signs:** Runtime error "ZodError is not a constructor" or validation never firing.

### Pitfall 4: Double Completion on First Job
**What goes wrong:** `usageEvents` may already have rows from pre-onboarding testing. `first_job` step shows complete immediately.
**Why it happens:** Phase 44 wired `recordUsageEvent()` into `waitAndNotify()` — any job completion before onboarding runs will create rows.
**How to avoid:** `first_job` step should dispatch a job AND wait for the result, not just check the count. Alternatively, check for `usageEvents` rows created AFTER onboarding started (`created_at > onboarding_state.created_at`). The planner should choose one approach.
**Warning signs:** Onboarding shows step 4 already complete on first load.

### Pitfall 5: Blocking Server Action on Docker Verification
**What goes wrong:** `docker.info()` hangs if Docker daemon is not running, blocking the Server Action indefinitely.
**Why it happens:** Dockerode uses TCP/Unix socket connection with no default timeout.
**How to avoid:** Wrap `docker.info()` in a `Promise.race()` with a 5-second timeout. Return structured error on timeout.
**Warning signs:** Wizard step never returns / loading spinner hangs.

### Pitfall 6: Templates vs. lib Confusion
**What goes wrong:** Wizard logic added to `templates/app/onboarding/page.js` instead of `lib/chat/components/onboarding-wizard.js`.
**Why it happens:** Templates directory looks like the right place for app pages.
**How to avoid:** `templates/CLAUDE.md` is explicit: all logic goes in `lib/`. Templates contain only thin wiring shells that import from `lib/chat/components/`.
**Warning signs:** Business logic, DB calls, or Server Action definitions appearing in `templates/` files.

---

## Code Examples

Verified patterns from existing codebase:

### Existing GitHub API Verification Pattern
```javascript
// Source: lib/github-api.js (existing)
// Internal function already handles auth — verification just needs a /user call
async function githubApiRaw(method, path, body) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);
  return response.json();
}
```

### Existing Docker Info Pattern
```javascript
// Source: lib/docker.js (existing dockerode usage)
import Docker from 'dockerode';
const docker = new Docker();
// Verification call:
const info = await docker.info(); // throws if daemon unreachable
```

### Existing Server Action Auth Guard Pattern
```javascript
// Source: lib/chat/actions.js (existing pattern)
'use server';
import { requireAuth } from '../auth/middleware.js';

export async function someAction(data) {
  const session = await requireAuth(); // throws redirect if not authed
  // ... action body
}
```

### Existing createJob Usage Pattern
```javascript
// Source: lib/tools/create-job.js (existing)
export async function createJob({ repo, branch, jobDescription, targetFile }) {
  // 1. creates job/{UUID} branch
  // 2. pushes job.md with jobDescription
  // 3. optionally pushes target.json
  return { jobId, branch, prUrl };
}
```

### Existing usageEvents Check Pattern
```javascript
// Source: lib/db/usage.js (existing Phase 44)
export function getUsageSummary(period = 'all') {
  // Returns { total, byType, byModel, periodStart, periodEnd }
  const rows = db.prepare('SELECT * FROM usage_events WHERE ...').all();
  return { total: rows.length, ... };
}
```

### Existing Superadmin Switch Pattern
```javascript
// Source: api/superadmin.js (existing)
async function handleSuperadminEndpoint(action, req, res) {
  switch (action) {
    case 'health': { ... }
    case 'stats': { ... }
    case 'jobs': { ... }
    case 'usage': {
      const { getUsage } = await import('../lib/billing/usage.js'); // dynamic import
      return res.json(await getUsage());
    }
    // Phase 45 adds:
    // case 'onboarding': { ... }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DB reads in Next.js middleware | Env var check only in middleware; DB in Server Components | Next.js 13+ (Edge Runtime adoption) | Prevents better-sqlite3 crash in Edge Runtime |
| Wizard state in localStorage | Server-persisted `onboarding_state` table | ClawForge Phase 45 (new) | Survives browser resets, multi-device, server restarts |
| Manual fetch wrappers | `githubApiRaw()` abstraction | Existing in lib/github-api.js | Consistent auth, error handling |

**Deprecated/outdated:**
- `/settings/*` routes: Admin panel migrated to `/admin/*`. New wizard lives at `/onboarding` (not `/settings/onboarding`).

---

## Open Questions

1. **First-job step: count-based vs. timestamp-based completion check**
   - What we know: `usageEvents` may have rows from pre-onboarding testing (Phase 44 backfills from job completions)
   - What's unclear: Whether to check `total > 0` or `rows with created_at > onboarding_state.created_at > 0`
   - Recommendation: Timestamp-based check is safer and avoids the pitfall described above. Planner should decide.

2. **Slack webhook verification method**
   - What we know: Slack webhook URLs are stored in instance config; the test is to POST a test message
   - What's unclear: Whether to POST a real "ClawForge onboarding test" message or just validate URL format
   - Recommendation: Real POST is more reliable. Planner should confirm acceptable test message text.

3. **Tooltip implementation for ONB-05**
   - What we know: Project uses Tailwind + shadcn; Radix UI Tooltip is available
   - What's unclear: Whether project already imports Radix Tooltip or needs `npx shadcn@latest add tooltip`
   - Recommendation: Check `components/ui/tooltip.tsx` existence before the plan. If absent, use HTML `title` attribute as fallback (lighter-weight).

4. **Wizard accessibility at `/onboarding` before any user exists**
   - What we know: Middleware redirects only authenticated users. Unauthenticated → `/login` first.
   - What's unclear: Whether onboarding should be accessible before first user setup (bootstrap scenario).
   - Recommendation: Keep current flow — `/login` first, then `/onboarding`. Planner should confirm bootstrap is out of scope.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test runner config found in project root |
| Config file | None — see Wave 0 |
| Quick run command | N/A until Wave 0 gap filled |
| Full suite command | N/A until Wave 0 gap filled |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ONB-01 | `onboarding_state` table created; `getOnboardingState()` returns null on empty DB | unit | TBD — no framework yet | ❌ Wave 0 |
| ONB-01 | `upsertOnboardingStep()` creates row on first call, updates on subsequent | unit | TBD | ❌ Wave 0 |
| ONB-02 | `verifyGithubPat()` returns `{ success: true }` on valid token | integration (manual) | Manual only — requires live GitHub token | manual-only |
| ONB-03 | `verifyDockerSocket()` returns `{ success: true }` when daemon running | integration (manual) | Manual only — requires live Docker daemon | manual-only |
| ONB-04 | `checkFirstJobComplete()` returns false when `usageEvents` empty | unit | TBD | ❌ Wave 0 |
| ONB-04 | `checkFirstJobComplete()` returns true when `usageEvents` has rows after onboarding start | unit | TBD | ❌ Wave 0 |
| ONB-05 | Tooltip text contains "AGENT_" prefix explanation | visual (manual) | Manual only — UI inspection | manual-only |
| ONB-06 | Repos empty state contains a CTA link/button | visual (manual) | Manual only — UI inspection | manual-only |

### Sampling Rate
- **Per task commit:** N/A — no test runner installed
- **Per wave merge:** Manual smoke test: navigate to `/onboarding`, verify wizard renders, verify redirect on completion
- **Phase gate:** Full manual walkthrough before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] No test framework detected — project has no `jest.config.*`, `vitest.config.*`, or `test/` directory
- [ ] `lib/onboarding/state.js` unit tests would need a test runner + SQLite in-memory fixture
- [ ] Recommendation: Skip automated unit tests for this phase; rely on manual smoke testing per the "no existing test infrastructure" finding. Document manual test steps in PLAN.md verification section.

*(If a test framework is added later, unit tests for `getOnboardingState()` and `upsertOnboardingStep()` are straightforward with an in-memory SQLite db.)*

---

## Sources

### Primary (HIGH confidence)
- `lib/db/schema.js` — confirmed `onboardingState` table absent; all Phase 44 tables present
- `lib/auth/middleware.js` — confirmed Edge Runtime, no onboarding redirect, existing guard patterns
- `api/superadmin.js` — confirmed `usage` case exists, `onboarding` case missing, dynamic import pattern
- `lib/billing/enforce.js` — synchronous SQLite pattern for new state module
- `lib/db/usage.js` — `recordUsageEvent()` and `getUsageSummary()` as `first_job` completion source
- `lib/tools/create-job.js` — simple dispatch function, safe to call from Server Action
- `lib/github-api.js` — `githubApiRaw()` available for PAT verification
- `lib/chat/components/admin-repos-page.js` — empty state confirmed, no actionable CTA
- `lib/chat/components/settings-mcp-page.js` — empty state confirmed, file-path only, no in-app action
- `.planning/STATE.md` — locked decision: middleware env var only, no DB reads
- `.planning/REQUIREMENTS.md` — ONB-01 through ONB-06 requirements
- `.planning/research/ARCHITECTURE.md` — Phase 45 capability design
- `templates/CLAUDE.md` — templates = thin wiring only; logic in `lib/`
- `api/CLAUDE.md` — Server Actions for browser UI, never API routes
- `package.json` — confirmed `react-hook-form` absent; Zod `^4.3.6` present

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` — Edge Runtime pitfalls documented from prior research
- `.planning/research/FEATURES.md` — wizard step sequence and two-phase verification design

### Tertiary (LOW confidence)
- None — all findings verified against source files

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against `package.json`; missing packages identified
- Architecture: HIGH — verified against existing codebase patterns in `lib/db/usage.js`, `api/superadmin.js`, `lib/auth/middleware.js`
- Pitfalls: HIGH — Edge Runtime pitfall verified in `lib/auth/middleware.js`; Zod v4 version verified in `package.json`; templates rule verified in `templates/CLAUDE.md`

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable stack, no fast-moving dependencies)
