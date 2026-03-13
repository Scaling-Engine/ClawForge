# Enhanced Code Workspaces (V2) — ClawForge

## Overview

Upgrades the existing persistent workspace system (v1.5) with a tabbed multi-workspace interface, drag-and-drop tab reordering, enhanced terminal features, and file tree navigation.

## What's New (vs v1.5)

| Feature | v1.5 | V2 |
|---------|------|-----|
| Terminal interface | Single xterm.js tab | DnD-reorderable tabs via @dnd-kit |
| Tab management | Fixed tab bar | Drag-to-reorder, close, rename |
| File navigation | CLI only (`ls`, `cd`) | File tree sidebar (chokidar-watched) |
| Search in terminal | None | xterm addon-search |
| Terminal links | None | xterm addon-web-links (clickable URLs) |
| Serialization | None | xterm addon-serialize (session save/restore) |
| WebSocket proxy | Basic binary relay | Enhanced with reconnection, heartbeat |

## Architecture

### Frontend Components

- `lib/code/terminal-view.jsx` — Main terminal view with tabbed interface
- `lib/code/actions.js` — Server Actions for workspace CRUD
- `lib/code/ws-proxy.js` — WebSocket proxy with reconnection logic

### DnD Tab System

Uses `@dnd-kit/core` and `@dnd-kit/sortable` for tab reordering:
- Tabs represent tmux sessions (separate terminal instances)
- Drag handle on each tab for reordering
- Close button with unsaved-changes warning
- New tab button creates additional tmux session

### xterm.js Addons

- `@xterm/addon-search` — Find text in terminal scrollback
- `@xterm/addon-web-links` — Clickable URLs in terminal output
- `@xterm/addon-serialize` — Save/restore terminal state across reconnections

### File Tree (chokidar)

- `chokidar` watches the workspace volume for file changes
- File tree renders in a sidebar panel (collapsible)
- Click-to-open sends `vim {path}` or `cat {path}` to terminal
- Respects `.gitignore` patterns for filtering

## Migration Path (v2.1)

Phase 36 upgrades existing workspaces:
1. Add DnD tab dependencies (@dnd-kit/core, @dnd-kit/sortable)
2. Upgrade xterm.js addons (search, web-links, serialize)
3. Add chokidar for file watching
4. Enhance terminal-view with tab management
5. Add file tree sidebar component
6. Backward compatible — existing workspaces continue working

## Dependencies

- `@dnd-kit/core`, `@dnd-kit/sortable` — Tab drag-and-drop
- `@xterm/addon-search`, `@xterm/addon-web-links`, `@xterm/addon-serialize` — Terminal enhancements
- `chokidar` — File system watching for file tree
- Note: ClawForge stays on `@xterm/xterm` v6 (upstream uses v5)
