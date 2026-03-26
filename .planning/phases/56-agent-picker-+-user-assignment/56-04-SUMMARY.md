---
phase: 56-agent-picker-+-user-assignment
plan: "04"
subsystem: auth
tags: [gap-closure, login, routing, cookies]
dependency_graph:
  requires: [56-01, 56-02]
  provides: [post-login-routing, lastAgent-cookie-consumption]
  affects: [templates/app/components/login-form.jsx]
tech_stack:
  added: []
  patterns: [cookie-read-in-client-component, ternary-router-push]
key_files:
  created: []
  modified:
    - templates/app/components/login-form.jsx
decisions:
  - "Read lastAgent cookie with document.cookie.split inline (no helper) — single-use, no abstraction needed"
metrics:
  duration: "< 5 minutes"
  completed: "2026-03-26"
  tasks: 1
  files: 1
---

# Phase 56 Plan 04: Post-Login Redirect Gap Closure Summary

Two-line fix in `login-form.jsx` that closes both PICK-01 and PICK-04 by reading the `lastAgent` cookie and routing conditionally after sign-in.

## What Was Changed

**File:** `templates/app/components/login-form.jsx` — line 35 (handleSubmit `else` branch)

**Before:**
```javascript
router.push('/');
```

**After:**
```javascript
const lastAgent = document.cookie.split('; ').find(r => r.startsWith('lastAgent='))?.split('=')[1];
router.push(lastAgent ? `/agent/${lastAgent}/chat` : '/agents');
```

One line replaced with two. No other changes.

## Gaps Closed

**PICK-01 (Blocker):** After successful login, users are now routed to `/agents` (the AgentPickerPage) instead of `/` (ChatPage). This is the primary user-visible goal of Phase 56 — "users see their assigned agents after login."

**PICK-04 (Partial):** The `lastAgent` cookie written by `agent-picker-page.jsx:118` on agent card click is now consumed at login. If the cookie is present, users skip the picker and go directly to `/agent/${lastAgent}/chat`. The write-without-read half-implementation is resolved.

## Verification

```
grep -n "router.push" templates/app/components/login-form.jsx
→ 36: router.push(lastAgent ? `/agent/${lastAgent}/chat` : '/agents');

grep -c "router.push('/')" templates/app/components/login-form.jsx
→ 0

grep -n "lastAgent" templates/app/components/login-form.jsx
→ 35: const lastAgent = document.cookie.split('; ')...
→ 36: router.push(lastAgent ? ...

grep -n "/agents" templates/app/components/login-form.jsx
→ 36: ... : '/agents');

wc -l templates/app/components/login-form.jsx
→ 94 (original 93, within 5-line tolerance)
```

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Fix post-login redirect to /agents with lastAgent cookie routing | e1dd5c8 |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `templates/app/components/login-form.jsx` exists and contains `lastAgent` cookie read
- [x] Commit `e1dd5c8` exists in git log
- [x] `router.push('/')` removed (0 matches)
- [x] `router.push(lastAgent` present (1 match)
- [x] `/agents` fallback present (1 match)
