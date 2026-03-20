---
phase: 52-tech-debt-cleanup
plan: "01"
subsystem: code-workspaces
tags: [tech-debt, docker, server-actions, auth, editor]
dependency_graph:
  requires: []
  provides: [readWorkspaceFile, requestFileContent, checkClaudeSubscription]
  affects: [lib/tools/docker.js, lib/ws/actions.js, templates/app/code/[id]/editor-view.jsx, lib/auth/claude-subscription.js, lib/chat/components/code/actions.js]
tech_stack:
  added: []
  patterns: [execCollect-docker-exec, server-action-auth-guard, react-useEffect-on-selectedFile]
key_files:
  created:
    - lib/auth/claude-subscription.js
  modified:
    - lib/chat/components/code/actions.js
    - lib/tools/docker.js
    - lib/ws/actions.js
    - templates/app/code/[id]/editor-view.jsx
decisions:
  - "DEBT-03 stale artifact: build regenerates lib/chat/features-context.js from features-context.jsx on every npm run build — deletion confirmed the artifact was stale; build recreates it correctly from source"
  - "readWorkspaceFile path guard: validates filePath.startsWith('/workspace/') to prevent directory traversal before exec"
  - "Binary file detection: uses file --brief --mime-type inside container; non-text types return a human-readable placeholder, not an error"
  - "500KB size limit: stat --format=%s before cat prevents large file transfers to browser"
metrics:
  duration_minutes: 4
  completed_date: "2026-03-20"
  tasks_completed: 2
  files_modified: 5
---

# Phase 52 Plan 01: Tech Debt Cleanup Summary

**One-liner:** Resolved all 4 v1.0 audit debt items — async linkChatToWorkspace, end-to-end EditorView file read via docker exec Server Action, stale esbuild artifact deletion, and Claude subscription auth stub.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Await linkChatToWorkspace + delete stale artifact + create auth stub | 88a6629 | lib/chat/components/code/actions.js, lib/auth/claude-subscription.js |
| 2 | Wire EditorView file-read Server Action end-to-end | 56339fe | lib/tools/docker.js, lib/ws/actions.js, templates/app/code/[id]/editor-view.jsx |

## What Was Built

### DEBT-01: Await linkChatToWorkspace
Added `await` before `linkChatToWorkspace(chatId, result.workspaceId)` in `launchWorkspace` Server Action. The function is currently synchronous (better-sqlite3 `.run()`), but the await adds async safety for any future migration to an async DB driver.

### DEBT-02: EditorView File-Read End-to-End
Three-part change:
1. **`readWorkspaceFile`** added to `lib/tools/docker.js` — validates path (directory traversal guard), checks file size (500KB limit), detects binary files via `file --brief --mime-type`, reads content via `cat` using the existing `execCollect` pattern.
2. **`requestFileContent`** Server Action added to `lib/ws/actions.js` — auth guard via `auth()`, delegates to `readWorkspaceFile`, returns `{ content, truncated, error }`.
3. **EditorView wired** in `templates/app/code/[id]/editor-view.jsx` — imports `requestFileContent`, adds `fileContent`/`fileLoading` state, `loadFileContent` callback, `useEffect` triggered on `selectedFile` change, and content panel shows loading/error/`<pre>` states.

### DEBT-03: Delete Stale esbuild Artifact
Deleted `lib/chat/features-context.js` from disk. The file was untracked (never committed) and was a stale pre-built artifact that caused the BUG-1-SPLIT-CONTEXT issue (fixed in Phase 51). The build (`npm run build`) correctly regenerates it from `lib/chat/features-context.jsx` — the deletion confirmed it was stale, and the build now always produces it fresh.

### DEBT-04: Claude Subscription Auth Gate Stub
Created `lib/auth/claude-subscription.js` — pure stub with no imports, no side effects. Exports `checkClaudeSubscription(user)` returning `{ allowed: true, reason: null, provider: 'stub' }`. Documented extension points for when Anthropic publishes an OAuth spec.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

**DEBT-03 verification nuance:** The acceptance criterion `test ! -f lib/chat/features-context.js` holds true immediately after deletion but not after `npm run build` (which regenerates it from source). The verification sequence in the plan (`grep` checks before `npm run build`) is the correct order. The debt item is resolved: the stale artifact was removed and the build correctly regenerates it from `.jsx` source.

## Self-Check

### Files Created/Modified

- [x] `lib/auth/claude-subscription.js` — created
- [x] `lib/chat/components/code/actions.js` — await added
- [x] `lib/tools/docker.js` — readWorkspaceFile added
- [x] `lib/ws/actions.js` — requestFileContent added + import updated
- [x] `templates/app/code/[id]/editor-view.jsx` — wired to requestFileContent

### Commits

- [x] 88a6629 — Task 1
- [x] 56339fe — Task 2

### Build

- [x] `npm run build` passes with zero errors after both tasks
