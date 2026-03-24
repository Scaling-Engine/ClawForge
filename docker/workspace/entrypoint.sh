#!/bin/bash
set -e

# ── Git setup ─────────────────────────────────────────────────────────
if [ -n "$GH_TOKEN" ]; then
  echo "$GH_TOKEN" | gh auth login --with-token
  gh auth setup-git
fi

GH_USER_JSON=$(gh api user -q '{name: .name, login: .login, email: .email, id: .id}' 2>/dev/null || echo '{}')
GH_USER_NAME=$(echo "$GH_USER_JSON" | jq -r '.name // .login // "ClawForge"')
GH_USER_EMAIL=$(echo "$GH_USER_JSON" | jq -r '.email // "clawforge@noreply.github.com"')
git config --global user.name "$GH_USER_NAME"
git config --global user.email "$GH_USER_EMAIL"

WORKSPACE_DIR="/home/claude-code/workspace"
cd "$WORKSPACE_DIR"

# ── Clone or update repo ──────────────────────────────────────────────
if [ ! -d ".git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" .
else
  git remote set-url origin "$REPO_URL" 2>/dev/null || true
  git fetch origin
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
  git clean -fd
fi

# ── Feature branch ────────────────────────────────────────────────────
if [ -n "$FEATURE_BRANCH" ]; then
  if git ls-remote --heads origin "$FEATURE_BRANCH" | grep -q .; then
    git checkout -B "$FEATURE_BRANCH" "origin/$FEATURE_BRANCH"
  else
    git checkout -b "$FEATURE_BRANCH"
    git push -u origin "$FEATURE_BRANCH" 2>/dev/null || true
  fi
fi

# ── Chat context injection (from conversational bridge) ───────────────
if [ -n "$CHAT_CONTEXT" ]; then
  mkdir -p .claude
  cat > .claude/chat-context.txt << 'CTXHEADER'
The following is a previous planning conversation between the user and an AI assistant. The user has now switched to this interactive coding session to continue working on this task. Use this conversation as context.

CTXHEADER
  echo "$CHAT_CONTEXT" >> .claude/chat-context.txt
fi

# ── Claude Code auth ──────────────────────────────────────────────────
# Support both OAuth token (Claude Max subscription) and API key
if [ -n "$AGENT_LLM_CLAUDE_CODE_OAUTH_TOKEN" ]; then
  unset ANTHROPIC_API_KEY
  export CLAUDE_CODE_OAUTH_TOKEN="$AGENT_LLM_CLAUDE_CODE_OAUTH_TOKEN"
elif [ -n "$AGENT_LLM_ANTHROPIC_API_KEY" ]; then
  export ANTHROPIC_API_KEY="$AGENT_LLM_ANTHROPIC_API_KEY"
fi

# ── Claude Code settings ─────────────────────────────────────────────
mkdir -p ~/.claude

if [ -f "${WORKSPACE_DIR}/.claude/chat-context.txt" ]; then
  cat > ~/.claude/settings.json << SETTINGSEOF
{
  "theme": "dark",
  "hasTrustDialogAccepted": true,
  "skipDangerousModePermissionPrompt": true,
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "cat ${WORKSPACE_DIR}/.claude/chat-context.txt"
          }
        ]
      }
    ]
  }
}
SETTINGSEOF
else
  cat > ~/.claude/settings.json << 'EOF'
{
  "theme": "dark",
  "hasTrustDialogAccepted": true,
  "skipDangerousModePermissionPrompt": true
}
EOF
fi

cat > ~/.claude.json << ENDJSON
{
  "hasCompletedOnboarding": true,
  "projects": {
    "${WORKSPACE_DIR}": {
      "allowedTools": ["WebSearch"],
      "hasTrustDialogAccepted": true,
      "hasTrustDialogHooksAccepted": true
    }
  }
}
ENDJSON

# Signal readiness
touch /tmp/.workspace-ready

# ── Launch Claude Code in tmux, serve via ttyd ────────────────────────
# Claude Code runs in a tmux session; ttyd attaches to it as PID 1.
# Users see Claude Code CLI immediately, not a raw shell.
tmux -u new-session -d -s claude 'claude --dangerously-skip-permissions'

exec ttyd --writable -p "${PORT:-7681}" --ping-interval 30 tmux attach -t claude
