---
phase: quick
plan: 260323-gcl
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/chat/actions.js
  - lib/chat/components/pull-requests-page.jsx
autonomous: true
requirements: [quick-260323-gcl]
must_haves:
  truths:
    - "User can toggle between Open, Approved/Merged, and All PR tabs"
    - "User can expand any PR row to see changed files with inline diffs"
    - "Approved and merged PRs appear in the Approved/Merged tab"
    - "Approve/Request Changes buttons still work on open PRs"
  artifacts:
    - path: "lib/chat/actions.js"
      provides: "getPullRequests(state) and getPRFiles(owner, repo, prNumber) server actions"
    - path: "lib/chat/components/pull-requests-page.jsx"
      provides: "Filter tabs, expandable PR rows with inline diff rendering"
  key_links:
    - from: "pull-requests-page.jsx"
      to: "actions.js:getPullRequests"
      via: "server action call with state parameter"
      pattern: "getPullRequests\\("
    - from: "pull-requests-page.jsx"
      to: "actions.js:getPRFiles"
      via: "server action call on row expand"
      pattern: "getPRFiles\\("
    - from: "pull-requests-page.jsx"
      to: "diff-view.jsx:DiffView"
      via: "import and render per file patch"
      pattern: "DiffView"
---

<objective>
Enhance the Pull Requests page with filter tabs (Open / Approved-Merged / All), expandable PR rows showing changed files with inline diffs via the existing DiffView component, and visibility of closed/merged PRs.

Purpose: Users currently must leave ClawForge and visit GitHub to see what changed in a PR. This brings inline review directly into the app.
Output: Updated actions.js with two new server actions, updated pull-requests-page.jsx with tabs and expandable rows.
</objective>

<execution_context>
@/Users/nwessel/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nwessel/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@lib/chat/actions.js (lines 640-716 — PR actions section)
@lib/chat/components/pull-requests-page.jsx
@lib/chat/components/diff-view.jsx (existing DiffView component using diff2html)
@lib/chat/components/icons.jsx (ChevronDownIcon, GitPullRequestIcon, SpinnerIcon, RefreshIcon available)

<interfaces>
From lib/tools/github.js:
```javascript
// githubApi(endpoint, options) — internal, fetches from api.github.com with GH_TOKEN
// Used via: const { githubApi } = await import('../tools/github.js');
```

From lib/chat/components/diff-view.jsx:
```javascript
export function DiffView({ diff, filename })
// diff: unified diff string, filename: optional header text
// Already handles diff2html rendering with dark mode CSS
```

From lib/chat/components/icons.jsx:
```javascript
export function ChevronDownIcon({ size = 16, className = '' })
export function GitPullRequestIcon({ size = 16 })
export function SpinnerIcon({ size = 16 })
export function RefreshIcon({ size = 16 })
```

GitHub API response shapes:
```javascript
// GET /repos/{owner}/{repo}/pulls?state=open|closed|all
// Returns array of PR objects with: number, title, html_url, draft, state,
//   merged_at, user.login, head.ref, base.ref, created_at, _repo (added by us)

// GET /repos/{owner}/{repo}/pulls/{number}/files
// Returns array of: { filename, status, additions, deletions, changes, patch }
// patch is a unified diff string suitable for DiffView
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add server actions for filtered PRs and PR file diffs</name>
  <files>lib/chat/actions.js</files>
  <action>
Add two new exported server actions in the "Pull Request actions" section of lib/chat/actions.js (after the existing `requestChanges` function, before the "Runners actions" section):

1. `getPullRequests(state = 'open')` — Same pattern as `getPendingPullRequests` but accepts a `state` parameter ('open', 'closed', 'all'). Validate state is one of these three values, default to 'open'. Uses same `loadAllowedRepos()` + `githubApi()` pattern. Query string: `?state=${state}&per_page=50&sort=updated&direction=desc`. Tags each PR with `_repo` like existing code.

2. `getPRFiles(owner, repo, prNumber)` — Calls `githubApi(/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100)`. Returns the array of file objects (each has filename, status, additions, deletions, changes, patch). Wrap in try/catch returning empty array on failure. Requires `requireAuth()`.

Do NOT modify `getPendingPullRequests` or `getPendingPRCount` — they are used elsewhere (sidebar badge). The new `getPullRequests` is a separate function.
  </action>
  <verify>
    <automated>cd "/Users/nwessel/Claude Code/Business/Products/clawforge" && node -e "const m = require('./lib/chat/actions.js'); console.log(typeof m.getPullRequests, typeof m.getPRFiles)" 2>&1 | grep -q "function function" && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>Both getPullRequests and getPRFiles are exported from actions.js and callable</done>
</task>

<task type="auto">
  <name>Task 2: Add filter tabs and expandable diff rows to PR page</name>
  <files>lib/chat/components/pull-requests-page.jsx</files>
  <action>
Rewrite pull-requests-page.jsx with these additions (keep existing utilities and patterns):

**Imports:** Add `getPullRequests, getPRFiles` from actions.js. Add `DiffView` from `./diff-view.js`. Add `ChevronDownIcon` from `./icons.js` (already has GitPullRequestIcon, SpinnerIcon, RefreshIcon).

**Filter Tabs (in PullRequestsPage):**
- State: `activeTab` — 'open' | 'closed' | 'all' (default 'open')
- Three tab buttons below the header: "Open", "Approved / Merged", "All"
- Style: pill/segment buttons using existing Tailwind patterns. Active tab gets `bg-accent text-accent-foreground`, inactive gets `text-muted-foreground hover:text-foreground`
- Switching tabs calls `getPullRequests(state)` where 'open' maps to 'open', 'Approved / Merged' maps to 'closed', 'All' maps to 'all'
- Refresh button reloads current tab's data
- Update subtitle text per tab: "N open PRs (M ready for review)" for open tab, "N closed/merged PRs" for closed tab, "N total PRs" for all tab

**Expandable PR Rows (in PRRow):**
- State: `expanded` boolean (default false), `files` array (default null), `loadingFiles` boolean
- Click on the PR row body (not the action buttons) toggles expanded state
- On first expand, call `getPRFiles(owner, repo, pr.number)` and cache result in `files` state
- Show ChevronDownIcon that rotates when expanded (add `transition-transform` and `rotate-180` when expanded)
- Expanded section below the row content shows:
  - File list: each file as a collapsible section with filename, status badge (added/modified/removed), and +N/-N counts
  - Each file row is independently expandable to show its patch via `<DiffView diff={file.patch} filename={file.filename} />`
  - If file has no patch (binary or too large), show "No diff available" text
  - Loading state: show spinner while files load
- Add `cursor-pointer` to the clickable area of the row
- Prevent click propagation from Approve/Request Changes buttons (they should not toggle expand)

**Status indicators for closed/merged PRs:**
- If `pr.merged_at` exists, show a purple "Merged" badge next to the title
- If `pr.state === 'closed'` and no `merged_at`, show a red "Closed" badge
- If `pr.state === 'open'`, show a green "Open" badge (only visible on the "All" tab for distinction)
- Hide Approve/Request Changes buttons for non-open PRs

**Empty states:**
- Open tab: "No open pull requests" (existing message)
- Closed tab: "No approved or merged pull requests"
- All tab: "No pull requests found"
  </action>
  <verify>
    <automated>cd "/Users/nwessel/Claude Code/Business/Products/clawforge" && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>PR page shows filter tabs that switch between open/closed/all PRs; clicking a PR row expands to show changed files; each file can be expanded to show its diff via DiffView; status badges appear for merged/closed PRs; approve/request changes buttons only show on open PRs</done>
</task>

</tasks>

<verification>
1. `npm run build` succeeds with no errors
2. Navigate to the Pull Requests page in the browser
3. Verify three filter tabs appear (Open, Approved/Merged, All)
4. Click a PR row — it expands to show the file list
5. Click a file — it shows the diff inline via DiffView
6. Switch to "Approved / Merged" tab — shows closed/merged PRs with badges
7. Approve/Request Changes buttons only appear on open PRs
</verification>

<success_criteria>
- Filter tabs switch between open, closed, and all PR states
- PR rows expand on click to show changed files with diffs
- DiffView renders patches inline with red/green highlighting
- Status badges (Open/Merged/Closed) visible on PRs
- Build passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260323-gcl-enhance-pr-page-with-expandable-diffs-fi/260323-gcl-SUMMARY.md`
</output>
