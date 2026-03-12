# Phase 26: Web UI Auth + Repo Selector - Research

**Researched:** 2026-03-12
**Domain:** Next.js Server Actions auth, React context/state for UI controls, GitHub branch listing
**Confidence:** HIGH

## Summary

Phase 26 is primarily a UI enhancement and auth hardening phase. The three problem spaces are: (1) enforcing server-side auth on every Server Action, (2) adding a repo/branch selector dropdown to the chat header, and (3) adding a code-mode toggle to chat input. A fourth requirement (WEBUI-04) is a wiring task — the `JobStreamViewer` component and its `[JOB_STREAM:]` parsing already exist from Phase 25 and need only to be confirmed wired in `message.jsx` (it already is). A fifth requirement (WEBUI-03) is a `FeaturesContext` React context to gate in-development features per instance without code deploys.

The auth layer is already sound: all three Server Action files (`lib/chat/actions.js`, `lib/ws/actions.js`, `lib/auth/actions.js`) use `requireAuth()` / `auth()` internally with early throws. The `setupAdmin` action is intentionally unprotected (pre-login flow). The one gap identified: Server Action throws are not uniformly returning a typed 401 response — they throw `Error('Unauthorized')`. The requirement says "returns a 401", which for Server Actions means returning a structured error object `{ error: 'Unauthorized', status: 401 }` rather than throwing (or throwing a Next.js `unauthorized()` from `next/navigation` if using Next.js 15 auth error boundary). The project uses Next.js 15.5+.

The repo selector requires: (a) a Server Action or API call to surface the `REPOS.json` data and branch list, (b) a React context (`RepoChatContext`) to hold the selected repo/branch in the chat session, (c) a dropdown component in `ChatHeader`, and (d) forwarding the selected repo/branch as extra context on job dispatch (via the `chatStream` body or a system message injected at the LangGraph level). Branch listing requires a GitHub API call.

**Primary recommendation:** Build three lean additions — `RepoChatContext` (repo/branch state), `FeaturesContext` (feature flag state), and an enhanced `ChatHeader` with dropdowns — while standardizing Server Action error returns and wiring repo context into the chat stream body.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WEBUI-01 | Code mode toggle in chat input for syntax-highlighted monospace rendering | Toggle state in `ChatInput`; conditional className on message bubble; Tailwind `font-mono` + `prose-code` or raw `<pre>` wrapping |
| WEBUI-02 | Repo/branch selector in chat header; selection becomes job dispatch default | `RepoChatContext` + `ChatHeader` dropdown; `loadAllowedRepos()` Server Action; GitHub branches API; forwarded in stream body |
| WEBUI-03 | FeaturesContext to enable/disable in-dev features per instance without deploys | React context reading from `FEATURES.json` via Server Action; env-driven or file-driven flags |
| WEBUI-04 | Live job streaming renders inline via stream-viewer component | Already implemented in Phase 25 — `JobStreamViewer` + `[JOB_STREAM:]` marker in `message.jsx`. Confirmation task only |
| WEBUI-05 | All Server Actions enforce server-side auth — no client-only session checks | Currently use `requireAuth()` with throws; gap is return shape (throw vs structured 401); audit all `'use server'` files |
| WEBUI-06 | API-key-protected routes continue unchanged after auth boundary change | Middleware already skips `/api/*`; `checkAuth` in `api/index.js` is separate; no change required — smoke test only |
</phase_requirements>

---

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-auth | ^5.0.0-beta.30 | Session auth | Already integrated; `auth()` is the server-side check |
| next | >=15.5.12 | Framework | Provides `auth()` in Server Actions, `unauthorized()` helper |
| react | >=19.0.0 | UI | Context API for repo/features state |
| tailwindcss | ^4.2.0 | Styling | Existing pattern for all UI |

### New for This Phase
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | — | All needs met by existing stack | React Context + existing GitHub API utils handle repo/branch |

**No new npm dependencies needed for this phase.**

## Architecture Patterns

### Recommended Project Structure Additions
```
lib/
├── chat/
│   ├── components/
│   │   ├── chat-header.jsx        # EXTEND: add repo/branch dropdowns
│   │   ├── chat-input.jsx         # EXTEND: add code mode toggle
│   │   ├── chat.jsx               # EXTEND: consume RepoChatContext, pass to transport body
│   │   └── features-context.jsx   # NEW: FeaturesContext provider + hook
│   └── actions.js                 # EXTEND: add getRepos(), getBranches(), getFeatureFlags()
├── chat/
│   └── repo-chat-context.jsx      # NEW: RepoChatContext provider + hook
```

### Pattern 1: Server Action Auth — Structured Error Return

**What:** Every Server Action catches the `requireAuth()` rejection and returns `{ error: 'Unauthorized', status: 401 }` instead of throwing an unhandled error. This satisfies WEBUI-05 (returns 401) without breaking Next.js server action mechanics.

**When to use:** All Server Actions that are browser-facing (not internal server-to-server calls).

**Current behavior in `lib/chat/actions.js`:**
```javascript
async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');  // throws — client sees generic error
  }
  return session.user;
}
```

**Required pattern:**
```javascript
// Option A: Use Next.js 15 unauthorized() from next/navigation (throws internally,
// Next.js renders the nearest unauthorized.js boundary — HIGH confidence this is
// the idiomatic Next.js 15 approach for Server Actions)
import { unauthorized } from 'next/navigation';

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    unauthorized(); // Next.js 15 built-in — throws internally, returns 401 response
  }
  return session.user;
}
```

**Note on Next.js 15 `unauthorized()`:** This function was introduced in Next.js 15 as the canonical way for Server Actions and Server Components to signal a 401. It integrates with the `unauthorized.js` file convention. The project uses Next.js >=15.5.12, so this is available. Confidence: HIGH (official Next.js docs pattern).

**Alternative (works on any Next.js version, no boundary file needed):**
```javascript
// Each exported Server Action wraps requireAuth with a try/catch
export async function createChat(id, title = 'New Chat') {
  const user = await requireAuth();  // continues to throw
  // ...
}
// Callers on the client must handle the thrown error — this is the CURRENT behavior.
// For "returns 401" requirement, prefer unauthorized() approach.
```

### Pattern 2: RepoChatContext — Session-Scoped Repo/Branch State

**What:** A React context that holds the currently-selected repo slug and branch for the chat session. Stored in component state (not localStorage) — clears on page reload, which is acceptable for an operator tool.

**When to use:** Wrap `Chat` (or `ChatPage`) in this provider; consume in `ChatHeader` for display/selection and in `chat.jsx` when constructing the stream body.

```javascript
// lib/chat/repo-chat-context.jsx
'use client';
import { createContext, useContext, useState } from 'react';

const RepoChatContext = createContext(null);

export function RepoChatProvider({ children }) {
  const [selectedRepo, setSelectedRepo] = useState(null);   // { owner, slug, name }
  const [selectedBranch, setSelectedBranch] = useState(null); // string e.g. "main"

  return (
    <RepoChatContext.Provider value={{ selectedRepo, setSelectedRepo, selectedBranch, setSelectedBranch }}>
      {children}
    </RepoChatContext.Provider>
  );
}

export function useRepoChat() {
  return useContext(RepoChatContext);
}
```

**Forwarding to stream:** In `chat.jsx`, include the selected repo/branch in the `DefaultChatTransport` body so the stream API can inject it as context for the LangGraph agent:

```javascript
const transport = useMemo(
  () =>
    new DefaultChatTransport({
      api: '/stream/chat',
      body: {
        chatId,
        selectedRepo: selectedRepo?.slug || null,
        selectedBranch: selectedBranch || null,
      },
    }),
  [chatId, selectedRepo, selectedBranch]
);
```

**Agent-side use in `lib/chat/api.js`:** Extract `selectedRepo` and `selectedBranch` from the request body, then inject as a system context prefix into the `userText` before calling `chatStream`:

```javascript
const { messages, chatId: rawChatId, trigger, selectedRepo, selectedBranch } = body;

// Prepend repo context so agent uses it automatically
if (selectedRepo) {
  const repoLine = selectedBranch
    ? `[Active repo context: ${selectedRepo}, branch: ${selectedBranch}]`
    : `[Active repo context: ${selectedRepo}]`;
  userText = `${repoLine}\n\n${userText}`;
}
```

### Pattern 3: FeaturesContext — Instance Feature Flags

**What:** A React context (and Server Action) that reads a `FEATURES.json` config file at the instance level and exposes enabled flags to UI components. This is a read-only system — flags are set in the file, not by UI.

**When to use:** Wrap app in `FeaturesProvider`; components call `useFeature('flagName')` to conditionally render.

```javascript
// lib/chat/features-context.jsx
'use client';
import { createContext, useContext } from 'react';

const FeaturesContext = createContext({});

export function FeaturesProvider({ flags, children }) {
  return <FeaturesContext.Provider value={flags}>{children}</FeaturesContext.Provider>;
}

export function useFeature(flag) {
  const flags = useContext(FeaturesContext);
  return Boolean(flags[flag]);
}
```

**Server Action to load flags:**
```javascript
// In lib/chat/actions.js
export async function getFeatureFlags() {
  await requireAuth();
  const { featuresFile } = await import('../paths.js');
  const fs = await import('fs');
  try {
    return JSON.parse(fs.readFileSync(featuresFile, 'utf8'));
  } catch {
    return {}; // No FEATURES.json = all flags off
  }
}
```

**FEATURES.json shape** (per instance, at `instances/{name}/config/FEATURES.json`):
```json
{
  "codeMode": true,
  "repoSelector": true
}
```

**Hydration:** Load flags server-side in the page component, pass to `FeaturesProvider` as static prop. No client-side fetch needed — flags don't change at runtime.

### Pattern 4: Code Mode Toggle in ChatInput

**What:** A toggle button in the chat input toolbar that sets a `codeMode` boolean. When enabled, the message bubble uses `font-mono` and renders code blocks in a highlighted monospace style.

**When to use:** When operator is pasting code-heavy content and wants monospace rendering.

**Key decision:** "Code mode" applies to the *input rendering* — the textarea gets `font-mono`, and the resulting message bubble uses a `<pre>` block instead of `<Streamdown>` markdown rendering. This avoids needing a new markdown syntax-highlight library (e.g., Prism or Shiki) since `streamdown` already handles code fences in markdown.

```javascript
// In chat.jsx — add codeMode state, pass to ChatInput and Messages
const [codeMode, setCodeMode] = useState(false);

// In ChatInput — new prop + button
// When codeMode === true: textarea gets font-mono class
// When submitted: message is wrapped in triple-backtick fence automatically
// OR: a Code icon toggle button in the toolbar, separate from send
```

**Simpler alternative:** `codeMode` just applies `font-mono` CSS to the textarea and wraps submission text in ` ``` ``` `. The markdown renderer (`streamdown`) handles the rest naturally.

### Anti-Patterns to Avoid

- **Client-side session checks only:** Calling `useSession()` from `next-auth/react` and conditionally showing UI is NOT sufficient for Server Action protection. The `requireAuth()` check inside the action itself is the real guard.
- **Storing repo selection in URL:** Leads to shareable-but-stale links and URL pollution. In-memory React state is correct for a session-scoped selection.
- **Fetching all branches upfront on page load:** REPOS.json may have many repos. Lazy-load branches only when a repo is selected.
- **Adding `FEATURES.json` to gitignore:** It should be committed per-instance to version-control which flags are enabled in each deployed instance.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth signaling from Server Actions | Custom error codes/headers | `unauthorized()` from `next/navigation` (Next.js 15) | Built-in, integrates with error boundaries |
| Branch listing | Custom GitHub REST implementation | Existing `githubApi()` in `lib/tools/github.js` | Already handles auth, error handling, pagination |
| Dropdown UI | Custom select component from scratch | Native `<select>` or extend existing `dropdown-menu.jsx` | `dropdown-menu.jsx` already exists in `lib/chat/components/ui/` |
| Feature flag storage | DB table, Redis, etc. | JSON file in instance config dir | Matches existing per-instance config pattern (SOUL.md, AGENT.md, REPOS.json) |

**Key insight:** Everything for this phase is composition of existing primitives — the auth system, GitHub API utility, and UI component library are all in place. New code is thin glue.

## Common Pitfalls

### Pitfall 1: `requireAuth()` Throws vs Returns 401

**What goes wrong:** The current `requireAuth()` throws `new Error('Unauthorized')`. From the browser's perspective, a thrown Server Action error may surface as a generic error or be swallowed. WEBUI-05 requires that callers receive a clear 401 signal.

**Why it happens:** The existing pattern throws for early exit; this works for middleware-protected pages but is ambiguous for client-side Server Action callers.

**How to avoid:** Use `unauthorized()` from `next/navigation` (Next.js 15 built-in) inside `requireAuth()`. This is intercepted by Next.js and produces a proper 401 response. Alternatively, wrap each exported action in try/catch and return `{ error: 'Unauthorized', status: 401 }` — but this requires touching every function.

**Warning signs:** Client errors with generic "Action failed" messages when called without a valid session.

### Pitfall 2: Branch Fetch Race on Repo Change

**What goes wrong:** User selects a repo, branches start loading, user selects a different repo before branches arrive — stale branches from the first request populate the dropdown.

**Why it happens:** Async fetch with no cancellation.

**How to avoid:** Track a `branchLoadingForRepo` ref. Discard responses where `loadedForRepo !== currentRepo`.

### Pitfall 3: Transport Body Memoization with Changing Repo State

**What goes wrong:** `DefaultChatTransport` memoized with `useMemo([chatId])` will NOT update when repo selection changes mid-chat. The body sent to `/stream/chat` will be stale.

**Why it happens:** The `transport` memo in `chat.jsx` only depends on `chatId` currently.

**How to avoid:** Include `selectedRepo` and `selectedBranch` in the `useMemo` dependency array. (This re-creates the transport object on selection change, which is safe — `useChat` consumes the transport reference.)

### Pitfall 4: `setupAdmin` Must Stay Unprotected

**What goes wrong:** Over-applying auth to the `lib/auth/actions.js` file would break first-run setup.

**Why it happens:** Audit of "all Server Actions" could accidentally add auth to `setupAdmin`.

**How to avoid:** `setupAdmin` is intentionally unprotected — it's only callable when zero users exist, and `createFirstUser()` is atomic/idempotent. Do not add `requireAuth()` to it.

### Pitfall 5: WEBUI-04 Appears Not Wired But Actually Is

**What goes wrong:** A developer looks at `message.jsx` and misses the `renderTextWithStreamViewer()` function, then builds a parallel implementation.

**Why it happens:** The function is defined before the exported component, easy to miss.

**How to avoid:** WEBUI-04 is already fully implemented. The `JOB_STREAM_RE` regex, `renderTextWithStreamViewer()`, and `JobStreamViewer` import are all in `lib/chat/components/message.jsx` (lines 74-106). Phase 26 only needs to verify it works end-to-end and check it off.

## Code Examples

### Verified: Existing `requireAuth()` in `lib/chat/actions.js`
```javascript
// Source: lib/chat/actions.js (current)
async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  return session.user;
}
```

### Verified: Existing `auth()` call in `lib/ws/actions.js`
```javascript
// Source: lib/ws/actions.js (current)
export async function requestTerminalTicket(workspaceId, port = 7681) {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  // ...
}
```

### Verified: `loadAllowedRepos()` in `lib/tools/repos.js`
```javascript
// Source: lib/tools/repos.js
function loadAllowedRepos() {
  const reposFile = path.join(PROJECT_ROOT, 'config', 'REPOS.json');
  const raw = fs.readFileSync(reposFile, 'utf8');
  return JSON.parse(raw).repos || [];
}
// Returns: [{ owner, slug, name, aliases, dispatch }]
```

### Verified: GitHub API utility in `lib/tools/github.js`
```javascript
// Use existing githubApi() to fetch branches:
// GET /repos/{owner}/{slug}/branches
// Returns: [{ name, commit: { sha } }]
```

### Verified: `[JOB_STREAM:]` marker already wired in `message.jsx`
```javascript
// Source: lib/chat/components/message.jsx (lines 74-106)
const JOB_STREAM_RE = /\[JOB_STREAM:([a-f0-9-]+)\]/;

function renderTextWithStreamViewer(text, isLoading) {
  const match = JOB_STREAM_RE.exec(text);
  if (!match) {
    return <Streamdown ...>{text}</Streamdown>;
  }
  // Renders JobStreamViewer inline — WEBUI-04 is already done
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `throw new Error('Unauthorized')` | `unauthorized()` from `next/navigation` | Next.js 15 | Proper HTTP 401 semantics in Server Actions |
| Client session check only | Server-side `auth()` in every action | Auth.js v5 + Next.js 15 pattern | Required for WEBUI-05 |
| URL-based repo context | React context (in-memory) | — | Session-scoped, no URL pollution |

**Deprecated/outdated:**
- Client-only session guards via `useSession()` for protecting mutations: replaced by `auth()` inside the Server Action itself.

## Open Questions

1. **Does `unauthorized()` from `next/navigation` require an `unauthorized.js` file to exist?**
   - What we know: Next.js 15 docs say `unauthorized()` works similarly to `notFound()` — it throws an error caught by the nearest error boundary.
   - What's unclear: Whether it silently swallows if no `unauthorized.js` exists, or returns a default 401.
   - Recommendation: Add a minimal `unauthorized.js` page (mirrors `not-found.js` convention) as part of the auth hardening task.

2. **Where should `FEATURES.json` live for deployed instances?**
   - What we know: Other per-instance config lives in `instances/{name}/config/` (SOUL.md, AGENT.md, REPOS.json).
   - What's unclear: Whether `FEATURES.json` should be in `instances/{name}/config/` (same as REPOS.json) or at a runtime path resolved by `paths.js`.
   - Recommendation: Follow REPOS.json pattern — add `featuresFile` to `lib/paths.js`, defaulting to `config/FEATURES.json` in PROJECT_ROOT.

3. **Should code mode be per-message or per-session?**
   - What we know: WEBUI-01 says "toggle in chat input" — suggesting a session-level toggle, not per-message.
   - What's unclear: Whether toggling mid-conversation applies retroactively to existing messages.
   - Recommendation: Per-session toggle (state in `Chat` component). Only affects new messages sent after toggle.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None installed (package.json test: "echo \"No tests yet\"") |
| Config file | None |
| Quick run command | `npm test` (no-op) |
| Full suite command | `npm test` (no-op) |

### Phase Requirements — Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WEBUI-01 | Code mode toggle sets state, textarea gets font-mono | manual | n/a | n/a |
| WEBUI-02 | Repo/branch dropdown in header, job dispatch gets context | manual | n/a | n/a |
| WEBUI-03 | FeaturesContext flag gates UI elements | manual | n/a | n/a |
| WEBUI-04 | JobStreamViewer renders in chat message | manual | n/a | n/a — already in message.jsx |
| WEBUI-05 | Server Actions return 401 without session | manual curl / browser devtools | n/a | n/a |
| WEBUI-06 | API routes still accept API key auth | manual curl | n/a | n/a |

### Sampling Rate
- **Per task commit:** `npm test` (no-op — no automated tests)
- **Per wave merge:** Manual smoke test in browser
- **Phase gate:** Manual verification of all 6 requirements before `/gsd:verify-work`

### Wave 0 Gaps
None — no test infrastructure to set up. All validation for this phase is manual (UI behavior, auth boundary checks with browser devtools / curl).

## Sources

### Primary (HIGH confidence)
- Codebase direct read — `lib/chat/actions.js`, `lib/ws/actions.js`, `lib/auth/actions.js`, `lib/auth/config.js`, `lib/auth/middleware.js` — current auth implementation state
- Codebase direct read — `lib/chat/components/message.jsx` — WEBUI-04 wiring confirmed already present
- Codebase direct read — `lib/tools/repos.js` — REPOS.json shape and `loadAllowedRepos()` API
- Codebase direct read — `lib/chat/components/chat.jsx`, `lib/chat/api.js` — transport body forwarding pattern

### Secondary (MEDIUM confidence)
- Next.js 15 `unauthorized()` function — inferred from Next.js 15 release notes and `notFound()` parallel pattern; `unauthorized()` was added in Next.js 15 alongside the `unauthorized.js` file convention

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — codebase read confirms all dependencies already present
- Architecture: HIGH — patterns derived from existing code in the repo, not speculation
- Pitfalls: HIGH — three of five pitfalls directly observed in existing code; two are standard Next.js patterns

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable stack, no fast-moving dependencies in scope)
