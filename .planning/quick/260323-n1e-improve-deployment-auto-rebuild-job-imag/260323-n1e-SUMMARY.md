---
phase: quick
plan: 260323-n1e
subsystem: deployment-ci
tags: [ci, docker, github-actions, next.js, slack, health-check]
dependency_graph:
  requires: []
  provides:
    - auto-rebuild of job Docker image on path changes
    - HTTP health verification in event handler deploy
    - Slack alerting on unhealthy post-deploy containers
    - unique Next.js build ID per deploy for cache busting
  affects:
    - .github/workflows/rebuild-job-image.yml
    - .github/workflows/rebuild-event-handler.yml
    - templates/next.config.mjs
tech_stack:
  added: []
  patterns:
    - docker exec for in-container HTTP health check
    - set +e guard around per-container checks
    - source .env for Slack credentials in CI
    - generateBuildId returning GITHUB_SHA or timestamp
key_files:
  created:
    - .github/workflows/rebuild-job-image.yml
  modified:
    - .github/workflows/rebuild-event-handler.yml
    - templates/next.config.mjs
decisions:
  - "docker exec curl to localhost:80/api/ping chosen over host-port mapping — containers expose port 80 internally, Traefik routes externally"
  - "Slack notification non-fatal when vars missing — mirrors alerts.js pattern"
  - "set +e before container loop, set -e after — prevents premature exit on individual check failure"
  - "generateBuildId returns string (not async) — Next.js config requirement"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_changed: 3
---

# Quick Task 260323-n1e: Improve Deployment — Auto-Rebuild Job Image

**One-liner:** Added CI workflow for automatic job Docker image rebuild on dockerfile changes, enhanced health check with in-container HTTP verification and Slack alerting on failure, and added GITHUB_SHA-based generateBuildId to prevent stale-client Server Action mismatches.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create job image rebuild workflow and add generateBuildId | ff90ace | .github/workflows/rebuild-job-image.yml, templates/next.config.mjs |
| 2 | Enhance health check with HTTP verification and Slack notification | 7b4f0cf | .github/workflows/rebuild-event-handler.yml |

## What Was Built

### Task 1: Job Image Rebuild Workflow + generateBuildId

**New file:** `.github/workflows/rebuild-job-image.yml`
- Triggers on push to `main` when `docker/job/**` or `templates/docker/job/**` paths change
- Also available as `workflow_dispatch` for manual rebuilds
- Concurrency group `job-image-build` (separate from `event-handler-deploy`) with `cancel-in-progress: false`
- Runs on `[self-hosted, clawforge]`, 15-minute timeout
- Steps: checkout → `docker build -t scalingengine/clawforge:job-latest ./docker/job/` → verify image exists via `docker image inspect` → print image ID + timestamp summary

**Updated:** `templates/next.config.mjs`
- Added `generateBuildId: () => process.env.GITHUB_SHA || \`build-${Date.now()}\``
- Each CI deploy gets a unique build ID (GITHUB_SHA); local dev gets a timestamp fallback
- Prevents stale-client Server Action ID mismatches after deploys

### Task 2: Enhanced Health Check

**Updated:** `.github/workflows/rebuild-event-handler.yml` — health check step now:
1. Waits 15 seconds (unchanged)
2. For each container (clawforge-noah, clawforge-ses):
   - Docker health status via `docker inspect` (existing behavior preserved)
   - HTTP check: `docker exec $CONTAINER curl -sf http://localhost:80/api/ping` (in-container, not host port)
3. `set +e` guards the loop — individual check failures don't abort early
4. On `FAILED=1`: sources `.env` from the project dir, checks for `SLACK_BOT_TOKEN` + `SLACK_OPERATOR_CHANNEL`, sends `chat.postMessage` alert, then `exit 1`
5. If Slack vars missing: prints warning (non-fatal) and still exits 1

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `rebuild-job-image.yml` triggers on `docker/job/**` and `templates/docker/job/**` only — no conflict with event handler workflow
- `rebuild-event-handler.yml` still ignores `docker/job/**` and `templates/docker/**` — workflows don't overlap
- Health check uses `docker exec` to curl inside containers (not host-level port mapping)
- Slack notification skips gracefully when env vars missing
- `generateBuildId` returns a string (sync function returning GITHUB_SHA or timestamp)
- All YAML files are syntactically valid

## Self-Check

- [x] `.github/workflows/rebuild-job-image.yml` — created
- [x] `.github/workflows/rebuild-event-handler.yml` — updated
- [x] `templates/next.config.mjs` — updated
- [x] Commit ff90ace — Task 1
- [x] Commit 7b4f0cf — Task 2
