#!/bin/bash
set -e

# Git setup via gh auth (shared logic with job entrypoint, duplicated intentionally per research recommendation)
if [ -n "$GH_TOKEN" ]; then
  echo "$GH_TOKEN" | gh auth login --with-token
  gh auth setup-git
fi

GH_USER_JSON=$(gh api user -q '{name: .name, login: .login, email: .email, id: .id}' 2>/dev/null || echo '{}')
GH_USER_NAME=$(echo "$GH_USER_JSON" | jq -r '.name // .login // "ClawForge"')
GH_USER_EMAIL=$(echo "$GH_USER_JSON" | jq -r '.email // "clawforge@noreply.github.com"')
git config --global user.name "$GH_USER_NAME"
git config --global user.email "$GH_USER_EMAIL"

# Clone or update repo in /workspace
if [ -d "/workspace/.git" ]; then
  cd /workspace
  git remote set-url origin "$REPO_URL" 2>/dev/null || true
  git fetch origin
else
  cd /workspace
  git clone "$REPO_URL" .
fi

# Create and checkout feature branch
if [ -n "$FEATURE_BRANCH" ]; then
  git checkout "$FEATURE_BRANCH" 2>/dev/null || \
    git checkout -b "$FEATURE_BRANCH" origin/main
  git push -u origin "$FEATURE_BRANCH" 2>/dev/null || true
fi

# Signal readiness
touch /tmp/.workspace-ready

# Start ttyd with tmux (PID 1, long-running)
# -W enables writable mode, --ping-interval keeps WebSocket alive
exec ttyd -W -p 7681 --ping-interval 30 tmux new -A -s workspace
