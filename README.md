# ClawForge

**Ship AI-authored PRs from a Slack message.** Multi-channel conversational interface, Docker-isolated execution, git-native audit trail. Every action is a commit, every change is a PR.

ClawForge applies the architectural patterns from [Stripe's Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) — deterministic quality gates, context hydration, one-shot execution — on infrastructure you actually control. No AWS. No Kubernetes. Docker Compose on a single VPS.

---

## Full Architecture

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                              C L A W F O R G E                                 ║
║            Multi-channel AI agent gateway → Docker-isolated execution          ║
╚══════════════════════════════════════════════════════════════════════════════════╝


 HOW YOU USE IT
 ══════════════

  ┌─────────┐    ┌──────────┐    ┌──────────┐
  │  Slack   │    │ Telegram │    │ Web Chat │
  │  thread  │    │   chat   │    │  (React) │
  └────┬─────┘    └────┬─────┘    └────┬─────┘
       │               │               │
       │   "Fix the login bug          │
       │    in SmartQuote"             │
       │               │               │
       ▼               ▼               ▼
  ┌────────────────────────────────────────────────────────────┐
  │                    TRAEFIK (HTTPS)                         │
  │              clawforge.scalingengine.com                   │
  │         Routes by hostname → correct instance              │
  └────────────────────────┬───────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                                 ▼
  ┌───────────────────┐            ┌───────────────────┐
  │   NOAH INSTANCE   │            │   SES INSTANCE    │
  │   (noah-net)      │            │ (strategyES-net)  │
  │                   │            │                   │
  │ All channels      │            │ Slack only        │
  │ All repos         │            │ strategyes-lab/   │
  └────────┬──────────┘            └────────┬──────────┘
           │                                │
           ▼                                ▼

 LAYER 1 — EVENT HANDLER (always-on, PM2)
 ═════════════════════════════════════════

  ┌────────────────────────────────────────────────────────────┐
  │                    Next.js App (PM2)                        │
  │                                                            │
  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
  │  │ Channel      │  │  LangGraph   │  │   Web UI        │  │
  │  │ Adapters     │  │  ReAct Agent │  │                  │  │
  │  │              │  │              │  │  Auth (NextAuth) │  │
  │  │ slack.js     │  │ agent.js     │  │  Chat panel      │  │
  │  │ telegram.js  │  │ model.js     │  │  Repo selector   │  │
  │  │ base.js      │  │ tools.js     │  │  Code mode       │  │
  │  └──────┬───────┘  └──────┬───────┘  │  Stream viewer   │  │
  │         │                 │          │  Workspace term   │  │
  │         │    Conversation │          └────────┬──────────┘  │
  │         │    + routing    │                   │             │
  │         └────────┬────────┘                   │             │
  │                  ▼                            │             │
  │  ┌──────────────────────────────────┐         │             │
  │  │         AGENT TOOLS              │         │             │
  │  │                                  │         │             │
  │  │  create_job ──── single agent    │         │             │
  │  │  create_cluster_job ── multi     │         │             │
  │  │  start_coding ── workspace       │◄────────┘             │
  │  │  cancel_job ──── stop container  │                       │
  │  │  get_job_status                  │                       │
  │  │  get_project_state               │                       │
  │  │  create_instance_job             │                       │
  │  │  get_system_technical_specs      │                       │
  │  │  web_search (Brave API)          │                       │
  │  │  list_workspaces                 │                       │
  │  └──────────┬───────────────────────┘                       │
  │             │                                               │
  │  ┌──────────▼───────────────────────┐                       │
  │  │      CONTEXT HYDRATION           │                       │
  │  │                                  │                       │
  │  │  1. Read .planning/STATE.md      │                       │
  │  │  2. Read ROADMAP.md              │                       │
  │  │  3. Recent git history           │                       │
  │  │  4. Prior job outcome (thread)   │                       │
  │  │  5. Write job.md with full ctx   │                       │
  │  └──────────┬───────────────────────┘                       │
  │             │                                               │
  │  ┌──────────▼───────────────────────┐                       │
  │  │      PERSISTENCE                 │                       │
  │  │                                  │                       │
  │  │  SQLite (Drizzle ORM)            │                       │
  │  │  ├─ conversations (checkpoints)  │                       │
  │  │  ├─ job_outcomes                 │                       │
  │  │  ├─ docker_jobs (active runs)    │                       │
  │  │  ├─ cluster_runs                 │                       │
  │  │  ├─ users + roles                │                       │
  │  │  ├─ repos (allowed repos)        │                       │
  │  │  ├─ notifications                │                       │
  │  │  ├─ error_log                    │                       │
  │  │  ├─ usage tracking               │                       │
  │  │  └─ config (key-value)           │                       │
  │  └──────────────────────────────────┘                       │
  │                                                             │
  │  Instance Config (named volume):                            │
  │  ├─ SOUL.md ──────── personality                            │
  │  ├─ EVENT_HANDLER.md  conversational behavior               │
  │  ├─ AGENT.md ──────── job container behavior                │
  │  ├─ REPOS.json ────── allowed repositories                  │
  │  └─ MCP_SERVERS.json  per-instance MCP tools                │
  └─────────────────────────┬───────────────────────────────────┘
                            │
                            │  Docker Engine API (direct spawn)
                            │  ─── OR ───
                            │  job.md pushed to git branch
                            │  (GitHub Actions fallback)
                            │
                            ▼

 LAYER 2 — JOB CONTAINER (per-task, ephemeral)
 ═════════════════════════════════════════════

  ┌────────────────────────────────────────────────────────────┐
  │              Docker Container (Node 22)                     │
  │                                                            │
  │  entrypoint.sh:                                            │
  │  ┌──────────────────────────────────────────────────────┐  │
  │  │  1. Clone target repo (or use warm named volume)     │  │
  │  │  2. Inject SOUL.md + AGENT.md + CLAUDE.md            │  │
  │  │  3. Inject MCP config (--mcp-config)                 │  │
  │  │  4. Resolve {{AGENT_LLM_*}} template vars            │  │
  │  │  5. Run: claude -p "$(cat job.md)" --allowedTools    │  │
  │  │  6. Commit changes → Open PR                         │  │
  │  │  7. Stream logs back (SSE) with secret scrubbing     │  │
  │  └──────────────────────────────────────────────────────┘  │
  │                                                            │
  │  Available in container:                                    │
  │  ├─ Claude Code CLI + GSD (30 commands)                    │
  │  ├─ Node 22 / gh CLI / git                                 │
  │  ├─ Chrome + Playwright                                    │
  │  ├─ MCP servers (if configured)                            │
  │  └─ AGENT_LLM_* secrets (visible to LLM)                  │
  │                                                            │
  │  NOT available:                                             │
  │  ├─ Slack / Telegram access                                │
  │  ├─ User database                                          │
  │  ├─ Other instance data                                    │
  │  └─ AGENT_* secrets (filtered from LLM)                    │
  └─────────────────────────┬──────────────────────────────────┘
                            │
                            ▼

 DELIVERY
 ════════

  ┌────────────────────────────────────────────────────────────┐
  │                    TWO-STAGE MERGE GATE                     │
  │                                                            │
  │  Stage 1: blocked-paths check                              │
  │  ├─ Instance PRs (config changes) → require human review   │
  │  └─ Code PRs → proceed to stage 2                         │
  │                                                            │
  │  Stage 2: ALLOWED_PATHS whitelist                          │
  │  ├─ Changes within allowed dirs → auto-merge               │
  │  └─ Changes outside → require review                       │
  └─────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
  ┌────────────────────────────────────────────────────────────┐
  │  Live log streaming → originating Slack/TG/Web thread      │
  │  Summary injected into LangGraph memory for follow-ups     │
  │  Job outcome saved to SQLite for future context            │
  └────────────────────────────────────────────────────────────┘


 MULTI-AGENT CLUSTERS
 ════════════════════

  CLUSTER.json defines role pipelines:

  ┌──────────┐  "needs_impl"  ┌─────────────┐  "needs_review" ┌──────────┐
  │Researcher│──────────────▶│ Implementer  │───────────────▶│ Reviewer  │
  │          │                │              │                │           │
  │ outbox/  │  copied to     │ outbox/      │  copied to     │ outbox/   │
  │ └─notes  │  next inbox    │ └─code       │  next inbox    │ └─report  │
  └──────────┘                └──────────────┘                └───────┬───┘
       ▲                                                             │
       └──────────── "needs_research" (cycle back) ─────────────────┘

  Safety: max 5 iterations/agent, 15 total/run
  Each agent gets its own Docker volume — no shared state


 PERSISTENT WORKSPACES
 ═════════════════════

  Web UI → "Start Coding" → Docker container stays alive

  ┌──────────────────────────────────────┐
  │  Browser (xterm.js)  ◄──WebSocket──▶ │  Docker Container
  │  ├─ Interactive terminal             │  ├─ Named volume (warm state)
  │  ├─ Run Claude Code live             │  ├─ Full repo clone
  │  └─ Persists across sessions         │  └─ MCP servers active
  └──────────────────────────────────────┘


 INFRASTRUCTURE (VPS)
 ════════════════════

  ┌─────────────────────────────────────────────────┐
  │              Docker Compose on VPS               │
  │                                                  │
  │  ┌─────────┐  ┌──────────┐  ┌──────────────┐   │
  │  │ Traefik │  │  Noah    │  │  StrategyES  │   │
  │  │ (HTTPS) │  │ (PM2)   │  │  (PM2)       │   │
  │  │ :80/:443│  │          │  │              │   │
  │  └─────────┘  └──────────┘  └──────────────┘   │
  │                                                  │
  │  ┌──────────────────┐  ┌─────────────────────┐  │
  │  │  GitHub Runner   │  │  Job Containers     │  │
  │  │  (self-hosted)   │  │  (spawned on demand)│  │
  │  └──────────────────┘  └─────────────────────┘  │
  │                                                  │
  │  Named Volumes: noah-data, noah-config,          │
  │  ses-data, ses-config, traefik_certs,            │
  │  job warm-clone volumes                          │
  └─────────────────────────────────────────────────┘

  GitHub Actions (fallback + CI):
  ├─ rebuild-event-handler.yml  (push to main → redeploy)
  ├─ run-job.yml                (job/* branch → container)
  ├─ auto-merge.yml             (PR merge gate)
  ├─ notify-pr-complete.yml     (result routing)
  └─ notify-job-failed.yml      (failure alerts)
```

---

## Why ClawForge

Stripe ships 1,000+ AI-authored PRs per week with their Minions system. [OpenClaw](https://github.com/openclaw/openclaw) connects 20+ chat platforms to AI agents running on your machine. ClawForge occupies the space between them: Stripe-grade architecture patterns — containerized execution, context hydration, quality gates — without enterprise infrastructure, and with the production isolation that local-first tools can't provide.

### vs. Stripe Minions

Stripe's architecture requires a 100M-line monorepo, custom devbox infrastructure, and deep AWS integration. ClawForge brings the same patterns to teams running Docker Compose on a VPS.

| Capability | Stripe Minions | ClawForge |
|---|---|---|
| Entry points | Slack, CLI, web, embedded buttons | Slack, Telegram, Web Chat |
| Agent engine | Fork of Block's Goose | [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) + [GSD](https://github.com/gsd-build/get-shit-done) |
| Execution model | Pre-warmed devboxes (10s startup) | Docker containers with named volumes (warm starts) |
| Tool access | 400+ MCP tools via internal Toolshed | Per-instance MCP server configs with `--mcp-config` |
| Quality gates | Local lint (<5s) + max 2 CI runs | `--allowedTools` whitelist + secret filtering |
| Context hydration | Pre-fetch MCP tools on likely links | Repo context injection + `.planning/*` state hydration |
| Isolation | Devbox per run | Docker network per instance, per-agent volumes in clusters |
| Merge policy | Human review for complex PRs | Two-stage gate: blocked-paths + ALLOWED_PATHS whitelist |
| Multi-agent | Single agent per task | Multi-agent clusters with label-based routing |
| Infrastructure | AWS, internal platform | Docker Compose on any VPS |

### vs. OpenClaw

OpenClaw is a local-first gateway — it connects chat platforms to AI agents running natively on your machine. Great for personal productivity. ClawForge is built for production team workflows where isolation, audit trails, and multi-repo targeting matter.

| Capability | OpenClaw | ClawForge |
|---|---|---|
| Architecture | Local gateway daemon (WebSocket) | Docker containers per job (isolated) |
| Execution | Native on host machine | Containerized — nothing touches the host |
| Audit trail | Process logs, session output | Every action is a git commit, every change is a PR |
| Isolation | Permission boundaries, allowlists | Docker network per instance, separate DBs and secrets |
| Coding agent | Delegates to Codex/Claude/Pi/OpenCode | Claude Code CLI with structured GSD workflows |
| Multi-repo | Single workdir per session | Cross-repo targeting with `REPOS.json` + `target.json` |
| Context between jobs | Persistent local state | Repo-as-memory (`.planning/*`) + thread-scoped job outcomes |
| Merge workflow | No native PR/merge pipeline | Two-stage merge gate with auto-merge and blocked-paths |
| Team use | Single-user, local machine | Multi-instance, multi-user, shared VPS |
| Channel support | 20+ platforms | Slack, Telegram, Web Chat (focused, deep integration) |
| Workspaces | No persistent sessions | Browser terminal to persistent Docker containers |
| Multi-agent | Single agent | Cluster pipelines with coordinator dispatch |

---

## The Two-Layer Design

ClawForge runs **two completely separate AI agents** that never share context.

```
  LAYER 1: CONVERSATIONAL                    LAYER 2: EXECUTION
  ─────────────────────────                  ─────────────────────

  ┌─────────────────────────┐               ┌─────────────────────────┐
  │   Event Handler Agent   │               │     Claude Code CLI     │
  │                         │               │                         │
  │  LangGraph ReAct agent  │               │  Autonomous coder       │
  │  Multi-provider LLM     │   job.md      │  Always Claude          │
  │  (Anthropic / OpenAI /  │ ────────────▶ │  (via CLI)              │
  │   Google / custom)      │  (text file   │                         │
  │                         │   is the      │  No memory between jobs │
  │  Persistent memory      │   ONLY link)  │  Fresh clone each run   │
  │  (SQLite checkpoints)   │   between     │                         │
  │                         │   layers)     │  Knows: the repo,       │
  │  Knows: conversation    │               │  job.md prompt,         │
  │  history, user prefs,   │               │  GSD skills (30 cmds),  │
  │  prior job outcomes,    │               │  CLAUDE.md rules,       │
  │  project state          │               │  MCP tools (if config'd)│
  │                         │               │                         │
  │  Can't: edit files,     │               │  Can't: see Slack,      │
  │  run tests directly     │               │  read messages, talk    │
  │                         │               │  to user, access DB     │
  └─────────────────────────┘               └─────────────────────────┘

  Always-on (PM2)                           Per-job (container
  Scope: conversation + routing             starts → works → exits)
```

**The only link between them is `job.md`** — a text file pushed to a git branch. Layer 1 writes it. Layer 2 reads it. That's the entire interface.

- **Context hydration** — Before writing job.md, Layer 1 pulls project state (roadmap, current phase, blockers) from the target repo via GitHub API. The conversational agent *understands the codebase* before dispatching work — [Stripe's pre-hydration pattern](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) applied to the two-layer model
- The conversational agent's quality at *describing* work determines the coding agent's success
- Each coding job starts fresh — no accumulated state, no context bleed between jobs
- Job outcomes flow back as summaries (PR → webhook → Layer 1 memory)
- Prior job context is injected into the *next* job.md when you're in the same thread

**The repo itself is the long-term memory.** Claude Code writes to `.planning/STATE.md` and `ROADMAP.md` during every execution. The next job reads those files and picks up where the last one left off. [GSD skills](https://github.com/gsd-build/get-shit-done) are the structured workflows that maintain this state — without them, each job would be truly isolated.

---

## Key Features

**Channels & Instances**
- **Multi-channel** — Slack, Telegram, and Web Chat through a unified adapter interface
- **Multi-instance** — Run isolated agents for different users, repos, or Slack workspaces on one box
- **Docker network isolation** — Each instance gets its own network, env vars, SQLite DB, and Slack app
- **Instance creation via chat** — Describe a new agent in conversation; ClawForge scaffolds the full config as a PR

**Execution & Delivery**
- **Docker Engine API dispatch** — Containers spawn in seconds via Docker Engine API (GitHub Actions as fallback)
- **Named volumes** — Git clones persist across jobs for warm starts — no re-cloning on every run
- **Cross-repo targeting** — Jobs target any repo in the allowed list via `REPOS.json` + `target.json` sidecar
- **Git as audit trail** — Every agent action is a commit. Every change is a PR. Full visibility and reversibility
- **Two-stage merge gate** — Blocked-paths check (instance PRs need review) + ALLOWED_PATHS whitelist (safe dirs auto-merge)
- **Secret filtering** — `AGENT_` secrets reach the container but are filtered from the LLM's view

**Intelligence & Memory**
- **Multi-provider LLM** — Anthropic (default), OpenAI, Google Gemini, or any OpenAI-compatible endpoint
- **Context hydration** — Layer 1 reads `.planning/STATE.md`, `ROADMAP.md`, and recent history from target repos before writing job.md
- **Thread-aware notifications** — Results route back to the originating Slack thread or Telegram chat
- **Conversational memory** — Job outcomes are injected into LangGraph memory for follow-up context
- **Prior job continuity** — New jobs in a thread automatically include the previous job's outcome

**Headless Log Streaming**
- **Live job output** — Watch Claude Code work in real time from Slack or Web Chat — no reload required
- **Semantic filtering** — Only meaningful events (file saves, bash outputs, decisions) surface; raw JSONL is suppressed
- **Secret scrubbing** — Double-pass scrubbing ensures no secrets leak into streamed output
- **Job cancellation** — Say "cancel the job" to stop a running container cleanly; the branch is preserved for inspection

**Persistent Workspaces**
- **Browser terminal** — Open a persistent Docker container with a full terminal in your browser (xterm.js)
- **Interactive Claude Code** — Start a workspace to run Claude Code interactively, not just one-shot jobs
- **Warm state** — Workspaces persist across sessions on named volumes

**MCP Tool Layer**
- **Per-instance MCP configs** — Define MCP servers in `MCP_SERVERS.json` per instance with curated tool subsets
- **Template variables** — `{{AGENT_LLM_*}}` placeholders resolve from environment at container start — credentials never in git
- **Container injection** — Both job and workspace containers receive identical MCP config via `--mcp-config`
- **Graceful degradation** — If an MCP server fails to connect, the job continues with remaining healthy servers

**Multi-Agent Clusters**
- **Cluster definitions** — Define multi-agent pipelines in `CLUSTER.json` with named roles, system prompts, and allowed tools
- **Coordinator dispatch** — A coordinator loop runs agents sequentially, copying outbox→inbox between steps
- **Label-based routing** — Each agent writes a label (e.g., `needs_review`, `complete`) to `outbox/label.txt`; the coordinator uses transition maps to pick the next agent
- **Volume isolation** — Every agent in a cluster gets its own Docker volume — no two concurrent agents share state
- **Safety limits** — Hard caps prevent runaway cost: 5 iterations per agent cycle, 15 total per run
- **Slack thread updates** — Cluster progress posts as replies in a single Slack thread, not a flood of messages

**Web UI**
- **Server-side auth** — Every Server Action enforces NextAuth session checks; no client-only auth
- **Admin panel** — Instance config, user management, repo management, secrets, webhooks, billing
- **Repo/branch selector** — Anchor a chat session to a specific repo and branch from dropdown menus
- **Code mode** — Toggle monospace rendering for code-heavy responses
- **Voice input** — AssemblyAI real-time streaming for voice-to-text in the chat input
- **Feature flags** — Per-instance feature toggles control which UI capabilities are available
- **Superadmin dashboard** — Multi-instance monitoring, search, and error tracking

**Observability**
- **Error logging** — Structured error capture to SQLite with stack traces
- **Job logger** — Per-job execution logs with timing and outcome tracking
- **Usage tracking** — Token and cost tracking per instance
- **Monitoring alerts** — Configurable alert rules for job failures and system health

---

## Multi-Instance Isolation

Each instance runs in its own Docker network. Instances cannot see each other's data, environment, or traffic.

```
                      ┌───────────────────┐
                      │     proxy-net      │
                      │  ┌─────────────┐  │
                      │  │   Traefik   │  │
                      │  └──┬───────┬──┘  │
                      └─────┼───────┼─────┘
                            │       │
              ┌─────────────┘       └─────────────┐
              ▼                                   ▼
    ┌───────────────────┐           ┌───────────────────┐
    │  instance-a-net   │           │  instance-b-net   │
    │                   │           │                   │
    │  ● Own .env       │           │  ● Own .env       │
    │  ● Own SQLite DB  │           │  ● Own SQLite DB  │
    │  ● Own Slack app  │           │  ● Own Slack app  │
    │  ● Own MCP config │           │  ● Own MCP config │
    │  ● Can't see B    │           │  ● Can't see A    │
    └───────────────────┘           └───────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Next.js (API routes + React UI) |
| **AI (Layer 1)** | LangGraph ReAct agent, multi-provider LLM (Anthropic/OpenAI/Google) |
| **AI (Layer 2)** | Claude Code CLI + GSD skills (30 commands) |
| **Database** | SQLite via Drizzle ORM |
| **Auth** | NextAuth v5 (credentials provider), role-based (admin/user) |
| **Channels** | @slack/web-api, grammy (Telegram), React chat UI |
| **Containers** | Docker Engine API (dockerode), Docker Compose |
| **Reverse proxy** | Traefik v3 (auto HTTPS via Let's Encrypt) |
| **CI/CD** | GitHub Actions (self-hosted runner on VPS) |
| **Voice** | AssemblyAI real-time streaming |
| **Browser automation** | Chrome + Playwright (in job containers) |
| **Search** | Brave Search API (web_search tool) |
| **Process manager** | PM2 (keeps event handlers alive) |

---

## Agent Tools

These are the tools available to the Layer 1 LangGraph agent:

| Tool | Purpose |
|------|---------|
| `create_job` | Dispatch a single-agent job to a Docker container |
| `create_cluster_job` | Dispatch a multi-agent cluster pipeline |
| `create_instance_job` | Scaffold a new ClawForge instance as a PR |
| `start_coding` | Launch a persistent workspace container |
| `list_workspaces` | Show active workspace containers |
| `cancel_job` | Stop a running job container cleanly |
| `get_job_status` | Check if a job is running, succeeded, or failed |
| `get_project_state` | Read `.planning/*` state from a target repo |
| `get_system_technical_specs` | Return system info (memory, disk, Docker version) |
| `web_search` | Search the web via Brave Search API |

---

## GitHub Secrets Convention

| Prefix | Passed to Container | LLM Can Access | Example |
|--------|--------------------|--------------------|---------|
| `AGENT_` | Yes | No (filtered) | `AGENT_GH_TOKEN` |
| `AGENT_LLM_` | Yes | Yes | `AGENT_LLM_BRAVE_API_KEY` |
| *(none)* | No | No | `GH_WEBHOOK_SECRET` |

---

## Directory Structure

```
/
├── api/                          # Next.js API route handlers
│   ├── index.js                  # GET/POST catch-all (telegram, slack, github webhooks)
│   └── superadmin.js             # Multi-instance admin endpoints
├── lib/                          # Core implementation
│   ├── ai/                       # LangGraph agent, model factory, tools
│   │   ├── agent.js              # ReAct agent singleton with SQLite checkpointing
│   │   ├── tools.js              # create_job, cancel_job, cluster_job, start_coding, etc.
│   │   ├── model.js              # Multi-provider LLM (anthropic/openai/google)
│   │   ├── web-search.js         # Brave Search API integration
│   │   └── index.js              # chat(), chatStream(), summarizeJob()
│   ├── channels/                 # Channel adapters
│   │   ├── base.js               # Abstract ChannelAdapter interface
│   │   ├── telegram.js           # Telegram via grammy
│   │   ├── slack.js              # Slack via @slack/web-api
│   │   └── index.js              # Adapter factory
│   ├── chat/                     # Web chat streaming + React components
│   │   ├── components/           # 50+ components: chat, admin, clusters, settings, etc.
│   │   ├── features-context.jsx  # Per-instance feature flag context
│   │   ├── repo-chat-context.jsx # Repo/branch selection context
│   │   ├── terminal-api.js       # Workspace terminal WebSocket bridge
│   │   └── actions.js            # Server Actions (send message, manage chats)
│   ├── cluster/                  # Multi-agent cluster runtime
│   │   ├── config.js             # CLUSTER.json loader + validator
│   │   ├── coordinator.js        # Dispatch loop, label routing, safety limits
│   │   ├── volume.js             # Per-agent Docker volume management
│   │   └── index.js              # runCluster() entry point
│   ├── db/                       # SQLite via Drizzle ORM
│   │   ├── schema.js             # All table definitions
│   │   ├── users.js              # User CRUD + role management
│   │   ├── docker-jobs.js        # Active job tracking
│   │   ├── cluster-runs.js       # Cluster execution records
│   │   ├── job-outcomes.js       # Completed job results
│   │   ├── job-origins.js        # Thread→job mapping for notifications
│   │   ├── repos.js              # Allowed repository registry
│   │   ├── chats.js              # Chat history persistence
│   │   ├── notifications.js      # Notification queue
│   │   ├── workspaces.js         # Active workspace records
│   │   ├── error-log.js          # Structured error capture
│   │   ├── usage.js              # Token/cost tracking
│   │   ├── config.js             # Key-value config store
│   │   ├── crypto.js             # AES-256-GCM encryption (Node crypto)
│   │   ├── api-keys.js           # API key management
│   │   └── update-check.js       # Version update tracking
│   ├── tools/                    # Job creation + external integrations
│   │   ├── create-job.js         # Job dispatch (branch + job.md via GitHub API)
│   │   ├── docker.js             # Docker Engine API job dispatch
│   │   ├── instance-job.js       # Instance scaffolding
│   │   ├── stream-manager.js     # SSE log streaming to channels
│   │   ├── log-parser.js         # Semantic JSONL → human-readable events
│   │   ├── mcp-servers.js        # MCP config template resolution
│   │   ├── repos.js              # REPOS.json management
│   │   ├── github.js             # GitHub API helpers
│   │   ├── telegram.js           # Telegram-specific helpers
│   │   └── openai.js             # OpenAI-compatible endpoint helper
│   ├── jobs/                     # Job streaming infrastructure
│   │   └── stream-api.js         # SSE endpoint for live job output
│   ├── ws/                       # Persistent workspace management
│   │   ├── server.js             # WebSocket proxy (browser ↔ container)
│   │   ├── proxy.js              # ttyd protocol bridge
│   │   ├── actions.js            # Create/stop/list workspace containers
│   │   ├── tickets.js            # Auth ticket system for WebSocket
│   │   └── session-manager.js    # Session lifecycle
│   ├── auth/                     # NextAuth v5 (credentials provider)
│   ├── voice/                    # Voice input
│   │   ├── recorder.js           # AudioWorklet microphone capture
│   │   ├── transcription.js      # AssemblyAI real-time streaming
│   │   └── config.js             # Voice feature configuration
│   ├── terminal/                 # Terminal session management
│   │   ├── session-manager.js    # Terminal session lifecycle
│   │   ├── sdk-bridge.js         # Claude Code SDK bridge
│   │   └── cost-tracker.js       # Per-session cost tracking
│   ├── monitoring/               # System health
│   │   └── alerts.js             # Configurable alert rules
│   ├── observability/            # Logging + error tracking
│   │   ├── logger.js             # Structured logging
│   │   ├── job-logger.js         # Per-job execution logs
│   │   └── errors.js             # Error capture + persistence
│   ├── billing/                  # Usage enforcement
│   │   └── enforce.js            # Rate limiting + quota checks
│   ├── onboarding/               # New user setup
│   │   ├── state.js              # Onboarding progress tracking
│   │   └── verify.js             # Setup verification checks
│   ├── superadmin/               # Multi-instance admin
│   │   ├── config.js             # Superadmin configuration
│   │   └── client.js             # Cross-instance API client
│   ├── actions.js                # Action executor (agent/command/webhook/cluster)
│   ├── config.js                 # App configuration loader
│   ├── cron.js                   # Scheduled task runner
│   ├── triggers.js               # Event trigger definitions
│   ├── github-api.js             # GitHub API wrapper (secrets, variables, repos)
│   ├── llm-providers.js          # LLM provider registry
│   └── paths.js                  # Central path resolver
├── config/                       # Base config (overridden by instances)
├── instances/                    # Per-instance configuration
│   ├── noah/
│   │   ├── Dockerfile
│   │   └── config/               # SOUL.md, EVENT_HANDLER.md, AGENT.md,
│   │                             # MCP_SERVERS.json, REPOS.json
│   └── strategyES/
│       ├── Dockerfile
│       └── config/               # SOUL.md, EVENT_HANDLER.md, AGENT.md, REPOS.json
├── templates/                    # Scaffolding templates
│   ├── docker/
│   │   ├── job/                  # Claude Code job container
│   │   │   ├── Dockerfile        # Node 22 + Claude Code CLI + GSD + Chrome deps
│   │   │   └── entrypoint.sh     # Clone → hydrate context → Claude Code → commit → PR
│   │   └── event-handler/        # PM2 + Next.js container
│   └── .github/workflows/
│       ├── run-job.yml           # Triggers Docker container on job/* branch
│       ├── auto-merge.yml        # Path-restricted auto-merge
│       ├── notify-pr-complete.yml
│       └── notify-job-failed.yml
├── drizzle/                      # Database migrations
├── docker-compose.yml            # Multi-instance orchestration (Traefik + instances)
├── .github/workflows/
│   ├── rebuild-event-handler.yml # Push to main → rebuild + restart containers on VPS
│   ├── build-image.yml           # Build + publish job container image
│   └── claude.yml                # Claude Code automation
└── .env.example                  # All environment variables
```

---

## Web UI Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `chat-page` | Main chat interface with streaming |
| `/chats` | `chats-page` | Chat history browser |
| `/admin` | `admin-layout` | Admin panel hub |
| `/admin/general` | `admin-general-page` | Instance settings |
| `/admin/users` | `admin-users-page` | User + role management |
| `/admin/repos` | `admin-repos-page` | Allowed repository management |
| `/admin/instances` | `admin-instances-page` | Instance configuration |
| `/admin/webhooks` | `admin-webhooks-page` | Webhook configuration |
| `/admin/billing` | `admin-billing-page` | Usage + billing |
| `/settings/secrets` | `settings-secrets-page` | GitHub secrets CRUD |
| `/settings/mcp` | `settings-mcp-page` | MCP server viewer |
| `/clusters` | `clusters-page` | Cluster definitions |
| `/clusters/[id]` | `cluster-detail-page` | Cluster run details + logs |
| `/swarm` | `swarm-page` | Active job overview |
| `/runners` | `runners-page` | GitHub Actions runner status |
| `/pull-requests` | `pull-requests-page` | PR tracking |
| `/crons` | `crons-page` | Scheduled job management |
| `/triggers` | `triggers-page` | Event trigger configuration |
| `/notifications` | `notifications-page` | Notification center |
| `/profile` | `profile-page` | User profile + preferences |
| `/superadmin` | `superadmin-dashboard` | Multi-instance dashboard |
| `/forbidden` | `forbidden-page` | Access denied |

---

## Quick Start

```bash
npm run dev          # Start dev server
npm run build        # Production build
docker compose up    # Multi-instance orchestration on VPS
```

See [Deployment](docs/DEPLOYMENT.md) for full VPS setup with HTTPS.

---

## Roadmap

All milestones shipped. ClawForge v2.0 is feature-complete.

```
  v1.0 ━━━━ v1.1 ━━━━ v1.2 ━━━━ v1.3 ━━━━ v1.4 ━━━━ v1.5 ━━━━ v2.0
   GSD      Agent     Cross-   Instance   Docker   Persistent   Full
  Harden   Intel      Repo     Generator  Engine   Workspaces  Platform
```

| Version | Milestone | What It Delivers |
|---------|-----------|------------------|
| **v1.0** | GSD Hardening | Claude Code CLI in Docker, git-commit audit trail, PR-based delivery |
| **v1.1** | Agent Intelligence | Smart job prompts with repo context injection, prior job continuity |
| **v1.2** | Cross-Repo Targeting | Jobs target any allowed repo, notifications route back correctly |
| **v1.3** | Instance Generator | Create new agent instances through chat — full config scaffolded as a PR |
| **v1.4** | Docker Engine | Direct Docker API dispatch (seconds, not minutes). Named volumes for warm starts |
| **v1.5** | Persistent Workspaces | Browser terminal (xterm.js) to interactive Claude Code containers |
| **v2.0** | Full Platform | Headless log streaming, web UI auth + repo selector, MCP tool layer, multi-agent clusters |

---

## Docs

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System diagrams, container internals, execution flow |
| [Configuration](docs/CONFIGURATION.md) | Environment variables, GitHub secrets, repo variables |
| [Customization](docs/CUSTOMIZATION.md) | Personality files, skills, agent behavior |
| [Chat Integrations](docs/CHAT_INTEGRATIONS.md) | Slack, Telegram, Web Chat setup |
| [Auto-Merge](docs/AUTO_MERGE.md) | Path-based auto-merge controls |
| [Deployment](docs/DEPLOYMENT.md) | VPS setup, Docker Compose, HTTPS |
| [Security](docs/SECURITY.md) | Security model, risks, recommendations |
| [Upgrading](docs/UPGRADE.md) | Automated upgrades, recovery |
| [Context Engineering](docs/CONTEXT_ENGINEERING.md) | How context hydration works across layers |
| [Admin Panel](docs/ADMIN_PANEL.md) | Admin panel architecture, role system, config storage |
| [Voice](docs/VOICE.md) | Voice input architecture, AssemblyAI integration |
| [Code Workspaces](docs/CODE_WORKSPACES_V2.md) | Enhanced workspaces with DnD tabs, WebSocket proxy |

---

## Influences

- **[Stripe Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents)** — Deterministic interleaving, context hydration, quality gate patterns
- **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)** — The execution engine inside every job container
- **[GSD](https://github.com/gsd-build/get-shit-done)** — Structured planning/execution workflows that maintain state across jobs
- **[thepopebot](https://github.com/stephengpope/thepopebot)** — Multi-channel Docker execution model and container lifecycle patterns

---

## License

MIT
