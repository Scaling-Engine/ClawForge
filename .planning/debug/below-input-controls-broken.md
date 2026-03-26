---
status: awaiting_human_verify
trigger: "below-input-controls-broken"
created: 2026-03-20T00:00:00Z
updated: 2026-03-20T15:00:00Z
---

## Current Focus

hypothesis: Repos fail to populate in the deployed instance, causing the Headless button to stay disabled. Root cause is likely a Docker volume issue — the `noah-config` named volume shadows the COPY in the Dockerfile, so if REPOS.json was not synced into the volume after deploy, getRepos() returns [].
test: Ask user to verify repo dropdown shows options and what happens when selecting one
expecting: If repos are empty on the deployed instance, user will confirm dropdown shows only "No repo selected" with no other options
next_action: Human verification of dropdown behavior + server-side check of repos

## Symptoms

expected: (1) Repo dropdown below chat input shows available repos and persists selection when Code toggle is ON. (2) Headless toggle launches the terminal workspace.
actual: (1) Repo selection doesn't work — may not populate or not persist. (2) Headless toggle doesn't function — nothing happens when toggled.
errors: Unknown — user reports they don't work after deploy
reproduction: Enable Code toggle below chat input, try to select a repo, try to toggle Headless
started: Just deployed — controls moved/created in commit 0140ec8

## Eliminated

- hypothesis: Split-context bug (.jsx vs .js import mismatch for RepoChatProvider)
  evidence: Both chat-page.js and chat.js import RepoChatProvider from "repo-chat-context.js" and useRepoChat from "repo-chat-context.js" — same module. Both import FeaturesProvider/useFeature from "features-context.jsx" — same module. No split-context.
  timestamp: 2026-03-20T14:00:00Z

- hypothesis: Stale compiled artifacts (.js out of sync with .jsx source)
  evidence: chat.js timestamp (10:34) is AFTER chat.jsx (10:19). All .js artifacts were rebuilt after the source changes. Build output is correct.
  timestamp: 2026-03-20T14:15:00Z

- hypothesis: canUseCode gating prevents Code toggle from showing
  evidence: User explicitly states they CAN toggle Code — so canUseCode must be true (isAdmin=true + codeWorkspace feature flag=true). Config/FEATURES.json has codeWorkspace:true.
  timestamp: 2026-03-20T14:20:00Z

- hypothesis: Wrong onChange handler (event object vs string)
  evidence: Old chat-header.jsx passed event to handler and extracted e.target.value inside. New chat.jsx extracts e.target.value in the JSX onChange and passes the string to handleRepoChange(slug). This is correct — handleRepoChange takes a slug string.
  timestamp: 2026-03-20T14:25:00Z

- hypothesis: BelowInputBar as JSX variable causes stale closure issues
  evidence: BelowInputBar is a JSX variable recomputed on every render inside the Chat function body. It captures fresh refs to codeActive, repos, selectedRepo, handleRepoChange etc. on every render. No stale closure possible.
  timestamp: 2026-03-20T14:30:00Z

- hypothesis: npm package version mismatch (deployed vs local)
  evidence: Deployment uses docker compose up --build which builds from the repo checkout directly (instances/noah/Dockerfile). Source files are COPYed into the image then npm run build + npx next build run. The deployed image uses the checked-out source, not an npm registry package.
  timestamp: 2026-03-20T14:35:00Z

- hypothesis: Code logic bug in handleRepoChange
  evidence: handleRepoChange receives slug string, calls repos.find(r => r.slug === slug) to get repo object, calls setSelectedRepo(repo) from RepoChatProvider context. All correct. If repos array is non-empty and slug matches, selection works.
  timestamp: 2026-03-20T14:40:00Z

## Evidence

- timestamp: 2026-03-20T14:00:00Z
  checked: lib/chat/components/chat.jsx (new source after restructure)
  found: Imports getRepos/getBranches from ../actions.js. Uses useEffect to call getRepos() on mount. handleRepoChange is a useCallback with [repos, setSelectedRepo, setSelectedBranch] deps. BelowInputBar JSX variable gated on canUseCode and codeActive.
  implication: Code logic is correct and well-structured.

- timestamp: 2026-03-20T14:01:00Z
  checked: lib/chat/components/chat-page.jsx (provider wrapper)
  found: Wraps Chat with RepoChatProvider from repo-chat-context.js and FeaturesProvider from features-context.jsx. isAdmin computed from session.user.role. featureFlags loaded via getFeatureFlags() in useEffect.
  implication: Context providers are correctly placed above Chat in the tree.

- timestamp: 2026-03-20T14:02:00Z
  checked: lib/chat/repo-chat-context.js and lib/chat/features-context.jsx
  found: Both create context via createContext(). useRepoChat fallback returns no-op setters when context is null. useFeature returns Boolean(flags[flag]).
  implication: Context creation and consumption is correct.

- timestamp: 2026-03-20T14:10:00Z
  checked: instances/noah/Dockerfile
  found: Build sequence: COPY source files → npm run build (esbuild .jsx→.js) → npx next build. Source copied directly from repo checkout. COPY instances/noah/config/REPOS.json ./config/REPOS.json adds repos to image.
  implication: Build process is correct. Compiled artifacts are built from the latest source on each deploy.

- timestamp: 2026-03-20T14:11:00Z
  checked: docker-compose.yml volumes section
  found: noah-event-handler has volumes: [noah-data:/app/data, noah-config:/app/config]. Named volume noah-config SHADOWS the COPY'd config/ from the Dockerfile at runtime.
  implication: CRITICAL — files copied to /app/config/ in the Docker image are not visible at runtime if noah-config volume is mounted. The running container sees whatever is in the named volume, not the image layer.

- timestamp: 2026-03-20T14:12:00Z
  checked: .github/workflows/rebuild-event-handler.yml, Sync config step
  found: After rebuild, CI does docker cp for JOB_SUMMARY.md, FEATURES.json, and instance-specific files (SOUL.md, EVENT_HANDLER.md, AGENT.md, REPOS.json) into the running container. This writes to the volume.
  implication: If docker cp succeeds, the volume has correct REPOS.json and FEATURES.json. But if volume had stale data before docker cp runs (during container startup), the app reads stale config briefly. If docker cp fails silently, stale data persists until next deploy.

- timestamp: 2026-03-20T14:20:00Z
  checked: lib/tools/repos.js (loadAllowedRepos) and lib/db/repos.js (getRepos/migrateReposFromFile)
  found: loadAllowedRepos tries DB first (with auto-migration from REPOS.json on first call), falls back to config/REPOS.json. Both paths return correct repo objects.
  implication: If the noah-config volume has REPOS.json, repos load correctly. If volume is empty or has old REPOS.json, repos may be stale or empty.

- timestamp: 2026-03-20T14:25:00Z
  checked: lib/chat/actions.js getRepos() and requireAuth()
  found: getRepos() calls requireAuth() which calls unauthorized() if no session. unauthorized() from next/navigation (with authInterrupts:true) throws a catchable error. The .catch(() => setRepos([])) in chat.jsx would catch it. But user IS logged in, so this is not the issue.
  implication: Auth path is not the failure mode since user can view the chat page.

- timestamp: 2026-03-20T14:30:00Z
  checked: old chat-header.jsx (pre-restructure via git show 0140ec8^)
  found: Old header called getRepos() in useEffect and showed repo/branch selects UNCONDITIONALLY (no codeActive gate, no canUseCode gate). setSelectedRepo/setSelectedBranch were called from the header.
  implication: Pre-restructure, repos were always visible and always loaded on page load regardless of admin status or feature flags. Post-restructure, they're gated behind canUseCode AND codeActive.

- timestamp: 2026-03-20T14:35:00Z
  checked: instances/noah/config/REPOS.json
  found: Contains 2 repos: clawforge (ScalingEngine/clawforge) and neurostory (ScalingEngine/neurostory). Both have valid owner/slug/name/aliases/dispatch fields.
  implication: REPOS.json has valid data. If it's present in the container volume, repos should load.

## Resolution

root_cause: The code implementation in commit 0140ec8 is logically correct. The most likely cause of the reported failure is that the noah-config Docker volume does not contain the updated REPOS.json (or has a stale version), causing getRepos() to return an empty array. With an empty repos array: (1) the repo dropdown appears but shows only "No repo selected" with no options, making it impossible to select a repo; (2) with no selectedRepo, the Headless button stays disabled (disabled={!linkedWorkspaceId && !selectedRepo?.slug}), so clicking it does nothing.

Secondary possibility: the noah-config volume has a stale FEATURES.json without codeWorkspace:true, causing canUseCode=false and the Code toggle to be hidden entirely. But user reports being able to toggle Code, so this is less likely.

fix: Verify docker cp succeeded in the last deploy. If REPOS.json is missing from the volume, re-run the Sync config step or manually docker cp the file. No code changes needed.
verification: pending human confirmation
files_changed: []
