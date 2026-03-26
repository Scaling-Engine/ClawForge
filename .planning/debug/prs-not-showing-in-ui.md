---
status: awaiting_human_verify
trigger: "prs-not-showing-in-ui — /pull-requests page shows no PRs even though GitHub has PRs created by jobs"
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:01:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — Docker named volume `noah-config`/`ses-config` mounts over `/app/config/`, hiding the REPOS.json baked into the image. The `loadAllowedRepos()` function returns [] when DB has no repos AND the file is hidden by the volume mount.
test: traced full call chain from UI → getPendingPullRequests → loadAllowedRepos → getRepos/file fallback → Docker volume architecture
expecting: fix by copying REPOS.json to /app/defaults/ (outside volume) and updating migration/fallback to read from there
next_action: implement fix in paths.js, db/repos.js, loadAllowedRepos, and both Dockerfiles

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: /pull-requests page lists PRs created by jobs with status, links, details
actual: /pull-requests page shows no PRs on both clawforge.scalingengine.com and strategyes.scalingengine.com
errors: no error messages — page just shows empty
reproduction: complete a job that creates a PR, navigate to /pull-requests
started: unknown — may never have worked or broke recently

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: GitHub API token lacking permissions
  evidence: getPendingPullRequests uses GH_TOKEN from env which has org-level access; token is per-instance and separate from job tokens
  timestamp: 2026-03-23

- hypothesis: PRs already merged so state=open returns nothing
  evidence: Noah's clawforge repo has mergePolicy=gate-required, so PRs won't auto-merge. StrategyES has mergePolicy=auto but NeuroStory doesn't. This could partially explain it but not fully.
  timestamp: 2026-03-23

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-03-23
  checked: lib/chat/components/pull-requests-page.jsx
  found: component calls getPendingPullRequests() from actions.js, catches all errors and shows empty state
  implication: any failure in the chain silently returns [] and shows "No open pull requests"

- timestamp: 2026-03-23
  checked: lib/chat/actions.js getPendingPullRequests()
  found: calls loadAllowedRepos() then queries GitHub API for each repo; ALL errors silently caught with return []
  implication: impossible to tell from UI if failure is "no repos" vs "API error" vs "zero PRs"

- timestamp: 2026-03-23
  checked: lib/tools/repos.js loadAllowedRepos()
  found: reads from DB (getDbRepos) first; falls through to config/REPOS.json if DB empty; returns [] if both fail
  implication: requires either DB to have repos OR config/REPOS.json to exist

- timestamp: 2026-03-23
  checked: lib/db/repos.js getRepos() + migrateReposFromFile()
  found: migrateReposFromFile() checks if DB row exists (any value) and skips migration if found. Reads from config/REPOS.json to populate DB.
  implication: if DB row exists with [] value, migration is permanently skipped; fallback to file still works

- timestamp: 2026-03-23
  checked: instances/noah/Dockerfile + instances/strategyES/Dockerfile
  found: REPOS.json copied to /app/config/REPOS.json in image (line 45 of both). docker-compose.yml mounts noah-config:/app/config and ses-config:/app/config as named volumes.
  implication: NAMED VOLUMES SHADOW THE IMAGE FILES. If volumes were created before REPOS.json was added to Dockerfile (commit 060292f, Feb 25), or if volume already existed, REPOS.json from the image is NOT accessible.

- timestamp: 2026-03-23
  checked: git log for Dockerfile changes
  found: REPOS.json added to Dockerfile on Feb 25 (060292f). The docker-compose and container setup existed before this. Docker named volumes, once created, are not updated from newer image builds.
  implication: HIGH CONFIDENCE — config volume doesn't have REPOS.json. DB migration reads from config/REPOS.json (hidden by volume) and never populates the DB. loadAllowedRepos() returns [] from both DB and file. getPendingPullRequests() has no repos to query.

- timestamp: 2026-03-23
  checked: lib/paths.js
  found: PROJECT_ROOT = process.cwd() = /app. All config paths under /app/config/ which is exactly where the volume is mounted.
  implication: confirms the volume shadow issue; need a path outside /app/config/ for the defaults

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: Docker named volumes `noah-config` and `ses-config` are mounted at `/app/config/`, shadowing the `REPOS.json` file baked into the Docker image. Since these volumes were likely created before REPOS.json was added to the Dockerfile (Feb 25, 2026), the file never made it into the volumes. The DB migration reads from the hidden file and finds nothing. `loadAllowedRepos()` returns [] from both DB and file fallback. `getPendingPullRequests()` has no repos to query and silently returns [].
fix: Copy REPOS.json to /app/defaults/REPOS.json (outside the config volume) in both Dockerfiles. Update migrateReposFromFile() and loadAllowedRepos() to also check /app/defaults/REPOS.json as a seed/fallback path.
verification: pending human verification in production after container rebuild+redeploy
files_changed:
  - lib/paths.js
  - lib/tools/repos.js
  - lib/db/repos.js
  - instances/noah/Dockerfile
  - instances/strategyES/Dockerfile
