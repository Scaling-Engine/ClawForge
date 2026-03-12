#!/bin/bash
set -e
set -o pipefail

# Cluster Agent Entrypoint
# Differs from job entrypoint: uses role system prompt + inbox/outbox model,
# no GSD hint routing, no job.md reading.

# 1. Environment variables (with defaults)
ROLE_NAME="${ROLE_NAME:-unknown}"
INBOX_DIR="${INBOX_DIR:-/workspace/inbox}"
OUTBOX_DIR="${OUTBOX_DIR:-/workspace/outbox}"
CLUSTER_RUN_ID="${CLUSTER_RUN_ID:-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "unknown")}"

echo "=== Cluster Agent ==="
echo "Role: ${ROLE_NAME}"
echo "Cluster Run ID: ${CLUSTER_RUN_ID}"
echo "Inbox: ${INBOX_DIR}"
echo "Outbox: ${OUTBOX_DIR}"

# 2. Create inbox/outbox directories
mkdir -p "$INBOX_DIR" "$OUTBOX_DIR" "$OUTBOX_DIR/reports"
echo "Directories created: inbox, outbox, outbox/reports"

# 3. Export SECRETS (JSON) as flat env vars
# These are filtered from Claude Code's subprocess via --allowedTools
if [ -n "$SECRETS" ]; then
    eval $(echo "$SECRETS" | jq -r 'to_entries | .[] | "export \(.key)=\"\(.value)\""')
fi

# 4. Export LLM_SECRETS (JSON) as flat env vars
# These ARE accessible to Claude Code
if [ -n "$LLM_SECRETS" ]; then
    eval $(echo "$LLM_SECRETS" | jq -r 'to_entries | .[] | "export \(.key)=\"\(.value)\""')
fi

# 5. Git setup from GitHub token
gh auth setup-git
GH_USER_JSON=$(gh api user -q '{name: .name, login: .login, email: .email, id: .id}')
GH_USER_NAME=$(echo "$GH_USER_JSON" | jq -r '.name // .login')
GH_USER_EMAIL=$(echo "$GH_USER_JSON" | jq -r '.email // "\(.id)+\(.login)@users.noreply.github.com"')
git config --global user.name "$GH_USER_NAME"
git config --global user.email "$GH_USER_EMAIL"

# 6. Clone repository
if [ -z "$REPO_URL" ]; then
    echo "ERROR: REPO_URL is required"
    exit 1
fi
if [ -z "$BRANCH" ]; then
    echo "ERROR: BRANCH is required"
    exit 1
fi

echo "=== Cloning repository ==="
mkdir -p /workspace/repo
git clone --single-branch --branch "${BRANCH}" --depth 1 "${REPO_URL}" /workspace/repo
cd /workspace/repo
echo "Repository cloned into /workspace/repo"

# 7. Decode role system prompt from base64
if [ -z "$ROLE_SYSTEM_PROMPT_B64" ]; then
    echo "ERROR: ROLE_SYSTEM_PROMPT_B64 is required"
    exit 1
fi
ROLE_PROMPT=$(echo "$ROLE_SYSTEM_PROMPT_B64" | base64 -d)
echo "Role system prompt decoded (${#ROLE_PROMPT} chars)"

# 8. MCP config injection
MCP_FLAGS=""
if [ -n "$MCP_CONFIG_JSON" ]; then
    echo "$MCP_CONFIG_JSON" > /tmp/mcp-config.json
    MCP_FLAGS="--mcp-config /tmp/mcp-config.json --strict-mcp-config"
    echo "[mcp] Config written to /tmp/mcp-config.json"
fi

# 9. Build --allowedTools argument
# ALLOWED_TOOLS env var is comma-separated; pass as-is to --allowedTools
if [ -z "$ALLOWED_TOOLS" ]; then
    echo "ERROR: ALLOWED_TOOLS must be set. Cluster agents require an explicit tool whitelist."
    exit 1
fi

# 10. Build full prompt: role prompt + inbox/outbox instructions + initial prompt
INITIAL_PROMPT="${INITIAL_PROMPT:-}"

FULL_PROMPT="${ROLE_PROMPT}

---

## Cluster Context

**Role:** ${ROLE_NAME}
**Cluster Run ID:** ${CLUSTER_RUN_ID}
**Inbox directory:** ${INBOX_DIR}
**Outbox directory:** ${OUTBOX_DIR}
**Reports directory:** ${OUTBOX_DIR}/reports

Read your inputs from files in \`${INBOX_DIR}/\`.
Write your outputs (artifacts, data, reports) to files in \`${OUTBOX_DIR}/\`.
Write structured reports as markdown files to \`${OUTBOX_DIR}/reports/\`.

Before you exit, write a transition label to \`${OUTBOX_DIR}/label.txt\`.
The label must be a single word or short identifier from your role's defined transition labels.
If you do not write a label, the default label \"complete\" will be used."

if [ -n "$INITIAL_PROMPT" ]; then
    FULL_PROMPT="${FULL_PROMPT}

---

## Initial Task

${INITIAL_PROMPT}"
fi

# Write prompt to temp file for reliable stdin passing
printf '%s' "${FULL_PROMPT}" > /tmp/cluster-prompt.txt
echo "Prompt written (${#FULL_PROMPT} chars)"

# 11. Run Claude Code
echo "=== Running Claude Code ==="
echo "Role: ${ROLE_NAME} | Allowed tools: ${ALLOWED_TOOLS}"

CLAUDE_EXIT=0
claude -p \
    --allowedTools "${ALLOWED_TOOLS}" \
    --output-format stream-json \
    --verbose \
    $MCP_FLAGS \
    < /tmp/cluster-prompt.txt \
    2>&1 | tee "${OUTBOX_DIR}/claude-output.jsonl" || CLAUDE_EXIT=$?

if [ "$CLAUDE_EXIT" -ne 0 ]; then
    echo "Claude Code exited with code ${CLAUDE_EXIT}"
fi

# 12. Default label.txt if agent didn't write one
if [ ! -f "${OUTBOX_DIR}/label.txt" ]; then
    echo "complete" > "${OUTBOX_DIR}/label.txt"
    echo "[cluster] label.txt not found — wrote default 'complete'"
else
    LABEL=$(cat "${OUTBOX_DIR}/label.txt")
    echo "[cluster] label.txt found: '${LABEL}'"
fi

# 13. Commit and push any changes to the branch
echo "=== Committing changes ==="
git add -A
git commit -m "cluster: ${ROLE_NAME} agent output (run ${CLUSTER_RUN_ID})" || echo "Nothing to commit"
git push origin || echo "Push failed or nothing to push"

echo "=== Done === Role: ${ROLE_NAME} | Exit: ${CLAUDE_EXIT}"
exit $CLAUDE_EXIT
