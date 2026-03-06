# Milestones

## v1.3 Instance Generator (Shipped: 2026-03-06)

**Phases:** 13-17 + 16.1, 17.1 (7 phases, 9 plans)
**Timeline:** 8 days (2026-02-27 → 2026-03-06)
**Archive:** milestones/v1.3-ROADMAP.md, milestones/v1.3-REQUIREMENTS.md

**Key accomplishments:**
- `createInstanceJobTool` registered in LangGraph agent with Zod-validated schema and yaml@2.8.2 for comment-preserving docker-compose updates
- Multi-turn conversational intake in EVENT_HANDLER.md — grouped config gathering (max 4 turns), optional field suppression, approval gate, clean cancellation
- `buildInstanceJobDescription()` generates comprehensive job prompt with all 7 artifacts (Dockerfile, SOUL.md, AGENT.md, EVENT_HANDLER.md, REPOS.json, .env.example, docker-compose.yml update)
- Blocked-paths auto-merge exclusion — instance PRs (instances/*, docker-compose.yml) require manual review regardless of ALLOWED_PATHS
- `--body-file` PR creation for robust long PR bodies with operator setup checklists
- `get_project_state` LangGraph tool — Layer 1 fetches STATE.md + ROADMAP.md via GitHub Contents API for project-aware job dispatching
- End-to-end pipeline validated: conversation → approval → job dispatch → PR with all artifacts verified

### Known Gaps
- INTAKE-02 through INTAKE-05, SCAF-01 through SCAF-04: Code implemented and E2E validated, but phases 14/15 lack formal VERIFICATION.md
- Phase 17.2 (Layer 2 Context Hydration) deferred to v1.4

---

## v1.0 Foundation & Observability (Shipped: 2026-02-24)

**Phases:** 1-4, 6 plans
**Archive:** milestones/v1.0-ROADMAP.md (if exists)

**Key accomplishments:**
- Job containers run Claude Code CLI via `claude -p` with GSD installed globally
- Preflight diagnostics, PostToolUse observability hook, template sync
- Test harness for local Docker GSD verification
- Imperative AGENT.md instructions for consistent GSD invocation

---

## v1.1 Agent Intelligence & Pipeline Hardening (Shipped: 2026-02-25)

**Phases:** 5-8, 7 plans, ~10 tasks
**Timeline:** 24 days (2026-02-01 -> 2026-02-25)
**Files changed:** 45 (+5,023 / -257)
**Archive:** milestones/v1.1-ROADMAP.md, milestones/v1.1-REQUIREMENTS.md

**Key accomplishments:**
- Pipeline hardening: zero-commit PR guard, 30-min runner timeout, failure stage detection (docker_pull/auth/claude)
- Smart job prompts: structured FULL_PROMPT with CLAUDE.md injection (8k cap), package.json stack, GSD routing hints
- Previous job context: follow-up jobs receive prior merged job summary scoped by thread ID
- Notification accuracy: failure stage surfaced in Slack/Telegram, explicit gsd-invocations.jsonl lookup
- Test harness sync: test-entrypoint.sh aligned with production 5-section prompt and file-redirect delivery
- Full template sync: all workflows byte-for-byte identical between live and templates/

---

## v1.2 Cross-Repo Job Targeting (Shipped: 2026-02-27)

**Phases:** 9-12, 10 plans (v1.2 only), 23 total
**Timeline:** 2 days (2026-02-25 -> 2026-02-26)
**Files changed:** 46 files (+5,605 / -93)
**Archive:** milestones/v1.2-ROADMAP.md, milestones/v1.2-REQUIREMENTS.md

**Key accomplishments:**
- Per-instance REPOS.json config with `loadAllowedRepos()` + `resolveTargetRepo()` supporting case-insensitive slug/name/alias matching
- SOUL.md and AGENT.md baked into job Docker image at `/defaults/` so cross-repo jobs have system prompt without clawforge config in working tree
- `target_repo` threaded from LangGraph tool schema -> `create_job()` -> `target.json` sidecar on clawforge job branch
- Two-phase clone in entrypoint: clawforge checkout for metadata, target repo shallow clone as Claude's `WORK_DIR`; backward compatible (no target.json = v1.1 behavior)
- Cross-repo PR creation with `clawforge/{uuid}` branch naming, default branch detection via `gh repo view`, and ClawForge attribution in PR body
- Notification pipeline: nullable `target_repo` column in `job_outcomes`, webhook passthrough, `getJobStatus()` DB overlay returning completed job PR URLs

---

---
*Last updated: 2026-03-06 — v1.3 shipped*
