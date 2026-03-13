---
phase: 29-foundation-config
plan: "02"
subsystem: chat-ui
tags: [combobox, ui-primitives, tool-names, jsx]
dependency_graph:
  requires: []
  provides:
    - lib/chat/components/ui/combobox.jsx
    - lib/chat/components/tool-names.js
  affects:
    - "Settings pages (Phase 30+) that use Combobox for provider/model selection"
    - "Chat message renderer that uses getToolDisplayName for tool call display"
tech_stack:
  added: []
  patterns:
    - "Controlled React component with local filter state (no external state management)"
    - "click-outside via useEffect + document.addEventListener"
    - "snake_case → Title Case auto-formatter (split/map/join)"
key_files:
  created:
    - lib/chat/components/ui/combobox.jsx
    - lib/chat/components/tool-names.js
  modified:
    - .gitignore
decisions:
  - "Added .gitignore negation for tool-names.js — it is a pure JS source file, not a compiled JSX artifact, so it must not be excluded by the lib/chat/components/*.js rule"
  - "No static map in tool-names.js — auto-derivation via split/map covers all 9 ClawForge tool IDs correctly"
metrics:
  duration_minutes: 8
  completed: "2026-03-13T04:18:20Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 29 Plan 02: UI Combobox + Tool Names Summary

**One-liner:** Custom searchable dropdown (no Radix UI) and snake_case-to-Title Case auto-formatter for ClawForge tool display.

## What Was Built

### lib/chat/components/ui/combobox.jsx

A fully custom React combobox component. No Radix UI, no lucide-react, no new npm packages.

Props:
- `options` — `{ value, label }[]`
- `value` — controlled selected value
- `onChange` — selection callback
- `placeholder` — button placeholder text
- `loading` — shows "Loading..." text and disables interaction
- `disabled` — disables interaction
- `highlight` — adds primary-color border ring

Behavior:
- Click trigger button to open dropdown
- Search input (with SearchIcon prefix) filters options via case-insensitive `String.includes()`
- Click option to select — fires `onChange`, closes dropdown, clears search
- Click outside closes dropdown (useEffect + document mousedown listener)
- Selected option shows CheckIcon indicator
- Chevron icon rotates 180 when open

Imports: `{ useState, useRef, useEffect }` from `'react'`, icons from `'../icons.js'`, `cn` from `'../../utils.js'`.

### lib/chat/components/tool-names.js

Pure function, no imports:

```javascript
export function getToolDisplayName(toolName) {
  return toolName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
```

Verified against all 9 ClawForge tool IDs — auto-derivation produces correct Title Case for all.

## Verification Results

```
tool-names.js smoke test:
  create_job                 → "Create Job"        ok
  get_system_technical_specs → "Get System Technical Specs"  ok
  cancel_job                 → "Cancel Job"        ok
  OVERALL: PASS

npm run build: succeeded in 20ms
lib/chat/components/ui/combobox.js: COMPILED (confirmed present)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] .gitignore excluded tool-names.js as a compiled artifact**

- **Found during:** Task 1 — attempting `git add lib/chat/components/tool-names.js`
- **Issue:** The rule `lib/chat/components/*.js` in `.gitignore` was designed to exclude esbuild-compiled output, but it also matched `tool-names.js`, which is a pure JS source file (not compiled from JSX). Git refused to stage it.
- **Fix:** Added `!lib/chat/components/tool-names.js` negation line to `.gitignore` immediately after the existing `!lib/chat/components/index.js` exception.
- **Files modified:** `.gitignore`
- **Commit:** 510da13

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 + 2 | 510da13 | feat(29-02): add combobox component and tool-names utility |

## Self-Check

### Files exist
- `lib/chat/components/ui/combobox.jsx` — FOUND
- `lib/chat/components/tool-names.js` — FOUND
- `lib/chat/components/ui/combobox.js` (compiled) — FOUND

### Commits exist
- 510da13 — FOUND

## Self-Check: PASSED
