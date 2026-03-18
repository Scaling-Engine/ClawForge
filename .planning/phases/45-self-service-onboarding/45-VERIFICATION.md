---
phase: 45-self-service-onboarding
verified: 2026-03-18T00:00:00Z
status: human_needed
score: 14/14 must-haves verified
re_verification: false
human_verification:
  - test: "Onboarding redirect loop prevention"
    expected: "After completing all steps, ONBOARDING_ENABLED=true should NOT loop — the page-level completedAt check redirects to / instead of looping back to /onboarding"
    why_human: "Redirect behavior requires running the full Next.js server with a real session and DB state"
  - test: "ONB-04 gap: first-job step shows job dispatch success but not a confirmed PR URL"
    expected: "ONB-04 requires 'confirms a PR was created' — the UI shows job_id + branch with a note that GitHub Actions will create the PR, but the wizard completes without a PR URL in hand. Verify this is acceptable for the phase goal or if the step should poll for the PR."
    why_human: "Requires a real GitHub Actions run to produce the PR. The deviation from ONB-04 wording is deliberate (createJob returns no prUrl) but the requirement says 'confirms a PR was created.'"
  - test: "Session persistence across browser close"
    expected: "Closing the browser and reopening should resume at the last incomplete step (ONB-02)"
    why_human: "Requires a live browser session and real DB state to verify resume behavior"
  - test: "AGENT_* tooltip visibility on secrets page"
    expected: "Hovering or focusing the secret name input shows the AGENT_ prefix explanation"
    why_human: "HTML title attribute tooltip requires a real browser — cannot be verified programmatically"
---

# Phase 45: Self-Service Onboarding Verification Report

**Phase Goal:** A new operator can set up a working ClawForge instance without asking for help — and the system confirms their setup actually works
**Verified:** 2026-03-18
**Status:** human_needed (all automated checks passed; 4 items need human testing)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | onboarding_state table exists in SQLite with correct columns | VERIFIED | `lib/db/schema.js:180` — `sqliteTable('onboarding_state', ...)` with currentStep, githubConnect, dockerVerify, channelConnect, firstJob, completedAt columns |
| 2 | getOnboardingState() returns null or state object | VERIFIED | `lib/onboarding/state.js:27-30` — returns singleton row via Drizzle `.get() ?? null` |
| 3 | upsertOnboardingStep() creates on first call, updates on subsequent | VERIFIED | `lib/onboarding/state.js:39-76` — exists check → INSERT or UPDATE with step advancement |
| 4 | Authenticated users redirected to /onboarding when ONBOARDING_ENABLED=true | VERIFIED | `lib/auth/middleware.js:25-27` — env var only, no DB import |
| 5 | Middleware does NOT import better-sqlite3 or any DB module | VERIFIED | Grep confirms zero DB imports in middleware.js |
| 6 | Onboarding page Server Component redirects to / when completedAt is non-null | VERIFIED | `templates/app/onboarding/page.js:14` — `if (state?.completedAt) redirect('/')` |
| 7 | Superadmin can query onboarding state via /api/superadmin?action=onboarding | VERIFIED | `api/superadmin.js:54-56` — `case 'onboarding'` with dynamic import |
| 8 | Wizard displays correct step from DB state (session persistence) | VERIFIED | `lib/chat/components/onboarding-wizard.jsx:80-88` — initialState seeded from DB into useState |
| 9 | GitHub PAT verification calls real GitHub /user endpoint | VERIFIED | `lib/onboarding/verify.js:13` — fetches `https://api.github.com/user` with GH_TOKEN |
| 10 | Docker verification uses Promise.race with 5s timeout | VERIFIED | `lib/onboarding/verify.js:51` — `Promise.race([pingPromise, timeoutPromise])` |
| 11 | Slack webhook verification POSTs test message | VERIFIED | `lib/onboarding/verify.js:69-73` — POST with `{ text: 'ClawForge onboarding test - connection verified' }` |
| 12 | First-job step dispatches a real job via createJob | VERIFIED | `lib/chat/actions.js:1397-1405` — calls createJob, gates completion on job_id |
| 13 | AGENT_* prefix fields on secrets page show tooltip | VERIFIED | `lib/chat/components/settings-secrets-page.jsx:394,409` — title attribute with AGENT_ convention explanation |
| 14 | Repos, secrets, MCP pages show actionable empty states with CTA | VERIFIED | admin-repos-page.jsx:327, settings-secrets-page.jsx:525, settings-mcp-page.jsx:144 all have empty state + CTA |

**Score:** 14/14 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/db/schema.js` | onboardingState table definition | VERIFIED | Line 180 — full table with all required columns |
| `lib/onboarding/state.js` | DB read/write for onboarding_state | VERIFIED | Exports getOnboardingState, upsertOnboardingStep, markOnboardingComplete, resetOnboardingState — all synchronous (0 async keywords) |
| `lib/auth/middleware.js` | Onboarding redirect guard | VERIFIED | ONBOARDING_ENABLED env-var-only guard at line 25 |
| `templates/app/onboarding/page.js` | Onboarding page shell | VERIFIED | Server Component with auth check, DB completion check, OnboardingWizard render |
| `api/superadmin.js` | Onboarding status endpoint | VERIFIED | `case 'onboarding'` at line 54 |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/chat/components/onboarding-wizard.jsx` | Main wizard Client Component | VERIFIED | Full wizard, not stub — STEPS array, progress indicator, state resume from initialState, switch rendering |
| `lib/chat/components/onboarding-steps/step-github.jsx` | GitHub PAT verification step | VERIFIED | Calls verifyOnboardingGithub Server Action |
| `lib/chat/components/onboarding-steps/step-docker.jsx` | Docker socket verification step | VERIFIED | Calls verifyOnboardingDocker Server Action |
| `lib/chat/components/onboarding-steps/step-channel.jsx` | Slack channel connection step | VERIFIED | Calls verifyOnboardingSlack, includes "Skip this step" link |
| `lib/chat/components/onboarding-steps/step-first-job.jsx` | First job dispatch step | VERIFIED | Calls dispatchOnboardingFirstJob, shows job_id + branch on success, gates onStepComplete on success |
| `lib/chat/components/onboarding-steps/step-complete.jsx` | Completion screen | VERIFIED | "Onboarding Complete!" heading with "Go to Dashboard" navigation |
| `lib/onboarding/verify.js` | Infrastructure verification functions | VERIFIED | verifyGithubPat (AbortController 5s), verifyDockerSocket (Promise.race 5s), verifySlackWebhook (AbortController 5s) |
| `lib/chat/actions.js` | Server Actions for onboarding steps | VERIFIED | 5 new exports at lines 1346-1421: verifyOnboardingGithub, verifyOnboardingDocker, verifyOnboardingSlack, dispatchOnboardingFirstJob, getOnboardingStatus |

### Plan 03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/chat/components/settings-secrets-page.jsx` | Tooltip on AGENT_* prefix fields | VERIFIED | title attribute at lines 394+409; AGENT_LLM_ badge (purple), AGENT_ badge (blue) in secrets list |
| `lib/chat/components/admin-repos-page.jsx` | Actionable empty state for repos | VERIFIED | "No repositories configured" + "Add First Repository" CTA at line 327 |
| `lib/chat/components/settings-mcp-page.jsx` | Actionable empty state for MCP servers | VERIFIED | "No MCP servers configured" + "Add First MCP Server" CTA at line 144 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/auth/middleware.js` | `process.env.ONBOARDING_ENABLED` | env var check only | WIRED | Line 25 — no DB import anywhere in file |
| `templates/app/onboarding/page.js` | `lib/onboarding/state.js` | getOnboardingState() call | WIRED | Line 3 import + line 10 call |
| `api/superadmin.js` | `lib/onboarding/state.js` | dynamic import in switch case | WIRED | Line 55 — `await import('../lib/onboarding/state.js')` |
| `lib/chat/components/onboarding-wizard.jsx` | `lib/chat/actions.js` | Server Action calls per step | WIRED | Step components import and call verifyOnboarding* actions |
| `lib/chat/actions.js` | `lib/onboarding/verify.js` | dynamic import in each Server Action | WIRED | Lines 1348, 1363, 1379 — `await import('../onboarding/verify.js')` |
| `lib/chat/actions.js` | `lib/onboarding/state.js` | upsertOnboardingStep after each verification | WIRED | Lines 1349, 1364, 1380, 1396 — imports and calls upsertOnboardingStep |
| `lib/chat/components/onboarding-steps/step-first-job.jsx` | `lib/chat/actions.js` | dispatchOnboardingFirstJob Server Action | WIRED | Line 4 import + line 15 call |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ONB-01 | 45-01 | New operator redirected to onboarding on first login when ONBOARDING_ENABLED=true | SATISFIED | middleware.js:25 env-var redirect guard for authenticated users |
| ONB-02 | 45-01, 45-02 | Onboarding step progress persisted in DB, resumes across sessions | SATISFIED | state.js upsert + wizard initialState hydration from DB |
| ONB-03 | 45-02 | Wizard programmatically verifies: GitHub PAT, Docker socket, Slack webhook | SATISFIED | verify.js + 3 Server Actions in actions.js |
| ONB-04 | 45-02 | Onboarding terminal step dispatches a real job and confirms a PR was created | PARTIAL | Job dispatched, job_id returned. PR URL not shown because createJob() returns {job_id, branch} only — PR is created asynchronously by GitHub Actions. UI says "GitHub Actions will run the job and create a PR. Check your repository." Human verification needed to assess acceptability. |
| ONB-05 | 45-03 | Complex admin fields (AGENT_* prefix) display contextual tooltips | SATISFIED | title attribute on secret name input; AGENT_ and AGENT_LLM_ badges in list view |
| ONB-06 | 45-03 | Repos, secrets, and MCP servers pages display helpful empty states when no items exist | SATISFIED | All three pages have actionable empty states with CTA buttons |

**All 6 requirement IDs (ONB-01 through ONB-06) are accounted for. No orphaned requirements.**

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/chat/components/onboarding-steps/step-channel.jsx` | 75-76 | `placeholder="https://hooks.slack.com/..."` | Info | Input placeholder attribute — expected UI pattern, not a stub |

No blockers or warnings found. The `placeholder` hits in grep are HTML input placeholder attributes, not implementation stubs.

---

## ONB-04 Deviation Detail

**Requirement text:** "Onboarding terminal step dispatches a real job and confirms a PR was created"

**Implementation:** `createJob()` in `lib/tools/create-job.js` returns `{ job_id, branch }` only — no prUrl. The PR is created asynchronously by GitHub Actions after the job branch is pushed. The step-first-job component shows the job_id and branch, and displays the message "GitHub Actions will run the job and create a PR. Check your repository to watch it in progress."

**Assessment:** The job dispatch succeeds and triggers the real pipeline (GitHub Actions → Docker container → Claude Code → PR). The PR confirmation cannot happen synchronously because it depends on GitHub Actions completing. This is an architectural constraint, not an implementation gap. The SUMMARY documents this as a known deviation.

**Human verification needed:** Confirm that job dispatch success (job_id returned) satisfies the intent of ONB-04, or determine if the step should poll for the PR URL before marking complete.

---

## Human Verification Required

### 1. ONB-04 PR Confirmation Adequacy

**Test:** Run through the full onboarding wizard on a live instance with a real GitHub repo configured. Complete Step 4 (First Job). Observe whether showing the job_id + branch with a message about GitHub Actions is sufficient confirmation for an operator.
**Expected:** Operator understands the job is dispatched and a PR will appear in their GitHub repo shortly
**Why human:** Requires real GitHub Actions execution and a UX judgment call about whether the requirement "confirms a PR was created" is met by "confirms a job was dispatched that will create a PR"

### 2. Redirect Loop Prevention

**Test:** Set ONBOARDING_ENABLED=true in .env, start the dev server, log in, complete all steps, then navigate to the app root
**Expected:** After completion, navigating to / does not redirect back to /onboarding (completedAt check in page.js breaks the loop)
**Why human:** Middleware redirect and Server Component redirect interact at runtime — cannot verify statically

### 3. Session Persistence Across Browser Close (ONB-02)

**Test:** Set ONBOARDING_ENABLED=true, log in, complete Step 1 (GitHub), close the browser entirely, reopen and log in again
**Expected:** Wizard resumes at Step 2 (Docker), not Step 1
**Why human:** Requires real DB persistence + browser session + server restart to validate

### 4. AGENT_* Tooltip Visibility

**Test:** Navigate to Admin > Secrets, click "New Secret", hover or tab to the Name input field
**Expected:** Browser tooltip appears with the AGENT_* prefix convention explanation
**Why human:** HTML title attribute tooltips are browser-rendered and cannot be tested programmatically

---

## Gaps Summary

No gaps blocking goal achievement. All 14 must-have truths are verified in the codebase. The ONB-04 deviation (job_id instead of PR URL) is an architectural constraint of createJob(), documented in the summary, and does not prevent the system from "confirming the setup works" — it confirms the job pipeline is live. Human verification is needed to confirm the UX of that confirmation is sufficient.

---

_Verified: 2026-03-18_
_Verifier: Claude (gsd-verifier)_
