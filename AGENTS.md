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

## Key Decisions

- **Claude Code CLI** replaces Pi agent in job containers
- **`--allowedTools`** whitelist, NEVER `--dangerously-skip-permissions`
- **Separate Docker networks** per instance (noah-net, strategyES-net)
- **Separate Slack apps** per instance (different workspaces, tokens, scopes)
- **Org-level GitHub Runner** shared across repos

## Instances

| Instance | Channels | Restriction |
|----------|----------|-------------|
| noah | Slack, Telegram, Web Chat | Noah's user ID |
| strategyES | Slack only | Jim's user ID, specific channels |

## Rules

- Follow patterns in existing codebase
- Docker isolation between instances is non-negotiable
- See `.claude/rules/` for domain-specific rules

## Scoped Rules

Rules in `.claude/rules/` are auto-attached when editing matching files:
- `channels.md` — Channel adapters, API routes, instance isolation
- `jobs.md` — Job execution, Docker, GitHub Actions, secrets
- `ai-agent.md` — LangGraph agent, LLM config, instance persona files
