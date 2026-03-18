---
phase: 45-self-service-onboarding
plan: 02
subsystem: ui
tags: [onboarding, wizard, react, server-actions, docker, github, slack, react-hook-form]

# Dependency graph
requires:
  - phase: 45-01
    provides: onboarding_state schema, state module (getOnboardingState/upsertOnboardingStep/markOnboardingComplete), middleware redirect, page shell
provides:
  - Multi-step onboarding wizard UI with DB-persisted progress that resumes across sessions
  - GitHub PAT verification via real GitHub /user API endpoint
  - Docker socket verification with 5-second Promise.race timeout guard
  - Slack incoming webhook verification with test message POST
  - First-job dispatch via createJob with completion gate
  - 5 Server Actions wired to infrastructure verification functions
affects:
  - Phase 46 (monitoring) — onboarding marks instance ready, may gate monitoring page
  - Templates/app/onboarding/page.js — wizard is the page's only content

# Tech tracking
tech-stack:
  added: [react-hook-form@^7.71.2, @hookform/resolvers@^5.2.2]
  patterns:
    - Server Action → verify function → upsertOnboardingStep (per-step verification pattern)
    - Promise.race with explicit setTimeout reject for Docker ping timeout
    - AbortController with 5s timeout for all external HTTP calls (GitHub API, Slack webhook)
    - esbuild processes lib/chat/components/**/*.jsx → same subdir *.js (step components follow same pattern as parent)

key-files:
  created:
    - lib/onboarding/verify.js
    - lib/chat/components/onboarding-steps/step-github.jsx
    - lib/chat/components/onboarding-steps/step-docker.jsx
    - lib/chat/components/onboarding-steps/step-channel.jsx
    - lib/chat/components/onboarding-steps/step-first-job.jsx
    - lib/chat/components/onboarding-steps/step-complete.jsx
  modified:
    - lib/chat/actions.js (5 new exported Server Actions appended)
    - lib/chat/components/onboarding-wizard.jsx (stub replaced with full wizard)
    - package.json (react-hook-form + @hookform/resolvers added)

key-decisions:
  - "dispatchOnboardingFirstJob returns job_id + branch (not prUrl) — createJob returns {job_id, branch} only; PR is created later by GitHub Actions. Job dispatch success gates completion."
  - "Step components import from ../../actions.js (relative path) — consistent with 'relative imports only' rule in CLAUDE.md"
  - "onboarding-steps/ subdir compiled by esbuild glob lib/chat/components/**/*.jsx — no extra build config needed"
  - "react-hook-form installed but not used in final components — plain useState/handlers simpler for verification-only forms with no complex validation rules"

patterns-established:
  - "Verification pattern: Server Action calls verify fn → on success calls upsertOnboardingStep('step_name', 'complete') → returns result to client"
  - "Step component pattern: loading/success/error state via useState, 1.5s delay before onStepComplete on success so user sees confirmation"
  - "Docker timeout pattern: Promise.race([docker.ping(), timeoutReject(5000)]) — guards against Docker hanging when daemon is down"

requirements-completed: [ONB-02, ONB-03, ONB-04]

# Metrics
duration: 6min
completed: 2026-03-18
---

# Phase 45 Plan 02: Onboarding Wizard Summary

**Multi-step wizard with GitHub PAT, Docker socket, Slack webhook, and first-job verification — all with DB-persisted progress that resumes across browser sessions**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-18T02:58:30Z
- **Completed:** 2026-03-18T03:04:29Z
- **Tasks:** 2 executed + 1 checkpoint (auto-approved)
- **Files modified:** 9

## Accomplishments

- Verification module (lib/onboarding/verify.js) with three infrastructure checks: GitHub PAT (real API call), Docker socket (Promise.race 5s timeout), Slack webhook (POST with test message)
- Five Server Actions in lib/chat/actions.js wired to verification functions and DB state updates
- Full wizard UI replacing stub: step progress indicator, DB state resume on load, loading/success/failure states per step
- Step-channel includes "Skip this step" for optional Slack configuration
- Step-first-job gates completion on job dispatch success (returns job_id + branch)
- react-hook-form and @hookform/resolvers installed as dependencies

## Task Commits

1. **Task 1: Install deps + verification module + Server Actions** - `8e523b5` (feat)
2. **Task 2: Wizard UI + step components** - `1a141c6` (feat)
3. **Task 3: Checkpoint** - auto-approved (--auto mode)

## Files Created/Modified

- `lib/onboarding/verify.js` — verifyGithubPat, verifyDockerSocket (Promise.race), verifySlackWebhook
- `lib/chat/actions.js` — 5 new Server Actions: verifyOnboardingGithub, verifyOnboardingDocker, verifyOnboardingSlack, dispatchOnboardingFirstJob, getOnboardingStatus
- `lib/chat/components/onboarding-wizard.jsx` — Full wizard with STEPS array, progress indicator, state resume from initialState prop
- `lib/chat/components/onboarding-steps/step-github.jsx` — GitHub PAT verify step
- `lib/chat/components/onboarding-steps/step-docker.jsx` — Docker socket verify step
- `lib/chat/components/onboarding-steps/step-channel.jsx` — Slack webhook verify step + skip link
- `lib/chat/components/onboarding-steps/step-first-job.jsx` — First job dispatch + completion gate
- `lib/chat/components/onboarding-steps/step-complete.jsx` — Completion screen with Go to Dashboard
- `package.json` — react-hook-form, @hookform/resolvers added

## Decisions Made

- **dispatchOnboardingFirstJob returns {jobId, branch} not prUrl** — createJob() returns {job_id, branch}; PR is created asynchronously by GitHub Actions. Job dispatch success (job_id returned) is the pipeline verification signal, consistent with how the event handler treats job creation.
- **Step components use plain useState** — react-hook-form was installed but not used in final components; these are single-button verification flows with minimal input, not complex forms. useState is simpler and more readable.

## Deviations from Plan

None — plan executed exactly as written. One note: the plan specified "shows PR URL as a clickable link" for step-first-job, but createJob() does not return a prUrl (it returns job_id + branch only). Implemented job dispatch success display showing job_id and branch instead, which is what's actually available. The completion gate still works correctly.

## Issues Encountered

None — build passed on first attempt for both tasks.

## User Setup Required

None — no additional external service configuration required beyond what was set up in Plan 01.

## Next Phase Readiness

- Phase 45 is complete — all 3 plans done (01: foundation, 02: wizard UI, 03: UX polish)
- Phase 46 (Monitoring Dashboard) can begin — onboarding state is now a concrete DB entity
- Operators need ONBOARDING_ENABLED=true in .env to activate the wizard for new instances

---
*Phase: 45-self-service-onboarding*
*Completed: 2026-03-18*
