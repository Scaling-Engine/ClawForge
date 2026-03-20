# Phase 49: Interactive Code IDE - Research

**Researched:** 2026-03-20
**Domain:** Tabbed IDE page, Docker workspace launch, chat-to-workspace linking, DnD tabs
**Confidence:** HIGH

## Summary

Phase 49 adds a `/code/{id}` tabbed IDE page to ClawForge by cherry-picking the upstream page structure and wiring the chat's new `codeSubMode` toggle to launch Docker workspace containers and redirect to this page. The primary deliverables are: (1) the `/code/{id}` page itself with Code/Shell/Editor tabs and DnD reordering, (2) an "Interactive" launch mechanism in the chat UI that calls a Server Action to start/reuse a workspace container and then redirects, and (3) a `codeWorkspaceId` FK on the `chats` table to link chat sessions to their associated workspace.

All dependencies are already installed. The upstream parity analysis document at `.planning/debug/code-mode-upstream-parity.md` provides precise file-level diff mapping. Phase 36 delivered a fully working workspace terminal page (`templates/app/workspace/[id]/workspace-terminal-page.jsx`) with DnD tabs, xterm.js, and WebSocket proxy integration — Phase 49 adapts this infrastructure, not rebuilds it. The one schema change required is additive only: a nullable `codeWorkspaceId` column on the `chats` table.

**Primary recommendation:** Copy the workspace terminal page pattern directly from Phase 36 output. Do not cherry-pick upstream verbatim — ClawForge's existing infrastructure (ws/actions.js, sdk-bridge.js, codeWorkspaces table) already covers the upstream implementation. Adapt, don't copy.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | ^6.3.1 | DnD primitives for tab reordering | Already installed, used in workspace-terminal-page.jsx |
| @dnd-kit/sortable | ^10.0.0 | Sortable context for horizontal tab list | Already installed, proven pattern |
| @xterm/xterm | ^5.5.0 | Terminal emulator in Shell tab | Already installed, wired via WebSocket proxy |
| @xterm/addon-fit | ^0.10.0 | Auto-resize terminal to container | Already installed |
| @xterm/addon-attach | ^0.11.0 | Attach terminal to WebSocket stream | Already installed |
| @ai-sdk/react | ^2.0.0 | useChat hook for Code tab AI streaming | Already installed |
| ai | ^5.0.0 | UIMessageStream / data stream protocol | Already installed |
| @anthropic-ai/claude-agent-sdk | ^0.2.77 | Claude Agent SDK powering /stream/terminal | Already installed, used in sdk-bridge.js |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-orm | existing | Schema migration (codeWorkspaceId FK) | Adding nullable FK column to chats table |
| next/navigation | built-in | useRouter for redirect after workspace launch | Programmatic navigation from chat input |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Adapting Phase 36 workspace page | Verbatim upstream cherry-pick | Upstream uses package imports (`thepopebot/*`) not relative; ClawForge uses dockerode/own ws layer |
| Single codeWorkspaceId on chats | New join table | FK is sufficient — one chat, one workspace at a time |

**Installation:** No new packages needed. All dependencies are installed.

## Architecture Patterns

### Recommended Project Structure

```
templates/app/code/[id]/
├── page.js                    # Server Component — auth gate, workspace lookup
└── code-page.jsx              # Client Component — tabbed IDE shell

lib/code/
├── code-page.jsx              # Client Component implementation (tabs, DnD, state)
├── terminal-view.jsx          # Shell tab — xterm.js + WebSocket attach
├── editor-view.jsx            # Editor tab — file tree + content display
└── actions.js                 # Server Actions: launchWorkspace, getWorkspace

lib/db/schema.js               # Add codeWorkspaceId FK to chats table
lib/chat/components/
└── chat-input.jsx             # Add Interactive button that calls launchWorkspace
```

### Pattern 1: Tabbed IDE Page Structure (from workspace-terminal-page.jsx)
**What:** DndContext with SortableContext wraps a horizontal tab list. Tab state tracks active tab by ID, not index. Tab order stored as array of IDs.
**When to use:** Whenever tab list can be reordered by user.
**Example:**
```jsx
// Source: templates/app/workspace/[id]/workspace-terminal-page.jsx (Phase 36)
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
);

function handleDragEnd(event) {
  const { active, over } = event;
  if (over && active.id !== over.id) {
    setTabOrder(prev => {
      const oldIdx = prev.indexOf(active.id);
      const newIdx = prev.indexOf(over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  }
}
```

### Pattern 2: Workspace Launch + Redirect from Chat
**What:** "Interactive" button in ChatInput calls a Server Action that starts/reuses a workspace container, links the workspace to the current chat via codeWorkspaceId, then redirects client to `/code/{workspaceId}`.
**When to use:** Phase 49 Interactive toggle behavior.
**Example:**
```jsx
// chat-input.jsx — Interactive button handler
async function handleLaunchInteractive() {
  setLaunching(true);
  const { workspaceId } = await launchWorkspace({ chatId, repoSlug });
  router.push(`/code/${workspaceId}`);
}
```

### Pattern 3: codeWorkspaceId Schema Addition (Drizzle)
**What:** Additive nullable FK column on `chats` table pointing to `codeWorkspaces.id`.
**When to use:** Schema change for Phase 49.
**Example:**
```js
// lib/db/schema.js — chats table addition
export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''),
  starred: integer('starred', { mode: 'boolean' }).notNull().default(false),
  codeWorkspaceId: text('code_workspace_id').references(() => codeWorkspaces.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});
```

### Pattern 4: Server Action Auth Gate (from ws/actions.js)
**What:** All Server Actions call `auth()` first, throw if no session, check role for admin actions.
**When to use:** Every new Server Action in Phase 49.
**Example:**
```js
// lib/code/actions.js
'use server';
import { auth } from '../auth/config.js';

export async function launchWorkspace({ chatId, repoSlug }) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  // ... workspace launch logic
}
```

### Pattern 5: esbuild Component Compilation
**What:** All `lib/chat/components/*.jsx` and `lib/code/*.jsx` files are compiled by esbuild. Source must be `.jsx` extension. Export via `index.js` in same directory.
**When to use:** Any new client component in lib/chat/ or lib/code/.

### Anti-Patterns to Avoid
- **Index-based tab state:** Track active tab by ID not array index — DnD reorder changes indices
- **Importing from `thepopebot/*`:** All upstream imports use package path; ClawForge uses relative paths
- **Blocking workspace launch:** launchWorkspace should return existing running workspace if `codeWorkspaces WHERE chatId = ? AND status = 'running'` exists — don't start duplicate containers
- **Modifying terminalSessions table:** Do-not-touch per STATE.md — use codeWorkspaces for workspace linking
- **Hardcoding shellMode in SDK transport:** shellMode was removed from Phase 48 UI; backend default is fine

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DnD tab reordering | Custom mouse event handlers | @dnd-kit/core + @dnd-kit/sortable | Already installed; Phase 36 has working implementation |
| Terminal in Shell tab | Custom WebSocket terminal | xterm.js + @xterm/addon-attach | All addons installed; ws/actions.js Server Actions already exist |
| WebSocket proxy | New proxy server | lib/ws/proxy.js + lib/ws/server.js | Phase 36 full implementation, do-not-touch |
| File tree display | Recursive DOM builder | requestFileTree Server Action (ws/actions.js) | Already implemented via listWorkspaceFiles in docker.js |
| Auth in Server Actions | Manual session extraction | auth() from lib/auth/config.js | Consistent pattern across all Server Actions |
| Workspace container management | Direct dockerode calls in page | codeWorkspaces table + existing lib/tools/ | Phase 36 established the workspace lifecycle pattern |

**Key insight:** Phase 36 built the entire workspace infrastructure. Phase 49 is a UI composition task — assemble existing pieces into a new page layout.

## Common Pitfalls

### Pitfall 1: Starting duplicate workspace containers
**What goes wrong:** User clicks "Interactive" twice — two containers start for the same chat, one orphaned.
**Why it happens:** launchWorkspace not checking for existing running workspace first.
**How to avoid:** Query `codeWorkspaces WHERE chatId = ? AND status IN ('starting', 'running')` before creating new container. Return existing if found.
**Warning signs:** Multiple `codeWorkspaces` rows with same chatId.

### Pitfall 2: codeWorkspaceId migration breaks existing chats
**What goes wrong:** Schema change fails on existing DB because column added without DEFAULT or NOT NULL.
**Why it happens:** SQLite requires either nullable column or DEFAULT for ALTER TABLE ADD COLUMN.
**How to avoid:** Add column as nullable with no default (`codeWorkspaceId: text(...).references(...)`). Drizzle generates correct migration.

### Pitfall 3: PointerSensor fires click as drag
**What goes wrong:** Clicking a tab triggers drag handler, tab doesn't activate.
**Why it happens:** PointerSensor with zero activation distance interprets mousedown+mouseup as drag.
**How to avoid:** `activationConstraint: { distance: 5 }` — must move 5px before drag starts. Phase 36 already uses this.

### Pitfall 4: xterm.js SSR crash
**What goes wrong:** Next.js tries to server-render xterm.js, crashes with `window is not defined`.
**Why it happens:** xterm.js accesses browser globals at module load time.
**How to avoid:** Dynamic import with `ssr: false` for the Shell tab component, or useEffect instantiation pattern. Check how workspace-terminal-page.jsx handles this.

### Pitfall 5: esbuild skips new lib/code/ components
**What goes wrong:** New `.jsx` components in lib/code/ don't get compiled.
**Why it happens:** esbuild glob pattern is `lib/chat/*.jsx lib/chat/components/*.jsx lib/chat/components/**/*.jsx` — lib/code/ not included.
**How to avoid:** Either place components under lib/chat/components/ OR update the esbuild script to include `lib/code/**/*.jsx`. Check package.json build script before placing files.

### Pitfall 6: codeActive vs Interactive mode conflation
**What goes wrong:** Phase 48 `codeActive` (routes to /stream/terminal SDK) conflated with Phase 49 "Interactive" (launches Docker workspace + redirects).
**Why it happens:** Both involve "code mode" conceptually but are different actions.
**How to avoid:** Keep them as distinct UI states. `codeActive` = send this chat message to SDK bridge. "Interactive" = launch workspace container + navigate away. The Interactive button is separate from the Code toggle.

## Code Examples

### Launching workspace from chat input
```jsx
// Source: pattern from lib/ws/actions.js + lib/chat/components/chat-input.jsx
import { useRouter } from 'next/navigation';

// In ChatInput component:
const router = useRouter();
const [isLaunching, setIsLaunching] = useState(false);

async function handleLaunchInteractive() {
  if (!chatId || isLaunching) return;
  setIsLaunching(true);
  try {
    const { workspaceId } = await launchWorkspaceAction({ chatId, repoSlug: selectedRepo });
    router.push(`/code/${workspaceId}`);
  } catch (err) {
    console.error('Failed to launch workspace', err);
    setIsLaunching(false);
  }
}
```

### Tab with DnD sortable (from workspace-terminal-page.jsx pattern)
```jsx
// Source: templates/app/workspace/[id]/workspace-terminal-page.jsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableTab({ id, label, isActive, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
         onClick={onClick}
         className={isActive ? 'tab tab-active' : 'tab'}>
      {label}
    </div>
  );
}
```

### Workspace page auth gate (Server Component)
```jsx
// Source: pattern from templates/app/workspace/[id]/page.js
import { auth } from '../../../../lib/auth/config.js';
import { redirect } from 'next/navigation';
import { db } from '../../../../lib/db/index.js';
import { codeWorkspaces } from '../../../../lib/db/schema.js';
import { eq } from 'drizzle-orm';

export default async function CodePage({ params }) {
  const session = await auth();
  if (!session?.user) redirect('/');

  const { id } = await params;  // Next.js 15: params is async
  const [workspace] = await db.select()
    .from(codeWorkspaces)
    .where(eq(codeWorkspaces.id, id))
    .limit(1);

  if (!workspace) redirect('/');

  return <CodePageClient workspace={workspace} user={session.user} />;
}
```

### Schema migration for codeWorkspaceId
```js
// Source: lib/db/schema.js modification pattern
// After adding codeWorkspaceId to chats table definition,
// run: npx drizzle-kit generate && npx drizzle-kit migrate
// Migration SQL will be:
// ALTER TABLE `chats` ADD `code_workspace_id` text REFERENCES `code_workspaces`(`id`) ON DELETE set null;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3 chat toggles (codeMode/terminalMode/shellMode) | codeActive + codeSubMode | Phase 48 (2026-03-20) | Phase 49 adds Interactive as third action, not toggle |
| No workspace linking on chats | codeWorkspaceId FK | Phase 49 | Enables returning to same workspace from chat history |
| Separate workspace page (/workspace/[id]) | New code IDE page (/code/[id]) | Phase 49 | Dedicated tabbed IDE vs. terminal-only workspace |

**Deprecated/outdated:**
- `codeMode`, `terminalMode`, `shellMode` state variables: Removed in Phase 48 — do not reference
- `onToggleCodeMode`, `onToggleTerminalMode`, `onToggleShellMode` props: Removed in Phase 48

## Open Questions

1. **esbuild glob — should lib/code/ components live under lib/chat/components/ instead?**
   - What we know: Current build glob is `lib/chat/**/*.jsx` only
   - What's unclear: Whether a new `lib/code/` directory needs build script update, or files should go in `lib/chat/components/code/`
   - Recommendation: Place code IDE components in `lib/chat/components/code/` to avoid build script change. Verify build script in package.json before task 1.

2. **Interactive vs. codeSubMode='code' — same or separate UI controls?**
   - What we know: Phase 48 delivers `codeSubMode` ('plan'|'code') in transport body. Phase 49 adds "Interactive" launch.
   - What's unclear: Whether "Interactive" replaces `codeSubMode='code'` or is additive (three modes: Plan, Code, Interactive).
   - Recommendation: Make Interactive a distinct third action in the Code toggle area. `codeSubMode` values remain 'plan'|'code' for streaming. Interactive is a separate button that launches Docker + redirects.

3. **Should launchWorkspace reuse a running workspace or always start fresh?**
   - What we know: codeWorkspaces table tracks status (starting/running/stopped).
   - What's unclear: UX decision — same chat, second "Interactive" click.
   - Recommendation: Reuse running workspace. If workspace exists for this chatId with status running, redirect directly. Only start new container if no running workspace found.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected (no jest/vitest/pytest config found) |
| Config file | none — manual verification only |
| Quick run command | `npm run build` (build passes = structural validity) |
| Full suite command | `npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| 49-01 | /code/{id} page renders with tabs | smoke | `npm run build` | Wave 0 |
| 49-02 | Interactive button in chat launches workspace | smoke | `npm run build` | Wave 0 |
| 49-03 | codeWorkspaceId FK on chats table | schema | `npm run build` (drizzle types) | Wave 0 |
| 49-04 | Tab reorder via DnD persists across interaction | manual | manual browser test | N/A |
| 49-05 | Shell tab connects to workspace via WebSocket | manual | manual browser test | N/A |

### Sampling Rate
- **Per task commit:** `npm run build`
- **Per wave merge:** `npm run build`
- **Phase gate:** Build passes + manual smoke test of /code/{id} page before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] No automated test infrastructure — verification is build-pass + manual smoke test
- [ ] Schema migration file will be generated by `npx drizzle-kit generate` in task that adds codeWorkspaceId

*(No test framework present — existing verification is build-only)*

## Sources

### Primary (HIGH confidence)
- Direct code reads: `templates/app/workspace/[id]/workspace-terminal-page.jsx` — DnD tab pattern
- Direct code reads: `lib/ws/actions.js` — Server Action auth pattern
- Direct code reads: `lib/chat/terminal-api.js` — workspace lookup pattern
- Direct code reads: `lib/db/schema.js` — current chats/codeWorkspaces schema
- Direct code reads: `lib/chat/components/chat.jsx` — Phase 48 codeActive/codeSubMode state
- Direct code reads: `.planning/debug/code-mode-upstream-parity.md` — upstream/downstream diff analysis

### Secondary (MEDIUM confidence)
- `.planning/phases/48-code-mode-unification/48-01-SUMMARY.md` — Phase 48 decisions
- `.planning/ROADMAP.md` — Phase 49 goal statement
- `.planning/STATE.md` — Do-not-touch list, accumulated decisions

### Tertiary (LOW confidence)
- None — all findings verified against codebase source

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in package.json
- Architecture: HIGH — patterns read directly from Phase 36 output files
- Pitfalls: HIGH — derived from direct schema inspection and known Phase 36/48 decisions
- Schema change: HIGH — chats table read directly, codeWorkspaceId absence confirmed

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable — no fast-moving external dependencies)
