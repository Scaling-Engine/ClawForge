---
phase: 26-web-ui-auth-repo-selector
verified: 2026-03-12T00:00:00Z
status: human_needed
score: 12/12 must-haves verified
human_verification:
  - test: "Repo dropdown renders in chat header with repos from REPOS.json"
    expected: "Dropdown shows configured repos; selecting one triggers lazy branch fetch; selecting a branch populates the branch dropdown"
    why_human: "UI rendering and interactive dropdown behavior cannot be verified programmatically"
  - test: "Code mode toggle button (</>): clicking switches textarea to monospace font and submitted text is wrapped in triple-backtick fences"
    expected: "Textarea gains font-mono class; sent message content appears inside ```...``` in the message bubble"
    why_human: "Visual font change and message bubble rendering require browser observation"
  - test: "WEBUI-03 feature flags: setting codeMode=false in config/FEATURES.json causes the </> toggle button to disappear"
    expected: "Feature flag gating works because useFeature() hook is available; NOTE: no component currently calls useFeature() to gate the button — the button renders unconditionally via onToggleCodeMode prop"
    why_human: "The useFeature hook exists and is exported but is not yet consumed by any component to gate the code-mode button. This is a functional gap to flag — the flag system exists but no UI component actually reads it yet."
  - test: "WEBUI-05 auth boundary: unauthenticated Server Action call returns 401 not 500"
    expected: "Browser dev tools show 401 response or redirect to /login — not a generic error page"
    why_human: "Requires live session manipulation to test the unauthorized() path"
  - test: "WEBUI-06 API routes: /api/ping and /api/slack/events respond correctly"
    expected: "curl /api/ping returns 200; Slack route returns signature validation response, not 500"
    why_human: "Live HTTP request needed to confirm route behavior unchanged"
  - test: "JobStreamViewer renders inline when [JOB_STREAM:uuid] appears in a message"
    expected: "Dispatching a job from chat produces a message with inline stream viewer rather than raw marker text"
    why_human: "Requires actual job dispatch and live streaming to observe"
---

# Phase 26: Web UI Auth + Repo Selector Verification Report

**Phase Goal:** All browser-facing Server Actions enforce server-side auth, and operators can anchor a chat session to a specific repo and branch without typing it in every message
**Verified:** 2026-03-12
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Server Actions in lib/chat/actions.js use unauthorized() instead of throw on unauthenticated access | VERIFIED | Line 26: `unauthorized()` in `requireAuth()`; zero `throw new Error('Unauthorized')` remain |
| 2 | Server Actions in lib/ws/actions.js use unauthorized() instead of throw | VERIFIED | Lines 19, 44, 58, 76 — all four actions call `unauthorized()` |
| 3 | lib/auth/actions.js setupAdmin remains unprotected | VERIFIED | Zero occurrences of `requireAuth` or `unauthorized` in the file; only `createFirstUser` called |
| 4 | app/unauthorized.js boundary page exists | VERIFIED | Exists at `templates/app/unauthorized.js`; exports `UnauthorizedPage` default component |
| 5 | FeaturesContext provides feature flags via useFeature() hook | VERIFIED | `lib/chat/features-context.jsx` exports `FeaturesProvider` and `useFeature` |
| 6 | Feature flags loaded from config/FEATURES.json via auth-protected Server Action | VERIFIED | `getFeatureFlags()` in `lib/chat/actions.js` calls `requireAuth()`, reads `featuresFile` from `lib/paths.js` |
| 7 | RepoChatContext holds selectedRepo and selectedBranch for the session | VERIFIED | `lib/chat/repo-chat-context.jsx` exports `RepoChatProvider` and `useRepoChat`; state holds `{owner,slug,name}` + branch string |
| 8 | ChatPage wraps Chat in FeaturesProvider (outermost) and RepoChatProvider | VERIFIED | `lib/chat/components/chat-page.jsx` lines 91–108: `FeaturesProvider > ChatNavProvider > RepoChatProvider > SidebarProvider` |
| 9 | Repo and branch dropdowns appear in ChatHeader; branch loads lazily with race protection | VERIFIED | `lib/chat/components/chat-header.jsx`: `useRepoChat()`, `getRepos()`, `getBranches()`, `branchLoadingForRepo` ref guard |
| 10 | Chat transport forwards selectedRepo and selectedBranch; dep array includes both | VERIFIED | `lib/chat/components/chat.jsx` lines 20–31: transport body includes `selectedRepo?.slug` and `selectedBranch`; deps `[chatId, selectedRepo, selectedBranch]` |
| 11 | api.js injects [Active repo context: ...] prefix into userText before LangGraph dispatch | VERIFIED | `lib/chat/api.js` lines 64–70: if `selectedRepo` is set, prepends `[Active repo context: ...]` to `userText` |
| 12 | Code mode toggle wraps submitted text in triple-backtick fences | VERIFIED | `lib/chat/components/chat.jsx` lines 62–64: `codeMode && rawText.trim() ? \`\`\`\n${rawText.trim()}\n\`\`\`` |

**Score:** 12/12 truths verified (automated). 6 items need human confirmation.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/chat/actions.js` | requireAuth() uses unauthorized(); getFeatureFlags/getRepos/getBranches exported | VERIFIED | All three actions present lines 277–322; `unauthorized()` in requireAuth line 26 |
| `lib/ws/actions.js` | Four actions use unauthorized() | VERIFIED | All four actions (lines 16, 41, 56, 72) call `unauthorized()` |
| `templates/app/unauthorized.js` | Next.js 15 boundary page | VERIFIED | Exports default `UnauthorizedPage` function at line 4 |
| `lib/chat/features-context.jsx` | FeaturesProvider + useFeature exports | VERIFIED | Both exported; 27 lines, substantive |
| `lib/chat/repo-chat-context.jsx` | RepoChatProvider + useRepoChat exports | VERIFIED | Both exported; state shape correct |
| `lib/paths.js` | featuresFile export | VERIFIED | Line 40: `export const featuresFile = path.join(PROJECT_ROOT, 'config', 'FEATURES.json')` |
| `config/FEATURES.json` | codeMode and repoSelector flags | VERIFIED | `{"codeMode": true, "repoSelector": true}` |
| `lib/chat/components/chat-page.jsx` | Wrapped in FeaturesProvider and RepoChatProvider | VERIFIED | Lines 91–108 confirm correct nesting |
| `lib/chat/components/chat-header.jsx` | Repo/branch dropdowns with useRepoChat | VERIFIED | Full implementation with race-guard ref |
| `lib/chat/components/chat-input.jsx` | codeMode prop, font-mono toggle, </> button | VERIFIED | Lines 40, 177–193, 218 confirm all three |
| `lib/chat/components/chat.jsx` | codeMode state, useRepoChat, transport wiring | VERIFIED | Lines 10, 15, 18–31, 62–64 |
| `lib/chat/api.js` | selectedRepo/selectedBranch destructured; prefix injected | VERIFIED | Lines 15, 64–70 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/chat/actions.js requireAuth()` | `next/navigation unauthorized()` | `import { unauthorized } from 'next/navigation'` | WIRED | Line 3 import; line 26 call |
| `lib/ws/actions.js` (all 4 actions) | `next/navigation unauthorized()` | same import pattern | WIRED | Line 3 import; 4 call sites |
| `lib/chat/components/chat-page.jsx` | `lib/chat/features-context.jsx` | FeaturesProvider wrapping tree | WIRED | Import line 9; rendered line 91 |
| `lib/chat/components/chat-page.jsx` | `lib/chat/repo-chat-context.jsx` | RepoChatProvider wrapping tree | WIRED | Import line 10; rendered line 93 |
| `lib/chat/actions.js getFeatureFlags()` | `lib/paths.js featuresFile` | dynamic import('../paths.js') | WIRED | Line 279 |
| `lib/chat/components/chat-header.jsx` | `lib/chat/repo-chat-context.jsx` | `useRepoChat()` hook | WIRED | Import line 5; destructured line 9 |
| `lib/chat/components/chat.jsx` transport | `lib/chat/api.js` | DefaultChatTransport body: `{selectedRepo, selectedBranch}` | WIRED | chat.jsx lines 24–27; api.js line 15 |
| `lib/chat/api.js` | `chatStream()` userText param | `[Active repo context: ...]` prepended to userText | WIRED | Lines 64–70 before chatStream call |
| `message.jsx` | `JobStreamViewer` | `[JOB_STREAM:uuid]` regex match | WIRED | message.jsx line 7 import, line 100 render |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| WEBUI-01 | 26-03 | Code mode toggle in chat input: monospace rendering, backtick fencing | SATISFIED | `codeMode` prop in chat-input.jsx; wrapping in chat.jsx handleSend |
| WEBUI-02 | 26-03 | Repo and branch selector in chat header; session-default for job dispatch | SATISFIED | chat-header.jsx dropdowns; api.js prefix injection |
| WEBUI-03 | 26-02 | FeaturesContext for per-instance feature flag toggling | SATISFIED (partial) | Provider and hook exist and are wired; `useFeature()` is not yet consumed by any component (no UI is gated by flags yet) |
| WEBUI-04 | 26-03 | JobStreamViewer renders inline in chat messages | SATISFIED | message.jsx JOB_STREAM_RE + JobStreamViewer import and render at line 100 |
| WEBUI-05 | 26-01 | Server Actions enforce server-side auth via unauthorized() | SATISFIED | All Server Actions use requireAuth(); ws/actions.js all four inline checks updated |
| WEBUI-06 | 26-01 | API-key routes unchanged alongside new session-protected Server Actions | SATISFIED | api/index.js verifyApiKey() and PUBLIC_ROUTES intact; no modifications |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/chat/components/chat-input.jsx` | 84–88 | `handleSubmit` calls `onSubmit()` directly without backtick wrapping — wrapping happens in parent chat.jsx instead | Info | No impact on correctness; wrapping is wired correctly in `chat.jsx:handleSend`. Deviation from plan's stated location, but functional. |
| `lib/chat/features-context.jsx` | — | `useFeature()` hook exported but not consumed by any component | Warning | WEBUI-03's flag-gating purpose is not exercised yet. The infrastructure exists but no UI reads feature flags to toggle behavior. This means `config/FEATURES.json` has no effect on the rendered UI today. |

### Human Verification Required

#### 1. Repo Selector End-to-End

**Test:** Start `npm run dev`. Open chat UI. Verify repo dropdown appears in chat header. Select a repo — confirm branch dropdown appears and populates. Select a branch. Send a message. Check terminal logs or LangGraph agent input for `[Active repo context: slug, branch: branchname]` prefix.
**Expected:** Repo/branch state flows from UI dropdown through transport body to agent prompt prefix automatically.
**Why human:** Dropdown rendering, async branch load timing, and LangGraph log output cannot be verified statically.

#### 2. Code Mode Toggle Behavior

**Test:** Click the `</>` button in the chat input area. Observe textarea font change. Type code and press Enter. Inspect the sent message bubble for triple-backtick wrapping.
**Expected:** Textarea switches to monospace font; message appears as a code block in the chat thread.
**Why human:** Visual font rendering and message bubble presentation require browser observation.

#### 3. Feature Flag Gating (known gap)

**Test:** Set `"codeMode": false` in `config/FEATURES.json`. Reload chat. Observe whether the `</>` toggle button disappears.
**Expected:** It will NOT disappear. The `useFeature()` hook is defined but no component currently reads it to conditionally render the code-mode button. The button is rendered whenever `onToggleCodeMode` is passed as a prop, which chat.jsx always does regardless of the flag.
**Why human:** This is a known gap — the FeaturesContext infrastructure is wired, but no UI component actually gates behavior on it yet. WEBUI-03 as written ("enables/disables in-development features") is not yet exercised in practice.

#### 4. Auth Boundary (WEBUI-05)

**Test:** Open browser DevTools Network tab. Log out of the app. Attempt to trigger a Server Action (e.g., rename a chat, or fetch the sidebar chat list).
**Expected:** Response is 401 (and/or redirect to /login boundary page) — not a 500 or unhandled exception trace.
**Why human:** Live session state manipulation required.

#### 5. API Routes Unchanged (WEBUI-06)

**Test:** `curl http://localhost:3000/api/ping` and `curl -X POST http://localhost:3000/api/slack/events -H "Content-Type: application/json" -d '{}'`
**Expected:** Ping returns 200. Slack events route returns Slack signature validation error (not 500).
**Why human:** Live HTTP request needed to confirm runtime behavior.

#### 6. JobStreamViewer Inline Rendering (WEBUI-04)

**Test:** Dispatch a job from the chat (send a message that triggers job creation). Observe the returned message — it should contain an inline streaming panel, not raw `[JOB_STREAM:uuid]` text.
**Expected:** `JobStreamViewer` component renders inside the message bubble and shows live job progress.
**Why human:** Requires actual job dispatch and SSE streaming to observe; confirmed wired from Phase 25 by code inspection.

### Gaps Summary

All 12 automated must-haves pass. No blocking anti-patterns were found. The codebase correctly implements:

- Auth hardening: `unauthorized()` in all browser-facing Server Actions across both `lib/chat/actions.js` and `lib/ws/actions.js`; `setupAdmin` untouched; `templates/app/unauthorized.js` boundary page created
- Context foundation: `FeaturesProvider` and `RepoChatProvider` wired as outermost wrappers in ChatPage; `getFeatureFlags`, `getRepos`, `getBranches` Server Actions all auth-gated
- UI features: Repo/branch dropdowns in ChatHeader with race-protected branch loading; code mode toggle in ChatInput with `font-mono` and backtick-fence wrapping in `chat.jsx`; transport body forwards `selectedRepo`/`selectedBranch`; `api.js` prepends `[Active repo context: ...]` to `userText`

One notable observation: `useFeature()` hook is defined and exported but no component currently calls it. The flag system infrastructure is complete, but WEBUI-03's intended behavior (toggling features per instance) is not yet exercised by any component in the codebase. This is not a blocker for the phase goal — the infrastructure is in place for future use — but it means `config/FEATURES.json` has no observable effect on the UI today.

---

_Verified: 2026-03-12_
_Verifier: Claude (gsd-verifier)_
