---
phase: quick-260321-w4q
plan: 01
subsystem: notifications-ui
tags: [notifications, job-visibility, ui]
dependency_graph:
  requires: []
  provides: [rich-notification-cards]
  affects: [lib/chat/components/notifications-page.jsx, lib/chat/components/icons.jsx]
tech_stack:
  added: []
  patterns: [payload-parse-with-fallback, conditional-icon-status, client-component-decomposition]
key_files:
  created: []
  modified:
    - lib/chat/components/notifications-page.jsx
    - lib/chat/components/icons.jsx
decisions:
  - "NotificationCard extracted as sub-component for clean conditional rendering logic"
  - "parsePayload() helper with try/catch ensures graceful fallback on invalid JSON"
  - "Left border accent applied via conditional string concatenation (no extra CSS classes needed)"
metrics:
  duration_minutes: 8
  completed: 2026-03-22T03:16:58Z
  tasks_completed: 1
  files_modified: 2
---

# Quick Task 260321-w4q: Fix Job Result Visibility - Summary

**One-liner:** Notification cards now show green/red status icons, colored left borders, job ID headers, and explicit PR links extracted from the stored payload JSON.

## What Was Built

Enhanced `NotificationsPage` to render rich job result cards by consuming the `payload` field already returned by `getNotifications()`. The payload is parsed per-card; invalid or absent payloads fall back to the original bell icon style with no crash.

### New Component: `NotificationCard`

Extracted the per-notification rendering into a dedicated `NotificationCard` sub-component that:

1. Parses `n.payload` via `parsePayload()` (try/catch, returns null on failure)
2. Derives `status`, `jobId`, `prUrl`, `commitMessage`, `changedFiles`, `targetRepo` from parsed payload
3. Applies conditional left border: green for success, red for failure, plain for unknown
4. Renders `CircleCheckIcon` (green) / `XIcon` (red) / `BellIcon` (fallback) as the status indicator
5. Shows `"Job {jobId} completed"` or `"Job {jobId} failed"` header above the Streamdown summary
6. Renders a meta row below the summary with: PR link (opens in new tab), truncated commit message (60 chars), files changed count, and target repo badge

### New Icon: `CircleCheckIcon`

Added `CircleCheckIcon` to `icons.jsx` following the existing lucide-style SVG pattern — stroke-based, accepts `size` and `className` props. Uses a circle + checkmark path.

## Commits

| Hash | Message |
|------|---------|
| da278aa | feat(quick-260321-w4q-01): enhance notification cards with status indicators, PR links, job ID headers |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `lib/chat/components/notifications-page.jsx` exists and is > 80 lines (147 lines)
- [x] `lib/chat/components/icons.jsx` contains `CircleCheckIcon` export
- [x] `npm run build` succeeded (25ms, no errors)
- [x] Commit da278aa exists

## Self-Check: PASSED
