---
phase: 49-interactive-code-ide
plan: "01"
subsystem: db-schema, server-actions, page-routing
tags: [drizzle, sqlite, server-actions, nextjs, workspaces, chats]
dependency_graph:
  requires: []
  provides: [codeWorkspaceId-fk, getWorkspaceByChatId, linkChatToWorkspace, launchWorkspace, getLinkedWorkspace, code-page-shell]
  affects: [lib/db/schema.js, lib/db/workspaces.js, lib/chat/components/code/actions.js, templates/app/code/[id]/page.js]
tech_stack:
  added: []
  patterns: [drizzle-alter-column, server-action-auth-gate, dynamic-import-ssr-escape]
key_files:
  created:
    - drizzle/0011_dapper_thor_girl.sql
    - lib/chat/components/code/actions.js
    - templates/app/code/[id]/page.js
  modified:
    - lib/db/schema.js
    - lib/db/workspaces.js
    - drizzle/meta/_journal.json
    - drizzle/meta/0011_snapshot.json
decisions:
  - "No .references() on codeWorkspaceId — chats table has no FK constraints (userId has no .references() either); kept consistent"
  - "Dynamic import of code-page.jsx in page shell — avoids SSR bundle issues with xterm.js; Next.js only resolves on visit"
  - "launchWorkspace reuse check covers running/starting/creating statuses — prevents duplicate container launches mid-boot"
  - "drizzle-kit migrate not used — project uses initDatabase() custom runner at server startup; only generate step needed"
metrics:
  duration: "~8 min"
  completed: "2026-03-20"
  tasks_completed: 2
  files_changed: 7
---

# Phase 49 Plan 01: Interactive Code IDE — Schema + Server Actions Summary

**One-liner:** Drizzle migration adding `code_workspace_id` FK to chats, workspace query helpers, and auth-gated Server Actions for launching/linking workspaces from chat.

## What Was Built

### Task 1: Schema migration + workspace query helpers

Added `codeWorkspaceId` (nullable text) to the `chats` table in `lib/db/schema.js`, matching the existing pattern (no `.references()` constraint, consistent with `userId`).

Generated Drizzle migration `0011_dapper_thor_girl.sql`:
```sql
ALTER TABLE `chats` ADD `code_workspace_id` text;
```

Added two new exported functions to `lib/db/workspaces.js`:
- `getWorkspaceByChatId(chatId)` — looks up a chat's `codeWorkspaceId`, then fetches the workspace; returns `undefined` if unlinked or `destroyed`
- `linkChatToWorkspace(chatId, workspaceId)` — sets `codeWorkspaceId` on a chat row with auto-updated `updatedAt`

Both functions import `chats` from `./schema.js` (added to existing import).

### Task 2: Server Actions + /code/[id] page shell

Created `lib/chat/components/code/actions.js` as a `'use server'` module with:
- `launchWorkspace({ chatId, repoSlug })` — validates repoSlug via regex (`owner/repo` format), reuses existing workspace if running/starting/creating, calls `ensureWorkspaceContainer`, links result to chat
- `getLinkedWorkspace({ chatId })` — returns workspace linked to a chat or `null`
- Auth-gated: requires session; `launchWorkspace` additionally requires `admin` or `superadmin` role

Created `templates/app/code/[id]/page.js` as Server Component page shell:
- Auth gate: redirects to `/login` if unauthenticated
- Workspace lookup: redirects to `/chats` if workspace missing or not running
- Dynamic import of `./code-page.jsx` (Plan 02 client component) avoids SSR bundle issues with xterm.js

## Deviations from Plan

None — plan executed exactly as written.

The one deviation from the plan instructions: `npx drizzle-kit migrate` failed because it requires a `url:` parameter. Investigation confirmed this is expected — ClawForge uses `initDatabase()` as a custom migration runner at server startup from `lib/db/index.js`. The `generate` step is all that's needed. This matches the pattern used for all previous migrations (0005 through 0010).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| lib/db/schema.js | FOUND |
| lib/db/workspaces.js | FOUND |
| drizzle/0011_dapper_thor_girl.sql | FOUND |
| lib/chat/components/code/actions.js | FOUND |
| templates/app/code/[id]/page.js | FOUND |
| Commit 90a342a (Task 1) | FOUND |
| Commit 1bb080d (Task 2) | FOUND |
