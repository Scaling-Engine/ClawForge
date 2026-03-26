---
phase: 56-agent-picker-+-user-assignment
verified: 2026-03-26T00:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: true
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "User lands on /agents after login — login-form.jsx now reads lastAgent cookie and routes to /agent/[slug]/chat or /agents"
    - "lastAgent cookie written on agent card click is now consumed by the post-login redirect"
  gaps_remaining: []
  regressions: []
---

# Phase 56: Agent Picker + User Assignment Verification Report

**Phase Goal:** Users see their assigned agents after login and superadmin can control which users access which agents
**Verified:** 2026-03-26T00:00:00Z
**Status:** PASSED
**Re-verification:** Yes — after gap closure (plan 56-04)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Hub DB layer exposes getHubUsers, getUserById, getAssignmentsForUser, upsertUserAssignment, removeUserAssignment | VERIFIED | All 5 functions present in lib/db/hub-users.js (lines 84-169); `and` imported from drizzle-orm at line 3 |
| 2 | Server Actions expose getHubUsers, getHubUserById, getUserAgentAssignments, setUserAgentAssignments, getAgentPickerData | VERIFIED | All 5 actions found in lib/chat/actions.js at lines 1778, 1802, 1790, 1818, 1853 |
| 3 | getAgentPickerData filters to session.user.assignedAgents; hub admins see all | VERIFIED | actions.js lines 1859-1863: `isHubAdmin` check + `assignedSlugs.has(r.instance)` filter wired correctly |
| 4 | setUserAgentAssignments is guarded by requireAdmin and validates agentRole values | VERIFIED | actions.js lines 1819-1824: requireAdmin() called, validRoles whitelist enforced, SUPERADMIN_HUB guard present |
| 5 | User lands on /agents after login and sees a card grid filtered to their assigned agents | VERIFIED | login-form.jsx lines 35-36: reads lastAgent cookie, routes to /agent/[slug]/chat if present else /agents. router.push('/') is gone (0 matches confirmed). |
| 6 | Superadmin can navigate to /admin/users/[id] and manage agent assignments with role dropdowns | VERIFIED | AdminUserDetailPage (172 lines) at lib/chat/components/admin-user-detail-page.jsx; dynamic route shell at templates/app/admin/users/[id]/page.js; "Assign agents" link in admin-users-page.jsx (line 56-59) |
| 7 | Last-selected agent slug is stored in lastAgent cookie on card click and is consumed on next login | VERIFIED | Cookie write: agent-picker-page.jsx line 118 (30-day TTL, SameSite=Lax). Cookie read: login-form.jsx lines 35-36 — document.cookie.split finds lastAgent and routes to /agent/${lastAgent}/chat. Both sides wired. |

**Score:** 7/7 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/db/hub-users.js` | Hub DB CRUD: 5 new functions | VERIFIED | 169 lines; getHubUsers, getUserById, getAssignmentsForUser, upsertUserAssignment, removeUserAssignment all exported |
| `lib/chat/actions.js` | 5 new Server Actions | VERIFIED | All 5 actions found at lines 1778-1873; requireAdmin guards on hub actions; SUPERADMIN_HUB env gates present |
| `lib/chat/components/agent-picker-page.jsx` | AgentPickerPage client component | VERIFIED | 163 lines; 'use client'; StatusBadge, AgentCard, LoadingSkeleton, AgentPickerPage all present; getAgentPickerData wired; empty state present |
| `templates/app/agents/page.js` | Next.js page shell at /agents | VERIFIED | 5 lines; imports AgentPickerPage from lib/chat/components/index.js; thin wiring shell confirmed intact |
| `lib/chat/components/admin-user-detail-page.jsx` | AdminUserDetailPage client component | VERIFIED | 172 lines; 'use client'; getHubUserById, getUserAgentAssignments, setUserAgentAssignments all called; role dropdowns (viewer/operator/admin); knownAgents prop present |
| `templates/app/admin/users/[id]/page.js` | Dynamic route shell at /admin/users/[id] | VERIFIED | 15 lines; getInstanceRegistry called server-side; knownAgents passed as prop; AdminUserDetailPage rendered |
| `lib/chat/components/index.js` | AgentPickerPage and AdminUserDetailPage exports | VERIFIED | Lines 46-47: both exports present; existing exports untouched |
| `lib/chat/components/admin-users-page.jsx` | "Assign agents" link in UserCard | VERIFIED | Lines 56-59: href="/admin/users/${user.id}"; link present |
| `templates/app/components/login-form.jsx` | Post-login routing to /agents or /agent/[slug]/chat | VERIFIED | Lines 35-36: lastAgent cookie read + ternary router.push. router.push('/') removed (0 matches). |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| lib/chat/components/agent-picker-page.jsx | lib/chat/actions.js:getAgentPickerData | useEffect on mount | WIRED | Line 99: `const result = await getAgentPickerData()` inside useCallback called from useEffect |
| AgentCard click handler | document.cookie lastAgent | document.cookie assignment | WIRED | Line 118: cookie write confirmed (30-day TTL, SameSite=Lax) |
| AgentCard click handler | /agent/[slug]/chat | router.push | WIRED | Line 40: `router.push('/agent/' + agent.name + '/chat')` |
| templates/app/components/login-form.jsx | document.cookie lastAgent | document.cookie.split read | WIRED | Lines 35-36: reads lastAgent cookie; routes to /agent/${lastAgent}/chat if present |
| templates/app/components/login-form.jsx | /agents | router.push post-signIn (ternary fallback) | WIRED | Line 36: `router.push(lastAgent ? \`/agent/${lastAgent}/chat\` : '/agents')` |
| lib/chat/components/admin-user-detail-page.jsx | lib/chat/actions.js:setUserAgentAssignments | form onSubmit | WIRED | Line 62: `await setUserAgentAssignments(userId, assignments)` in handleSave |
| lib/chat/components/admin-user-detail-page.jsx | lib/chat/actions.js:getHubUserById | useEffect on mount | WIRED | Line 20: `getHubUserById(userId)` in Promise.all |
| lib/chat/components/admin-user-detail-page.jsx | lib/chat/actions.js:getUserAgentAssignments | useEffect on mount | WIRED | Line 21: `getUserAgentAssignments(userId)` in Promise.all |
| lib/chat/actions.js:setUserAgentAssignments | lib/db/hub-users.js:upsertUserAssignment | dynamic import | WIRED | Line 1827-1837: dynamic import, upsertUserAssignment called in loop |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| agent-picker-page.jsx | `data` (agents array) | getAgentPickerData() → queryAllInstances('health') | Yes — queries live instance health endpoints via lib/superadmin/client.js | FLOWING |
| admin-user-detail-page.jsx | `user`, `assignments` | getHubUserById + getUserAgentAssignments → lib/db/hub-users.js | Yes — queries hub SQLite DB via drizzle-orm | FLOWING |
| login-form.jsx | `lastAgent` | document.cookie.split at login time | Yes — reads cookie written on prior agent card click | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| AgentPickerPage exports exist in index.js | grep "AgentPickerPage" lib/chat/components/index.js | Found at line 47 | PASS |
| AdminUserDetailPage exports exist in index.js | grep "AdminUserDetailPage" lib/chat/components/index.js | Found at line 46 | PASS |
| hub-users.js has all 5 new functions | grep "^export function" lib/db/hub-users.js | 5 new functions confirmed at lines 84, 99, 114, 129, 160 | PASS |
| setUserAgentAssignments validates roles | grep "validRoles" lib/chat/actions.js | Found at line 1821 — whitelist enforced before DB write | PASS |
| login-form.jsx redirects to /agents (gap closure) | grep "router.push" templates/app/components/login-form.jsx | Line 36: router.push(lastAgent ? `/agent/${lastAgent}/chat` : '/agents') | PASS |
| login-form.jsx does NOT bare-push to '/' | grep -c "router.push('/')" templates/app/components/login-form.jsx | 0 matches | PASS |
| lastAgent cookie read present in login-form.jsx | grep "lastAgent" templates/app/components/login-form.jsx | Lines 35-36: document.cookie.split read + ternary use | PASS |
| /agents page shell intact after gap closure | cat templates/app/agents/page.js | 5-line shell imports AgentPickerPage and renders it | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PICK-01 | 56-01, 56-02, 56-04 | After login, user sees an agent picker dashboard showing all agents they're assigned to | SATISFIED | login-form.jsx lines 35-36 redirect to /agents after sign-in (or directly to /agent/[slug]/chat if lastAgent cookie is set). /agents route renders AgentPickerPage which calls getAgentPickerData() and shows only assigned agents. |
| PICK-02 | 56-02 | Each agent card shows status (online/offline), last job timestamp, open PR count, and active workspace count | SATISFIED | AgentPickerPage:AgentCard renders StatusBadge, activeJobs, openPrs, activeWorkspaces, formatRelativeTime(agent.lastJobAt) |
| PICK-04 | 56-02, 56-04 | Selected agent persists across page loads via cookie | SATISFIED | Cookie written on card click (agent-picker-page.jsx:118, 30-day TTL). Cookie read in login-form.jsx lines 35-36 and used to skip picker and go directly to /agent/[slug]/chat. Full round-trip: write on selection, read on next login. |
| USER-01 | 56-01, 56-03 | Superadmin can assign users to specific agents via the admin UI | SATISFIED | AdminUserDetailPage with checkbox per agent slug; setUserAgentAssignments called on save; "Assign agents" link in user list |
| USER-02 | 56-03 | Superadmin can set per-agent roles (viewer/operator/admin) for each user-agent assignment | SATISFIED | AGENT_ROLES = ['viewer', 'operator', 'admin'] in admin-user-detail-page.jsx; role dropdown rendered per assigned agent |
| USER-03 | 56-02 | Users with no agent assignments see an empty state directing them to contact their admin | SATISFIED | agent-picker-page.jsx lines 132-152: "No agents assigned yet." + "Contact your admin to get access." with muted SVG icon |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| lib/chat/components/agent-picker-page.jsx + agent-picker-page.js | — | .js build artifact coexists with .jsx source in same directory | Info only | index.js imports the .jsx source; no functional problem. Not introduced by gap closure. |

No blocker anti-patterns. The previous blocker (`router.push('/')` in login-form.jsx) is resolved.

---

## Human Verification Required

No items require human verification. All gaps were verifiable programmatically and all checks pass.

---

## Gaps Summary

Both gaps from the initial verification are confirmed closed by plan 56-04.

**Gap 1 (PICK-01 — closed):** `templates/app/components/login-form.jsx` previously had `router.push('/')` at line 35. Plan 56-04 replaced this with a two-line cookie read + conditional redirect. Confirmed: `grep -c "router.push('/')" login-form.jsx` returns 0; line 36 contains `router.push(lastAgent ? \`/agent/${lastAgent}/chat\` : '/agents')`.

**Gap 2 (PICK-04 — closed):** The `lastAgent` cookie was written but never read. Plan 56-04 added the read in login-form.jsx line 35. The full cookie round-trip is now wired: written on agent card click (agent-picker-page.jsx:118), read on next login (login-form.jsx:35), consumed in routing decision (login-form.jsx:36).

All 6 required requirements (PICK-01, PICK-02, PICK-04, USER-01, USER-02, USER-03) are SATISFIED. Phase goal achieved.

---

_Verified: 2026-03-26T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification after: plan 56-04 gap closure_
