# Getting Started

This guide walks you through everything you need to know to set up and manage your ClawForge instance — creating agents, connecting channels, configuring repos, and running your first job.

---

## What Is ClawForge?

ClawForge is a two-layer AI agent platform. You chat with your agent (Archie, Epic, or whatever you've named it) via Slack, Telegram, or web chat. When you ask it to build something, it spins up a Docker container running Claude Code CLI, executes the task autonomously, and sends you back a pull request.

**Layer 1 — Your Conversational Agent** (always on): A Next.js app powered by a LangGraph AI agent. This is the agent you talk to. It understands your requests and dispatches jobs.

**Layer 2 — Job Containers** (spun up on demand): Docker containers that run Claude Code CLI. Each job gets its own container, executes the task, creates a PR, then shuts down.

The two layers communicate through a single text file (`job.md`) pushed to a git branch. Clean isolation, no shared state.

**Each instance is fully isolated**: its own Docker container, network, volumes, environment variables, and channel connections. The "noah" instance cannot see the "strategyES" instance.

---

## Instance Structure

Every instance lives in `instances/{name}/` and has this structure:

```
instances/{name}/
├── Dockerfile            # Builds the event handler image for this instance
├── .env.example          # Template for required environment variables
└── config/
    ├── SOUL.md           # Agent identity and personality
    ├── EVENT_HANDLER.md  # How the conversational layer behaves
    ├── AGENT.md          # How job containers behave
    ├── REPOS.json        # Allowed repositories this instance can target
    ├── AGENT_QUICK.md    # (optional) Lightweight prompt for simple jobs
    ├── MCP_SERVERS.json  # (optional) External tools for job containers
    └── CLUSTER.json      # (optional) Subagent definitions
```

| File | Purpose | Who reads it |
|------|---------|-------------|
| `SOUL.md` | Core identity — name, personality, scope | LangGraph agent (Layer 1) |
| `EVENT_HANDLER.md` | Conversational behavior — tools, job flow, approval gates | LangGraph agent (Layer 1) |
| `AGENT.md` | Job execution instructions — git behavior, GSD skills | Job container (Layer 2) |
| `REPOS.json` | Which GitHub repos this instance can target | Event handler (repo resolution) |
| `MCP_SERVERS.json` | External tools (Brave search, GitHub API) for jobs | Job container via `--mcp-config` |
| `CLUSTER.json` | Subagent pipeline definitions for complex tasks | Cluster coordinator |

---

## Creating a New Instance

### Method 1: Conversational (via Archie)

Ask Archie to create a new instance. The event handler has a `create_instance_job` tool with a guided intake flow:

1. Tell Archie you want to create a new instance
2. Archie asks for:
   - **Name** (slug, lowercase, no spaces) — e.g., `acmecorp`
   - **Purpose** — what the instance is for
   - **Allowed repos** — GitHub repo slugs it can target
   - **Channels** — slack, telegram, and/or web
   - **Slack user IDs** (if Slack enabled)
   - **Telegram chat ID** (if Telegram enabled)
3. Review and approve the job description
4. Archie dispatches a job that generates all instance files and updates `docker-compose.yml`
5. A PR is created with the full instance scaffolding

### Method 2: Manual

Copy an existing instance directory and modify:

```bash
cp -r instances/noah instances/acmecorp
```

Then edit each config file as described below.

---

## Configuring an Instance

### SOUL.md — Identity

Defines who the agent is. This is injected as system context into every conversation.

```markdown
# Your Identity

You are [Agent Name], [description of role and personality].

## Scope

- You can access: [list of repos/systems]
- You cannot access: [restrictions]

## Personality

[How the agent should communicate — formal, casual, technical, etc.]
```

**Scoped instance example (Epic for StrategyES):**
```markdown
You are Epic, the StrategyES development agent.
You help Jim and the team build StrategyES.
You can ONLY access the strategyes-lab repository.
```

**Full-access instance example (Archie for Noah):**
```markdown
You are Archie, Noah's personal AI development agent.
You have full access to all configured repositories.
```

### EVENT_HANDLER.md — Conversational Behavior

Controls how the agent behaves in conversation. Key sections to customize:

1. **Your Role** — One paragraph on what this agent does
2. **Scope Restrictions** — What repos/systems are off-limits
3. **Tools available** — Which tools the agent can use (create_job, get_job_status, etc.)
4. **Context about the target project** — Stack, conventions, patterns
5. **Job Creation Flow** — The approval gate (agent always asks before dispatching)

For a new scoped instance, copy `instances/strategyES/config/EVENT_HANDLER.md` and replace the role description, scope restriction, and project context section.

### AGENT.md — Job Container Behavior

Instructions that Claude Code reads when executing jobs. Key sections:

1. **Working directory** — Where in the container the agent operates
2. **Git behavior** — Commit conventions, branch naming
3. **GSD skills reference** — Available structured workflow commands
4. **Project-specific context** — Stack and conventions (for scoped instances)

---

## Channel Setup

### Web Chat

Included automatically at `APP_URL`. No additional configuration needed.

### Slack

Each instance needs its **own Slack app** (separate tokens and scopes).

**Required environment variables:**
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_ALLOWED_USERS=U12345,U67890     # Comma-separated user IDs
SLACK_ALLOWED_CHANNELS=C12345,C67890  # (optional) Restrict to specific channels
```

**Slack app setup:**
1. Create a new Slack app at api.slack.com
2. Enable Event Subscriptions → point to `https://{APP_URL}/api`
3. Subscribe to: `message.channels`, `message.groups`, `message.im`, `app_mention`
4. Install to workspace, copy Bot Token and Signing Secret
5. Add the bot to relevant channels

### Telegram

**Required environment variables:**
```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...          # Random string for webhook verification
TELEGRAM_ALLOWED_USERS=123456789     # Comma-separated Telegram user IDs
```

**Setup:**
```bash
npm run setup-telegram
```

This registers the webhook URL with Telegram's API.

---

## Repository Configuration

### REPOS.json

Controls which GitHub repos an instance can target. Located at `instances/{name}/config/REPOS.json`.

```json
[
  {
    "name": "ScalingEngine/strategyes-lab",
    "slug": "strategyes-lab",
    "aliases": ["ses", "strategy"],
    "dispatch": "docker",
    "description": "StrategyES — AI-powered contractor leadership OS"
  }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Full `owner/repo` GitHub path |
| `slug` | Yes | Short identifier used in commands |
| `aliases` | No | Alternative names users can type |
| `dispatch` | No | `"docker"` (default, ~9s) or `"actions"` (~60s) |
| `description` | No | Human-readable description shown to the agent |

When a user says "fix a bug in strategyes-lab", the agent loads `REPOS.json`, matches against `slug`/`name`/`aliases`, and dispatches to that repo.

---

## MCP Server Configuration

### MCP_SERVERS.json

Defines external tool servers available to job containers. Located at `instances/{name}/config/MCP_SERVERS.json`.

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-brave-search"],
      "env": {
        "BRAVE_API_KEY": "{{AGENT_LLM_BRAVE_API_KEY}}"
      },
      "allowedTools": ["brave_web_search"]
    }
  }
}
```

Template variables like `{{AGENT_LLM_BRAVE_API_KEY}}` are resolved at runtime from environment variables. This is **optional** — instances work without MCP servers.

---

## Subagent Configuration

See the [Using Subagents](SUBAGENTS.md) guide for a full walkthrough of setting up and running multi-agent pipelines.

---

## Environment Variables

Each instance needs its own set of environment variables. In `docker-compose.yml`, these are namespaced with a prefix (e.g., `NOAH_*`, `SES_*`) and mapped to standard names inside the container.

### Required Variables

| Variable | Description |
|----------|-------------|
| `APP_URL` | Public URL for this instance |
| `AUTH_SECRET` | NextAuth session encryption key |
| `GITHUB_TOKEN` | GitHub PAT with repo access |
| `GITHUB_OWNER` | GitHub org/user |
| `GITHUB_REPO` | GitHub repo for job branches |
| `LLM_PROVIDER` | `anthropic`, `openai`, or `google` |
| `LLM_MODEL` | Model ID (e.g., `claude-sonnet-4-20250514`) |
| `ANTHROPIC_API_KEY` | API key for the LLM provider |
| `INSTANCE_NAME` | Instance slug (e.g., `noah`) |
| `DOCKER_NETWORK` | Docker network name (e.g., `noah-net`) |
| `JOB_IMAGE` | Docker image for job containers |

### Channel Variables

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Slack bot OAuth token |
| `SLACK_SIGNING_SECRET` | Slack signing secret |
| `SLACK_ALLOWED_USERS` | Comma-separated Slack user IDs |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook verification secret |
| `TELEGRAM_ALLOWED_USERS` | Comma-separated Telegram user IDs |

### Secret Convention (for Job Containers)

| Prefix | Behavior |
|--------|----------|
| `AGENT_*` | Passed to job containers but NOT accessible by the LLM |
| `AGENT_LLM_*` | Passed to job containers AND accessible by the LLM |
| No prefix | Not passed to job containers at all |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Sentry DSN for server-side error tracking |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for client-side error capture |
| `ONBOARDING_ENABLED` | Set to `true` to show onboarding wizard on first login |
| `SLACK_OPERATOR_CHANNEL` | Slack channel ID for billing and alert notifications |

---

## Claude Max Subscription Auth

By default, job containers authenticate via `ANTHROPIC_API_KEY` (pay-per-use). If you have a Claude Max, Team, or Enterprise subscription, you can switch to subscription auth using `CLAUDE_CODE_OAUTH_TOKEN`.

### Setup

1. **Generate the token.** Run `claude setup-token` on any machine with a browser. This opens an OAuth flow and outputs a token in the format `sk-ant-oat01-...`.

2. **Add to LLM secrets** in your `.env`:
   ```
   NOAH_AGENT_LLM_SECRETS={"CLAUDE_CODE_OAUTH_TOKEN":"sk-ant-oat01-YOUR_TOKEN_HERE"}
   ```

3. **Remove the API key** if switching exclusively to subscription auth:
   ```
   # Subscription only (recommended):
   NOAH_AGENT_LLM_SECRETS={"CLAUDE_CODE_OAUTH_TOKEN":"sk-ant-oat01-..."}
   ```

4. **Restart the event handler:**
   ```bash
   docker compose up -d {instance}-event-handler
   ```

5. **Verify.** Dispatch a test job. The entrypoint logs will show:
   ```
   Auth method: subscription (CLAUDE_CODE_OAUTH_TOKEN)
   ```

The token is long-lived (~1 year). Claude Code CLI handles refresh automatically. Re-run `claude setup-token` when the refresh token expires.

---

## Admin Panel

Accessible at `{APP_URL}/admin` for users with the `admin` role. See the [Admin Settings Guide](ADMIN_PANEL.md) for full details.

---

## Deployment

See [Deploying Your Instance](DEPLOYMENT.md) for VPS deployment, Docker Compose setup, and HTTPS configuration.

---

## Troubleshooting

### Container crash-loop: "Could not find a production build"

**Fix:** Run the build on the host, then restart:
```bash
npm run build
docker compose restart {service-name}
```

### Job container exits immediately (exit code 1)

**Fix:** Verify `AGENT_SECRETS` is valid JSON. Confirm the GitHub token has `contents:write` and `pull_requests:write` on target repos.

### Slack webhook returns 401 or "invalid_auth"

**Fix:** Regenerate the signing secret in Slack app settings, update `SLACK_SIGNING_SECRET` in `.env`, rebuild and restart the container.

### Docker network not found on job dispatch

**Fix:** Find the actual network name (Docker Compose may prefix with project name):
```bash
docker network ls | grep {name}
# Update: NOAH_DOCKER_NETWORK=clawforge_noah-net
```

### Billing limit blocks jobs unexpectedly

**Fix:** Check limits via `/admin/billing`. Superadmin can adjust at `/admin/superadmin/billing`.

### Workspace terminal shows blank screen

**Fix:**
1. Confirm the workspace container is running: `docker ps`
2. Verify `APP_URL` matches the URL in your browser exactly
3. Check the browser console for WebSocket connection errors

---

## Current Instances

### Archie (noah)

- **Purpose:** Noah's personal AI dev agent, full repo access
- **URL:** clawforge.scalingengine.com
- **Channels:** Slack, Telegram, Web Chat
- **Repos:** clawforge, neurostory (expandable)
- **Config:** `instances/noah/config/`

### Epic (strategyES)

- **Purpose:** StrategyES development agent for Jim
- **URL:** https://strategyes.scalingengine.com
- **Channels:** Slack, Web Chat
- **Repos:** strategyes-lab only (hard-scoped)
- **Config:** `instances/strategyES/config/`

---

## New Instance Checklist

1. [ ] Create `instances/{name}/config/` directory
2. [ ] Write `SOUL.md` — who is this agent?
3. [ ] Write `EVENT_HANDLER.md` — how should it converse? (copy from strategyES and modify)
4. [ ] Write `AGENT.md` — how should job containers behave?
5. [ ] Write `REPOS.json` — which repos can it access?
6. [ ] Copy and modify `Dockerfile` from an existing instance
7. [ ] Create `.env.example` with all required variables
8. [ ] Add service block to `docker-compose.yml`
9. [ ] Create Docker network: `docker network create {name}-net`
10. [ ] Set up channel(s): Slack app, Telegram bot, or just Web
11. [ ] Add environment variables to `.env`
12. [ ] Build and deploy: `docker compose build && docker compose up -d`
13. [ ] Create admin user via first login
14. [ ] Configure secrets via `/admin/secrets` if needed
15. [ ] (Optional) Add `MCP_SERVERS.json` for external tools
16. [ ] (Optional) Add `CLUSTER.json` for subagent pipelines
