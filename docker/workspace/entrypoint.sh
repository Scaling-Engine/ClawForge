#!/bin/bash
# ClawForge Workspace Entrypoint
# NEVER exits early — ttyd MUST start so users can debug.

ERRORS=""

# ── Git setup ─────────────────────────────────────────────────────────
if [ -n "$GH_TOKEN" ]; then
  echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || ERRORS="${ERRORS}gh-auth "
  gh auth setup-git 2>/dev/null || true
fi

GH_USER_JSON=$(gh api user -q '{name: .name, login: .login, email: .email, id: .id}' 2>/dev/null || echo '{}')
GH_USER_NAME=$(echo "$GH_USER_JSON" | jq -r '.name // .login // "ClawForge"')
GH_USER_EMAIL=$(echo "$GH_USER_JSON" | jq -r '.email // "clawforge@noreply.github.com"')
git config --global user.name "$GH_USER_NAME"
git config --global user.email "$GH_USER_EMAIL"

cd /workspace

# ── Clone or update repo ──────────────────────────────────────────────
if [ -n "$REPO_URL" ]; then
  if [ ! -d ".git" ]; then
    echo "[entrypoint] cloning $REPO_URL..."
    git clone --branch "${BRANCH:-main}" "$REPO_URL" . 2>&1 || ERRORS="${ERRORS}clone "
  else
    git remote set-url origin "$REPO_URL" 2>/dev/null || true
    git fetch origin 2>/dev/null || ERRORS="${ERRORS}fetch "
  fi

  if [ -n "$FEATURE_BRANCH" ] && [ -d ".git" ]; then
    if git ls-remote --heads origin "$FEATURE_BRANCH" 2>/dev/null | grep -q .; then
      git checkout -B "$FEATURE_BRANCH" "origin/$FEATURE_BRANCH" 2>/dev/null || true
    else
      git checkout -b "$FEATURE_BRANCH" 2>/dev/null || true
      git push -u origin "$FEATURE_BRANCH" 2>/dev/null || true
    fi
  fi
fi

# ── Chat context ──────────────────────────────────────────────────────
if [ -n "$CHAT_CONTEXT" ]; then
  mkdir -p .claude
  printf 'Previous conversation context:\n\n%s\n' "$CHAT_CONTEXT" > .claude/chat-context.txt
fi

# ── Claude Code auth ──────────────────────────────────────────────────
if [ -n "$AGENT_LLM_CLAUDE_CODE_OAUTH_TOKEN" ]; then
  unset ANTHROPIC_API_KEY
  export CLAUDE_CODE_OAUTH_TOKEN="$AGENT_LLM_CLAUDE_CODE_OAUTH_TOKEN"
elif [ -n "$AGENT_LLM_ANTHROPIC_API_KEY" ]; then
  export ANTHROPIC_API_KEY="$AGENT_LLM_ANTHROPIC_API_KEY"
fi

# ── Claude Code settings ─────────────────────────────────────────────
mkdir -p /root/.claude
cat > /root/.claude/settings.json << 'EOF'
{
  "theme": "dark",
  "hasTrustDialogAccepted": true,
  "skipDangerousModePermissionPrompt": true
}
EOF

cat > /root/.claude.json << ENDJSON
{
  "hasCompletedOnboarding": true,
  "projects": {
    "/workspace": {
      "allowedTools": ["WebSearch"],
      "hasTrustDialogAccepted": true,
      "hasTrustDialogHooksAccepted": true
    }
  }
}
ENDJSON

touch /tmp/.workspace-ready

[ -n "$ERRORS" ] && echo "[entrypoint] warnings: $ERRORS"

# ── Launch ────────────────────────────────────────────────────────────
if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ] || [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "[entrypoint] launching Claude Code..."
  tmux -u new-session -d -s claude "cd /workspace && claude --dangerously-skip-permissions"
  sleep 1
  if tmux has-session -t claude 2>/dev/null; then
    exec ttyd --writable -p "${PORT:-7681}" --ping-interval 30 tmux attach -t claude
  fi
fi

echo "[entrypoint] falling back to bash shell"
exec ttyd --writable -p "${PORT:-7681}" --ping-interval 30 tmux new -A -s workspace
