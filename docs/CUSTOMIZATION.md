# Customizing Your Agent

This guide covers how to shape your agent's personality, behavior, and capabilities — from how it introduces itself to what tools it can use.

---

## The Config Files

Everything about your agent's identity and behavior is defined in three files in `instances/{name}/config/`:

| File | Controls |
|------|---------|
| `SOUL.md` | Who the agent is — name, personality, scope restrictions |
| `EVENT_HANDLER.md` | How the agent converses — what it can do, how it creates jobs, what context it has |
| `AGENT.md` | How job containers behave — git conventions, GSD skill usage, project context |

These files are loaded at runtime. Changes take effect after restarting the event handler container (or the dev server).

---

## SOUL.md — Personality and Identity

This is injected into every conversation as system context. It defines who the agent is.

**Structure:**
```markdown
# Your Identity

You are [Name], [description].

## Scope

- You can access: [repos/systems]
- You cannot access: [restrictions]

## Personality

[Communication style, tone, how it handles uncertainty]
```

**What to customize:**
- The agent's name and role description
- Which repos and systems it's allowed to access
- Tone and communication style (formal vs. casual, verbose vs. concise)
- How it should handle out-of-scope requests

---

## EVENT_HANDLER.md — Conversational Behavior

This is the longest config file. It controls how the conversational agent behaves. Key sections:

1. **Your Role** — What this agent does in one paragraph
2. **Scope Restrictions** — Hard limits on what it can access
3. **Available Tools** — Which LangGraph tools are active for this instance
4. **Project Context** — Tech stack, conventions, common patterns (for scoped instances)
5. **Job Creation Flow** — The approval gate: always propose a job description and wait for confirmation before dispatching
6. **GSD Command Reference** — Available workflow skill commands

**Tip:** For a new scoped instance, copy `instances/strategyES/config/EVENT_HANDLER.md` and update:
- The role description
- The scope restriction (which repo)
- The project context (stack and conventions)

---

## AGENT.md — Job Container Behavior

Instructions that Claude Code reads at the start of every job container execution. Shorter than EVENT_HANDLER.md. Key sections:

1. **Working directory** — Where the agent works inside the container
2. **Git conventions** — Commit message format, branch naming
3. **GSD skills** — Which structured workflow commands to use and when
4. **Project context** — Stack and conventions the agent needs to know to do good work

---

## Scheduled Jobs (CRONS.json)

Define recurring jobs that run on a schedule:

```json
[
  {
    "name": "daily-check",
    "schedule": "0 9 * * *",
    "job": "Check for dependency updates and open a PR if any are outdated",
    "enabled": true
  }
]
```

Cron schedule format: `minute hour day month weekday`. Set `"enabled": false` to temporarily pause a job.

---

## Webhook Triggers (TRIGGERS.json)

Define jobs that fire when an external webhook arrives:

```json
[
  {
    "name": "on-pr-merged",
    "event": "pr.merged",
    "job": "Update the changelog with the merged PR description",
    "enabled": true
  }
]
```

---

## Available Agent Tools

The LangGraph agent in the event handler has access to these tools (configurable per instance in `EVENT_HANDLER.md`):

| Tool | What It Does |
|------|-------------|
| `create_job` | Dispatch an autonomous coding job to a job container |
| `get_job_status` | Check the status of a running or completed job |
| `get_system_technical_specs` | Read the CLAUDE.md architecture docs |
| `get_project_state` | Fetch `STATE.md` and `ROADMAP.md` from a repo |
| `start_coding` | Open an interactive code workspace |
| `list_workspaces` | List active workspaces |
| `create_cluster_job` | Start a multi-agent subagent run |
| `web_search` | Search the web via Brave Search API |

Not all tools are available to all instances. The `EVENT_HANDLER.md` for each instance controls which tools the agent can use.

---

## MCP Servers for Jobs

Add external tools (like Brave Search, GitHub API, database clients) to job containers via `MCP_SERVERS.json`. See [Settings & Configuration](CONFIGURATION.md) for the format and `AGENT_LLM_*` secret convention.

---

## Web Chat Behavior

The web chat interface uses your agent's `SOUL.md` for persona and `EVENT_HANDLER.md` for capabilities. Changes to those files immediately affect web chat behavior after a container restart.

You can also:
- Toggle features on/off via `/admin/chat`
- Enable/disable voice input via `/admin/voice`
- Manage users and roles via `/admin/users`
