# AGENTS.md — ClawForge

## What This Is

Multi-channel AI agent gateway that connects Claude Code CLI to messaging channels (Slack, Telegram, Web Chat) with strict Docker isolation between instances. Forked from `stephengpope/thepopebot`.

## Architecture

Two-layer architecture:
1. **Event Handler** (Next.js) — Conversational AI layer. Receives messages, orchestrates jobs.
2. **Job Container** (Docker) — Runs Claude Code CLI autonomously. Every action is a git commit, every change is a PR.

```
User → Channel → Event Handler → job branch → GitHub Actions → Docker (Claude Code) → PR → auto-merge/review → notification
```

## Current State

- **Milestone:** See `.planning/STATE.md` for live sprint state
- **Roadmap:** `.planning/ROADMAP.md` — phase breakdown with success criteria
- **Requirements:** `.planning/REQUIREMENTS.md` — traceable feature requirements
- **Project history:** `.planning/PROJECT.md` — milestone goals and version history

## Tech Stack

Next.js API routes, LangGraph ReAct agent (SQLite checkpointing), multi-provider LLM (Anthropic/OpenAI/Google), Docker containers, GitHub Actions, Drizzle ORM (SQLite), grammy (Telegram), @slack/web-api, NextAuth v5.

## Quick Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
docker compose up    # Multi-instance orchestration
```

## Deep Context (read on demand)

| Doc | What's in it |
|-----|-------------|
| `docs/ARCHITECTURE.md` | Full directory structure, API routes, channel adapters, job flow |
| `docs/CONFIGURATION.md` | Instance config, environment variables, Docker setup |
| `docs/DEPLOYMENT.md` | VPS deployment, Docker Compose, GitHub Actions |
| `docs/SECURITY.md` | Secret conventions, instance isolation, allowed tools |
| `docs/CONTEXT_ENGINEERING.md` | SOUL.md, EVENT_HANDLER.md, AGENT.md persona files |
| `docs/CHAT_INTEGRATIONS.md` | Slack, Telegram, Web Chat integration details |
| `docs/AUTO_MERGE.md` | Path-restricted auto-merge rules |
| `docs/ADMIN_PANEL.md` | Admin panel architecture, role system, config storage |
| `docs/VOICE.md` | Voice input architecture, AssemblyAI integration |
| `docs/CODE_WORKSPACES_V2.md` | Enhanced workspaces with DnD tabs, WebSocket proxy |

## Key Decisions

- **Claude Code CLI** replaces Pi agent in job containers
- **`--allowedTools`** whitelist, NEVER `--dangerously-skip-permissions`
- **Separate Docker networks** per instance (noah-net, strategyES-net)
- **Separate Slack apps** per instance (different workspaces, tokens, scopes)
- **Org-level GitHub Runner** shared across repos
- **Cherry-pick upstream features** via 3 waves (v2.1); never overwrite ClawForge-specific systems (dockerode, MCP, cluster coordinator, SSE streaming)
- **Node crypto** (AES-256-GCM) for all encryption — no libsodium dependency
- **Relative imports** only — upstream `thepopebot/*` package imports converted on cherry-pick

## Instances

| Instance | Agent Name | URL | Channels | Restriction |
|----------|------------|-----|----------|-------------|
| noah | Archie | clawforge.scalingengine.com | Slack, Telegram, Web Chat | Noah's user ID |
| strategyES | Epic | strategyes.scalingengine.com | Slack, Web Chat | Jim's user ID, specific channels |

Agent names are read from `instances/{name}/config/SOUL.md` at runtime. The browser tab title, sidebar, chat header, and greeting all display the agent name dynamically.

## Rules

- Follow patterns in existing codebase
- Docker isolation between instances is non-negotiable
- See `.claude/rules/` for domain-specific rules

## Scoped Rules

Rules in `.claude/rules/` are auto-attached when editing matching files:
- `channels.md` — Channel adapters, API routes, instance isolation
- `jobs.md` — Job execution, Docker, GitHub Actions, secrets
- `ai-agent.md` — LangGraph agent, LLM config, instance persona files
- `admin.md` — Admin panel, auth roles, config storage, GitHub secrets management
- `voice.md` — Voice input, AssemblyAI streaming, AudioWorklet
