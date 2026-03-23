# Settings & Configuration

This guide covers all the environment variables, GitHub secrets, and configuration options you need to get your ClawForge instance running correctly.

---

## Environment Variables

Set these in your `.env` file in the project root. Each instance gets its own set of variables, prefixed in `docker-compose.yml` (e.g., `NOAH_APP_URL` maps to `APP_URL` inside the container).

### Core Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `APP_URL` | Public URL for this instance (e.g., `https://archie.yourdomain.com`) | Yes |
| `APP_HOSTNAME` | Hostname extracted from APP_URL — used by Traefik for routing | Yes |
| `AUTH_SECRET` | Session encryption key. Generate with `openssl rand -hex 32` | Yes |
| `AUTH_TRUST_HOST` | Set to `true` when running behind a reverse proxy like Traefik | For Docker |
| `INSTANCE_NAME` | Instance slug (e.g., `noah`, `strategyES`) | Yes |

### GitHub Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GH_TOKEN` | GitHub Personal Access Token with `contents:write` and `pull_requests:write` | Yes |
| `GH_OWNER` | GitHub org or username (e.g., `ScalingEngine`) | Yes |
| `GH_REPO` | GitHub repo name for job branches (e.g., `clawforge`) | Yes |
| `GH_WEBHOOK_SECRET` | Secret for GitHub webhook auth — must match your GitHub webhook config | For notifications |

### LLM Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `LLM_PROVIDER` | `anthropic`, `openai`, or `google` (default: `anthropic`) | No |
| `LLM_MODEL` | Model ID override (e.g., `claude-sonnet-4-20250514`). Uses provider default if unset | No |
| `ANTHROPIC_API_KEY` | API key for Anthropic | For API key auth |
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token for Claude Max subscription auth. Add to `AGENT_LLM_SECRETS` JSON — see [Getting Started](OPERATOR_GUIDE.md#claude-max-subscription-auth) for setup | For subscription auth |
| `OPENAI_API_KEY` | API key for OpenAI | For OpenAI provider |
| `GOOGLE_API_KEY` | API key for Google | For Google provider |

### Slack Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SLACK_BOT_TOKEN` | Slack bot OAuth token (starts with `xoxb-`) | For Slack |
| `SLACK_SIGNING_SECRET` | Slack signing secret for webhook verification | For Slack |
| `SLACK_ALLOWED_USERS` | Comma-separated Slack user IDs allowed to interact | For Slack |
| `SLACK_ALLOWED_CHANNELS` | (Optional) Comma-separated channel IDs to restrict bot to | No |
| `SLACK_OPERATOR_CHANNEL` | Slack channel ID for operational alerts (billing warnings, failure alerts) | No |

### Telegram Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | For Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | Secret for webhook validation. Generate with `openssl rand -hex 32` | For Telegram |
| `TELEGRAM_ALLOWED_USERS` | Comma-separated Telegram user IDs | For Telegram |
| `TELEGRAM_VERIFICATION` | Verification code for getting your chat ID during setup | For Telegram setup |

### Docker Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DOCKER_NETWORK` | Docker network name for job containers (e.g., `noah-net`) | Yes |
| `JOB_IMAGE` | Docker image for job containers (built from `templates/docker/job/Dockerfile`) | Yes |

### Optional / Advanced Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_PATH` | Override SQLite database location (default: `data/thepopebot.sqlite`) |
| `LETSENCRYPT_EMAIL` | Email for Let's Encrypt SSL (required when enabling HTTPS in docker-compose) |
| `SENTRY_DSN` | Sentry project DSN for server-side error tracking. When unset, Sentry is fully disabled |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for client-side error capture. Must match `SENTRY_DSN` |
| `ONBOARDING_ENABLED` | Set to `true` to redirect new users to the onboarding wizard on first login. Remove once complete |

---

## GitHub Repository Variables

Set these in your GitHub repo under **Settings → Secrets and variables → Actions → Variables tab**.

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_URL` | Public URL for the event handler (e.g., `https://mybot.example.com`) | — |
| `AUTO_MERGE` | Set to `false` to disable auto-merge of all job PRs | Enabled |
| `ALLOWED_PATHS` | Comma-separated path prefixes for auto-merge | `/logs` |
| `RUNS_ON` | GitHub Actions runner label (use `self-hosted` for VPS runner) | `ubuntu-latest` |
| `LLM_PROVIDER` | LLM provider (`anthropic`, `openai`, `google`) | `anthropic` |
| `LLM_MODEL` | LLM model name override | Provider default |

---

## GitHub Repository Secrets

Set these in **Settings → Secrets and variables → Actions → Secrets tab**.

| Secret | Description | Required |
|--------|-------------|----------|
| `AGENT_SECRETS` | Base64-encoded JSON with protected credentials for job containers | Yes |
| `AGENT_LLM_SECRETS` | Base64-encoded JSON with LLM-accessible credentials | No |
| `GH_WEBHOOK_SECRET` | Secret for webhook authentication (must match `GH_WEBHOOK_SECRET` in `.env`) | Yes |

**Secret prefix convention — how credentials are filtered:**

| Prefix | Passed to Container | LLM Can Access |
|--------|--------------------|--------------------|
| `AGENT_` | Yes | No (filtered from LLM) |
| `AGENT_LLM_` | Yes | Yes |
| *(no prefix)* | No | No |

Example: `AGENT_LLM_BRAVE_API_KEY` → available to MCP servers. `AGENT_GH_TOKEN` → available to container scripts but hidden from the LLM.

---

## Changing Your APP_URL

If your public URL changes (e.g., after switching domains):

1. Update `APP_URL` and `APP_HOSTNAME` in `.env`
2. Update the `APP_URL` GitHub repository variable
3. Restart Docker: `docker compose up -d`
4. If Telegram is configured, re-register the webhook:
   ```bash
   npm run setup-telegram
   ```

---

## API Keys for Web UI

API keys for programmatic job creation via `/api/create-job` are database-backed and managed via the web UI at `/admin/secrets`. Use the `x-api-key` header when calling the API.

---

## Manual Telegram Setup

If you can't run the setup script (e.g., deploying to Vercel or Railway):

1. Set these environment variables:
   - `TELEGRAM_BOT_TOKEN` — from @BotFather
   - `TELEGRAM_WEBHOOK_SECRET` — generate with `openssl rand -hex 32`
   - `TELEGRAM_VERIFICATION` — a code like `verify-abc12345`

2. Register the webhook:
   ```bash
   curl -X POST https://your-app.url/api/telegram/register \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_API_KEY" \
     -d '{"bot_token": "YOUR_BOT_TOKEN", "webhook_url": "https://your-app.url/api/telegram/webhook"}'
   ```

3. Get your chat ID by messaging your bot the verification code (e.g., `verify-abc12345`). The bot replies with your chat ID.

4. Set `TELEGRAM_ALLOWED_USERS` to that chat ID and restart.
