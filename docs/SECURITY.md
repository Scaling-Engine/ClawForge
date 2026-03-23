# Keeping Your Instance Safe

This guide covers the security measures built into ClawForge and the steps you should take to keep your instance protected.

---

## Built-In Security Protections

ClawForge includes several protections out of the box:

- **API key authentication** — All external `/api` routes require a valid `x-api-key` header. Keys are SHA-256 hashed in the database.
- **Webhook secret validation** — Slack, Telegram, and GitHub webhook endpoints validate shared secrets. If a secret is not configured, the endpoint rejects all requests (fail-closed behavior).
- **Session encryption** — Web sessions use JWT encrypted with `AUTH_SECRET`, stored in httpOnly cookies.
- **Secret filtering in job containers** — The container entrypoint filters `AGENT_*` secrets from the LLM's bash subprocess. Your agent cannot accidentally echo or exfiltrate protected credentials.
- **Auto-merge path restrictions** — The `auto-merge.yml` workflow only auto-merges PRs where all changed files fall within `ALLOWED_PATHS` (default: `/logs`). Code changes outside allowed paths require your manual review.
- **Server Actions with session checks** — All browser-to-server mutations use Next.js Server Actions with `requireAuth()`, which validates the session cookie before executing.

---

## How Secret Filtering Works

When a job runs, secrets are passed to the container but filtered from what the LLM can see:

| Credential | Passes to Container | LLM Can See |
|------------|--------------------|--------------------|
| `AGENT_GH_TOKEN` | Yes | No |
| `AGENT_LLM_BRAVE_API_KEY` | Yes | Yes |
| `GH_WEBHOOK_SECRET` | No | No |

The entrypoint decodes your `AGENT_SECRETS` JSON and exports each key as an environment variable. Immediately after, a filtering mechanism removes all those keys from the bash subprocess environment. The LLM can't `echo $GH_TOKEN` and get anything useful.

Use `AGENT_LLM_*` prefix only for credentials that the LLM genuinely needs (e.g., a Brave API key for a search MCP server). Keep everything else as `AGENT_*`.

---

## Running in Development (with a Tunnel)

When you run `npm run dev` and expose it via ngrok, Cloudflare Tunnel, or port forwarding, your development server is publicly accessible. This is fine for testing but carry these risks in mind:

### What's Exposed

| Endpoint | Auth |
|----------|------|
| `/api/create-job` | API key required |
| `/api/telegram/webhook` | Webhook secret required |
| `/api/github/webhook` | Webhook secret required |
| `/api/ping` | Public (health check) |
| `/login` | Public |
| `/stream/chat` | Session cookie |
| All other routes | Session cookie |

### What to Do

- **Always set webhook secrets** — Configure `TELEGRAM_WEBHOOK_SECRET` and `GH_WEBHOOK_SECRET` in `.env`. Without them, webhook endpoints reject all requests, but explicit secrets add extra validation.
- **Always set API keys** — Generate an API key through the web UI before exposing your server. Without a valid key, `/api/create-job` rejects all requests.
- **Stop tunnels when not in use** — Close ngrok when you're done. Don't leave endpoints exposed overnight.
- **Restrict Telegram to your chat** — Set `TELEGRAM_ALLOWED_USERS` to your personal Telegram user ID. Your bot will only respond to you.
- **Use Docker Compose with TLS for production** — For anything beyond local testing, use `docker compose up` with Let's Encrypt TLS enabled. See [Deploying Your Instance](DEPLOYMENT.md).

### Known Limitations (Local Dev)

- **No rate limiting** — A determined attacker could spam job creation (burning GitHub Actions minutes and LLM credits).
- **Local network exposure** — `npm run dev` binds to `0.0.0.0`. Other devices on your network can reach the dev server directly.
- **No TLS on dev server** — The tunnel provides TLS to the internet, but the local hop from the tunnel agent to your dev server is plain HTTP.

---

## Auto-Merge Settings

Keep `ALLOWED_PATHS` restrictive. The default (`/logs`) means only log files auto-merge — any code changes stay open for your review.

Only widen `ALLOWED_PATHS` after you've established trust with what your agent produces.

```
# Safe default — only logs auto-merge
ALLOWED_PATHS = /logs

# Require manual review for everything
AUTO_MERGE = false

# Allow everything (only when you trust the agent completely)
ALLOWED_PATHS = /
```

---

## Disclaimer

ClawForge is provided as-is, without warranties of any kind. You are responsible for:

- Securing your own infrastructure (server, network, DNS)
- Managing your API keys and secrets
- Reviewing agent-generated pull requests before merging outside `/logs`
- Monitoring your agent's activity and resource usage
