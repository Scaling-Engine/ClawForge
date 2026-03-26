---
phase: 54-terminology-migration
verified: 2026-03-25T12:00:00Z
status: gaps_found
score: 10/12 must-haves verified
gaps:
  - truth: "No logged-in user reads the word 'instance' or 'instances' in any heading, label, button, badge, or empty-state message"
    status: failed
    reason: "Two user-visible 'Instance' strings remain in components not covered by either plan"
    artifacts:
      - path: "lib/chat/components/superadmin-search.jsx"
        issue: "Line 106: <h2 className=\"font-semibold text-sm\">Cross-Instance Job Search</h2> — this heading is visible to superadmin users in the search panel. The table column header (line 157) was correctly changed to 'Agent' by plan 01, but the section heading above the form was missed."
      - path: "lib/chat/components/cluster-detail-page.jsx"
        issue: "Line 90: <span>Instance: <span ...>{run.instanceName}</span></span> — this label is rendered on the cluster run detail page and is visible to any logged-in user who clicks into a cluster run. The string 'Instance:' is a user-facing label, not a JS identifier."
    missing:
      - "In superadmin-search.jsx line 106: change 'Cross-Instance Job Search' to 'Cross-Agent Job Search'"
      - "In cluster-detail-page.jsx line 90: change the label text 'Instance:' to 'Agent:'"
human_verification:
  - test: "Navigate to the superadmin search panel while logged in as a superadmin user"
    expected: "The search form heading should read 'Cross-Agent Job Search', not 'Cross-Instance Job Search'"
    why_human: "Visual confirmation needed — the heading is present in JSX at line 106 of superadmin-search.jsx and renders in-browser"
  - test: "Navigate to any cluster detail page (click into a cluster run from the clusters list)"
    expected: "The metadata row should show 'Agent: <name>' not 'Instance: <name>'"
    why_human: "Visual confirmation needed — the label renders at cluster-detail-page.jsx line 90"
---

# Phase 54: Terminology Migration Verification Report

**Phase Goal:** Every user-facing string in the platform says "agent" or "agents" — no user ever reads "instance" in the UI
**Verified:** 2026-03-25
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | No logged-in user reads "instance" or "instances" in any heading, label, button, badge, or empty-state | FAILED | Two user-visible strings remain: `Cross-Instance Job Search` heading in superadmin-search.jsx:106 and `Instance:` label in cluster-detail-page.jsx:90 |
| 2 | Admin sidebar nav item reads 'Agents' (not 'Instances') | VERIFIED | `admin-layout.jsx:17` — `label: 'Agents'` confirmed |
| 3 | Superadmin switcher dropdown label reads 'Agent' (not 'Instance') | VERIFIED | `instance-switcher.jsx:52` — `Agent` text node confirmed |
| 4 | Superadmin dashboard heading and stat label use 'Agent(s)' | VERIFIED | `superadmin-dashboard.jsx:139,144` — `Cross-Agent Overview` and `Agents` stat label confirmed |
| 5 | Monitoring dashboard heading and stat label use 'Agent(s)' | VERIFIED | `superadmin-monitoring.jsx:195,199` — `Agent Health Monitor` and `Agents` stat label confirmed |
| 6 | Job search table header column reads 'Agent' | VERIFIED | `superadmin-search.jsx:157` — `<th ...>Agent</th>` confirmed |
| 7 | Billing page usage table row label reads 'Agent' | VERIFIED | `admin-billing-page.jsx:218` — `<span className="text-sm font-medium">Agent</span>` confirmed |
| 8 | Clicking 'Agents' in sidebar navigates to /admin/agents | VERIFIED | `admin-layout.jsx:17` — `href: '/admin/agents'` confirmed |
| 9 | /admin/agents route renders AdminInstancesPage | VERIFIED | `templates/app/admin/agents/page.js` exists and imports/renders `AdminInstancesPage` |
| 10 | /admin/instances URL redirects to /admin/agents | VERIFIED | `templates/app/admin/instances/page.js` contains `redirect('/admin/agents')` |
| 11 | No link or button in the UI produces a URL containing /admin/instances | VERIFIED | `grep -rn "href.*\/admin\/instances" lib/chat/components/*.jsx` returns no matches |
| 12 | admin-instances-page count/empty-state text uses 'agent(s)' | VERIFIED | Lines 84, 98, 100 confirmed: `agent/agents`, `No agents found`, `single-agent mode` |

**Score:** 10/12 truths verified (truth #1 fails due to 2 missed strings)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/chat/components/admin-layout.jsx` | Nav label 'Agents', href '/admin/agents' | VERIFIED | Line 17: `{ id: 'instances', label: 'Agents', href: '/admin/agents', icon: ServerIcon }` |
| `lib/chat/components/instance-switcher.jsx` | Dropdown label 'Agent' | VERIFIED | Line 52: `Agent` text node present |
| `lib/chat/components/admin-instances-page.jsx` | Count/empty-state uses 'agent/agents' | VERIFIED | Lines 84, 98, 100 confirmed |
| `lib/chat/components/superadmin-dashboard.jsx` | Heading 'Cross-Agent Overview' | VERIFIED | Line 139 confirmed |
| `lib/chat/components/superadmin-monitoring.jsx` | Heading 'Agent Health Monitor' | VERIFIED | Line 195 confirmed |
| `lib/chat/components/superadmin-search.jsx` | Table column header 'Agent' | VERIFIED (partial) | Column header (line 157) is 'Agent'; section heading (line 106) still reads 'Cross-Instance Job Search' |
| `lib/chat/components/admin-billing-page.jsx` | Row label 'Agent' | VERIFIED | Line 218 confirmed |
| `templates/app/admin/agents/page.js` | /admin/agents page rendering AdminInstancesPage | VERIFIED | File exists, contains `AdminAgentsRoute` and `AdminInstancesPage` |
| `templates/app/admin/instances/page.js` | Redirect to /admin/agents | VERIFIED | Contains `redirect('/admin/agents')` |
| `lib/chat/components/cluster-detail-page.jsx` | Not in scope per plan | OUT OF SCOPE | File was not listed in either plan's `files_modified` — but contains user-facing 'Instance:' label at line 90 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `admin-layout.jsx` ADMIN_NAV | `templates/app/admin/agents/page.js` | `href: '/admin/agents'` | VERIFIED | href matches route file path |
| `instance-switcher.jsx` | dropdown label text | JSX text node | VERIFIED | Line 52 contains `Agent` |
| `templates/app/admin/agents/page.js` | `lib/chat/components/index.js` | `AdminInstancesPage` import | VERIFIED | Import present in page file |
| `templates/app/admin/instances/page.js` | `/admin/agents` | `redirect()` | VERIFIED | `redirect('/admin/agents')` present |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase is a pure text/label migration (no new data sources or rendering pipelines introduced). All artifacts are UI string changes in existing components. Existing data flows are unchanged.

---

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| Sidebar nav label | `grep "label: 'Agents'" lib/chat/components/admin-layout.jsx` | Match found | PASS |
| Old label gone | `grep "label: 'Instances'" lib/chat/components/admin-layout.jsx` | No match | PASS |
| Nav href updated | `grep "href: '/admin/agents'" lib/chat/components/admin-layout.jsx` | Match found | PASS |
| Old href gone | `grep "href: '/admin/instances'" lib/chat/components/admin-layout.jsx` | No match | PASS |
| /admin/agents page exists | `cat templates/app/admin/agents/page.js` | File present with correct content | PASS |
| /admin/instances redirect | `grep "redirect" templates/app/admin/instances/page.js` | `redirect('/admin/agents')` found | PASS |
| Global scan for remaining user-facing instance text | `grep -rn '"Instance"\|>Instance<\|No instances\|single-instance\|instance${' lib/chat/components/*.jsx` | No matches | PASS |
| Broader scan with label pattern | `grep -rn ">Instance\b\|Instance:"` in JSX files | Two matches found | FAIL — `cluster-detail-page.jsx:90` (`Instance:` label) and `superadmin-search.jsx:106` (`Cross-Instance Job Search` heading) |
| Commits present | `git show --stat 39a4e4e c90e664 98601e2 bfe1ea2` | All 4 commits found | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| TERM-01 | 54-01 | All user-facing UI text uses "agents" instead of "instances" (sidebar, headings, buttons, labels) | PARTIAL | 10 of 12 targeted strings replaced; `Cross-Instance Job Search` heading and `Instance:` detail label missed |
| TERM-02 | 54-02 | URL paths use `/agent/[slug]/` structure instead of instance-specific subdomains | VERIFIED | /admin/agents route created, /admin/instances redirects, admin nav href updated |

REQUIREMENTS.md marks both TERM-01 and TERM-02 as `[x]` (complete). TERM-01 should be downgraded — two user-visible "instance" strings remain in shipped components.

No orphaned requirements: REQUIREMENTS.md maps only TERM-01 and TERM-02 to Phase 54. Both were claimed by plans 54-01 and 54-02 respectively.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/chat/components/superadmin-search.jsx` | 106 | `Cross-Instance Job Search` heading in rendered JSX | Blocker | Superadmin users see "Instance" in the search panel heading — directly contradicts phase goal |
| `lib/chat/components/cluster-detail-page.jsx` | 90 | `Instance:` label in cluster run detail view | Blocker | Any user who views a cluster run detail sees "Instance:" as a metadata label |

Both are plain JSX text nodes — not JS identifiers, not comments, not code. Both are visible to logged-in users during normal navigation.

---

### Human Verification Required

#### 1. Superadmin Search Heading

**Test:** Log in as a superadmin user and navigate to the admin search page.
**Expected:** The search form heading should read "Cross-Agent Job Search", not "Cross-Instance Job Search".
**Why human:** JSX confirmed at line 106 — automated grep found the issue, but the fix requires manual remediation and visual sign-off.

#### 2. Cluster Detail Label

**Test:** Log in as any user with cluster access, navigate to the clusters list, and click into any cluster run to open the detail view.
**Expected:** The metadata row below the cluster name should display "Agent: archie" (or the relevant agent name), not "Instance: archie".
**Why human:** JSX confirmed at line 90 of cluster-detail-page.jsx — automated grep found the issue, but requires visual confirmation post-fix.

---

### Gaps Summary

Phase 54 successfully completed the bulk of the terminology migration: all 7 targeted JSX files were updated correctly, both commits in plan 01 and both commits in plan 02 are present and verified, the /admin/agents route was created, the /admin/instances redirect is in place, and no /admin/instances hrefs remain in source.

However, two user-visible "instance" strings were not in scope of either plan and were not detected by the plan's own verification grep patterns:

1. **`superadmin-search.jsx:106`** — The section heading `<h2>Cross-Instance Job Search</h2>` above the search form. The plan correctly changed the table column header (line 157) from "Instance" to "Agent" but missed this heading 51 lines above it. The plan's verification grep `grep ">Instance<" lib/chat/components/superadmin-search.jsx` would have caught `>Instance</th>` but the heading uses `>Cross-Instance Job Search<` which does not match the literal pattern.

2. **`cluster-detail-page.jsx:90`** — The `Instance:` metadata label in the cluster run detail view. This file (`cluster-detail-page.jsx`) was never listed in either plan's `files_modified` section, meaning it was not scanned during execution. It is a user-facing component rendered to all users who navigate to cluster detail pages.

Both gaps are single-line text substitutions requiring no logic changes. The phase goal — "no user ever reads 'instance' in the UI" — is not achieved while these strings exist.

---

_Verified: 2026-03-25_
_Verifier: Claude (gsd-verifier)_
