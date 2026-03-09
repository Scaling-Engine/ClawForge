FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y \
    git \
    jq \
    curl \
    procps \
    tmux \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install GSD skills for Claude Code
RUN npx get-shit-done-cc@latest --claude --global

# Verify GSD installed successfully (fail build if missing)
RUN test -d /root/.claude/commands/gsd/ && \
    ls /root/.claude/commands/gsd/ | grep -q . || \
    (echo "ERROR: GSD install failed — /root/.claude/commands/gsd/ missing or empty" && exit 1)

# Install ttyd 1.7.7 for web terminal access
RUN curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -o /usr/local/bin/ttyd \
    && chmod +x /usr/local/bin/ttyd

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace

EXPOSE 7681

ENTRYPOINT ["/entrypoint.sh"]
