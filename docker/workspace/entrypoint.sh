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

# ── Claude Code settings (for both root and node user) ────────────────
for UHOME in /root /home/node; do
  mkdir -p "$UHOME/.claude"
done

cat > /root/.claude/settings.json << 'EOF'
{
  "theme": "dark",
  "hasTrustDialogAccepted": true,
  "skipDangerousModePermissionPrompt": true
}
EOF

cat > /root/.claude.json << 'ENDJSON'
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

# Copy settings to node user (for Claude Code running as non-root)
cp /root/.claude/settings.json /home/node/.claude/settings.json
cp /root/.claude.json /home/node/.claude.json
chown -R node:node /home/node/.claude /home/node/.claude.json 2>/dev/null || true

touch /tmp/.workspace-ready
[ -n "$ERRORS" ] && echo "[entrypoint] warnings: $ERRORS"

# ── Launch ────────────────────────────────────────────────────────────
# Use a SINGLE tmux session for everything. ttyd connects to it.
# If Claude Code auth is available, start it. If it exits, user lands in bash.
# If no auth, user gets bash directly.
#
# Key: `tmux new -A -s workspace` creates OR attaches. ttyd always uses this
# so reconnections work even if the initial session command exits.

if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ] || [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "[entrypoint] launching Claude Code CLI in tmux..."
  # Claude Code refuses --dangerously-skip-permissions as root.
  # Run it as the 'node' user (provided by node:22 base image).
  # Export auth env vars so they're available in the su session.
  export CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_API_KEY
  tmux -u new-session -d -s workspace \
    "cd /workspace && su -m node -c 'claude --dangerously-skip-permissions' 2>&1; echo ''; echo 'Claude Code exited. You are in a bash shell.'; exec bash"
else
  echo "[entrypoint] no Claude auth, starting bash shell in tmux..."
  tmux -u new-session -d -s workspace "cd /workspace && exec bash"
fi

# Give tmux a moment to start
sleep 1

# ttyd serves the tmux session. `new -A` means: attach if exists, create if not.
# This ensures reconnections always work even if the session was recreated.
exec ttyd --writable -p "${PORT:-7681}" --ping-interval 30 tmux new -A -s workspace
