---
status: verifying
trigger: "In the ClawForge web chat UI, the repo selection dropdown doesn't persist. User selects a repo but it reverts. This has never worked correctly. No console errors visible."
created: 2026-03-20T00:00:00Z
updated: 2026-03-20T00:00:00Z
---

## Current Focus

hypothesis: Chat re-mounts with a new key every time activeChatId changes, which resets the entire Chat subtree including ChatHeader local state (branches, loadingBranches). RepoChatProvider is OUTSIDE the Chat key boundary, so selectedRepo/selectedBranch in context should survive — BUT: the select dropdown controlled value depends on repos[] being populated, and handleRepoChange calls getBranches which is async. The real culprit is that the `<Chat key={resolvedChatId} ...>` re-mount destroys ChatHeader's local `repos` state and `branches` state, so after re-mount repos = [] and selectedRepo?.slug won't find a match in the empty repos array. However the dropdown value IS bound to selectedRepo?.slug from context... Wait — let me re-examine.

CONFIRMED ROOT CAUSE: `chat-page.jsx` line 101 — `<Chat key={resolvedChatId} ...>`. When the user selects a repo, `setSelectedRepo(repo)` is called in context (which survives). But `navigateToChat` sets `setResolvedChatId(null)` then to a new UUID on chat navigation, which causes `Chat` to re-mount. More importantly: the `resolvedChatId` itself is set to `chatId` from URL on load, and when navigating to a NEW chat `setResolvedChatId(crypto.randomUUID())` — this triggers Chat re-mount, wiping ChatHeader's local `repos` and `branches` state. But selectedRepo in context should still be set...

ACTUAL ROOT CAUSE (confirmed on second read): `RepoChatProvider` is placed OUTSIDE `ChatNavProvider` value scope but INSIDE `ChatNavProvider`. When `navigateToChat(null)` is called (new chat), `setResolvedChatId(crypto.randomUUID())` triggers `Chat` re-mount via key change. The `RepoChatProvider` itself does NOT re-mount (it's a stable ancestor), so `selectedRepo` in context SHOULD survive navigation. BUT: `ChatHeader` gets re-mounted fresh with `repos = []` and immediately calls `getRepos()` async. During that async window, the select renders with `value={selectedRepo?.slug || ''}` but the `repos` array is empty — so the option doesn't exist yet. However React controlled selects with a value that has no matching option will show the first option ("No repo selected") visually but the value prop is still held correctly.

WAIT — the actual bug is simpler. Looking at `chat-page.jsx` line 95-109: `RepoChatProvider` IS stable across chat navigations (its parent `ChatNavProvider` doesn't re-mount). So `selectedRepo` in context persists. But ChatHeader's LOCAL `repos` state starts empty on re-mount. The select renders with the persisted `selectedRepo?.slug` value, but NO matching `<option>` exists yet. When `getRepos()` resolves, repos fills in — at this point the controlled select should re-render and show the correct selection. This should work...

FINAL ROOT CAUSE IDENTIFIED: The issue is that `chat-page.jsx` line 101: `<Chat key={resolvedChatId} ...>` — every time a NEW chat starts, `resolvedChatId` is set to a fresh `crypto.randomUUID()`. This re-mounts `Chat` AND `ChatHeader`. `ChatHeader` re-mounts with `repos = []`. BUT — the context's `selectedRepo` is still set from the previous selection. The dropdown renders with `value={selectedRepo?.slug}` before `getRepos()` resolves. A controlled select with a value that doesn't have a matching option does NOT revert the value prop — it just shows blank visually. When repos loads, the correct option appears and the select should show it correctly.

So this should work... unless the user is navigating between chats and something triggers `RepoChatProvider` to re-mount.

CHECKING: Is RepoChatProvider ever unmounted? It lives inside `ChatNavProvider` which lives inside `FeaturesProvider` — none of these have keys. So RepoChatProvider is stable for the lifetime of the page. selectedRepo in context is never reset by navigation.

ACTUAL ACTUAL ROOT CAUSE: The `useRepoChat()` call in `chat-header.jsx` imports from `'../repo-chat-context.js'` (the compiled .js file). The `chat.jsx` also imports from `'../repo-chat-context.js'`. But `chat-page.jsx` imports `RepoChatProvider` from `'../repo-chat-context.jsx'` (the .jsx source). These are TWO DIFFERENT MODULE INSTANCES. The context created in repo-chat-context.jsx and the context consumed in repo-chat-context.js are different React Context objects — so `useRepoChat()` in ChatHeader returns the null-fallback `{ selectedRepo: null, setSelectedRepo: () => {} }` (the no-op version), meaning setSelectedRepo calls do nothing and state is never actually stored anywhere.

test: Verify that chat-header.jsx imports from .js while chat-page.jsx imports from .jsx
expecting: If imports differ, setSelectedRepo() is a no-op and selections never persist
next_action: Check import paths in chat-header.jsx, chat.jsx, chat-page.jsx — then fix to use consistent import

## Symptoms

expected: When a repo is selected in the chat header dropdown, it should (1) populate and show in the header, (2) persist across interactions, and (3) be used when creating jobs
actual: Selection doesn't stick — user picks a repo but it reverts or doesn't save
errors: No errors visible in browser console or on screen
reproduction: Select a repo from the dropdown in the web chat UI header — it reverts
started: Never worked — broken since first attempt

## Eliminated

- hypothesis: RepoChatProvider re-mounts on navigation causing state reset
  evidence: RepoChatProvider is a stable ancestor — not keyed, not inside any keyed component
  timestamp: 2026-03-20T00:00:00Z

- hypothesis: Controlled select with no matching option reverts value
  evidence: React controlled selects don't revert value prop even when no matching option exists; async repo load would restore the visual selection
  timestamp: 2026-03-20T00:00:00Z

## Evidence

- timestamp: 2026-03-20T00:00:00Z
  checked: chat-header.jsx import statement (line 5)
  found: `import { useRepoChat } from '../repo-chat-context.js';` — imports the .js compiled file
  implication: ChatHeader consumes context from repo-chat-context.js module

- timestamp: 2026-03-20T00:00:00Z
  checked: chat.jsx import statement (line 11)
  found: `import { useRepoChat } from '../repo-chat-context.js';` — imports the .js compiled file
  implication: Chat also consumes context from repo-chat-context.js module

- timestamp: 2026-03-20T00:00:00Z
  checked: chat-page.jsx import statement (line 10)
  found: `import { RepoChatProvider } from '../repo-chat-context.jsx';` — imports the .jsx SOURCE file
  implication: Provider is from repo-chat-context.jsx; consumers are from repo-chat-context.js — TWO DIFFERENT MODULES = TWO DIFFERENT CONTEXT OBJECTS

- timestamp: 2026-03-20T00:00:00Z
  checked: useRepoChat() fallback in repo-chat-context.jsx line 28
  found: When ctx is null (no matching provider), returns `{ selectedRepo: null, setSelectedRepo: () => {}, selectedBranch: null, setSelectedBranch: () => {} }`
  implication: setSelectedRepo is a no-op. Every call to setSelectedRepo from ChatHeader is silently discarded. selectedRepo is always null. This exactly explains "selection doesn't stick" with no console errors.

## Resolution

root_cause: Split module identity bug — `chat-page.jsx` imports `RepoChatProvider` from `repo-chat-context.jsx` (JSX source), while `chat-header.jsx` and `chat.jsx` import `useRepoChat` from `repo-chat-context.js` (compiled/different file). These are two distinct React Context objects. The Provider from .jsx creates one context; the consumers in .js read a different context. `useContext()` returns null, triggering the no-op fallback. `setSelectedRepo()` is a no-op — no state is ever stored.

fix: Updated chat-page.jsx (line 10) and chat-page.js (line 10) to import RepoChatProvider from '../repo-chat-context.js' instead of '../repo-chat-context.jsx'. This aligns the Provider and all consumers to the same module instance, so createContext() is called once and useContext() in ChatHeader/Chat reads the same context object that RepoChatProvider provides.
verification: []
files_changed: [lib/chat/components/chat-page.jsx, lib/chat/components/chat-page.js]
