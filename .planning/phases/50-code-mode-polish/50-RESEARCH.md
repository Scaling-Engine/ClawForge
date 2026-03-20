# Phase 50: Code Mode Polish - Research

**Researched:** 2026-03-20
**Domain:** Feature flag gating, mobile session continuity, Claude subscription auth, device-agnostic session persistence
**Confidence:** MEDIUM (feature flag gating HIGH, mobile continuity MEDIUM, Claude subscription auth LOW)

## Summary

Phase 50 polishes the Code mode feature delivered in Phases 48-49. Three goals: (1) gate Code mode behind a `features.codeWorkspace` feature flag so operators can enable/disable it without code changes, (2) ensure workspace sessions are resumable across devices via the existing `codeWorkspaceId` FK on the chats table, (3) explore Claude subscription auth (OAuth login vs API key) — though the scope here is LOW confidence because Anthropic has no standard OAuth provider.

The feature flag infrastructure is fully in place: `FeaturesProvider`/`useFeature` context exists, `getFeatureFlags()` Server Action reads `config/FEATURES.json`. The only work is wiring `useFeature('codeWorkspace')` into the `chat.jsx` and `chat-input.jsx` components to control visibility of the Code toggle and Interactive button. Mobile/device continuity is primarily a matter of ensuring the existing `codeWorkspaceId` link flows through the chat UI so a user returning to a chat from any device navigates to the same workspace.

**Primary recommendation:** Wire `useFeature('codeWorkspace')` as an additional gate on the Code toggle (ANDed with `isAdmin`). Create `config/FEATURES.json` template. Ensure `codeWorkspaceId` is used in `getLinkedWorkspace` to reconnect sessions from any device. Treat Claude subscription auth as aspirational/deferred unless a clear scope is defined.

## Standard Stack

### Core (already present — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-auth | v5 (beta) | Auth session management | Already in use; credentials provider |
| better-sqlite3 | current | Synchronous SQLite reads | Already in use; Drizzle ORM layer |
| React context | (built-in) | Feature flag distribution | `FeaturesProvider`/`useFeature` already built |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/chat/features-context.jsx` | local | `useFeature(flag)` hook | Consume in any component that should be flag-gated |
| `lib/chat/actions.js:getFeatureFlags` | local | Read `config/FEATURES.json` | Called once in `chat-page.jsx` on mount |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| File-based FEATURES.json | DB-backed via `lib/db/config.js` | DB approach enables runtime toggle without restart, but file approach is consistent with existing pattern and simpler for Phase 50 |
| isAdmin gate only | isAdmin AND useFeature('codeWorkspace') | Flag gate allows operator control without code changes; admin gate remains as role-based access control |

**Installation:** No new packages required.

## Architecture Patterns

### Feature Flag Gate Pattern

The existing system: `chat-page.jsx` calls `getFeatureFlags()` and wraps the app in `<FeaturesProvider flags={featureFlags}>`. Any child component calls `useFeature('flagName')` to get a boolean.

**Current state (Phase 49 output):**
```jsx
// chat.jsx — Code toggle is gated on isAdmin only
<ChatInput
  onToggleCode={isAdmin ? () => setCodeActive(prev => !prev) : undefined}
  onLaunchInteractive={handleLaunchInteractive}
  ...
/>
```

**Phase 50 target:**
```jsx
// Source: lib/chat/components/chat.jsx (Phase 49 pattern)
// Add useFeature import and AND with isAdmin
import { useFeature } from '../features-context.js';

export function Chat({ chatId, initialMessages = [], isAdmin = false }) {
  const codeWorkspaceEnabled = useFeature('codeWorkspace');
  // ...
  const canUseCode = isAdmin && codeWorkspaceEnabled;

  return (
    <ChatInput
      onToggleCode={canUseCode ? () => setCodeActive(prev => !prev) : undefined}
      onLaunchInteractive={canUseCode ? handleLaunchInteractive : undefined}
      // ...
    />
  );
}
```

### FEATURES.json Template Pattern

No `config/FEATURES.json` exists in `templates/config/` yet. Wave 0 must create it.

```json
{
  "codeWorkspace": false
}
```

This file lives at `config/FEATURES.json` in each deployed instance (resolved via `lib/paths.js:featuresFile`). Operators toggle Code mode by editing this file and restarting (or hot-reloading if a reload mechanism is added).

### Device-Agnostic Session Continuity Pattern

The workspace is already server-side (Docker container, server-identified by `workspaceId`). The `codeWorkspaceId` FK on `chats` maps a chat to its workspace. `getLinkedWorkspace({ chatId })` already queries this relationship.

```js
// Source: lib/chat/components/code/actions.js (Phase 49)
// getLinkedWorkspace already returns the running workspace for a chatId
// Any device that loads the same chatId will get the same workspaceId
// and the Interactive button will navigate to /code/{workspaceId}
```

The continuity gap is UX, not data: on mobile or a second device, the user returns to `/chat/{chatId}`, sees the Interactive button (if workspace is still running), and clicks to resume. No new API or data model is needed — the existing `getLinkedWorkspace` + `linkedWorkspaceId` state in `chat.jsx` already handles this.

### Mobile Responsive Layout

The `/code/{id}` page (`templates/app/code/[id]/code-page.jsx`) uses DnD tabs. On mobile, the tab drag-and-drop UI may be cumbersome. Consider:
- Hiding the DnD affordances on narrow viewports (CSS `@media` or Tailwind responsive classes)
- Ensuring the Shell tab (xterm.js) fills the viewport on mobile

### Recommended Project Structure Changes

```
config/
└── FEATURES.json          # New: feature flag file (created in Wave 0)

lib/chat/components/
├── chat.jsx               # Modified: add useFeature('codeWorkspace') gate
└── chat-input.jsx         # May need modification if it has its own gate logic
```

### Anti-Patterns to Avoid

- **Replacing the isAdmin gate with the feature flag:** The isAdmin gate is role-based access control (only admins can use Code mode). The feature flag is operator-level toggle (enables/disables the feature entirely). Both must be present: `canUseCode = isAdmin && codeWorkspaceEnabled`.
- **DB-backed feature flags for Phase 50:** The existing file-based system is sufficient. Don't introduce a `features` table unless hot-reloading without restart is explicitly required.
- **Touching `terminalSessions`/`terminalCosts` tables or `lib/ws/`:** These are on the do-not-touch list in STATE.md.
- **Adding an Anthropic OAuth provider to NextAuth without a clear spec:** There is no standard Anthropic OAuth provider. If "Claude subscription auth" means something specific (e.g., validating a Claude Pro subscription token), that needs operator input before implementation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Feature flag reads | Custom config loader | `getFeatureFlags()` in `lib/chat/actions.js` | Already handles missing file gracefully (returns `{}`) |
| Feature flag distribution | Prop drilling through component tree | `useFeature()` from `lib/chat/features-context.jsx` | Context already wired in `chat-page.jsx` |
| Workspace session lookup | New DB query | `getLinkedWorkspace({ chatId })` Server Action | Already returns running workspace for chatId |
| Auth session | Custom session management | NextAuth v5 `auth()` / `useSession()` | Already in use throughout; do not reinvent |

**Key insight:** All infrastructure for this phase exists. Phase 50 is wiring work, not new system work.

## Common Pitfalls

### Pitfall 1: Feature flag import path
**What goes wrong:** `chat.jsx` uses `.js` imports for compiled esbuild output. `features-context.js` is the compiled output; `features-context.jsx` is the source. Importing `.jsx` directly in `chat.jsx` will fail at runtime.
**Why it happens:** esbuild compiles `lib/chat/components/**/*.jsx` → `.js`. The `chat.jsx` component imports compiled `.js` siblings.
**How to avoid:** Use `import { useFeature } from '../features-context.js'` (the compiled output path), NOT `../features-context.jsx`.
**Warning signs:** `Module not found` error or `useFeature is not a function` at runtime.

### Pitfall 2: Feature flag default when FEATURES.json is absent
**What goes wrong:** If `config/FEATURES.json` doesn't exist, `getFeatureFlags()` returns `{}`. `useFeature('codeWorkspace')` returns `false`. Code mode is hidden for ALL users including admins.
**Why it happens:** Graceful fallback design treats missing file as all-flags-off.
**How to avoid:** The Wave 0 task MUST create `config/FEATURES.json` in the instance config with `codeWorkspace: true` for existing deployments where Code mode is already in use.
**Warning signs:** Code toggle disappears for admin users after deploy.

### Pitfall 3: Interactive button requires both feature flag AND repo selection
**What goes wrong:** The Interactive button has multiple guards: `codeActive && onToggleCode` (from Phase 49), `hasRepoSelected`, and potentially the new feature flag. If the feature flag is added to the wrong guard level, the button may show/hide inconsistently.
**Why it happens:** The `onLaunchInteractive` prop and the button's own `disabled` state have separate conditions.
**How to avoid:** Apply the feature flag gate at the `canUseCode` level in `chat.jsx` (where `onToggleCode` and `onLaunchInteractive` props are conditionally passed). Don't add flag checks inside `chat-input.jsx`.
**Warning signs:** Interactive button visible but non-functional, or visible without Code mode active.

### Pitfall 4: Claude subscription auth scope is undefined
**What goes wrong:** Implementing a complex OAuth flow for Anthropic when no OAuth provider exists, or building custom token validation that isn't spec'd.
**Why it happens:** "Claude subscription auth" in the ROADMAP is aspirational language without a clear implementation target.
**How to avoid:** Treat this as out-of-scope for Phase 50 implementation unless the operator provides a specific spec. Research what Anthropic actually offers (no standard OAuth as of 2026-03-20). Document as an open question.
**Warning signs:** Spending time on auth provider research with no official Anthropic OAuth docs to reference.

### Pitfall 5: Mobile responsiveness breaks xterm.js Terminal
**What goes wrong:** xterm.js Terminal instances sized at mount time don't resize when viewport changes (e.g., mobile orientation change or browser resize).
**Why it happens:** xterm.js `Terminal.resize(cols, rows)` must be called explicitly; the `FitAddon` handles this but must be triggered on window resize events.
**How to avoid:** Ensure the existing xterm.js setup in `TerminalView` (Phase 49) already calls `fitAddon.fit()` on resize. If not, add a `ResizeObserver` or `window.addEventListener('resize', ...)` in the TerminalView component.
**Warning signs:** Terminal appears with wrong column width on mobile or after window resize; text wraps incorrectly.

## Code Examples

### Feature Flag Gate in chat.jsx
```jsx
// Source: lib/chat/components/chat.jsx — Phase 50 modification
// Add at top of Chat component:
import { useFeature } from '../features-context.js';

export function Chat({ chatId, initialMessages = [], isAdmin = false }) {
  const codeWorkspaceEnabled = useFeature('codeWorkspace');
  const canUseCode = isAdmin && codeWorkspaceEnabled;

  // In JSX, replace isAdmin ? ... with canUseCode ? ...
  // onToggleCode={canUseCode ? () => setCodeActive(prev => !prev) : undefined}
  // onLaunchInteractive={canUseCode ? handleLaunchInteractive : undefined}
}
```

### config/FEATURES.json template
```json
{
  "codeWorkspace": false
}
```
Operators set `"codeWorkspace": true` to enable Code mode for admin users.

### getLinkedWorkspace — device continuity (no changes needed)
```js
// Source: lib/chat/components/code/actions.js (Phase 49)
// Already handles device-agnostic continuity:
// Any device loading /chat/{chatId} calls getLinkedWorkspace → gets workspaceId
// Interactive button navigates to /code/{workspaceId}
// No new code needed for basic multi-device access
```

### FEATURES.json read path (existing)
```js
// Source: lib/chat/actions.js:491-504
export async function getFeatureFlags() {
  await requireAuth();
  const { featuresFile } = await import('../paths.js');
  const fs = (await import('fs')).default;
  try {
    return JSON.parse(fs.readFileSync(featuresFile, 'utf8'));
  } catch {
    return {}; // No FEATURES.json = all flags off
  }
}
// featuresFile = path.join(PROJECT_ROOT, 'config', 'FEATURES.json')
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Three separate toggles (codeMode, shellMode, terminalMode) | Single `codeActive` boolean + `codeSubMode` | Phase 48 | Simpler state, unified routing |
| No interactive workspace from chat | Interactive button → `/code/{id}` | Phase 49 | Full IDE accessible from chat |
| No feature flag on Code mode | Feature flag gate `features.codeWorkspace` | Phase 50 (this phase) | Operator can disable without code deploy |
| Credentials-only auth | Credentials-only (no change in Phase 50) | N/A | Claude subscription OAuth deferred |

**Deprecated/outdated:**
- `codeMode`/`shellMode`/`terminalMode` separate state fields: Removed in Phase 48, replaced by `codeActive`+`codeSubMode`
- Direct `isAdmin` gate only for Code mode: Phase 50 adds `&&codeWorkspaceEnabled` requirement

## Open Questions

1. **Claude subscription auth / OAuth scope**
   - What we know: ROADMAP says "Claude subscription auth (OAuth login vs API key)". Anthropic has no standard OAuth provider as of 2026-03-20. NextAuth v5 has no official Anthropic provider.
   - What's unclear: Does this mean (a) allow users to authenticate using Claude.ai credentials, (b) validate that a user has an active Claude Pro subscription before enabling Code mode, or (c) something else entirely?
   - Recommendation: Treat as deferred/out-of-scope for Phase 50 unless the operator provides a specific spec. Flag as an open question in the PLAN. If it means "use user's own API key instead of instance key," that's a different admin config feature.

2. **Hot-reload feature flags without restart**
   - What we know: Current `getFeatureFlags()` reads file at request time (called from `chat-page.jsx` on mount via Server Action). Changing `FEATURES.json` takes effect on next page load — no server restart needed.
   - What's unclear: Is this sufficient, or do operators need a UI toggle in the admin panel?
   - Recommendation: File-based toggle is sufficient for Phase 50. Admin panel UI for feature flags can be Phase 51+ if needed.

3. **Mobile responsive layout for /code/{id} tab panel**
   - What we know: Phase 49 used `@dnd-kit` for draggable tabs. DnD on mobile touch may require `useSensor(TouchSensor)` configuration.
   - What's unclear: Phase 49 RESEARCH noted DnD works on mobile with touch sensors, but the actual `code-page.jsx` implementation may not have configured touch sensors.
   - Recommendation: Check Phase 49's `code-page.jsx` for `TouchSensor` in the `useSensors` call. If absent, add it in Phase 50.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (inferred from package.json — no explicit config found) |
| Config file | none detected — see Wave 0 |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

Phase 50 requirement IDs are TBD (not yet defined in REQUIREMENTS.md). Based on the ROADMAP goals:

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POL-01 | `useFeature('codeWorkspace')` returns false when FEATURES.json absent | unit | `npm test -- --testPathPattern=features` | Wave 0 |
| POL-02 | `useFeature('codeWorkspace')` returns true when flag is set in FEATURES.json | unit | `npm test -- --testPathPattern=features` | Wave 0 |
| POL-03 | Code toggle hidden when `codeWorkspace: false` even for admin users | manual-only | N/A — requires browser render | N/A |
| POL-04 | Interactive button hidden when `codeWorkspace: false` | manual-only | N/A — requires browser render | N/A |
| POL-05 | Returning to a chat from second device shows Interactive button for linked workspace | manual-only | N/A — requires multi-device test | N/A |

**Manual-only justification:** Feature flag UI gating (POL-03, POL-04) and multi-device continuity (POL-05) require browser rendering and cannot be meaningfully tested in a headless Jest unit test without significant mocking overhead.

### Sampling Rate
- **Per task commit:** `npm test` (if test files exist)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `config/FEATURES.json` — create template file with `codeWorkspace: false` default
- [ ] `templates/config/FEATURES.json` — scaffolding template so `npx thepopebot init` creates the file
- [ ] No test infrastructure detected for this codebase — confirm `npm test` script exists before Wave 0 verification

## Sources

### Primary (HIGH confidence)
- `lib/chat/features-context.jsx` — FeaturesProvider/useFeature implementation
- `lib/chat/actions.js:491-504` — getFeatureFlags Server Action, file-based flag reads
- `lib/paths.js` — featuresFile path resolution (config/FEATURES.json)
- `lib/chat/components/chat.jsx` — Phase 49 output, current Code toggle gating via isAdmin prop
- `lib/chat/components/code/actions.js` — launchWorkspace, getLinkedWorkspace Server Actions
- `lib/db/schema.js` — chats table codeWorkspaceId FK
- `lib/auth/config.js` — Credentials-only NextAuth v5, no OAuth providers
- `.planning/STATE.md` — do-not-touch list, Phase 49 decisions

### Secondary (MEDIUM confidence)
- `.planning/phases/48-code-mode-unification/48-RESEARCH.md` — Phase 48 pattern decisions
- `.planning/phases/49-interactive-code-ide/49-RESEARCH.md` — Phase 49 pattern decisions
- `templates/app/code/[id]/code-page.jsx` — Phase 49 DnD tabbed IDE implementation
- `templates/CLAUDE.md` — templates/ scaffolding-only rule

### Tertiary (LOW confidence)
- ROADMAP.md Phase 50 description: "Claude subscription auth (OAuth login vs API key)" — scope unclear, no Anthropic OAuth provider exists; treated as aspirational

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all infrastructure is existing, verified in source files
- Feature flag gating: HIGH — FeaturesProvider/useFeature/getFeatureFlags all exist and verified
- Device continuity: MEDIUM — server-side workspaces + codeWorkspaceId FK already handle it; mobile layout needs verification
- Claude subscription auth: LOW — no Anthropic OAuth provider; scope unclear from ROADMAP description

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days — stable codebase, no fast-moving dependencies)
