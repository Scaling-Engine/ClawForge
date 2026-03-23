# Deploying Your Instance

This guide covers how to deploy ClawForge to a production VPS with HTTPS, including Docker setup, Traefik configuration, and Let's Encrypt SSL.

---

## Quick Start (Local Dev)

```bash
npm run dev    # Start Next.js dev server
```

The dev server runs on port 3000. Use ngrok or a similar tunnel if you need to test Slack/Telegram webhooks locally.

---

## Production Deployment (Docker Compose)

### Step 1: Server Prerequisites

You need a VPS (Hetzner, DigitalOcean, AWS, etc.) with:

- Docker + Docker Compose
- Node.js 22+
- Git and GitHub CLI (`gh`)
- A domain pointing to your server's IP (DNS A record)

### Step 2: Clone and Configure

```bash
# Clone the ClawForge repository
git clone https://github.com/ScalingEngine/clawforge.git
cd clawforge

# Copy the env template and fill in all values
cp .env.example .env
# Edit .env — set APP_URL, API keys, Slack tokens, GitHub token, etc.

# Install dependencies
npm install
```

### Step 3: Build the Next.js App

You must run the build before starting containers. The event handler container needs the `.next/` directory to exist.

```bash
npm run build
```

If you skip this step, the container will crash-loop with "Could not find a production build."

### Step 4: Start All Services

```bash
docker compose up -d
```

This starts three services:
- **Traefik** — Reverse proxy, handles HTTPS via Let's Encrypt
- **Event Handler** — Node.js + PM2, serves the Next.js app (one per instance)
- **Runner** — Self-hosted GitHub Actions runner for executing jobs

### Step 5: Enable HTTPS (Let's Encrypt)

HTTPS support is built into `docker-compose.yml` but commented out by default. Three edits to enable it:

**a) Add your email to `.env`:**
```
LETSENCRYPT_EMAIL=you@example.com
```

**b) In `docker-compose.yml`, uncomment the TLS lines in the traefik service command:**
```yaml
- --entrypoints.web.http.redirections.entrypoint.to=websecure
- --entrypoints.web.http.redirections.entrypoint.scheme=https
- --certificatesresolvers.letsencrypt.acme.email=${LETSENCRYPT_EMAIL}
- --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
- --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
```

**c) In the event-handler labels, switch from HTTP to HTTPS:**
```yaml
# Comment out HTTP:
# - traefik.http.routers.event-handler.entrypoints=web

# Uncomment HTTPS:
- traefik.http.routers.event-handler.entrypoints=websecure
- traefik.http.routers.event-handler.tls.certresolver=letsencrypt
```

Port 80 must be open even with HTTPS — Let's Encrypt uses it for domain verification.

---

## Live Instances

| Domain | Instance | Agent Name |
|--------|----------|------------|
| clawforge.scalingengine.com | noah | Archie |
| strategyes.scalingengine.com | strategyES | Epic |

Each domain is routed by Traefik via `Host()` rules in `docker-compose.yml`.

---

## Adding a New Instance

To add a second (or third) instance to your deployment:

1. Create `instances/{name}/` with all config files (see [Getting Started](OPERATOR_GUIDE.md))
2. Add a new service block to `docker-compose.yml` (copy an existing one)
3. Set a unique `container_name` (e.g., `clawforge-acme`)
4. Create a new Docker network (e.g., `acme-net`)
5. Add prefixed env vars (e.g., `ACME_APP_URL`, `ACME_SLACK_BOT_TOKEN`)
6. Add Traefik labels for hostname routing
7. Build and start:
   ```bash
   docker compose build acme-event-handler
   docker compose up -d acme-event-handler
   ```

---

## Deploying Updates

When you push code changes to main:

```bash
# On your VPS
git pull
npm run build
docker compose build
docker compose up -d
```

If you've changed the job container (`templates/docker/job/**`), the `build-image.yml` GitHub Action automatically rebuilds and pushes the GHCR job image.

### Rebuilding a Single Instance

```bash
docker compose build noah-event-handler
docker compose up -d noah-event-handler
```

---

## How the Event Handler Container Works

The event handler Dockerfile provides the Node.js runtime, system dependencies, PM2, and pre-installed `node_modules`. It does NOT contain the Next.js app code directly — that comes from a bind mount.

```yaml
volumes:
  - .:/app              # bind mount: your project files → /app
  - /app/node_modules   # anonymous volume: preserves Linux-compiled modules
```

The bind mount overlays your project (including `.next/`). The anonymous volume shields `node_modules` so the container uses its Linux-compiled native modules (not your macOS-compiled ones). This is why you build on the host but it runs correctly in the container.

---

## Self-Hosted GitHub Actions Runner

The runner service registers as a self-hosted GitHub Actions runner, enabling `run-job.yml` to spin up Docker containers directly on your VPS.

Set `RUNS_ON=self-hosted` as a GitHub repository variable to route job workflows to your runner:

```bash
gh variable set RUNS_ON --body "self-hosted" --repo OWNER/REPO
```

Without this, jobs run on GitHub-hosted runners (slower, limited minutes, no local Docker network access).
