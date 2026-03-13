# Phase 36: Code Workspaces V2 - Research

**Researched:** 2026-03-13
**Domain:** Browser terminal enhancements (xterm.js addons, DnD tabs, file tree)
**Confidence:** HIGH

## Summary

Phase 36 upgrades the existing v1.5 workspace terminal with three additive feature groups: drag-and-drop tab reordering via `@dnd-kit`, xterm.js addons for in-terminal search and clickable URLs, and a file tree sidebar powered by server-side `find` commands executed via dockerode `exec`. All new features layer on top of the existing `WorkspaceTerminalPage` and `Terminal` components without breaking backward compatibility.

The current workspace infrastructure is solid: `templates/app/workspace/[id]/workspace-terminal-page.jsx` already manages multi-tab state (up to 5 tabs on ports 7681-7685), `terminal.jsx` handles xterm.js initialization with dynamic imports, `lib/ws/proxy.js` bridges browser WebSocket to ttyd inside Docker containers, and `lib/ws/actions.js` provides authenticated Server Actions for ticket issuance and shell spawning. The V2 work adds DnD to the existing tab bar, loads three new xterm addons alongside the existing fit addon, and adds a new collapsible sidebar for file browsing.

**Primary recommendation:** Implement as three distinct concerns -- (1) wrap existing tab buttons with @dnd-kit sortable context, (2) load addon-search/addon-web-links/addon-serialize in the Terminal component's init function, (3) add file tree sidebar with a new Server Action that runs `find` inside the container via dockerode exec.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CWSV2-01 | Workspace tabs are drag-reorderable via @dnd-kit; new tabs spawn tmux sessions | @dnd-kit/core 6.3.x + @dnd-kit/sortable 10.x; existing tab state in workspace-terminal-page.jsx; existing spawnExtraShell in docker.js |
| CWSV2-02 | Terminal supports in-terminal search (addon-search) and clickable URLs (addon-web-links) | @xterm/addon-search 0.16.0, @xterm/addon-web-links 0.12.0, @xterm/addon-serialize 0.14.0; load in terminal.jsx init() alongside existing FitAddon |
| CWSV2-03 | File tree sidebar shows workspace directory contents, auto-refreshes on file changes (chokidar) | Server-side dockerode exec for directory listing; chokidar not viable inside browser -- use polling or WebSocket push from container; collapsible sidebar component |
| CWSV2-04 | Existing v1.5 workspaces continue working without migration -- V2 features are additive | All changes are additive to existing components; no schema changes; no Docker image changes needed for core features |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/core` | ^6.3.1 | DnD primitives (DndContext, sensors) | De facto React DnD library; peer dep of @dnd-kit/sortable |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable list preset (SortableContext, useSortable) | Purpose-built for reorderable lists/tabs |
| `@xterm/addon-search` | ^0.16.0 | In-terminal text search | Official xterm.js addon, same monorepo as @xterm/xterm v6 |
| `@xterm/addon-web-links` | ^0.12.0 | Clickable URLs in terminal output | Official xterm.js addon |
| `@xterm/addon-serialize` | ^0.14.0 | Save/restore terminal buffer state | Official xterm.js addon; useful for reconnection |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@dnd-kit/utilities` | ^3.2.2 | CSS transform utilities | Transitive dep of @dnd-kit/sortable; provides CSS.Transform.toString() |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit | react-beautiful-dnd | react-beautiful-dnd is deprecated/unmaintained; @dnd-kit is the successor |
| @dnd-kit | HTML5 Drag and Drop API | No animation, poor touch support, no sortable preset |
| chokidar (server-side) | Polling via setInterval | Simpler, no extra dependency; chokidar inside Docker container adds complexity |

**Installation:**
```bash
npm install @dnd-kit/core @dnd-kit/sortable @xterm/addon-search @xterm/addon-web-links @xterm/addon-serialize
```

**Note on chokidar:** The design doc mentions chokidar for file watching. However, chokidar would need to run *inside the Docker container* (where the filesystem lives), not on the host. This adds complexity: either install chokidar in the workspace Dockerfile and expose a WebSocket/SSE endpoint, or use simple polling from the host via `docker exec find`. **Recommendation: Use polling (every 5-10s) via dockerode exec rather than chokidar.** The file tree is a convenience feature, not real-time critical. Polling avoids modifying the workspace Docker image and adding a new communication channel. If users demand real-time updates later, chokidar can be added to the container image in a future phase.

## Architecture Patterns

### Current Component Structure (v1.5)
```
templates/app/workspace/[id]/
  workspace-terminal-page.jsx  -- Tab state, new-tab/close/reconnect logic
  terminal.jsx                 -- xterm.js init, WebSocket connect, ttyd protocol
lib/ws/
  server.js                    -- Custom HTTP server, WebSocket upgrade handler
  proxy.js                     -- Browser WS <-> ttyd WS bidirectional relay
  tickets.js                   -- Single-use ticket auth for WS connections
  actions.js                   -- Server Actions (ticket, spawn shell, git status, close)
lib/tools/docker.js            -- spawnExtraShell(), execCollect(), checkWorkspaceGitStatus()
lib/db/workspaces.js           -- CRUD for code_workspaces table
```

### V2 Additions
```
templates/app/workspace/[id]/
  workspace-terminal-page.jsx  -- MODIFY: wrap tabs in DndContext/SortableContext
  terminal.jsx                 -- MODIFY: load search/web-links/serialize addons
  sortable-tab.jsx             -- NEW: individual sortable tab component (useSortable)
  search-bar.jsx               -- NEW: search UI for addon-search (Ctrl+F toggle)
  file-tree-sidebar.jsx        -- NEW: collapsible file tree panel
lib/ws/
  actions.js                   -- MODIFY: add requestFileTree() Server Action
lib/tools/docker.js            -- MODIFY: add listWorkspaceFiles() using execCollect
```

### Pattern 1: DnD Tab Reordering
**What:** Wrap existing tab buttons in @dnd-kit's sortable context
**When to use:** The existing tab bar in workspace-terminal-page.jsx renders tabs as simple buttons. Wrap with DndContext + SortableContext, extract each tab into a SortableTab component using useSortable hook.

```jsx
// workspace-terminal-page.jsx — key changes
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

// Inside component:
const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

function handleDragEnd(event) {
  const { active, over } = event;
  if (active.id !== over?.id) {
    setTabs((prev) => {
      const oldIndex = prev.findIndex((t) => t.id === active.id);
      const newIndex = prev.findIndex((t) => t.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }
}

// In JSX:
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={tabs.map(t => t.id)} strategy={horizontalListSortingStrategy}>
    {tabs.map((tab, i) => <SortableTab key={tab.id} tab={tab} ... />)}
  </SortableContext>
</DndContext>
```

```jsx
// sortable-tab.jsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export function SortableTab({ tab, isActive, isDisconnected, onSelect, onClose }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tab.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <button ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onSelect}>
      Shell {tab.port - 7680}
      {isDisconnected && ' (disconnected)'}
      <span onClick={(e) => { e.stopPropagation(); onClose(); }}>x</span>
    </button>
  );
}
```

### Pattern 2: xterm Addon Loading
**What:** Load addon-search, addon-web-links, and addon-serialize alongside existing addon-fit
**When to use:** In terminal.jsx's async init() function, after creating the Terminal instance

```jsx
// terminal.jsx — additions to init()
const { SearchAddon } = await import('@xterm/addon-search');
const { WebLinksAddon } = await import('@xterm/addon-web-links');
const { SerializeAddon } = await import('@xterm/addon-serialize');

const searchAddon = new SearchAddon();
const webLinksAddon = new WebLinksAddon();
const serializeAddon = new SerializeAddon();

term.loadAddon(searchAddon);
term.loadAddon(webLinksAddon);
term.loadAddon(serializeAddon);

// Expose searchAddon via ref so search-bar can call findNext/findPrevious
instanceRef.current = { term, ws, fitAddon, searchAddon, serializeAddon };
```

### Pattern 3: File Tree via Server Action + Polling
**What:** List files in workspace container by executing `find` inside the container
**When to use:** File tree sidebar component polls every 5-10 seconds

```js
// lib/tools/docker.js — new function
export async function listWorkspaceFiles(workspaceId, basePath = '/workspace', maxDepth = 3) {
  const ws = getWorkspace(workspaceId);
  if (!ws || !ws.containerId) throw new Error('Workspace not found');
  const container = docker.getContainer(ws.containerId);
  // Use find with maxdepth to avoid scanning node_modules etc.
  const output = await execCollect(container, [
    'find', basePath, '-maxdepth', String(maxDepth),
    '-not', '-path', '*/node_modules/*',
    '-not', '-path', '*/.git/*',
    '-printf', '%y %p\n'
  ]);
  return output.split('\n').filter(Boolean).map(line => {
    const type = line[0] === 'd' ? 'directory' : 'file';
    const path = line.slice(2);
    return { type, path };
  });
}
```

### Anti-Patterns to Avoid
- **Re-creating Terminal on DnD move:** When a tab is dragged to a new position, do NOT unmount/remount the Terminal component. Use stable React keys tied to tab.id (not array index). The xterm instance lives in a ref and must persist across position changes.
- **chokidar on the host server:** The workspace filesystem is inside a Docker container. Running chokidar on the host would watch the wrong filesystem (or require volume mount inspection). Either run it inside the container or use polling.
- **useState for Terminal instances:** Terminal is imperative; storing in state causes re-renders and recreation. Always useRef.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab reordering | Custom drag event handlers | @dnd-kit/sortable | Touch support, animations, accessibility, collision detection |
| Terminal text search | Manual buffer scanning | @xterm/addon-search | Handles scrollback, decorations, regex, incremental search |
| URL detection in terminal | Regex over terminal output | @xterm/addon-web-links | Handles wrapped URLs, ANSI escape codes, cursor positioning |
| Terminal buffer save/restore | Manual buffer extraction | @xterm/addon-serialize | Handles styles, cursor state, alternate screen buffer |
| Array reordering | splice/unshift logic | arrayMove from @dnd-kit/sortable | Immutable, handles edge cases |

## Common Pitfalls

### Pitfall 1: xterm.js Memory Leak on Tab Close/DnD (from PITFALLS.md #14)
**What goes wrong:** Terminal instances leak memory when tabs are closed or dragged without calling `Terminal.dispose()`.
**Why it happens:** xterm.js is imperative; React cleanup doesn't auto-dispose. Each instance holds ~34MB of buffer memory.
**How to avoid:** Always call `term.dispose()` in useEffect cleanup. Store Terminal in useRef, never useState. Use stable keys for DnD moves so the component is NOT unmounted/remounted -- just reposition the DOM node.
**Warning signs:** Browser memory growing with each tab open/close cycle; detached Terminal nodes in heap snapshot.

### Pitfall 2: DnD Activating on Tab Click
**What goes wrong:** Clicking a tab to select it accidentally initiates a drag operation.
**Why it happens:** PointerSensor has no activation distance by default.
**How to avoid:** Set `activationConstraint: { distance: 5 }` on the PointerSensor. This requires 5px of mouse movement before drag activates, so clicks pass through normally.
**Warning signs:** Tab selection feels "sticky" or doesn't respond to quick clicks.

### Pitfall 3: activeTabIndex Desync After DnD Reorder
**What goes wrong:** After dragging tab A to position 3, the active tab index still points to the old position, showing the wrong terminal.
**Why it happens:** Tab reorder changes array order but activeTabIndex is a numeric index, not an ID reference.
**How to avoid:** Track active tab by `tab.id` (string), not by array index. Resolve the index from `tabs.findIndex(t => t.id === activeTabId)` when rendering.
**Warning signs:** After drag, wrong terminal is visible; clicking the "active-looking" tab shows a different terminal.

### Pitfall 4: Search Bar Keyboard Shortcuts Conflicting with Terminal
**What goes wrong:** Ctrl+F opens browser find instead of in-terminal search. Or typing in the search input sends keystrokes to the terminal.
**Why it happens:** xterm.js captures keyboard events. Browser and terminal both listen for Ctrl+F.
**How to avoid:** Use `term.attachCustomKeyEventHandler()` to intercept Ctrl+F before xterm processes it. When search bar is focused, prevent event propagation to the terminal.
**Warning signs:** Ctrl+F opens browser's native find bar instead of in-terminal search.

### Pitfall 5: File Tree Polling Overwhelming Docker Exec
**What goes wrong:** Polling `find` inside the container every second generates excessive exec calls, slowing the container.
**Why it happens:** Each dockerode exec creates a new process inside the container.
**How to avoid:** Poll at 5-10 second intervals. Add a "Refresh" button for manual refresh. Limit `find` depth to 3 levels. Exclude `node_modules`, `.git`, and other heavy directories.
**Warning signs:** Container CPU usage spikes; `find` commands pile up; terminal becomes sluggish.

### Pitfall 6: WebLinksAddon Opening Links Inside Terminal
**What goes wrong:** Clicking a URL in the terminal opens it inside the same browser tab, navigating away from the workspace.
**Why it happens:** Default link handler may use `window.location`.
**How to avoid:** Configure WebLinksAddon with a custom handler: `new WebLinksAddon((event, uri) => window.open(uri, '_blank'))` to always open in a new tab.
**Warning signs:** Clicking a URL in terminal output navigates away from the workspace page.

## Code Examples

### Search Bar UI Component
```jsx
// search-bar.jsx
'use client';
import { useState, useRef, useEffect } from 'react';

export default function SearchBar({ searchAddon, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    e.stopPropagation(); // Prevent terminal from capturing keystrokes
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        searchAddon?.findPrevious(query);
      } else {
        searchAddon?.findNext(query);
      }
    }
    if (e.key === 'Escape') {
      searchAddon?.clearDecorations();
      onClose();
    }
  };

  return (
    <div style={{ display: 'flex', gap: '4px', padding: '4px 8px', backgroundColor: '#181825' }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        style={{ flex: 1, fontSize: '12px', padding: '4px 8px', backgroundColor: '#313244', color: '#cdd6f4', border: 'none', borderRadius: '4px' }}
      />
      <button onClick={() => searchAddon?.findPrevious(query)}>Up</button>
      <button onClick={() => searchAddon?.findNext(query)}>Down</button>
      <button onClick={onClose}>Close</button>
    </div>
  );
}
```

### File Tree Server Action
```js
// lib/ws/actions.js — new export
export async function requestFileTree(workspaceId) {
  const session = await auth();
  if (!session?.user) unauthorized();
  return listWorkspaceFiles(workspaceId);
}
```

### Custom Key Handler for Ctrl+F
```jsx
// Inside terminal.jsx init(), after term is created:
term.attachCustomKeyEventHandler((event) => {
  // Intercept Ctrl+F / Cmd+F for search
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault();
    // Signal parent to show search bar (via callback prop)
    if (onSearchToggle) onSearchToggle();
    return false; // Prevent xterm from processing
  }
  return true;
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd | @dnd-kit | 2022+ | react-beautiful-dnd deprecated; @dnd-kit has better React 18/19 support |
| xterm-addon-* (v5 names) | @xterm/addon-* (v6 names) | xterm v5.3.0+ | Scoped package names; ClawForge already on v6 |
| chokidar v3 (CommonJS) | chokidar v5 (ESM-only, Node 20+) | Nov 2025 | If used, must use v5 for ESM project; but polling is recommended instead |

## Open Questions

1. **File tree depth and filtering**
   - What we know: `find` with maxdepth 3 and node_modules/.git exclusion covers most use cases
   - What's unclear: Should the file tree respect `.gitignore` patterns? That would require parsing `.gitignore` or using `git ls-files` instead of `find`
   - Recommendation: Start with `find` + hardcoded exclusions. Add `git ls-files` as an enhancement if users request it.

2. **Terminal state persistence across reconnection**
   - What we know: addon-serialize can save/restore terminal buffer
   - What's unclear: Whether to serialize on every disconnect and restore on reconnect, or only use it for explicit "save session" UX
   - Recommendation: Use serialize on disconnect to restore scrollback on reconnect. Store serialized state in a ref or sessionStorage.

3. **File tree action on click**
   - What we know: Design doc says "click-to-open sends `vim {path}` or `cat {path}` to terminal"
   - What's unclear: Which action for which file type? Should it just `cat` for preview, or open in vim for editing?
   - Recommendation: Single-click sends `cat {path}` (safe, read-only). Double-click or explicit "Edit" button sends `vim {path}`. Clicking a directory `cd`s into it.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `templates/app/workspace/[id]/terminal.jsx`, `workspace-terminal-page.jsx` (current v1.5 implementation)
- Codebase inspection: `lib/ws/proxy.js`, `lib/ws/server.js`, `lib/ws/actions.js` (WebSocket infrastructure)
- Codebase inspection: `lib/tools/docker.js` (spawnExtraShell, execCollect pattern)
- Codebase inspection: `templates/docker/workspace/Dockerfile` and `entrypoint.sh` (ttyd + tmux setup)
- npm registry: version verification for all packages

### Secondary (MEDIUM confidence)
- [dnd-kit sortable docs](https://docs.dndkit.com/presets/sortable) - API and usage patterns
- [xterm.js addon-search](https://github.com/xtermjs/xterm.js/tree/master/addons/addon-search) - Search addon API
- [xterm.js addon-web-links](https://github.com/xtermjs/xterm.js/tree/master/addons/addon-web-links) - Web links addon API
- `.planning/research/PITFALLS.md` Pitfall #14 - xterm.js memory leak patterns

### Tertiary (LOW confidence)
- chokidar v5 ESM-only change (verified via npm but not tested in this Docker context)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all packages verified via npm, versions confirmed compatible with existing xterm v6
- Architecture: HIGH - existing codebase patterns are clear; V2 additions are straightforward extensions
- Pitfalls: HIGH - Pitfall #14 from project's own PITFALLS.md; DnD pitfalls from @dnd-kit docs
- File tree approach: MEDIUM - polling vs chokidar is a judgment call; polling is simpler but less real-time

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable libraries, no breaking changes expected)
