# Interactive Code Sessions

This guide covers the interactive code workspace feature — a persistent terminal environment where you can write and run code alongside your agent, with a tabbed interface and file tree navigation.

---

## What Are Code Workspaces?

Code workspaces are persistent Docker containers attached to your browser. They give you a full Linux terminal, a file tree sidebar, and multiple tabs (each tab is a separate terminal session). Unlike job containers (which run once and shut down), workspaces stay alive until you close them.

Use workspaces when you want to:
- Explore a codebase interactively alongside your agent
- Run commands and see output in real-time
- Work on multiple things in parallel (one tab per task)
- Keep a terminal open while your agent makes changes

---

## Interface Features

| Feature | What It Does |
|---------|-------------|
| **Multiple tabs** | Each tab is a separate terminal session (tmux). Create, rename, close tabs |
| **Drag-to-reorder tabs** | Drag tabs to reorder them however you like |
| **File tree sidebar** | Browse the workspace filesystem without using `ls`. Click a file to open it in the terminal |
| **Search in terminal** | Find text in terminal scrollback (Ctrl+Shift+F) |
| **Clickable URLs** | URLs in terminal output are clickable links |
| **Session persistence** | Terminal state saves across browser reconnections |

---

## Accessing Workspaces

Navigate to `/workspace` from the sidebar or header. You'll see a list of your active workspaces. Click **New Workspace** to create one, or click an existing workspace to resume it.

The workspace opens in a full-browser tabbed IDE view. The **Code** tab gives you the interactive terminal. The **Shell** and **Editor** tabs provide additional views into the same workspace container.

---

## WebSocket Connection

Your browser connects to the workspace container via WebSocket. If you see a disconnection message:

1. The WebSocket proxy automatically tries to reconnect
2. If reconnection fails, refresh the browser tab
3. If the container stopped, restart it from the workspaces list

---

## Closing a Workspace

Closing a workspace safely requires confirmation — the container is stopped and its data is preserved. If you try to close a workspace with unsaved work in the terminal, a warning panel appears at the top of the screen.

---

## Technical Details

For administrators and developers:

- **Tab management:** Uses `@dnd-kit/core` and `@dnd-kit/sortable` for drag-and-drop reordering. Each tab represents a tmux session.
- **Terminal:** xterm.js v6 with addons for search (`@xterm/addon-search`), web links (`@xterm/addon-web-links`), and session serialization (`@xterm/addon-serialize`)
- **File tree:** Powered by `chokidar` watching the workspace volume. Respects `.gitignore` patterns.
- **WebSocket proxy:** Enhanced relay with reconnection logic and heartbeat. Lives in `lib/ws/`.
