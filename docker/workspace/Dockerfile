FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# System packages
RUN apt-get update && apt-get install -y \
    tmux \
    git \
    curl \
    jq \
    procps \
    build-essential \
    locales \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Locale (needed for tmux unicode support)
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV LC_CTYPE=en_US.UTF-8

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# ttyd (web terminal)
RUN curl -fsSL -o /usr/local/bin/ttyd https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 \
    && chmod +x /usr/local/bin/ttyd

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Non-root user (matches upstream)
RUN useradd -m -s /bin/bash claude-code \
    && mkdir -p /home/claude-code/workspace \
    && chown claude-code:claude-code /home/claude-code/workspace

# Install GSD skills for Claude Code (as claude-code user)
USER claude-code
RUN npx get-shit-done-cc@latest --claude --global || true
USER root

# Verify GSD installed
RUN test -d /home/claude-code/.claude/commands/gsd/ && \
    ls /home/claude-code/.claude/commands/gsd/ | grep -q . || \
    echo "WARN: GSD install may have failed"

# tmux config
COPY .tmux.conf /home/claude-code/.tmux.conf
RUN chown claude-code:claude-code /home/claude-code/.tmux.conf

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER claude-code
WORKDIR /home/claude-code/workspace

ENV REPO_URL=""
ENV BRANCH=main
ENV PORT=7681

EXPOSE 7681

# Built by rebuild-workspace-image.yml
ENTRYPOINT ["/entrypoint.sh"]
