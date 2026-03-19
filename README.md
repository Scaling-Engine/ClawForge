# ClawForge

**Ship AI-authored PRs from a Slack message.** Multi-channel conversational interface, Docker-isolated execution, git-native audit trail. Every action is a commit, every change is a PR.

ClawForge applies the architectural patterns from [Stripe's Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) — deterministic quality gates, context hydration, one-shot execution — on infrastructure you actually control. No AWS. No Kubernetes. Docker Compose on a single VPS.

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

## The Core Idea

ClawForge runs **two completely separate AI agents** that never share context. This is the entire design.

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

  Context hydration: before writing job.md, Layer 1 reads project
  state (roadmap, current phase, blockers) from target repos via
  GitHub API — Stripe's "pre-hydration" pattern applied to the
  two-layer model.
```

**The only link between them is `job.md`** — a text file pushed to a git branch. Layer 1 writes it. Layer 2 reads it. That's the entire interface.

- **Context hydration** — Before writing job.md, Layer 1 pulls project state (roadmap, current phase, blockers) from the target repo via GitHub API. The conversational agent *understands the codebase* before dispatching work — [Stripe's pre-hydration pattern](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) applied to the two-layer model
- The conversational agent's quality at *describing* work determines the coding agent's success
- Each coding job starts fresh — no accumulated state, no context bleed between jobs
- Job outcomes flow back as summaries (PR → webhook → Layer 1 memory)
- Prior job context is injected into the *next* job.md when you're in the same thread

**The repo itself is the long-term memory.** Claude Code writes to `.planning/STATE.md` and `ROADMAP.md` during every execution. The next job reads those files and picks up where the last one left off. [GSD skills](https://github.com/gsd-build/get-shit-done) are the structured workflows that maintain this state — without them, each job would be truly isolated.

---

## How It Works

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │                          C L A W F O R G E                          │
 ├──────────────────────────────────────────────────────────────────────┤
 │                                                                      │
 │   ┌─────────┐  ┌─────────┐  ┌─────────┐                            │
 │   │  Slack  │  │Telegram │  │Web Chat │         CHANNELS            │
 │   └────┬────┘  └────┬────┘  └────┬────┘                            │
 │        └────────────┼────────────┘                                  │
 │                     ▼                                                │
 │        ┌────────────────────────┐                                   │
 │        │       Traefik          │               ROUTING             │
 │        │    (HTTPS + Let's      │                                   │
 │        │     Encrypt)           │                                   │
 │        └─────┬──────────┬──────┘                                   │
 │              ▼          ▼                                            │
 │     ┌─────────────┐ ┌─────────────┐                                │
 │     │ Instance A  │ │ Instance B  │             EVENT HANDLERS      │
 │     │             │ │             │             (LangGraph ReAct)   │
 │     │ SOUL.md     │ │ SOUL.md     │                                │
 │     │ REPOS.json  │ │ REPOS.json  │             Each instance:     │
 │     │ MCP config  │ │ MCP config  │             own personality,   │
 │     │ SQLite DB   │ │ SQLite DB   │             repos, tools, DB   │
 │     └──────┬──────┘ └──────┬──────┘                                │
 │            │               │                                        │
 │            └───────┬───────┘                                        │
 │                    ▼                                                 │
 │     ┌──────────────────────────────┐                                │
 │     │        JOB DISPATCH          │            Docker Engine API   │
 │     │                              │            direct container    │
 │     │  Docker Engine API (primary) │            spawn — seconds,    │
 │     │  GitHub Actions (fallback)   │            not minutes         │
 │     └──────────────┬───────────────┘                                │
 │                    ▼                                                 │
 │     ┌──────────────────────────────┐                                │
 │     │      DOCKER CONTAINER        │            EXECUTION           │
 │     │                              │                                │
 │     │  Claude Code CLI (-p)        │            Clone repo,         │
 │     │  + GSD skills (30 cmds)      │            read job.md,        │
 │     │  + MCP servers (if config'd) │            do the work,        │
 │     │  + Node 22 / gh CLI          │            commit, open PR     │
 │     │  + Chrome (Playwright)       │                                │
 │     └──────────────┬───────────────┘                                │
 │                    ▼                                                 │
 │     ┌──────────────────────────────┐                                │
 │     │    LIVE STREAMING + MERGE    │            QUALITY + FEEDBACK  │
 │     │                              │                                │
 │     │  Log streaming → chat UI     │            Operator watches    │
 │     │  Secret scrubbing on output  │            live progress in    │
 │     │  PR with structured body     │            Slack/Web Chat      │
 │     │  --allowedTools whitelist    │                                │
 │     │  Auto-merge or review gate   │            Results route to    │
 │     │  Summary → LangGraph memory  │            originating thread  │
 │     └──────────────────────────────┘                                │
 │                                                                      │
 └──────────────────────────────────────────────────────────────────────┘
```

You talk to the agent in natural language. For simple questions, it answers directly. For tasks that need code changes, it proposes a job description, gets your approval, then dispatches an autonomous Docker container running Claude Code CLI. The container clones the repo, does the work, commits, and opens a PR. The result routes back to the exact thread where you started.

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
- **Settings UI** — View configured MCP servers and allowed tools from the read-only settings page

**Multi-Agent Clusters**
- **Cluster definitions** — Define multi-agent pipelines in `CLUSTER.json` with named roles, system prompts, and allowed tools
- **Coordinator dispatch** — A coordinator loop runs agents sequentially, copying outbox→inbox between steps
- **Label-based routing** — Each agent writes a label (e.g., `needs_review`, `complete`) to `outbox/label.txt`; the coordinator uses transition maps to pick the next agent
- **Volume isolation** — Every agent in a cluster gets its own Docker volume — no two concurrent agents share state
- **Safety limits** — Hard caps prevent runaway cost: 5 iterations per agent cycle, 15 total per run
- **Slack thread updates** — Cluster progress posts as replies in a single Slack thread, not a flood of messages

**Web UI**
- **Server-side auth** — Every Server Action enforces NextAuth session checks; no client-only auth
- **Repo/branch selector** — Anchor a chat session to a specific repo and branch from dropdown menus
- **Code mode** — Toggle monospace rendering for code-heavy responses
- **Feature flags** — Per-instance feature toggles control which UI capabilities are available

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

## Multi-Agent Clusters

Clusters let you define multi-agent pipelines where sequential agents with distinct roles collaborate via shared volume inbox/outbox.

```
  CLUSTER.json defines:
  ┌────────────────────────────────────────────────────────────────┐
  │  Roles: researcher, implementer, reviewer                     │
  │  Each role has: systemPrompt, allowedTools, mcpServers         │
  │  Transitions: label → next role (e.g. "needs_impl" → impl)    │
  └────────────────────────────────────────────────────────────────┘

  Execution flow:
  ┌──────────┐    label.txt     ┌──────────────┐    label.txt     ┌──────────┐
  │Researcher│ ──"needs_impl"──▶│ Implementer  │ ──"needs_review"▶│ Reviewer │
  │          │                  │              │                  │          │
  │ outbox/  │  copied to       │ outbox/      │  copied to       │ outbox/  │
  │ ├─notes  │  next inbox      │ ├─code       │  next inbox      │ ├─report │
  │ └─label  │                  │ └─label      │                  │ └─label  │
  └──────────┘                  └──────────────┘                  └──────────┘
       ▲                                                               │
       └───────────── "needs_research" (cycle back) ──────────────────┘

  Safety: max 5 iterations per agent cycle, 15 total per run
  Volume: each agent gets its own isolated Docker volume
```

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

**v2.0 details** — 28 phases, 35 requirements, all satisfied:
- **Phase 25**: Headless Log Streaming — live job output in chat, secret scrubbing, cancel support
- **Phase 26**: Web UI Auth + Repo Selector — server-side auth boundary, repo/branch dropdowns, code mode
- **Phase 27**: MCP Tool Layer — per-instance MCP configs, template variable resolution, encrypted credentials
- **Phase 28**: Multi-Agent Clusters — role-based cluster runtime, coordinator dispatch, label routing, safety limits

---

## Directory Structure

```
/
├── api/                          # Next.js API route handlers
│   └── index.js                  # GET/POST catch-all (telegram, slack, github webhooks)
├── lib/                          # Core implementation
│   ├── ai/                       # LangGraph agent, model factory, tools
│   │   ├── agent.js              # ReAct agent singleton with SQLite checkpointing
│   │   ├── tools.js              # create_job, cancel_job, cluster_job, start_coding, etc.
│   │   ├── model.js              # Multi-provider LLM (anthropic/openai/google)
│   │   └── index.js              # chat(), chatStream(), summarizeJob()
│   ├── channels/                 # Channel adapters
│   │   ├── base.js               # Abstract ChannelAdapter interface
│   │   ├── telegram.js           # Telegram via grammy
│   │   ├── slack.js              # Slack via @slack/web-api
│   │   └── index.js              # Adapter factory
│   ├── chat/                     # Web chat streaming + React components
│   │   ├── components/           # ChatPanel, MessageList, StreamViewer, etc.
│   │   ├── features-context.jsx  # Per-instance feature flag context
│   │   └── repo-chat-context.jsx # Repo/branch selection context
│   ├── cluster/                  # Multi-agent cluster runtime
│   │   ├── config.js             # CLUSTER.json loader + validator
│   │   ├── coordinator.js        # Dispatch loop, label routing, safety limits
│   │   └── index.js              # runCluster() entry point
│   ├── db/                       # SQLite via Drizzle ORM
│   ├── jobs/                     # Job streaming (SSE, log parser, secret scrubber)
│   ├── mcp/                      # MCP config loader + template resolver
│   ├── tools/                    # Job creation, GitHub API helpers
│   ├── ws/                       # Workspace management (Docker containers)
│   ├── auth/                     # NextAuth v5 (credentials provider)
│   ├── paths.js                  # Central path resolver
│   └── actions.js                # Action executor (agent/command/webhook/cluster)
├── config/                       # Base config (overridden by instances)
├── instances/                    # Per-instance configuration
│   └── {name}/
│       ├── Dockerfile
│       ├── config/               # SOUL.md, EVENT_HANDLER.md, AGENT.md, MCP_SERVERS.json
│       └── .env.example
├── templates/                    # Scaffolding templates
│   ├── docker/
│   │   ├── job/                  # Claude Code job container
│   │   │   ├── Dockerfile        # Node 22 + Claude Code CLI + Chrome deps
│   │   │   └── entrypoint.sh     # Clone → hydrate context → Claude Code → commit → PR
│   │   └── event-handler/        # PM2 + Next.js container
│   └── .github/workflows/
│       ├── run-job.yml           # Triggers Docker container on job/* branch
│       ├── auto-merge.yml        # Path-restricted auto-merge
│       ├── notify-pr-complete.yml
│       └── notify-job-failed.yml
├── drizzle/                      # Database migrations
├── docker-compose.yml            # Multi-instance orchestration (Traefik + instances)
└── .env.example                  # All environment variables
```

---

## GitHub Secrets Convention

| Prefix | Passed to Container | LLM Can Access | Example |
|--------|--------------------|--------------------|---------|
| `AGENT_` | Yes | No (filtered) | `AGENT_GH_TOKEN` |
| `AGENT_LLM_` | Yes | Yes | `AGENT_LLM_BRAVE_API_KEY` |
| *(none)* | No | No | `GH_WEBHOOK_SECRET` |

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

---

## Influences

ClawForge draws from the best ideas in agent infrastructure and assembles them into a single, self-hosted platform:

- **[Stripe Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents)** — Deterministic interleaving, context hydration, quality gate patterns
- **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)** — The execution engine inside every job container
- **[GSD](https://github.com/gsd-build/get-shit-done)** — Structured planning/execution workflows that maintain state across jobs
- **[thepopebot](https://github.com/stephengpope/thepopebot)** — Multi-channel Docker execution model and container lifecycle patterns

---

## License

MIT
