---
phase: 34-github-secrets
plan: 01
subsystem: admin
tags: [github-api, secrets, sealed-box, tweetnacl, admin-panel, crud]

requires:
  - phase: 29-foundation-config
    provides: crypto.js AES-256-GCM encryption, config.js secret storage
  - phase: 33-admin-panel
    provides: admin layout, settings-secrets-page base, requireAuth pattern
provides:
  - GitHub Secrets CRUD via sealed-box encryption (lib/github-api.js)
  - GitHub Variables CRUD (lib/github-api.js)
  - 8 server actions for GitHub secrets/variables management
  - Admin UI sections for GitHub Secrets + Variables on /admin/secrets
  - deleteConfigSecret() utility in lib/db/config.js
affects: [35-github-variables, deployment, job-containers]

tech-stack:
  added: [tweetnacl, tweetnacl-sealedbox-js]
  patterns: [githubApiRaw for 204 responses, ghsec: prefix for local secret cache]

key-files:
  created: [lib/github-api.js]
  modified: [lib/chat/actions.js, lib/chat/components/settings-secrets-page.jsx, lib/db/config.js, package.json]

key-decisions:
  - "githubApiRaw helper for PUT/DELETE endpoints that return 204 No Content instead of modifying shared githubApi"
  - "Local secret cache uses ghsec: prefix in config_secret table for masked display"
  - "deleteConfigSecret added to config.js following deleteCustomProvider pattern"

patterns-established:
  - "githubApiRaw: use for GitHub API calls that may return 204 No Content (PUT/DELETE)"
  - "AGENT_ prefix enforcement: dropdown selector in UI, regex validation in server action"

requirements-completed: [GHSEC-01, GHSEC-02, GHSEC-03, GHSEC-04]

duration: 4min
completed: 2026-03-13
---

# Phase 34 Plan 01: GitHub Secrets Management Summary

**GitHub Secrets and Variables CRUD on /admin/secrets with sealed-box encryption via tweetnacl and AGENT_* prefix enforcement**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T06:51:36Z
- **Completed:** 2026-03-13T06:55:19Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Full CRUD for GitHub repo secrets with sealed-box encryption via tweetnacl-sealedbox-js
- Full CRUD for GitHub repo variables with plaintext values
- Admin UI with 3 sections (API Key + GitHub Secrets + GitHub Variables) on /admin/secrets
- AGENT_/AGENT_LLM_ prefix enforcement via dropdown with help text explaining the difference
- Local encrypted cache of secret values for masked display (last 4 chars)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps + create lib/github-api.js + add server actions** - `8c373d3` (feat)
2. **Task 2: Extend settings-secrets-page.jsx with GitHub Secrets + Variables sections** - `2409c84` (feat)

## Files Created/Modified
- `lib/github-api.js` - GitHub Secrets + Variables CRUD wrapper with sealed-box encryption (8 exports)
- `lib/chat/actions.js` - 8 new server actions for GitHub secrets/variables with requireAuth() guard
- `lib/chat/components/settings-secrets-page.jsx` - GitHubSecretsSection + GitHubVariablesSection components
- `lib/db/config.js` - Added deleteConfigSecret() for cache cleanup
- `package.json` - Added tweetnacl, tweetnacl-sealedbox-js as direct dependencies

## Decisions Made
- Used `githubApiRaw()` helper for PUT/DELETE calls that return 204 No Content, rather than modifying the shared `githubApi()` function
- Local secret cache uses `ghsec:` prefix in config_secret table (e.g., `ghsec:AGENT_MY_SECRET`)
- Added `deleteConfigSecret()` to config.js following the `deleteCustomProvider()` pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added deleteConfigSecret to lib/db/config.js**
- **Found during:** Task 1
- **Issue:** Plan mentioned using deleteConfigSecret but it did not exist in config.js
- **Fix:** Added deleteConfigSecret() following the deleteCustomProvider() pattern
- **Files modified:** lib/db/config.js
- **Verification:** Build passes, function follows existing pattern
- **Committed in:** 8c373d3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correctness -- secret cache cleanup on delete. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Existing GH_TOKEN, GH_OWNER, GH_REPO env vars are already configured.

## Next Phase Readiness
- GitHub secrets/variables management fully operational on /admin/secrets
- Ready for any phase that needs AGENT_* secret management through the admin UI

---
*Phase: 34-github-secrets*
*Completed: 2026-03-13*
