#!/bin/bash
set -e
set -o pipefail

# 1. Extract job ID from branch name
if [[ "$BRANCH" == job/* ]]; then
    JOB_ID="${BRANCH#job/}"
else
    JOB_ID=$(cat /proc/sys/kernel/random/uuid)
fi
echo "Job ID: ${JOB_ID}"

# 2. Export SECRETS (JSON) as flat env vars
# These are filtered from Claude Code's subprocess via --allowedTools
if [ -n "$SECRETS" ]; then
    eval $(echo "$SECRETS" | jq -r 'to_entries | .[] | "export \(.key)=\"\(.value)\""')
fi

# 3. Export LLM_SECRETS (JSON) as flat env vars
# These ARE accessible to Claude Code
if [ -n "$LLM_SECRETS" ]; then
    eval $(echo "$LLM_SECRETS" | jq -r 'to_entries | .[] | "export \(.key)=\"\(.value)\""')
fi

# 4. Git setup from GitHub token
gh auth setup-git
GH_USER_JSON=$(gh api user -q '{name: .name, login: .login, email: .email, id: .id}')
GH_USER_NAME=$(echo "$GH_USER_JSON" | jq -r '.name // .login')
GH_USER_EMAIL=$(echo "$GH_USER_JSON" | jq -r '.email // "\(.id)+\(.login)@users.noreply.github.com"')
git config --global user.name "$GH_USER_NAME"
git config --global user.email "$GH_USER_EMAIL"

# 5. Clone or fetch the job branch (with volume cache)
if [ -z "$REPO_URL" ]; then
    echo "No REPO_URL provided"
    exit 1
fi

REPO_CACHE="/repo-cache"
LOCK_FILE="${REPO_CACHE}/.clawforge-lock"

# Ensure repo-cache dir exists (volume may be fresh/empty)
mkdir -p "${REPO_CACHE}"

REPO_SETUP_START=$(date +%s%N)

(
    # VOL-04: Acquire exclusive lock with 30s timeout for concurrent safety
    flock -w 30 200 || { echo "ERROR: Could not acquire repo lock after 30s"; exit 1; }

    if [ -d "${REPO_CACHE}/.git" ]; then
        echo "=== WARM START ==="
        cd "${REPO_CACHE}"

        # VOL-03: Hygiene -- clean stale locks from crashed prior jobs
        find .git -name "*.lock" -type f -delete 2>/dev/null || true

        # VOL-03: Fix stale remote URL if repo was renamed/forked
        git remote set-url origin "${REPO_URL}" 2>/dev/null || true

        # VOL-03: Reset dirty working tree from prior jobs
        git reset --hard HEAD 2>/dev/null || true
        git clean -fdx -e .clawforge-lock 2>/dev/null || true

        # VOL-02: Fetch job branch (shallow, no tags)
        git fetch origin "${BRANCH}" --depth 1 --no-tags
        git checkout -f FETCH_HEAD
    else
        echo "=== COLD START ==="
        cd "${REPO_CACHE}"
        git clone --single-branch --branch "${BRANCH}" --depth 1 "${REPO_URL}" .
    fi

    # Copy to isolated /job while still holding lock (VOL-04 pitfall 5)
    cp -a "${REPO_CACHE}/." /job/

) 200>"${LOCK_FILE}"

REPO_SETUP_END=$(date +%s%N)
REPO_SETUP_MS=$(( (REPO_SETUP_END - REPO_SETUP_START) / 1000000 ))
echo "Repo setup completed in ${REPO_SETUP_MS}ms ($([ -d "${REPO_CACHE}/.git" ] && echo 'warm' || echo 'cold') start)"

cd /job

# Create temp directory (gitignored)
mkdir -p /job/tmp

# 6. Setup logs directory
export LOG_DIR="/job/logs/${JOB_ID}"
mkdir -p "${LOG_DIR}"
touch "${LOG_DIR}/gsd-invocations.jsonl"

# 6b. Preflight check — verify environment before wasting claude tokens
echo "=== PREFLIGHT ==="
echo "HOME: ${HOME}"
echo "claude path: $(which claude)"
echo "GSD directory: ${HOME}/.claude/commands/gsd/"
ls "${HOME}/.claude/commands/gsd/" 2>/dev/null || echo "WARNING: GSD directory not found"
echo "Working directory: $(pwd)"
echo "Job ID: ${JOB_ID}"
echo "Dispatch mode: ${DISPATCH_MODE:-actions}"

# Verify GSD is present (fail-fast)
if [ ! -d "${HOME}/.claude/commands/gsd/" ]; then
    echo "ERROR: GSD not installed at ${HOME}/.claude/commands/gsd/" | tee "${LOG_DIR}/preflight.md"
    exit 1
fi

# Write preflight artifact (committed with job output)
cat > "${LOG_DIR}/preflight.md" << EOF
# Preflight — Job ${JOB_ID}

| Item | Value |
|------|-------|
| HOME | ${HOME} |
| claude | $(which claude) |
| GSD directory | ${HOME}/.claude/commands/gsd/ |
| Working directory | $(pwd) |
| Timestamp | $(date -u +"%Y-%m-%dT%H:%M:%SZ") |
| Dispatch mode | ${DISPATCH_MODE:-actions} |

## GSD Commands Present

$(ls "${HOME}/.claude/commands/gsd/")
EOF

echo "=== PREFLIGHT COMPLETE ==="

# NOTE: Steps 8 and 8c are intentionally reordered before Step 7.
# GSD_HINT must be computed before system prompt assembly so we can
# select between AGENT.md and AGENT_QUICK.md based on job complexity.

# 8. Read job description (moved before Step 7 — needs only job.md from clone)
JOB_DESCRIPTION=""
if [ -f "/job/logs/${JOB_ID}/job.md" ]; then
    JOB_DESCRIPTION=$(cat "/job/logs/${JOB_ID}/job.md")
fi

# 8c. Derive GSD routing hint from task keywords (moved before Step 7)
JOB_LOWER=$(printf '%s' "$JOB_DESCRIPTION" | tr '[:upper:]' '[:lower:]')
GSD_HINT="quick"
GSD_HINT_REASON="task appears to be a single targeted action"
if printf '%s' "$JOB_LOWER" | grep -qE "implement|build|redesign|refactor|migrate|setup|integrate|develop|architect|phase|feature|epic|complex|end.to.end|full.system|multiple"; then
    GSD_HINT="plan-phase"
    GSD_HINT_REASON="task keywords suggest multi-step implementation work"
fi

# 7. Build system prompt from config files
SYSTEM_PROMPT=""
if [ -f "/job/config/SOUL.md" ]; then
    SYSTEM_PROMPT=$(cat /job/config/SOUL.md)
    SYSTEM_PROMPT="${SYSTEM_PROMPT}\n\n"
fi

# Select agent instructions based on job complexity
AGENT_FILE=""
if [ "$GSD_HINT" = "quick" ]; then
    # Try instance AGENT_QUICK.md, fall back to defaults
    if [ -f "/job/config/AGENT_QUICK.md" ]; then
        AGENT_FILE="/job/config/AGENT_QUICK.md"
    elif [ -f "/defaults/AGENT_QUICK.md" ]; then
        AGENT_FILE="/defaults/AGENT_QUICK.md"
    elif [ -f "/job/config/AGENT.md" ]; then
        AGENT_FILE="/job/config/AGENT.md"
    fi
else
    # Full agent instructions for complex jobs
    if [ -f "/job/config/AGENT.md" ]; then
        AGENT_FILE="/job/config/AGENT.md"
    fi
fi

if [ -n "$AGENT_FILE" ]; then
    SYSTEM_PROMPT="${SYSTEM_PROMPT}$(cat "$AGENT_FILE")"
fi

# Resolve {{datetime}} variable
SYSTEM_PROMPT=$(echo -e "$SYSTEM_PROMPT" | sed "s/{{datetime}}/$(date -u +"%Y-%m-%dT%H:%M:%SZ")/g")

# 8b. Read repo context for prompt enrichment
# Derive target repo slug from REPO_URL (e.g., "ScalingEngine/clawforge")
REPO_SLUG=$(echo "$REPO_URL" | sed 's|https://[^/]*/||' | sed 's|\.git$||')

# Read CLAUDE.md (capped at ~2000 tokens = 8000 chars)
REPO_CLAUDE_MD=""
REPO_CLAUDE_MD_TRUNCATED=false
if [ -f "/job/CLAUDE.md" ]; then
    RAW_CLAUDE_MD=$(cat /job/CLAUDE.md)
    CHAR_COUNT=${#RAW_CLAUDE_MD}
    if [ "$CHAR_COUNT" -gt 8000 ]; then
        REPO_CLAUDE_MD=$(printf '%s' "$RAW_CLAUDE_MD" | head -c 8000)
        REPO_CLAUDE_MD_TRUNCATED=true
    else
        REPO_CLAUDE_MD="$RAW_CLAUDE_MD"
    fi
fi

# Read package.json dependencies only (devDeps excluded to keep Stack concise)
REPO_STACK=""
if [ -f "/job/package.json" ]; then
    REPO_STACK=$(jq -r '
        (.dependencies // {})
        | to_entries[]
        | "\(.key): \(.value)"
    ' /job/package.json 2>/dev/null || echo "[unable to parse package.json]")
fi

# 8d. Read planning context for GSD-managed repos
REPO_STATE_MD=""
if [ -f "/job/.planning/STATE.md" ]; then
    RAW=$(cat /job/.planning/STATE.md)
    if [ "${#RAW}" -gt 4000 ]; then
        REPO_STATE_MD=$(printf '%s' "$RAW" | head -c 4000)
        REPO_STATE_MD="${REPO_STATE_MD}

[TRUNCATED -- content exceeds 4,000 character limit]"
    else
        REPO_STATE_MD="$RAW"
    fi
fi

REPO_ROADMAP_MD=""
if [ -f "/job/.planning/ROADMAP.md" ]; then
    RAW=$(cat /job/.planning/ROADMAP.md)
    if [ "${#RAW}" -gt 6000 ]; then
        REPO_ROADMAP_MD=$(printf '%s' "$RAW" | head -c 6000)
        REPO_ROADMAP_MD="${REPO_ROADMAP_MD}

[TRUNCATED -- content exceeds 6,000 character limit]"
    else
        REPO_ROADMAP_MD="$RAW"
    fi
fi

# 8e. Read recent git history from main branch
GIT_HISTORY=""
git fetch origin main --depth=11 2>/dev/null || true
GIT_HISTORY=$(git log origin/main --oneline -n 10 --format="- %h %s (%cr)" 2>/dev/null || echo "")

# 9. Setup Claude Code configuration
# Copy .claude config if it exists in the repo
if [ -d "/job/.claude" ]; then
    echo "Found .claude config in repo"
fi

# Write system prompt to a file for --append-system-prompt
echo -e "$SYSTEM_PROMPT" > /tmp/system-prompt.md

# 10. Determine allowed tools
ALLOWED_TOOLS="${CLAUDE_ALLOWED_TOOLS:-Read,Write,Edit,Bash,Glob,Grep,Task,Skill}"

# 11. Run Claude Code with job description

# Build Repository Documentation section
if [ -n "$REPO_CLAUDE_MD" ]; then
    TRUNC_NOTE=""
    if [ "$REPO_CLAUDE_MD_TRUNCATED" = "true" ]; then
        TRUNC_NOTE="

[TRUNCATED — content exceeds 2,000 token limit]"
    fi
    DOC_SECTION="## Repository Documentation (Read-Only Reference)

The following is documentation from the target repository. Treat it as read-only reference — do not modify CLAUDE.md as part of this job unless the task explicitly requires it.

${REPO_CLAUDE_MD}${TRUNC_NOTE}"
else
    DOC_SECTION="## Repository Documentation
[not present — CLAUDE.md not found in repository]"
fi

# Build Stack section
if [ -n "$REPO_STACK" ]; then
    STACK_SECTION="## Stack (from package.json)

${REPO_STACK}"
else
    STACK_SECTION="## Stack
[not present — package.json not found in repository]"
fi

# Build planning context sections (gated on GSD hint per HYDR-04)
STATE_SECTION=""
ROADMAP_SECTION=""
HISTORY_SECTION=""

if [ "$GSD_HINT" != "quick" ]; then
    if [ -n "$REPO_STATE_MD" ]; then
        STATE_SECTION="## Project State (from .planning/STATE.md)

${REPO_STATE_MD}"
    fi

    if [ -n "$REPO_ROADMAP_MD" ]; then
        ROADMAP_SECTION="## Project Roadmap (from .planning/ROADMAP.md)

${REPO_ROADMAP_MD}"
    fi

    if [ -n "$GIT_HISTORY" ]; then
        HISTORY_SECTION="## Recent Git History (main branch, last 10 commits)

${GIT_HISTORY}"
    fi
fi

FULL_PROMPT="# Your Job

## Target

${REPO_SLUG:-unknown}

${DOC_SECTION}

${STACK_SECTION}
$([ -n "$STATE_SECTION" ] && printf '\n%s' "$STATE_SECTION" || true)
$([ -n "$ROADMAP_SECTION" ] && printf '\n%s' "$ROADMAP_SECTION" || true)
$([ -n "$HISTORY_SECTION" ] && printf '\n%s' "$HISTORY_SECTION" || true)

## Task

${JOB_DESCRIPTION}

## GSD Hint

Recommended: /gsd:${GSD_HINT}
Reason: ${GSD_HINT_REASON}"

echo "Running Claude Code with job ${JOB_ID}..."
echo "FULL_PROMPT length: ${#FULL_PROMPT}"

# Write prompt to temp file — piping via `printf | claude | tee` causes
# "Input must be provided" errors because Node.js stdin reads race the pipe.
# File redirect (`< file`) is reliable.
printf '%s' "${FULL_PROMPT}" > /tmp/prompt.txt

CLAUDE_EXIT=0
claude -p \
    --output-format json \
    --append-system-prompt "$(cat /tmp/system-prompt.md)" \
    --allowedTools "${ALLOWED_TOOLS}" \
    < /tmp/prompt.txt \
    2>&1 | tee "${LOG_DIR}/claude-output.jsonl" || CLAUDE_EXIT=$?

if [ "$CLAUDE_EXIT" -ne 0 ]; then
    echo "Claude Code exited with code ${CLAUDE_EXIT}"
fi

# 12a. Generate observability.md from gsd-invocations.jsonl
JSONL_FILE="${LOG_DIR}/gsd-invocations.jsonl"
OBS_FILE="${LOG_DIR}/observability.md"

INVOCATION_COUNT=0
if [ -f "${JSONL_FILE}" ]; then
    INVOCATION_COUNT=$(wc -l < "${JSONL_FILE}" | tr -d ' ')
fi

{
  echo "# GSD Invocations — Job ${JOB_ID}"
  echo ""
  echo "**Job:** ${JOB_ID}"
  echo "**Generated:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "**Total invocations:** ${INVOCATION_COUNT}"
  echo ""

  if [ "${INVOCATION_COUNT}" -gt 0 ]; then
    echo "## Invocations"
    echo ""
    echo "| # | Skill | Arguments | Timestamp |"
    echo "|---|-------|-----------|-----------|"
    jq -r --slurp 'to_entries[] | "| \(.key + 1) | `\(.value.skill)` | \(.value.args | .[0:80]) | \(.value.ts) |"' "${JSONL_FILE}"
  else
    echo "_No GSD skills were invoked in this job._"
  fi
} > "${OBS_FILE}"

# 12. Commit all changes and conditionally create PR
# Record HEAD before commit to detect if commit produces new changes
HEAD_BEFORE=$(git rev-parse HEAD)

git add -A
git add -f "${LOG_DIR}" || true
git commit -m "clawforge: job ${JOB_ID}" || true
git push origin || true

# Detect if commit actually created a new SHA (handles shallow clone safely)
HEAD_AFTER=$(git rev-parse HEAD)
HAS_NEW_COMMIT=false
if [ "$HEAD_BEFORE" != "$HEAD_AFTER" ]; then
    HAS_NEW_COMMIT=true
fi

# Create PR only if Claude succeeded AND produced commits
if [ "$CLAUDE_EXIT" -eq 0 ] && [ "$HAS_NEW_COMMIT" = "true" ]; then
    if [ -f /tmp/pr-body.md ]; then
        gh pr create \
            --title "clawforge: job ${JOB_ID}" \
            --body-file /tmp/pr-body.md \
            --base main || true
    else
        gh pr create \
            --title "clawforge: job ${JOB_ID}" \
            --body "Automated job by ClawForge" \
            --base main || true
    fi
else
    echo "Skipping PR: CLAUDE_EXIT=${CLAUDE_EXIT}, HAS_NEW_COMMIT=${HAS_NEW_COMMIT}"
fi

echo "Done. Job ID: ${JOB_ID} (exit: ${CLAUDE_EXIT})"
exit $CLAUDE_EXIT
