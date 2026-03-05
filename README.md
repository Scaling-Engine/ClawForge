# ClawForge

**Ship AI-authored PRs from a Slack message.** Multi-channel conversational interface, Docker-isolated execution, git-native audit trail. Every action is a commit, every change is a PR.

ClawForge applies the architectural patterns from [Stripe's Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) — deterministic quality gates, context hydration, one-shot execution — on infrastructure you actually control. No AWS. No Kubernetes. Docker Compose on a single VPS.

---

## Why ClawForge

Stripe ships 1,000+ AI-authored PRs per week with their Minions system. That architecture requires a 100M-line monorepo, custom devbox infrastructure, and deep AWS integration. ClawForge brings the same patterns to teams that want agent-powered development without enterprise infrastructure.

| Capability | Stripe Minions | ClawForge |
|---|---|---|
| Entry points | Slack, CLI, web, embedded buttons | Slack, Telegram, Web Chat |
| Agent engine | Fork of Block's Goose | [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) + [GSD](https://github.com/gsd-build/get-shit-done) |
| Execution model | Pre-warmed devboxes (10s startup) | Docker containers (cold-start now, warm volumes planned) |
| Tool access | 400+ MCP tools via internal Toolshed | `--allowedTools` whitelist (per-instance MCP planned) |
| Quality gates | Local lint (<5s) + max 2 CI runs | `--allowedTools` + secret filtering (lint/CI gates planned) |
| Isolation | Devbox per run | Docker network per instance |
| Merge policy | Human review for complex PRs | Two-stage gate: blocked-paths + ALLOWED_PATHS whitelist |
| Infrastructure | AWS, internal platform | Docker Compose on any VPS |

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
  │  prior job outcomes     │               │  CLAUDE.md rules        │
  │                         │               │                         │
  │  Can't: read code,      │               │  Can't: see Slack,      │
  │  edit files, run tests  │               │  read messages, talk    │
  │                         │               │  to user, access DB     │
  └─────────────────────────┘               └─────────────────────────┘

  Always-on (PM2)                           Per-job (container
  Scope: conversation + routing             starts → works → exits)
```

**The only link between them is `job.md`** — a text file pushed to a git branch. Layer 1 writes it. Layer 2 reads it. That's the entire interface.

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
 │     │ SQLite DB   │ │ SQLite DB   │             own personality,   │
 │     │ Slack app   │ │ Slack app   │             repos, tools, DB   │
 │     └──────┬──────┘ └──────┬──────┘                                │
 │            │               │                                        │
 │            └───────┬───────┘                                        │
 │                    ▼                                                 │
 │     ┌──────────────────────────────┐                                │
 │     │        JOB DISPATCH          │            git push job/*      │
 │     │                              │            branch → trigger    │
 │     │  GitHub Actions (current)    │                                │
 │     │  Docker Engine API (planned) │                                │
 │     └──────────────┬───────────────┘                                │
 │                    ▼                                                 │
 │     ┌──────────────────────────────┐                                │
 │     │      DOCKER CONTAINER        │            EXECUTION           │
 │     │                              │                                │
 │     │  Claude Code CLI (-p)        │            Clone repo,         │
 │     │  + GSD skills (30 cmds)      │            read job.md,        │
 │     │  + Node 22 / gh CLI          │            do the work,        │
 │     │  + Chrome (Playwright)       │            commit, open PR     │
 │     └──────────────┬───────────────┘                                │
 │                    ▼                                                 │
 │     ┌──────────────────────────────┐                                │
 │     │        DELIVERY              │            QUALITY + MERGE     │
 │     │                              │                                │
 │     │  PR with structured body     │            Blocked-paths →     │
 │     │  --allowedTools whitelist    │            ALLOWED_PATHS →     │
 │     │  AGENT_ secret filtering    │            auto-merge or       │
 │     │                              │            require review      │
 │     └──────────────┬───────────────┘                                │
 │                    ▼                                                 │
 │     ┌──────────────────────────────┐                                │
 │     │    NOTIFICATION ROUTING      │            FEEDBACK            │
 │     │                              │                                │
 │     │  Result → originating thread │            Summary injected    │
 │     │  Summary → LangGraph memory  │            into agent memory   │
 │     │  Outcome → job_outcomes DB   │            for follow-up jobs  │
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
- **Cross-repo targeting** — Jobs target any repo in the allowed list via `REPOS.json` + `target.json` sidecar
- **Git as audit trail** — Every agent action is a commit. Every change is a PR. Full visibility and reversibility
- **Two-stage merge gate** — Blocked-paths check (instance PRs need review) + ALLOWED_PATHS whitelist (safe dirs auto-merge)
- **Secret filtering** — `AGENT_` secrets reach the container but are filtered from the LLM's view

**Intelligence & Memory**
- **Multi-provider LLM** — Anthropic (default), OpenAI, Google Gemini, or any OpenAI-compatible endpoint
- **Thread-aware notifications** — Results route back to the originating Slack thread or Telegram chat
- **Conversational memory** — Job outcomes are injected into LangGraph memory for follow-up context
- **Prior job continuity** — New jobs in a thread automatically include the previous job's outcome

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
    │  ● Can't see B    │           │  ● Can't see A    │
    └───────────────────┘           └───────────────────┘
```

---

## Roadmap

```
  SHIPPED ━━━━━━━━━━━━━━━━━━━━━━ IN PROGRESS ━━━━━━━━━━━━ PLANNED ━━━━━━━━━━━━━━━━━━━━▶

  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │  v1.0    │ │  v1.1    │ │  v1.2    │ │  v1.3    │ │  v1.4    │ │  v1.5    │
  │          │ │          │ │          │ │          │ │          │ │          │
  │ GSD      │ │ Agent    │ │ Cross-   │ │ Instance │ │ Docker   │ │Persistent│
  │Hardening │ │ Intel    │ │ Repo     │ │Generator │ │ Engine   │ │Workspaces│
  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘

  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │  v1.6    │ │  v1.7    │ │  v1.8    │
  │          │ │          │ │          │
  │ MCP Tool │ │  Smart   │ │ Multi-   │
  │  Layer   │ │Execution │ │  Agent   │
  └──────────┘ └──────────┘ └──────────┘
```

| Version | Milestone | What It Delivers |
|---------|-----------|------------------|
| **v1.0** | GSD Hardening | Claude Code CLI in Docker, git-commit audit trail, PR-based delivery |
| **v1.1** | Agent Intelligence | Smart job prompts with repo context injection, prior job continuity |
| **v1.2** | Cross-Repo Targeting | Jobs target any allowed repo, notifications route back correctly |
| **v1.3** | Instance Generator | Create new agent instances through chat — full config scaffolded as a PR |
| **v1.4** | Docker Engine | Direct Docker API dispatch (seconds, not minutes). Actions as fallback |
| **v1.5** | Persistent Workspaces | Browser terminal (ttyd + xterm.js) to interactive Claude Code containers |
| **v1.6** | MCP Tool Layer | Per-instance MCP server configs — curated tool access per agent |
| **v1.7** | Smart Execution | Pre-CI lint/typecheck, CI feedback loops (max 2 runs), merge policies |
| **v1.8** | Multi-Agent Clusters | Lead agent decomposes tasks, worker containers execute in parallel |

---

## Docs

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System diagrams, container internals, 12-step flow |
| [Configuration](docs/CONFIGURATION.md) | Environment variables, GitHub secrets, repo variables |
| [Customization](docs/CUSTOMIZATION.md) | Personality files, skills, agent behavior |
| [Chat Integrations](docs/CHAT_INTEGRATIONS.md) | Slack, Telegram, Web Chat setup |
| [Auto-Merge](docs/AUTO_MERGE.md) | Path-based auto-merge controls |
| [Deployment](docs/DEPLOYMENT.md) | VPS setup, Docker Compose, HTTPS |
| [Security](docs/SECURITY.md) | Security model, risks, recommendations |
| [Upgrading](docs/UPGRADE.md) | Automated upgrades, recovery |

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
