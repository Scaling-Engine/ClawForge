# ClawForge Operator Guide

How to set up and manage ClawForge instances, agents, repos, channels, and clusters.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Instance Architecture](#instance-architecture)
3. [Creating a New Instance](#creating-a-new-instance)
4. [Configuring an Instance](#configuring-an-instance)
5. [Channel Setup](#channel-setup)
6. [Repository Configuration](#repository-configuration)
7. [MCP Server Configuration](#mcp-server-configuration)
8. [Cluster Configuration](#cluster-configuration)
9. [Environment Variables](#environment-variables)
10. [Admin Panel](#admin-panel)
11. [GitHub Secrets](#github-secrets)
12. [Deployment](#deployment)
13. [Troubleshooting](#troubleshooting)
14. [Current Instances Reference](#current-instances-reference)

---

## Core Concepts

ClawForge is a two-layer system:

- **Layer 1 — Event Handler** (always-on): A Next.js app running a LangGraph agent. This is the conversational AI that users talk to via Slack, Telegram, or Web Chat.
- **Layer 2 — Job Container** (per-task): A Docker container running Claude Code CLI. Spun up on demand, executes a task, creates a PR, shuts down.

The only link between layers is a `job.md` text file pushed to a `job/{UUID}` branch. The Event Handler writes it, the Job Container reads and executes it.

**Each instance is fully isolated**: its own Docker container, network, volumes, environment variables, config files, and channel connections. Instance "noah" cannot see instance "strategyES" and vice versa.

---

## Instance Architecture

Every instance lives in `instances/{name}/` and has this structure:

```
instances/{name}/
├── Dockerfile            # Builds the Event Handler image for this instance
├── .env.example          # Template for required environment variables
└── config/
    ├── SOUL.md           # Agent identity and personality
    ├── EVENT_HANDLER.md  # How the conversational layer behaves
    ├── AGENT.md          # How the job container agent behaves
    ├── REPOS.json        # Allowed repositories this instance can target
    ├── AGENT_QUICK.md    # (optional) Lightweight agent prompt for simple jobs
    ├── MCP_SERVERS.json  # (optional) MCP tools available to job containers
    └── CLUSTER.json      # (optional) Multi-agent cluster definitions
```

### What Each Config File Does

| File | Purpose | Who reads it |
|------|---------|-------------|
| `SOUL.md` | Core identity — name, personality, scope restrictions | Event Handler LangGraph agent |
| `EVENT_HANDLER.md` | Conversational behavior — tools, job flow, approval gates, GSD reference | Event Handler LangGraph agent |
| `AGENT.md` | Job execution instructions — how to use Claude Code CLI, git behavior, GSD skills | Job Container (Layer 2) |
| `REPOS.json` | Which GitHub repos this instance is allowed to target | Event Handler (repo resolution) |
| `MCP_SERVERS.json` | External tools (Brave search, GitHub API, etc.) available during jobs | Job Container (via `--mcp-config`) |
| `CLUSTER.json` | Multi-agent pipeline definitions for complex tasks | Cluster coordinator |

---

## Creating a New Instance

### Method 1: Conversational (via Archie)

Ask Archie (the noah instance) to create a new instance. The Event Handler has a `create_instance_job` tool with a multi-turn intake flow:

1. Tell Archie you want to create a new instance
2. Archie asks for:
   - **Name** (slug, lowercase, no spaces) — e.g., `acmecorp`
   - **Purpose** — what the instance is for (used to author persona files)
   - **Allowed repos** — GitHub repo slugs it can target
   - **Channels** — slack, telegram, and/or web
   - **Slack user IDs** (if Slack enabled) — who can interact
   - **Telegram chat ID** (if Telegram enabled)
3. Review and approve the job description
4. Archie dispatches a job that generates all instance files and updates `docker-compose.yml`
5. A PR is created with the full instance scaffolding

### Method 2: Manual

Copy an existing instance directory and modify:

```bash
cp -r instances/noah instances/acmecorp
```

Then edit each config file (see [Configuring an Instance](#configuring-an-instance) below).

---

## Configuring an Instance

### SOUL.md — Identity

Defines who the agent "is." This is injected as system context into every LangGraph conversation.

**Key sections to customize:**

```markdown
# Your Identity

You are [Agent Name], [description of role and personality].

## Scope

- You can access: [list of repos/systems]
- You cannot access: [restrictions]

## Personality

[How the agent should communicate — formal, casual, technical, etc.]
```

**Example — Scoped instance (Epic for StrategyES):**
```markdown
You are Epic, the StrategyES development agent.
You help Jim and the team build StrategyES.
You can ONLY access the strategyes-lab repository.
You cannot access any other repositories, systems, or files.
```

**Example — Full-access instance (Archie for Noah):**
```markdown
You are Archie, Noah's personal AI development agent.
You have full access to all configured repositories.
```

### EVENT_HANDLER.md — Conversational Behavior

The longest config file. Controls how the Event Handler behaves in conversation. Key sections:

1. **Your Role** — One paragraph on what this agent does
2. **Scope Restrictions** — What repos/systems are off-limits
3. **Tools available** — Which LangGraph tools the agent can use:
   - `create_job` — dispatch autonomous work
   - `get_job_status` — check job progress
   - `get_system_technical_specs` — read architecture docs
   - `get_project_state` — fetch STATE.md/ROADMAP.md from a repo (full-access instances only)
   - `start_coding` — open interactive workspace (if enabled)
   - `list_workspaces` — list active workspaces
   - `create_cluster_job` — start multi-agent cluster run
4. **Context about the target project** — Stack, conventions, patterns
5. **GSD Command Reference** — Available GSD skills for structured work
6. **Job Creation Flow** — The approval gate (NEVER auto-dispatch)
7. **Interactive Mode** — How `[INTERACTIVE_MODE: true]` triggers workspace mode

**For a new scoped instance**, the simplest approach: copy `instances/strategyES/config/EVENT_HANDLER.md` and replace:
- The role description
- The scope restriction (which repo)
- The project context section (stack, conventions)

### AGENT.md — Job Container Behavior

Instructions baked into the Docker image that Claude Code reads when executing jobs. Shorter than EVENT_HANDLER.md. Key sections:

1. **Working directory** — Where in the container the agent operates
2. **Git behavior** — Commit conventions, branch naming
3. **GSD skills reference** — Available skills for structured execution
4. **Project-specific context** — Stack and conventions (for scoped instances)

### Dockerfile — Event Handler Image

Each instance gets its own Dockerfile that:

1. Starts from `node:22-bookworm-slim`
2. Installs system deps (`git`, `gh`, `pm2`)
3. Copies the full app source + templates
4. Copies instance-specific config files into `/app/config/`
5. Runs the build (`esbuild` + `next build`)
6. Starts via PM2

**To customize**: The only lines you typically change are the `COPY` commands for config files. The rest is boilerplate.

---

## Channel Setup

### Web Chat

Included automatically at `APP_URL`. No additional configuration needed — just set `APP_URL` in the environment.

### Slack

Each instance needs its **own Slack app** (separate workspace, tokens, and scopes).

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

**Format:**
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

**Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Full `owner/repo` GitHub path |
| `slug` | Yes | Short identifier used in commands |
| `aliases` | No | Alternative names users can type |
| `dispatch` | No | `"docker"` (default) or `"actions"` — how jobs run |
| `description` | No | Human-readable description shown to the agent |

**Dispatch methods:**
- `docker` — Job runs in a local Docker container via dockerode (~9 second start)
- `actions` — Job runs via GitHub Actions workflow (~60 second start)

**Multi-repo example (Archie/noah):**
```json
[
  {
    "name": "ScalingEngine/clawforge",
    "slug": "clawforge",
    "aliases": ["cf", "claw"],
    "dispatch": "docker"
  },
  {
    "name": "ScalingEngine/neurostory",
    "slug": "neurostory",
    "aliases": ["ns"],
    "dispatch": "docker"
  }
]
```

**Single-repo example (Epic/strategyES):**
```json
[
  {
    "name": "ScalingEngine/strategyes-lab",
    "slug": "strategyes-lab",
    "dispatch": "docker"
  }
]
```

### How repo resolution works

When a user says "fix a bug in strategyes-lab", the Event Handler:
1. Loads `REPOS.json`
2. Tries to match against `slug`, `name`, or `aliases` (case-insensitive)
3. If matched → dispatches to that repo
4. If not matched → returns an error listing available repos

---

## MCP Server Configuration

### MCP_SERVERS.json

Defines external tool servers available to job containers. Located at `instances/{name}/config/MCP_SERVERS.json`.

**Format:**
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
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-github"],
      "env": {
        "GITHUB_TOKEN": "{{AGENT_LLM_GITHUB_TOKEN}}"
      },
      "allowedTools": ["search_repositories", "list_commits"]
    }
  }
}
```

**Key points:**
- Template variables like `{{AGENT_LLM_BRAVE_API_KEY}}` are resolved at runtime from environment variables
- `allowedTools` whitelists which tools from each server the agent can use
- The file is passed to Claude Code via `--mcp-config` flag
- This is **optional** — instances work fine without MCP servers

---

## Cluster Configuration

### CLUSTER.json

Defines multi-agent pipelines where specialized agents execute sequentially on a shared workspace. Located at `instances/{name}/config/CLUSTER.json`.

**Format:**
```json
{
  "clusters": [
    {
      "name": "code-review-pipeline",
      "roles": [
        {
          "name": "researcher",
          "systemPrompt": "You are a code research agent. Analyze the codebase and identify patterns, potential issues, and areas for improvement. Write your findings to /tmp/shared/research.md.",
          "allowedTools": ["Read", "Grep", "Glob", "Bash"]
        },
        {
          "name": "reviewer",
          "systemPrompt": "You are a code reviewer. Read /tmp/shared/research.md and create a detailed code review with actionable recommendations. Write to /tmp/shared/review.md.",
          "allowedTools": ["Read", "Write", "Edit", "Grep", "Glob"]
        },
        {
          "name": "implementer",
          "systemPrompt": "You are an implementation agent. Read /tmp/shared/review.md and implement the recommended changes.",
          "allowedTools": ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]
        }
      ]
    }
  ]
}
```

**How clusters work:**

1. User triggers a cluster run (via conversation or the `create_cluster_job` tool)
2. The coordinator loads the cluster definition from `CLUSTER.json`
3. Each role runs **sequentially** in its own Docker container
4. Agents share data via a shared Docker volume mounted at `/tmp/shared/`
5. A label-based state machine tracks progress (pending → running → completed/failed)
6. Slack thread notifications update as each agent completes
7. Hard iteration limits prevent runaway execution

**Each role has:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Role identifier (e.g., "researcher", "writer") |
| `systemPrompt` | Yes | Instructions for this agent — what to do, where to write output |
| `allowedTools` | Yes | Claude Code tools this agent can use |

**Tips for writing cluster roles:**
- Each agent should write its output to a known path in `/tmp/shared/`
- Later agents should read from those paths
- Keep tool lists minimal — each agent only needs what its role requires
- The `systemPrompt` is the only thing distinguishing agents, so be specific

---

## Environment Variables

Each instance needs its own set of environment variables. In `docker-compose.yml`, these are namespaced with a prefix (e.g., `NOAH_*`, `SES_*`) and mapped to standard names inside the container.

### Required Variables

| Variable | Description |
|----------|-------------|
| `APP_URL` | Public URL for this instance (e.g., `https://archie.yourdomain.com`) |
| `AUTH_SECRET` | NextAuth session encryption key (generate with `openssl rand -hex 32`) |
| `GITHUB_TOKEN` | GitHub PAT with repo access |
| `GITHUB_OWNER` | GitHub org/user (e.g., `ScalingEngine`) |
| `GITHUB_REPO` | GitHub repo for job branches (e.g., `clawforge`) |
| `LLM_PROVIDER` | `anthropic`, `openai`, or `google` |
| `LLM_MODEL` | Model ID (e.g., `claude-sonnet-4-20250514`) |
| `ANTHROPIC_API_KEY` | API key for the LLM provider |
| `INSTANCE_NAME` | Instance slug (e.g., `noah`, `strategyES`) |
| `DOCKER_NETWORK` | Docker network name (e.g., `noah-net`) |
| `JOB_IMAGE` | Docker image for job containers |

### Channel Variables

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Slack bot OAuth token |
| `SLACK_SIGNING_SECRET` | Slack signing secret for webhook verification |
| `SLACK_ALLOWED_USERS` | Comma-separated Slack user IDs |
| `SLACK_ALLOWED_CHANNELS` | (optional) Restrict to specific channels |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook verification secret |
| `TELEGRAM_ALLOWED_USERS` | Comma-separated Telegram user IDs |

### Secret Convention (for Job Containers)

| Prefix | Behavior |
|--------|----------|
| `AGENT_*` | Passed to job containers but NOT accessible by the LLM |
| `AGENT_LLM_*` | Passed to job containers AND accessible by the LLM |
| No prefix | Not passed to job containers at all |

Example: `AGENT_LLM_BRAVE_API_KEY` → available to MCP servers in the job container. `AGENT_GITHUB_TOKEN` → available to scripts but hidden from the LLM.

### Observability & Billing Variables

Added in v3.0 (Phases 43–46). All are optional — ClawForge operates without them.

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTRY_DSN` | No | Sentry project DSN for server-side error tracking. When unset, Sentry is fully disabled (zero network calls). |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for client-side error capture. Must match `SENTRY_DSN`. Both must be set for full coverage. |
| `ONBOARDING_ENABLED` | No | Set to `true` to redirect new users to the onboarding wizard on first login. Remove or set to any other value to disable. Remove once setup is complete. |
| `SLACK_OPERATOR_CHANNEL` | No | Slack channel ID for operational alerts (billing 80% threshold warnings, consecutive failure alerts). When unset, alerts are silently skipped — jobs always proceed. |

---

## Admin Panel

Accessible at `{APP_URL}/admin` for users with the `admin` role.

### Pages

| Route | Purpose |
|-------|---------|
| `/admin/general` | Instance name, LLM provider/model selection |
| `/admin/github` | GitHub owner/repo, token status |
| `/admin/users` | User CRUD, role assignment (admin/user) |
| `/admin/secrets` | GitHub secrets management (AGENT_* prefix) |
| `/admin/voice` | Voice input settings (AssemblyAI) |
| `/admin/chat` | Chat configuration |
| `/admin/webhooks` | Webhook display and configuration |

### Auth Roles

- **admin** — Full access to all admin pages
- **user** — Can use chat and workspaces, blocked from `/admin/*` routes

The first user to sign in gets `admin` role by default. Subsequent users get `user` role. Change roles via `/admin/users`.

### Managing GitHub Secrets

The secrets page (`/admin/secrets`) lets you manage secrets that are passed to job containers:

1. Secrets are encrypted at rest with AES-256-GCM (Node `crypto`)
2. Values are masked in the UI (last 4 characters visible)
3. The `AGENT_*` prefix convention is enforced
4. Deletion requires a confirmation modal

---

## Deployment

### Docker Compose (Production)

The `docker-compose.yml` orchestrates all instances plus a Traefik reverse proxy:

```
┌──────────────────────────────────────────────┐
│                   Traefik                     │
│         (TLS termination, routing)            │
│  archie.domain.com → noah container           │
│  strategyes.scalingengine.com → strategyES container │
└──────────┬───────────────────┬───────────────┘
           │                   │
    ┌──────┴──────┐     ┌──────┴──────┐
    │ noah-net    │     │ ses-net     │
    │ (isolated)  │     │ (isolated)  │
    │ Port 3000   │     │ Port 3000   │
    └─────────────┘     └─────────────┘
```

**Adding a new instance to docker-compose.yml:**

1. Add a new service block (copy an existing one)
2. Set a unique `container_name` (e.g., `clawforge-acme`)
3. Point `build.context` to `instances/acmecorp`
4. Create a new network (e.g., `acme-net`)
5. Add prefixed env vars (e.g., `ACME_APP_URL`, `ACME_SLACK_BOT_TOKEN`, etc.)
6. Add Traefik labels for hostname routing
7. Add named volumes for data and config persistence

### Deploy to a Fresh VPS

**Server prerequisites** — Any VPS (Hetzner, DigitalOcean, AWS, etc.) with:
- Docker + Docker Compose
- Node.js 22+
- Git and GitHub CLI (`gh`)
- A domain pointed to the server's IP (DNS A record)

**Deployment steps:**

```bash
# 1. Clone the ClawForge repository
git clone https://github.com/ScalingEngine/clawforge.git
cd clawforge

# 2. Copy the env template and fill in all values
cp .env.example .env
# Edit .env — set APP_URL, API keys, Slack tokens, GitHub token, etc.

# 3. Install dependencies
npm install

# 4. Build the Next.js app (must run before starting containers)
npm run build

# 5. Start all services
docker compose up -d
```

Ports 80 and 443 must be open on your server. Port 80 is required even with HTTPS — Let's Encrypt uses it for the ACME HTTP challenge to verify domain ownership.

**Enable HTTPS (Let's Encrypt):**

The `docker-compose.yml` has Let's Encrypt support built in but commented out. Three edits to enable it:

a) Add your email to `.env`:
```
LETSENCRYPT_EMAIL=you@example.com
```

b) In `docker-compose.yml`, uncomment the TLS lines in the traefik service command:
```yaml
- --entrypoints.web.http.redirections.entrypoint.to=websecure
- --entrypoints.web.http.redirections.entrypoint.scheme=https
- --certificatesresolvers.letsencrypt.acme.email=${LETSENCRYPT_EMAIL}
- --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
- --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
```

c) In the event-handler labels, switch from HTTP to HTTPS:
```yaml
# - traefik.http.routers.event-handler.entrypoints=web
- traefik.http.routers.event-handler.entrypoints=websecure
- traefik.http.routers.event-handler.tls.certresolver=letsencrypt
```

### Build and Start

```bash
# Build all instances
docker compose build

# Start everything
docker compose up -d

# Rebuild one instance after config changes
docker compose build noah-event-handler
docker compose up -d noah-event-handler
```

---

## Troubleshooting

Common problems operators encounter, with symptoms and fixes.

### 1. Container crash-loop: "Could not find a production build"

**Symptom:** PM2 restarts endlessly; logs show `Could not find a production build in '/app/.next'`

**Cause:** `npm run build` was not run before `docker compose up`, or `.next/` is missing from the bind mount.

**Fix:** Run the build on the host, then restart the affected service:
```bash
npm run build
docker compose restart {service-name}
```

### 2. Job container exits immediately (exit code 1)

**Symptom:** Job dispatches but completes in under 5 seconds with failure status.

**Cause:** Missing or invalid `AGENT_SECRETS` / `AGENT_LLM_SECRETS`, or the GitHub token lacks required scopes.

**Fix:** Verify `AGENT_SECRETS` is valid JSON. Confirm the GitHub token (`GH_TOKEN`) has `contents:write` and `pull_requests:write` on all target repositories.

### 3. Slack webhook returns 401 or "invalid_auth"

**Symptom:** Bot doesn't respond to messages; logs show signature verification failure.

**Cause:** `SLACK_SIGNING_SECRET` doesn't match the Slack app's signing secret, or the bot token has expired.

**Fix:** Regenerate the signing secret in Slack app settings, update `SLACK_SIGNING_SECRET` in `.env`, then rebuild and restart the container.

### 4. ONBOARDING_ENABLED redirect loop

**Symptom:** Browser redirects infinitely between `/` and `/onboarding`.

**Cause:** `ONBOARDING_ENABLED=true` is set but the onboarding page is not accessible (build error or missing route).

**Fix:** Confirm `npm run build` completed without errors. Verify `templates/app/onboarding/page.js` exists. Remove `ONBOARDING_ENABLED` after onboarding completes.

### 5. Docker network not found on job dispatch

**Symptom:** Job dispatch fails with `network {name} not found`.

**Cause:** The `DOCKER_NETWORK` env var doesn't match the actual Docker network name. Docker Compose prefixes with the project name.

**Fix:** Find the actual network name and update your env var:
```bash
docker network ls | grep {name}
# Example: clawforge_noah-net
# Update: NOAH_DOCKER_NETWORK=clawforge_noah-net
```

### 6. Billing limit blocks jobs unexpectedly

**Symptom:** Job dispatch returns "Monthly job limit reached" but the instance has not dispatched many jobs.

**Cause:** The `billing_limits` table has a low limit set, or the period boundary crossed a month during calculation.

**Fix:** Check limits via `/admin/billing`. Superadmin can adjust limits at `/admin/superadmin/billing`.

### 7. Sentry not capturing errors

**Symptom:** Errors occur in the app but nothing appears in the Sentry dashboard.

**Cause:** `SENTRY_DSN` is not set (server errors), or `NEXT_PUBLIC_SENTRY_DSN` is not set (client errors need the public DSN).

**Fix:** Set both variables in `.env`, then rebuild:
```bash
npm run build
docker compose restart {service-name}
```

### 8. GitHub webhook not triggering notifications

**Symptom:** Jobs complete (PR is created) but no notification appears in Slack or Telegram.

**Cause:** `GH_WEBHOOK_SECRET` mismatch, or the webhook URL is not pointing to `{APP_URL}/api/github/webhook`.

**Fix:** Verify the webhook configuration in GitHub repository settings. The secret must match `GH_WEBHOOK_SECRET` exactly.

### 9. "better-sqlite3 is not compatible with Edge Runtime"

**Symptom:** Build error or runtime crash mentioning `better-sqlite3` and Edge Runtime.

**Cause:** A middleware or Edge function is importing a module that transitively imports `better-sqlite3`.

**Fix:** Database operations must run in Server Components or API routes — never in middleware. Trace the import chain to find which module is pulling in `better-sqlite3` from an Edge context.

### 10. Workspace container starts but terminal shows blank screen

**Symptom:** Workspace opens in the browser but the ttyd terminal shows nothing.

**Cause:** The WebSocket proxy cannot connect to ttyd inside the container, or the container port mapping is incorrect.

**Fix:**
1. Confirm the workspace container is running: `docker ps`
2. Verify `APP_URL` matches the URL in the browser exactly (including port if non-standard)
3. Check the browser console for WebSocket connection errors

---

## Current Instances Reference

### Archie (noah)

- **Purpose:** Noah's personal AI dev agent, full repo access
- **Channels:** Slack, Telegram, Web Chat
- **Repos:** clawforge, neurostory (expandable)
- **MCP:** Brave search, GitHub API
- **Special:** Can create new instances via `create_instance_job`
- **Config:** `instances/noah/config/`

### Epic (strategyES)

- **Purpose:** StrategyES development agent for Jim
- **URL:** https://strategyes.scalingengine.com
- **Channels:** Slack, Web Chat
- **Repos:** strategyes-lab only (hard-scoped)
- **MCP:** None configured
- **Special:** Locked to a single repo — cannot access anything else
- **Config:** `instances/strategyES/config/`

---

## Quick Reference: New Instance Checklist

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
16. [ ] (Optional) Add `CLUSTER.json` for multi-agent pipelines
