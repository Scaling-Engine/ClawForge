# Admin Settings Guide

This guide covers everything in the admin panel — user management, GitHub configuration, secrets, voice settings, and more. The admin panel lives at `{APP_URL}/admin`.

---

## Accessing the Admin Panel

You need the `admin` role to access `/admin/*` pages. The first user to sign in gets `admin` by default. All subsequent users get the `user` role (chat access only). Change roles via `/admin/users`.

If you don't have admin access, you'll be redirected to a "Forbidden" page. Ask an existing admin to promote your account.

---

## Admin Pages

### General (`/admin/general`)

Basic instance configuration:
- **Instance name** — The display name for this instance
- **LLM provider** — Switch between Anthropic, OpenAI, and Google
- **LLM model** — Override the default model for your chosen provider

Changes here take effect on next page load (no restart required).

### Repos (`/admin/repos`)

View and manage which GitHub repositories this instance can target for jobs.

### Subagents (`/admin/subagents`)

Create and manage subagent definitions — multi-agent pipelines where specialized roles execute sequentially. See the [Using Subagents](SUBAGENTS.md) guide for a full walkthrough.

### Instances (`/admin/instances`)

View and manage ClawForge instances. Useful in multi-instance deployments.

### Crons (`/admin/crons`)

Manage scheduled jobs that run on a recurring schedule (defined in `CRONS.json`).

### Triggers (`/admin/triggers`)

Manage webhook triggers that can dispatch jobs based on external events.

### Secrets (`/admin/secrets`)

Manage GitHub repository secrets that are passed to job containers. These are stored with AES-256-GCM encryption.

**Secret naming convention:**
- `AGENT_*` — Passed to job containers, but NOT visible to the LLM
- `AGENT_LLM_*` — Passed to job containers AND visible to the LLM

The UI shows blue "Container" badges for `AGENT_*` secrets and purple "Container+LLM" badges for `AGENT_LLM_*` secrets, so you can see at a glance what level of access each secret has.

**Adding a secret:**
1. Click "Add Secret"
2. Enter the secret name (must start with `AGENT_`)
3. Enter the value
4. Save — the value is encrypted and stored

**Deleting a secret:** Click the delete icon next to the secret and confirm.

Values are always masked in the UI (last 4 characters visible). Full values are never displayed after creation.

### Users (`/admin/users`)

Manage who has access to your instance:
- **admin** — Full access including the admin panel
- **user** — Chat and workspace access only

To promote a user to admin, click the role toggle next to their name.

### Voice (`/admin/voice`)

Configure voice input settings:
- Toggle voice input on/off
- Set your AssemblyAI API key

### Chat (`/admin/chat`)

Chat-related configuration:
- Code mode defaults
- Other chat behavior settings

### Webhooks (`/admin/webhooks`)

View and manage incoming and outgoing webhooks for this instance.

### Billing (`/admin/billing`)

View usage statistics and manage billing limits. Admins can see monthly job counts and set soft limits that generate warnings when approaching threshold.

---

## User Roles Summary

| Role | Can Chat | Can Use Workspaces | Can Access /admin |
|------|----------|-------------------|-------------------|
| `admin` | Yes | Yes | Yes (full) |
| `user` | Yes | Yes | No |

API-key-protected routes (Slack events, Telegram webhooks) bypass role checks entirely — they use their own authentication mechanism.

---

## Config Storage

Admin settings are stored in a key-value config table in SQLite. Config changes apply on the next request — no restart required for most settings.

GitHub secrets are managed via the GitHub REST API and stored encrypted in the database.
