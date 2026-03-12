---
phase: 28-multi-agent-clusters
plan: 02
subsystem: infra
tags: [docker, bash, claude-code-cli, cluster, entrypoint]

# Dependency graph
requires:
  - phase: 28-multi-agent-clusters
    provides: cluster architecture research and design decisions
provides:
  - Cluster agent Docker entrypoint script with role prompt injection and inbox/outbox model
affects:
  - 28-03-coordinator (reads this entrypoint contract for env var dispatch)
  - 28-04-agent-dockerfile (uses this entrypoint as CMD)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "base64-encoded system prompts passed via env var (ROLE_SYSTEM_PROMPT_B64) to avoid quoting issues"
    - "INITIAL_PROMPT env var for seeding first agent in cluster with task context"
    - "label.txt default fallback: coordinator can trust label always exists post-run"

key-files:
  created:
    - templates/docker/cluster-agent/entrypoint.sh
  modified: []

key-decisions:
  - "label.txt default 'complete' written by entrypoint if agent doesn't write it — coordinator never needs null-check"
  - "ALLOWED_TOOLS env var required (no default) — forces explicit whitelist, blocks accidental dangerously-skip-permissions usage"
  - "Cluster agent uses simple git clone (no volume cache) — clusters are ephemeral and per-run, warm-start cache adds complexity for no benefit"
  - "INITIAL_PROMPT env var gates task injection section — clean separation between system prompt and task content"

patterns-established:
  - "Cluster entrypoint pattern: inbox/outbox/reports dirs first, then clone, then secrets, then prompt assembly, then claude -p"
  - "MCP config written to /tmp/mcp-config.json with --strict-mcp-config flag (same as job entrypoint)"

requirements-completed: [CLST-03, CLST-11]

# Metrics
duration: 2min
completed: 2026-03-12
---

# Phase 28 Plan 02: Cluster Agent Entrypoint Summary

**Bash entrypoint for cluster agent containers: role system prompt via base64 env var, inbox/outbox/reports directories, label.txt fallback, and explicit --allowedTools whitelist with no --dangerously-skip-permissions path**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-12T18:20:07Z
- **Completed:** 2026-03-12T18:21:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `templates/docker/cluster-agent/entrypoint.sh` (154 lines, executable)
- Role system prompt injected via `ROLE_SYSTEM_PROMPT_B64` base64 decode — avoids shell quoting issues with arbitrary prompt content
- Inbox/outbox/reports directories created unconditionally before clone — coordinator can write files before container starts
- Default label `complete` written to `$OUTBOX_DIR/label.txt` if agent exits without writing one — coordinator always has a label to read

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cluster agent entrypoint script** - `b7ba07a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `templates/docker/cluster-agent/entrypoint.sh` - Cluster agent Docker entrypoint (role prompt injection, inbox/outbox, label fallback, MCP config wiring)

## Decisions Made

- **No volume cache for cluster agents:** Job entrypoint uses a warm-start repo cache with flock for concurrent safety. Cluster agents are ephemeral and per-run; simple `git clone` is sufficient and reduces complexity.
- **ALLOWED_TOOLS required, no default:** Forces coordinator to be explicit about tool whitelist. No silent fallback that could allow too-broad permissions.
- **INITIAL_PROMPT env var for first agent task injection:** Clean separation between the role system prompt (who you are) and the task (what to do now). Coordinator sets INITIAL_PROMPT only for the entry-point agent.
- **label.txt fallback in entrypoint (not coordinator):** Entrypoint owns the label contract — coordinator can assume label.txt always exists after container exit.

## Deviations from Plan

One minor deviation caught during verification:

**1. [Rule 1 - Bug] Removed dangerously-skip-permissions from error message string**
- **Found during:** Task 1 verification
- **Issue:** Grep check for absence of `dangerously-skip-permissions` failed because the string appeared in an echo error message ("never use --dangerously-skip-permissions"), not as an actual CLI flag
- **Fix:** Rewrote the error message to not include the literal flag text
- **Files modified:** templates/docker/cluster-agent/entrypoint.sh
- **Verification:** All 6 grep checks pass including absence check
- **Committed in:** b7ba07a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in error message text)
**Impact on plan:** Minor wording fix only. No functional change.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Cluster agent entrypoint contract is defined and committed
- Plan 03 (coordinator.js) can now reference the env vars this entrypoint expects: ROLE_NAME, INBOX_DIR, OUTBOX_DIR, CLUSTER_RUN_ID, ROLE_SYSTEM_PROMPT_B64, ALLOWED_TOOLS, MCP_CONFIG_JSON, REPO_URL, BRANCH, SECRETS, LLM_SECRETS, INITIAL_PROMPT
- Plan 04 (cluster-agent Dockerfile) can use this as the CMD/ENTRYPOINT

---
*Phase: 28-multi-agent-clusters*
*Completed: 2026-03-12*
