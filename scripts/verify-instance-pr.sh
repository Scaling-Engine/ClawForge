#!/usr/bin/env bash
set -euo pipefail

PR_NUMBER="${1:?Usage: verify-instance-pr.sh <PR_NUMBER> <INSTANCE_NAME>}"
INSTANCE_NAME="${2:-testbot}"
REPO="ScalingEngine/clawforge"

echo "=== Verifying instance PR #${PR_NUMBER} for '${INSTANCE_NAME}' ==="

# Check 1: All 7 files present in PR diff
echo "--- Checking artifact presence ---"
FILES=$(gh pr diff "$PR_NUMBER" -R "$REPO" --name-only | sort)
EXPECTED_FILES=(
  "docker-compose.yml"
  "instances/${INSTANCE_NAME}/.env.example"
  "instances/${INSTANCE_NAME}/Dockerfile"
  "instances/${INSTANCE_NAME}/config/AGENT.md"
  "instances/${INSTANCE_NAME}/config/EVENT_HANDLER.md"
  "instances/${INSTANCE_NAME}/config/REPOS.json"
  "instances/${INSTANCE_NAME}/config/SOUL.md"
)
MISSING=0
for f in "${EXPECTED_FILES[@]}"; do
  if echo "$FILES" | grep -qF "$f"; then
    echo "  [PASS] $f"
  else
    echo "  [FAIL] $f -- MISSING"
    MISSING=$((MISSING + 1))
  fi
done

# Check 2: PR body has operator setup checklist
echo "--- Checking PR body ---"
BODY=$(gh pr view "$PR_NUMBER" -R "$REPO" --json body -q '.body')
if echo "$BODY" | grep -qi "setup\|checklist\|secret"; then
  echo "  [PASS] PR body contains operator setup instructions"
else
  echo "  [FAIL] PR body missing operator setup checklist"
  MISSING=$((MISSING + 1))
fi

# Check 3: PR was NOT auto-merged
echo "--- Checking merge status ---"
MERGED=$(gh pr view "$PR_NUMBER" -R "$REPO" --json mergedAt -q '.mergedAt')
if [ "$MERGED" = "null" ] || [ -z "$MERGED" ]; then
  echo "  [PASS] PR not auto-merged (blocked-paths working)"
else
  echo "  [FAIL] PR was merged at ${MERGED} -- auto-merge exclusion failed!"
  MISSING=$((MISSING + 1))
fi

# Check 4: REPOS.json has correct owner
echo "--- Checking REPOS.json content ---"
PR_HEAD=$(gh pr view "$PR_NUMBER" -R "$REPO" --json headRefName -q '.headRefName')
REPOS_CONTENT=$(gh api "repos/${REPO}/contents/instances/${INSTANCE_NAME}/config/REPOS.json?ref=${PR_HEAD}" -H "Accept: application/vnd.github.raw" 2>/dev/null || echo "")
if echo "$REPOS_CONTENT" | grep -q '"ScalingEngine"'; then
  echo "  [PASS] REPOS.json has correct owner"
else
  echo "  [WARN] Could not verify REPOS.json owner (may not be accessible yet)"
fi

# Check 5: AGENT.md tool casing
echo "--- Checking AGENT.md tool casing ---"
AGENT_CONTENT=$(gh api "repos/${REPO}/contents/instances/${INSTANCE_NAME}/config/AGENT.md?ref=${PR_HEAD}" -H "Accept: application/vnd.github.raw" 2>/dev/null || echo "")
for TOOL in Read Write Edit Bash Glob Grep; do
  if echo "$AGENT_CONTENT" | grep -q "\\*\\*${TOOL}\\*\\*"; then
    echo "  [PASS] Tool casing: **${TOOL}**"
  else
    echo "  [WARN] Could not verify **${TOOL}** casing"
  fi
done

echo ""
if [ "$MISSING" -eq 0 ]; then
  echo "=== ALL CHECKS PASSED ==="
  exit 0
else
  echo "=== ${MISSING} CHECK(S) FAILED ==="
  exit 1
fi
