# How It Works

This guide explains what happens end-to-end when you send a message to your agent — from "hey build this" to receiving a PR notification in Slack.

---

## The Big Picture

ClawForge is a two-layer system:

1. **Layer 1 — Your Conversational Agent** (always on): A Next.js app running a LangGraph ReAct agent. This is Archie or Epic — the agent you talk to. It receives your messages, reasons about what to do, and dispatches jobs.

2. **Layer 2 — Job Containers** (spun up on demand): Docker containers running Claude Code CLI. Each job gets its own container, executes the task autonomously (reading/writing code, running commands), commits everything, creates a PR, and shuts down.

The two layers communicate through a single text file: `job.md` pushed to a `job/{UUID}` git branch. The event handler writes it. The job container reads it.

```
You → Channel → Event Handler → job branch → GitHub Actions → Docker (Claude Code) → PR → auto-merge → notification
```

---

## The 10-Step Flow

### 1. You Send a Message

Talk to Archie or Epic via Slack, Telegram, or the web chat.

### 2. Channel Receives It

Three channel adapters handle incoming messages:
- **Slack** — Events API webhook with HMAC-SHA256 signature verification
- **Telegram** — Bot API webhook with secret token
- **Web Chat** — NextAuth session + streaming response

### 3. Traefik Routes to Your Instance

Traefik (with automatic HTTPS via Let's Encrypt) routes to the correct Docker container based on hostname:
- `clawforge.scalingengine.com` → Noah/Archie
- `strategyes.scalingengine.com` → StrategyES/Epic

Each instance runs in an isolated Docker network.

### 4. LangGraph Agent Processes

The event handler is a **LangGraph ReAct agent** with tools:
- `create_job` — Dispatch an autonomous coding job
- `get_job_status` — Check running/completed jobs
- `get_system_technical_specs` — Read CLAUDE.md architecture docs

The agent uses your instance's `SOUL.md` (personality) and `EVENT_HANDLER.md` (capabilities) as system context. Conversation history is stored in **SQLite via Drizzle ORM** with LangGraph checkpointing.

For simple questions, the agent answers directly. For code tasks, it proposes a job description and **always asks for your approval before dispatching**.

### 5. Job Is Created

When you approve, the agent calls `create_job()` which:
1. Generates a UUID job ID
2. Creates a `job/{UUID}` branch on the target GitHub repo
3. Writes the job description to `logs/{UUID}/job.md`
4. Pushes the branch
5. Saves the job origin (thread ID + platform) to the database for notification routing

### 6. Git Push Triggers GitHub Actions

The `job/*` branch push triggers `run-job.yml`.

### 7. GitHub Actions Prepares the Container

The workflow pulls the pre-built Docker image from GHCR and runs it with the repo URL, branch name, and secrets.

### 8. Docker Container Executes

The container:
1. Clones the job branch
2. Reads `SOUL.md` + `AGENT.md` for system context
3. Reads `logs/{UUID}/job.md` for the task
4. Runs **Claude Code CLI** in non-interactive mode
5. Claude Code reasons through the task, writes code, runs commands, uses GSD workflow skills
6. Commits all changes and pushes
7. Creates a PR targeting main

### 9. Auto-Merge Runs

`auto-merge.yml` checks if changed files are within your `ALLOWED_PATHS` setting:
- If yes → automatically merges the PR
- If no → leaves PR open for human review

### 10. Notification Routes Back

The event handler receives a webhook from GitHub Actions with the job results. It:
1. Summarizes the results using a quick LLM call
2. Saves a notification to the database
3. Looks up the original job origin (which Slack thread started this)
4. Posts a reply in that Slack thread
5. Injects the summary into LangGraph memory for follow-up context

---

## Instance Isolation

Each instance runs in its own Docker network with its own:
- Docker container
- SQLite database
- Slack app (separate workspace, tokens, scopes)
- Environment variables
- Config files

Noah/Archie cannot see StrategyES/Epic and vice versa.

```
                    ┌─────────────────────┐
                    │     proxy-net       │
                    │  ┌───────────────┐  │
                    │  │   Traefik     │  │
                    └──┴───┬───────┬───┘──┘
                           │       │
              ┌────────────┘       └────────────┐
              │                                 │
  ┌───────────┴─────────┐       ┌───────────────┴──────┐
  │     noah-net        │       │    strategyES-net    │
  │  Noah/Archie        │       │  StrategyES/Epic     │
  │  Own .env           │       │  Own .env            │
  │  Own SQLite DB      │       │  Own SQLite DB       │
  │  Own Slack app      │       │  Own Slack app       │
  └─────────────────────┘       └──────────────────────┘
```

---

## Job Container Details

The job container image (built from `templates/docker/job/Dockerfile`) includes:

- Node.js 22
- GitHub CLI (`gh`)
- Chrome dependencies (for Playwright tasks)
- Claude Code CLI
- GSD Skills (30 structured workflow commands)

**What happens inside:**
1. Clone the job branch
2. Read `SOUL.md` + `AGENT.md` → system prompt
3. Read `logs/{UUID}/job.md` → task prompt
4. Run `claude -p --allowedTools "Read,Write,Edit,Bash,Glob,Grep,Task,Skill" "${FULL_PROMPT}"`
5. `git add`, `git commit`, `git push`
6. `gh pr create --base main`

---

## GSD Workflow Skills

Job containers have access to 30 GSD structured workflow commands. These give Claude Code a vocabulary for planning and executing complex projects:

| Category | Commands |
|----------|---------|
| Project lifecycle | `/gsd:new-project`, `/gsd:new-milestone`, `/gsd:complete-milestone` |
| Phase planning | `/gsd:plan-phase`, `/gsd:execute-phase`, `/gsd:verify-work` |
| Quick tasks | `/gsd:quick`, `/gsd:debug` |
| Roadmap | `/gsd:add-phase`, `/gsd:insert-phase`, `/gsd:progress` |
| Session | `/gsd:pause-work`, `/gsd:resume-work` |
| Health | `/gsd:map-codebase`, `/gsd:health` |

---

## GitHub Workflows

| Workflow | Trigger | What It Does |
|----------|---------|-------------|
| `run-job.yml` | Push to `job/*` branch | Pulls GHCR image, runs job container |
| `auto-merge.yml` | PR opened or synchronized | Checks `ALLOWED_PATHS`, merges or leaves open |
| `notify-pr-complete.yml` | PR merged | Sends webhook to event handler |
| `notify-job-failed.yml` | Job failure | Sends failure webhook to event handler |
| `build-image.yml` | Push to `templates/docker/job/**` | Rebuilds and pushes GHCR job image |

---

## GitHub Secrets Convention

| Prefix | Container Gets It | LLM Can See It |
|--------|-------------------|-----------------------|
| `AGENT_` | Yes | No (filtered) |
| `AGENT_LLM_` | Yes | Yes |
| *(none)* | No | No |

Examples:
- `AGENT_GH_TOKEN` → container uses it, Claude can't see it
- `AGENT_LLM_BRAVE_KEY` → container uses it, Claude CAN see it
- `GH_WEBHOOK_SECRET` → stays in GitHub, never reaches container

---

## Key Files

```
clawforge/
├── api/index.js                  # All webhook handlers (Slack, Telegram, GitHub)
├── lib/
│   ├── ai/
│   │   ├── agent.js              # LangGraph ReAct agent + SQLite checkpointing
│   │   ├── tools.js              # create_job, get_job_status, get_specs
│   │   └── model.js              # Multi-provider LLM factory
│   ├── channels/
│   │   ├── slack.js              # HMAC verify, threading, file download
│   │   └── telegram.js           # Telegram bot adapter
│   └── chat/components/          # Web chat UI components
├── instances/
│   ├── noah/config/              # SOUL.md, EVENT_HANDLER.md, AGENT.md
│   └── strategyES/config/        # SOUL.md, EVENT_HANDLER.md, AGENT.md
├── templates/docker/
│   └── job/
│       ├── Dockerfile            # Job container image
│       └── entrypoint.sh         # Clone → Claude Code → commit → PR
└── docker-compose.yml            # Multi-instance orchestration
```
