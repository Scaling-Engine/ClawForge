---
phase: quick-3
plan: "01"
subsystem: chat-ui
tags: [ui, agent-identity, server-actions, metadata]
dependency_graph:
  requires: []
  provides: [agent-name-visibility]
  affects: [lib/chat/actions.js, lib/chat/components/app-sidebar.jsx, lib/chat/components/chat-header.jsx, lib/chat/components/greeting.jsx, templates/app/layout.js]
tech_stack:
  added: []
  patterns: [server-action-without-auth, generateMetadata-async, useEffect-fetch-on-mount]
key_files:
  created: []
  modified:
    - lib/chat/actions.js
    - lib/chat/components/app-sidebar.jsx
    - lib/chat/components/chat-header.jsx
    - lib/chat/components/greeting.jsx
    - templates/app/layout.js
decisions:
  - "Inline path resolution in templates/app/layout.js rather than importing thepopebot/paths — templates are scaffold files copied to user projects, so self-contained resolution is more reliable"
  - "getAgentName() not auth-gated — agent name is not sensitive and simplifies usage in layout server component"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-03-16"
  tasks_completed: 2
  files_changed: 5
---

# Quick Task 3: Make Instance Agent Name Prominently Visible — Summary

**One-liner:** Agent name sourced from SOUL.md first line shown in sidebar header, chat header bar, greeting message, and browser tab title with INSTANCE_NAME env fallback.

## What Was Built

- **`getAgentName()` server action** (`lib/chat/actions.js`) — reads `config/SOUL.md`, parses the first line with `/^#\s+(\S+)/` (e.g. "# Archie — Noah's AI Agent" → "Archie"), falls back to `INSTANCE_NAME` env, then `'ClawForge'`
- **Sidebar header** (`app-sidebar.jsx`) — imports `getAgentName`, fetches on mount, replaces hardcoded "ClawForge" with dynamic agent name. Version badge stays intact after the name.
- **Chat header** (`chat-header.jsx`) — fetches agent name on mount, renders `<span className="hidden md:inline ...">` between mobile sidebar trigger and repo selector (desktop only; mobile sees sidebar)
- **Greeting** (`greeting.jsx`) — fetches agent name on mount, renders "Hello! I'm {name}. How can I help?" when loaded, falls back to "Hello! How can I help?" on error
- **Browser tab title** (`templates/app/layout.js`) — replaces static `metadata` export with async `generateMetadata()` that reads SOUL.md at server render time, same fallback chain

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Add getAgentName server action + wire into sidebar, chat header, greeting | b085c9f |
| 2 | Dynamic browser tab title with agent name | 0c4e473 |

## Deviations from Plan

None — plan executed exactly as written. The plan's note to use inline path resolution in the template (instead of `thepopebot/paths` import) was followed as specified.

## Self-Check: PASSED

- lib/chat/actions.js: modified, contains `getAgentName` export
- lib/chat/components/app-sidebar.jsx: modified, uses `agentName` state
- lib/chat/components/chat-header.jsx: modified, shows `agentName` span
- lib/chat/components/greeting.jsx: modified, dynamic greeting
- templates/app/layout.js: modified, uses `generateMetadata()`
- Commits b085c9f and 0c4e473 both exist in git log
- `npm run build` passes with zero errors after both tasks
