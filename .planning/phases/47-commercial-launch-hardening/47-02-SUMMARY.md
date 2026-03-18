---
phase: 47-commercial-launch-hardening
plan: 02
subsystem: docs
tags: [documentation, operator-guide, deployment, troubleshooting, env-vars]

requires: []
provides:
  - Complete operator troubleshooting guide with 10 common errors (symptom + cause + fix)
  - v3.0 env var reference (SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, ONBOARDING_ENABLED, SLACK_OPERATOR_CHANNEL)
  - ClawForge-specific VPS deployment runbook (removes upstream thepopebot scaffold references)
  - Updated .env.example with ONBOARDING_ENABLED and SLACK_OPERATOR_CHANNEL in both instance blocks
affects: [external-operators, onboarding, deployment]

tech-stack:
  added: []
  patterns:
    - "Troubleshooting entries follow Symptom / Cause / Fix structure for scanability"

key-files:
  created: []
  modified:
    - docs/OPERATOR_GUIDE.md
    - .env.example

key-decisions:
  - "Troubleshooting section placed between Deployment and Current Instances Reference to follow natural operator workflow"
  - "v3.0 env vars documented under new 'Observability & Billing Variables' subsection, not scattered inline"
  - "Deploy runbook uses git clone + npm install + npm run build + docker compose up — no thepopebot scaffolding"
  - "Optional vars in .env.example are commented out with explanatory notes so operators understand when to enable them"

patterns-established:
  - "Troubleshooting: numbered headers (### 1. Title) for anchor links and scanability"

requirements-completed: [DOCS-01]

duration: 3min
completed: 2026-03-18
---

# Phase 47 Plan 02: Operator Documentation Summary

**Operator-ready docs: 10-error troubleshooting guide, v3.0 env var reference (SENTRY_DSN, ONBOARDING_ENABLED, SLACK_OPERATOR_CHANNEL), and ClawForge-specific VPS deployment runbook replacing upstream thepopebot scaffold instructions**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-18T03:42:52Z
- **Completed:** 2026-03-18T03:45:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Troubleshooting section with 10 operator-facing errors, each with Symptom, Cause, and Fix blocks
- New "Observability & Billing Variables" subsection documenting SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, ONBOARDING_ENABLED, SLACK_OPERATOR_CHANNEL
- Deployment section updated with ClawForge-specific VPS runbook (git clone → npm install → npm run build → docker compose up) and full Let's Encrypt HTTPS instructions
- .env.example updated with ONBOARDING_ENABLED and SLACK_OPERATOR_CHANNEL commented out in both NOAH and SES instance blocks

## Task Commits

1. **Task 1: Add troubleshooting guide and complete config reference in OPERATOR_GUIDE.md** - `ffa7a45` (docs)
2. **Task 2: Update .env.example with v3.0 environment variables** - `ff8c6a9` (chore)

## Files Created/Modified

- `docs/OPERATOR_GUIDE.md` - Added Troubleshooting section (10 errors), Observability & Billing Variables subsection, ClawForge-specific deployment runbook, updated Table of Contents
- `.env.example` - Added NOAH_ONBOARDING_ENABLED, NOAH_SLACK_OPERATOR_CHANNEL, SES_ONBOARDING_ENABLED, SES_SLACK_OPERATOR_CHANNEL (all commented out, optional)

## Decisions Made

- Troubleshooting section placed between Deployment and Current Instances Reference — operators who reach Deployment have a working system, Troubleshooting is next natural stop when something goes wrong
- Optional v3.0 vars in .env.example are commented out so existing instances are unaffected by a fresh pull
- Deploy runbook removed `npx thepopebot init` and `npm run setup` (upstream scaffolding) — ClawForge diverged from this pattern in Phase 19+ and the old steps would fail

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- DOCS-01 requirement satisfied
- External operators can deploy, configure, and troubleshoot ClawForge from docs alone
- Phase 47 documentation work complete; remaining plans (if any) in Phase 47 are unblocked

---
*Phase: 47-commercial-launch-hardening*
*Completed: 2026-03-18*
