# ClawForge

**Production agent infrastructure for Claude Code** — multi-channel conversational interface, Docker-isolated execution, deterministic quality gates, and a git-native audit trail. Every action is a commit, every change is a PR.

Combines [thepopebot](https://github.com/stephengpope/thepopebot)'s multi-channel Docker execution model with [Stripe's agent infrastructure](https://stripe.com/blog/how-we-built-the-ai-agent-infrastructure-behind-stripe) patterns (deterministic interleaving, context hydration, quality gates) and [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) + [GSD](https://github.com/get-shit-done-cc/get-shit-done-cc) as the execution engine.

---

## How It Works

```
                              C L A W F O R G E

  ┌─────────┐   ┌─────────┐   ┌─────────┐
  │  Slack   │   │Telegram │   │Web Chat │              CHANNELS
  └────┬─────┘   └────┬─────┘   └────┬─────┘
       │              │              │
       └──────────────┼──────────────┘
                      │ webhooks
                      ▼
              ┌────────────────┐
              │    Traefik     │                    REVERSE PROXY
              │  (HTTPS/LE)   │
              └───────┬────────┘
                      │ routes by hostname
           ┌──────────┴──────────┐
           ▼                     ▼
   ┌───────────────┐    ┌───────────────┐
   │  Instance A   │    │  Instance B   │           EVENT HANDLERS
   │  Next.js +    │    │  Next.js +    │           (LangGraph ReAct)
   │  LangGraph    │    │  LangGraph    │
   │  SQLite       │    │  SQLite       │           Each instance:
   │  SOUL.md      │    │  SOUL.md      │           own personality,
   │  REPOS.json   │    │  REPOS.json   │           repos, tools,
   │  TRIGGERS.json│    │  TRIGGERS.json│           Slack app, DB
   └───────┬───────┘    └───────┬───────┘
           │                    │
           │  create_job()      │ create_instance_job()
           ▼                    ▼
   ┌─────────────────────────────────────────────┐
   │              JOB DISPATCH                    │
   │                                              │
   │  Currently:  GitHub Actions (run-job.yml)    │  ← job/* branch
   │  Planned:    Docker Engine API (direct)      │  ← seconds, not minutes
   │              (Actions retained as fallback)  │
   └──────────────────┬──────────────────────────┘
                      │
                      ▼
   ┌─────────────────────────────────────────────┐
   │           DOCKER JOB CONTAINER               │
   │                                              │
   │  ┌────────────────────────────────────────┐  │
   │  │  Claude Code CLI (-p)                  │  │
   │  │  + GSD Skills (30 commands)            │  │
   │  │  + Node.js 22 + gh CLI + Chrome        │  │
   │  │  + MCP Servers (planned: per-instance) │  │
   │  └────────────────────────────────────────┘  │
   │                                              │
   │  Context:  job.md + target.json (cross-repo) │
   │  Planned:  context hydration (pre-fetch      │
   │            URLs/refs via MCP before exec)    │
   └──────────────────┬──────────────────────────┘
                      │
                      ▼
   ┌─────────────────────────────────────────────┐
   │           QUALITY GATES                      │
   │                                              │
   │  Currently:  --allowedTools whitelist        │
   │              AGENT_ secret filtering         │
   │                                              │
   │  Planned:    Pre-CI lint + typecheck (<5s)   │  ← Stripe pattern:
   │              CI feedback loop (max 2 runs)   │    deterministic
   │              Self-correction on failure       │    interleaving
   └──────────────────┬──────────────────────────┘
                      │
                      ▼
   ┌─────────────────────────────────────────────┐
   │           DELIVERY                           │
   │                                              │
   │  PR with --body-file (structured body)       │
   │                                              │
   │  Merge gate:                                 │
   │    1. Blocked-paths check (instances/ etc.)  │
   │    2. ALLOWED_PATHS whitelist                │
   │    3. Auto-merge or require review           │
   │  Planned: per-repo merge policy engine       │
   └──────────────────┬──────────────────────────┘
                      │
                      ▼
   ┌─────────────────────────────────────────────┐
   │           NOTIFICATION ROUTING               │
   │                                              │
   │  Route result → originating thread           │
   │  Inject summary → LangGraph memory           │
   │  Store outcome → job_outcomes (future ctx)   │
   └─────────────────────────────────────────────┘
```

You talk to the agent in natural language. For simple questions, it answers directly. For tasks that need code changes, it proposes a job description, gets your approval, then dispatches an autonomous Docker container running Claude Code CLI. The container clones the repo, does the work, commits, and opens a PR.

The merge gate runs two checks: blocked-paths (instance scaffolding PRs always require manual review) and ALLOWED_PATHS (safe directories auto-merge, everything else needs review). When the job finishes, the result routes back to the exact Slack thread or Telegram chat where you started — and gets injected into the agent's memory for conversational continuity.

**Where it's heading:** Direct Docker Engine dispatch (seconds instead of minutes), persistent interactive workspaces (browser terminal to a live container), per-instance MCP tool layers, deterministic quality gates (lint/test interleaved with agent work, max 2 CI runs), and multi-agent clusters that decompose complex tasks across parallel workers.

---

## Key Features

**Channels & Instances**
- **Multi-channel** — Slack, Telegram, and Web Chat with a unified channel adapter interface
- **Multi-instance** — Run multiple isolated agents (different users, repos, Slack workspaces) on the same VPS
- **Docker network isolation** — Each instance has its own Docker network, env vars, SQLite DB, and Slack app
- **Instance creation via chat** — Describe a new agent in conversation; ClawForge scaffolds the full config as a PR

**Execution & Delivery**
- **Cross-repo targeting** — Jobs can target any repo in the allowed list via `REPOS.json` + `target.json` sidecar
- **Git as audit trail** — Every agent action is a commit. Every change is a PR. Full visibility and reversibility
- **Two-stage merge gate** — Blocked-paths check (instance PRs need review) + ALLOWED_PATHS whitelist (safe dirs auto-merge)
- **Secret filtering** — `AGENT_` secrets are passed to the container but filtered from Claude Code's LLM view

**Intelligence & Memory**
- **Multi-provider LLM** — Anthropic (default), OpenAI, Google Gemini, or any OpenAI-compatible endpoint (Ollama, etc.)
- **Thread-aware notifications** — Job results route back to the originating Slack thread or Telegram chat
- **LangGraph memory** — Job outcomes are injected into conversation memory so the agent has context for follow-ups
- **Prior job context** — When creating a new job in a thread, the agent includes the previous job's outcome for continuity

**Platform**
- **Triggers** — Fire-and-forget actions on incoming webhooks via `TRIGGERS.json`
- **Rate limiting** — Per-IP, per-route sliding window (30 req/min)
- **Planned: Docker Engine dispatch** — Direct container creation via Unix socket (seconds, not minutes)
- **Planned: Quality gates** — Lint/typecheck interleaved with agent work, CI feedback loops (Stripe pattern)
- **Planned: MCP tool layer** — Per-instance MCP server config so each agent gets curated tool access
- **Planned: Persistent workspaces** — Browser terminal (ttyd + xterm.js) to long-running interactive containers
- **Planned: Multi-agent clusters** — Lead agent decomposes tasks, worker containers execute in parallel

---

## Architecture

### Two Agents, Two Contexts, One Conversation

ClawForge runs **two completely separate AI agents** that never share context directly. This is the core design.

```
  LAYER 1: CONVERSATIONAL                    LAYER 2: EXECUTION
  ─────────────────────────                  ─────────────────────

  ┌─────────────────────────┐               ┌─────────────────────────┐
  │     "Archie"            │               │     Claude Code CLI     │
  │                         │               │                         │
  │  LangGraph ReAct Agent  │               │  Autonomous coder       │
  │  Anthropic / OpenAI /   │   job.md      │  Always Anthropic       │
  │  Google (configurable)  │ ────────────▶ │  (Claude via CLI)       │
  │                         │  (text file   │                         │
  │  Persistent memory      │   is the      │  No memory between jobs │
  │  (SQLite + checkpoints) │   ONLY link)  │  (fresh clone each run) │
  │                         │               │                         │
  │  Knows: conversation    │               │  Knows: job.md prompt   │
  │  history, user prefs,   │               │  + full repo contents   │
  │  prior job outcomes,    │               │  + GSD skills (30 cmds) │
  │  tool schemas           │               │  + CLAUDE.md rules      │
  │                         │               │                         │
  │  Can't: read code,      │               │  Can't: see Slack,      │
  │  edit files, run tests  │               │  read messages, talk    │
  │                         │               │  to user, access DB     │
  │  4 tools (dispatch +    │               │                         │
  │  status + specs +       │               │  Full toolset (Read,    │
  │  create instance)       │               │  Write, Edit, Bash,     │
  │                         │               │  Glob, Grep, etc.)      │
  └─────────────────────────┘               └─────────────────────────┘

  Runs: always-on (PM2)                     Runs: per-job (container
  Lives: event handler container                  starts → works → exits)
  Scope: conversation + routing             Scope: one repo, one task
```

**The key insight:** The Slack agent (Layer 1) is a *conversational coordinator* — it talks to you, decides when to dispatch work, and routes results back. It never touches code. The Docker agent (Layer 2) is an *autonomous coder* — it gets a text prompt (`job.md`), does the work, and exits. It never sees your conversation.

**The only link between them is `job.md`** — a text file pushed to a git branch. Layer 1 writes it. Layer 2 reads it. That's the entire interface. This means:

- The conversational agent's quality at *describing* work determines the coding agent's success
- Job outcomes flow back as summaries (Layer 2 → PR → notification webhook → Layer 1 memory)
- Each coding job starts fresh — no accumulated state, no context bleed between jobs
- Prior job context is injected by Layer 1 into the *next* job.md when you're in the same thread

### Two-Layer Design

| Layer | What | Tech |
|-------|------|------|
| **Event Handler** | Conversational AI. Receives messages, decides when to dispatch jobs, routes notifications. | Next.js + LangGraph ReAct Agent + SQLite (Drizzle ORM) |
| **Job Container** | Autonomous code execution. Clones a repo, runs Claude Code CLI, commits, opens a PR. | Docker (GHCR image) + Claude Code CLI + GSD Skills |

### Event Handler Tools

The LangGraph agent has four tools:

| Tool | Purpose |
|------|---------|
| `create_job` | Dispatch an autonomous coding job to a Docker container |
| `get_job_status` | Check running or completed jobs, look up PR URLs |
| `get_system_technical_specs` | Read the CLAUDE.md architecture docs |
| `create_instance_job` | Scaffold a new ClawForge instance (Dockerfile, config, docker-compose entry) |

### The 12-Step Flow

```
 ┌──────┐                                                       ┌──────┐
 │ YOU  │                                                       │ YOU  │
 └──┬───┘                                                       └──▲───┘
    │ 1. Send message                                 12. Reply    │
    ▼                                                 in thread    │
 ┌───────────────┐                              ┌──────────────────┴──┐
 │ 2. CHANNEL    │                              │ 11. NOTIFICATION    │
 │ (Slack/TG/    │                              │     ROUTING         │
 │  Web Chat)    │                              │  - reply in thread  │
 └───────┬───────┘                              │  - LangGraph memory │
         │ webhook                              │  - job_outcomes DB  │
         ▼                                      └──────────▲──────────┘
 ┌───────────────┐                              ┌──────────┴──────────┐
 │ 3. TRAEFIK    │                              │ 10. MERGE GATE      │
 │ route by host │                              │  - blocked-paths    │
 └───────┬───────┘                              │    (instances/ etc) │
         ▼                                      │  - ALLOWED_PATHS    │
 ┌───────────────┐                              │  - auto or review   │
 │ 4. LANGGRAPH  │                              └──────────▲──────────┘
 │    AGENT      │                                         │
 │  - SOUL.md    │                              ┌──────────┴──────────┐
 │  - 4 tools    │                              │ 9. PR CREATION      │
 │  - SQLite     │                              │  --body-file        │
 │  - prior jobs │                              │  (structured body)  │
 └───────┬───────┘                              └──────────▲──────────┘
         │ user approves                                   │
         ▼                                      ┌──────────┴──────────┐
 ┌───────────────┐                              │ 8. CLAUDE CODE      │
 │ 5. CREATE_JOB │                              │    EXECUTION        │
 │  - UUID       │                              │  - read job.md      │
 │  - job.md     │                              │  - GSD skills       │
 │  - target.json│                              │  - atomic commits   │
 └───────┬───────┘                              └──────────▲──────────┘
         │ git push                                        │
         ▼ job/* branch                         ┌──────────┴──────────┐
 ┌───────────────┐                              │ 7. DOCKER           │
 │ 6. DISPATCH   │──────────────────────────────│    CONTAINER        │
 │  GH Actions   │  run-job.yml triggers on     │  - GHCR image       │
 │  (→ Docker    │  job/* branch push           │  - clone + checkout │
 │    Engine)    │                              │  - AGENT_ secrets   │
 └───────────────┘                              └─────────────────────┘
```

**Reading the diagram:** You send a message (1) through any channel (2). Traefik routes it (3) to your instance's LangGraph agent (4), which has your personality, tools, and conversation history. When work is needed, it creates a job (5) with a UUID branch. The dispatch layer (6) triggers a Docker container (7) where Claude Code runs autonomously (8), committing as it goes. When done, a PR is created (9) with a structured body. The merge gate (10) checks blocked paths and allowed paths before auto-merging or flagging for review. A notification (11) routes back to your exact thread (12) with the result injected into conversation memory.

---

## Directory Structure

```
clawforge/
├── api/
│   └── index.js ─────────── Webhook handlers (Slack, Telegram, GitHub, generic)
├── lib/
│   ├── ai/
│   │   ├── agent.js ──────── LangGraph ReAct agent + SQLite checkpointing
│   │   ├── tools.js ──────── create_job, get_job_status, get_specs, create_instance
│   │   ├── model.js ──────── Multi-provider LLM factory (Anthropic/OpenAI/Google)
│   │   └── index.js ──────── chat(), chatStream(), summarizeJob(), addToThread()
│   ├── channels/
│   │   ├── base.js ────────── Abstract ChannelAdapter interface
│   │   ├── slack.js ──────── HMAC-SHA256 verify, threading, file download
│   │   ├── telegram.js ──── Telegram bot adapter (grammy)
│   │   └── index.js ──────── Adapter factory (lazy singletons)
│   ├── tools/
│   │   ├── create-job.js ── UUID branch creation + target.json sidecar
│   │   ├── github.js ─────── GitHub API wrapper + job status
│   │   ├── repos.js ──────── REPOS.json loader + fuzzy repo resolver
│   │   └── telegram.js ──── Telegram API helpers
│   ├── db/
│   │   ├── schema.js ─────── SQLite tables (users, chats, messages, notifications, etc.)
│   │   ├── job-origins.js ── Thread → job mapping for notification routing
│   │   └── job-outcomes.js ─ Completed job results for prior-context enrichment
│   ├── auth/ ──────────────── NextAuth v5 (credentials provider)
│   ├── chat/ ──────────────── Web chat streaming + React components
│   ├── paths.js ────────────── Central path resolver
│   ├── actions.js ──────────── Action executor (agent/command/webhook)
│   └── triggers.js ─────────── TRIGGERS.json loader + fire-and-forget executor
├── config/ ──────────────────── Base config (SOUL.md, EVENT_HANDLER.md, AGENT.md)
├── instances/
│   ├── noah/ ────────────────── Noah's instance (Slack + Telegram + Web)
│   │   ├── Dockerfile
│   │   ├── config/ ──────────── SOUL.md, EVENT_HANDLER.md, AGENT.md
│   │   └── .env.example
│   └── strategyES/ ──────────── StrategyES instance (Slack only, Jim-restricted)
│       ├── Dockerfile
│       ├── config/
│       └── .env.example
├── templates/ ───────────────── Scaffolding templates
│   ├── docker/
│   │   └── job/ ──────────────── Job container Dockerfile + entrypoint.sh
│   └── .github/workflows/ ──── run-job, auto-merge, notify-pr-complete, etc.
├── docker-compose.yml ────────── Multi-instance orchestration (Traefik + instances)
└── .env.example
```

---

## API Routes

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/slack/events` | POST | Slack signing secret | Slack event webhook |
| `/api/telegram/webhook` | POST | Telegram webhook secret | Telegram updates |
| `/api/telegram/register` | POST | API key | Register Telegram webhook |
| `/api/github/webhook` | POST | GitHub webhook secret | Job completion notifications |
| `/api/create-job` | POST | API key | Generic job creation |
| `/api/jobs/status` | GET | API key | Job status (all running or specific job ID) |
| `/api/ping` | GET | Public | Health check |

---

## GitHub Secrets Convention

| Prefix | Passed to Container | Claude Code Can Access | Example |
|--------|--------------------|-----------------------|---------|
| `AGENT_` | Yes | No (filtered) | `AGENT_GH_TOKEN` |
| `AGENT_LLM_` | Yes | Yes | `AGENT_LLM_BRAVE_API_KEY` |
| *(none)* | No | No | `GH_WEBHOOK_SECRET` |

---

## Multi-Instance Isolation

Each instance runs in its own Docker network with its own environment, database, and Slack app. Instances cannot see each other's data or network traffic.

```
                    ┌─────────────────────┐
                    │     proxy-net        │
                    │  ┌───────────────┐   │
                    │  │   Traefik     │   │
                    │  └───┬───────┬───┘   │
                    └──────┼───────┼───────┘
                           │       │
            ┌──────────────┘       └──────────────┐
            ▼                                     ▼
  ┌─────────────────────┐            ┌─────────────────────┐
  │     noah-net        │            │  strategyES-net      │
  │                     │            │                      │
  │  ● Own .env         │            │  ● Own .env          │
  │  ● Own SQLite DB    │            │  ● Own SQLite DB     │
  │  ● Own Slack app    │            │  ● Own Slack app     │
  │  ● Can't see SES    │            │  ● Can't see Noah    │
  └─────────────────────┘            └──────────────────────┘
```

---

## LLM Providers

Set `LLM_PROVIDER` and `LLM_MODEL` in your instance environment:

| Provider | Default Model | Required Key |
|----------|---------------|--------------|
| `anthropic` | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |
| `openai` | `gpt-4o` | `OPENAI_API_KEY` |
| `google` | `gemini-2.5-pro` | `GOOGLE_API_KEY` |
| `custom` | (any) | `CUSTOM_API_KEY` + `OPENAI_BASE_URL` |

The `custom` provider supports any OpenAI-compatible endpoint (Ollama, vLLM, etc.).

---

## Cross-Repo Targeting

Jobs can target any repo in `config/REPOS.json`. The agent resolves natural language repo references (slugs, names, aliases) and writes a `target.json` sidecar alongside the job description.

```json
{
  "repos": [
    {
      "owner": "ScalingEngine",
      "slug": "neurostory",
      "name": "NeuroStory",
      "aliases": ["ns"]
    }
  ]
}
```

Usage in conversation: *"Create a landing page for NeuroStory"* — the agent resolves "NeuroStory" to the repo and targets the job accordingly.

---

## Job Container

The Docker job container (built and pushed to GHCR) includes:

| Component | Purpose |
|-----------|---------|
| Node.js 22 | Runtime |
| Claude Code CLI | AI agent (non-interactive `-p` mode) |
| GSD Skills (30 commands) | Project planning, execution, debugging |
| GitHub CLI (`gh`) | PR creation and git operations |
| Chrome dependencies | Playwright/browser automation support |

Claude Code runs with an `--allowedTools` whitelist (Read, Write, Edit, Bash, Glob, Grep, Task, Skill) instead of `--dangerously-skip-permissions`.

---

## Notification Routing

When a job completes, the notification routes back to the exact conversation where it started:

1. `create_job()` saves the originating thread ID + platform to `job_origins`
2. Job completes, GitHub Actions fires a webhook to the event handler
3. Event handler summarizes the results via LLM
4. Looks up `job_origins` to find the originating thread
5. Posts the summary as a reply in the original Slack thread or Telegram chat
6. Injects the summary into LangGraph memory for conversational continuity
7. Saves the outcome to `job_outcomes` for future thread-scoped context

---

## Roadmap

```
     SHIPPED                          IN PROGRESS              PLANNED
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━▶

  v1.0                v1.1              v1.2              v1.3
  ┌────────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ GSD Hardening  │  │ Agent Intel  │  │ Cross-Repo   │  │  Instance    │
  │                │  │ & Pipeline   │  │ Job Targeting │  │  Generator   │
  │ Phases 1-4     │  │ Phases 5-8   │  │ Phases 9-12  │  │ Phases 13-17 │
  │ 2026-02-24     │  │ 2026-02-25   │  │ 2026-02-27   │  │ in progress  │
  └────────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

  v1.4                v1.5              v1.6              v1.7          v1.8
  ┌────────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ ┌──────────┐
  │ Docker Engine  │  │ Persistent   │  │  MCP Tool    │  │  Smart   │ │  Multi-  │
  │ Foundation     │  │ Workspaces   │  │  Layer       │  │Execution │ │  Agent   │
  │ Phases 18-21   │  │ Phases 22-25 │  │ Phases 26-28 │  │  29-31   │ │ Clusters │
  └────────────────┘  └──────────────┘  └──────────────┘  └──────────┘ └──────────┘
```

### Milestones

| Version | Milestone | Phases | Status |
|---------|-----------|--------|--------|
| v1.0 | GSD Verification & Hardening | 1-4 | Shipped 2026-02-24 |
| v1.1 | Agent Intelligence & Pipeline Hardening | 5-8 | Shipped 2026-02-25 |
| v1.2 | Cross-Repo Job Targeting | 9-12 | Shipped 2026-02-27 |
| v1.3 | Instance Generator | 13-17 | In progress |
| v1.4 | Docker Engine Foundation | 18-21 | Planned |
| v1.5 | Persistent Workspaces | 22-25 | Planned |
| v1.6 | MCP Tool Layer | 26-28 | Planned |
| v1.7 | Smart Execution | 29-31 | Planned |
| v1.8 | Multi-Agent Clusters | 32-34 | Future |

### What Each Milestone Delivers

**v1.0-v1.2 (Shipped)** — Foundation. Claude Code CLI in Docker containers, git-commit audit trail, PR-based delivery, multi-channel support (Slack/Telegram/Web), cross-repo job targeting, notification routing back to originating thread.

**v1.3 (In Progress)** — Instance creation via chat. Operators describe a new agent instance in conversation, Archie scaffolds the full config (Dockerfile, SOUL.md, AGENT.md, EVENT_HANDLER.md, docker-compose entry, REPOS.json, .env.example) and opens a PR with setup instructions.

```
 Operator                     Archie                    GitHub
    │                           │                          │
    │  "create instance for X"  │                          │
    │ ────────────────────────▶ │                          │
    │                           │                          │
    │  ◀── intake questions ──▶ │  (3-4 turns)            │
    │                           │                          │
    │  "approved"               │                          │
    │ ────────────────────────▶ │                          │
    │                           │── push job/* branch ───▶ │
    │                           │                          │── Actions: run-job.yml
    │                           │                          │── Claude Code container
    │                           │                          │── scaffold 7 artifacts
    │                           │                     PR ◀─┤  (blocked from auto-merge)
    │                           │  ◀── notification ─────  │
    │  ◀── "PR ready for       │                          │
    │       review" ───────────┤                          │
    │                           │                          │
    │  Operator reviews PR, merges, runs setup commands    │
```

**v1.4 (Planned)** — Docker Engine API replaces GitHub Actions for job dispatch. Containers start in seconds instead of minutes. Actions retained as fallback for CI-integrated repos.

**v1.5 (Planned)** — Persistent interactive workspaces. Browser-based terminal (ttyd + xterm.js) connected to long-running containers. Operators can work interactively with Claude Code, not just fire-and-forget jobs.

**v1.6 (Planned)** — Per-instance MCP server configuration. Each agent gets curated tool access (databases, APIs, services) via MCP servers started alongside Claude Code in the job container.

**v1.7 (Planned)** — Quality gates. Lint + typecheck before commit, CI feedback loops (at most 2 retries), per-repo merge policies replacing the current path-based auto-merge.

**v1.8 (Future)** — Multi-agent coordination. A lead agent decomposes complex tasks, dispatches to worker containers operating on shared volumes or separate branches, then aggregates results into a single PR.

---

## Acknowledgements

Built on [thepopebot](https://github.com/stephengpope/thepopebot) by Stephen Pope. Adapted for Claude Code CLI by Noah Wessel / [Scaling Engine](https://scalingengine.com).

---

## Docs

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Full system diagrams, 10-step flow, container internals |
| [Configuration](docs/CONFIGURATION.md) | Environment variables, GitHub secrets, repo variables |
| [Customization](docs/CUSTOMIZATION.md) | Personality files, skills, agent behavior |
| [Chat Integrations](docs/CHAT_INTEGRATIONS.md) | Slack, Telegram, Web Chat setup |
| [Auto-Merge](docs/AUTO_MERGE.md) | Path-based auto-merge controls |
| [Deployment](docs/DEPLOYMENT.md) | VPS setup, Docker Compose, HTTPS |
| [Security](docs/SECURITY.md) | Security model, risks, recommendations |
| [Upgrading](docs/UPGRADE.md) | Automated upgrades, recovery |

---

## License

MIT
