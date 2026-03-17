# Requirements: ClawForge v2.2

**Defined:** 2026-03-16
**Core Value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results

## v2.2 Requirements

Requirements for v2.2 Smart Operations. Each maps to roadmap phases.

### Claude Code Chat Mode (TERM)

- [ ] **TERM-01**: Operator can start a Claude Code chat session that streams text output in real time from an Agent SDK subprocess
- [ ] **TERM-02**: Operator sees each tool call (file edits, bash commands, MCP tools) visualized live in the chat message stream as it happens
- [ ] **TERM-03**: Operator sees file edits as unified diffs (red/green removed/added lines) with syntax highlighting inline in the message stream
- [ ] **TERM-04**: Operator can send follow-up instructions to a running Claude Code session to redirect or interrupt the agent mid-task
- [ ] **TERM-05**: Claude Code chat session targets a specific repo working directory via named volumes with warm-start pattern
- [ ] **TERM-06**: Operator sees token usage and estimated cost per Claude Code turn, stored in the database alongside message content
- [ ] **TERM-07**: Operator can toggle between chat mode (natural language prompts) and shell mode (direct bash commands with conversation context) in the same session
- [ ] **TERM-08**: Operator can view Claude's thinking steps in a collapsible reasoning panel when extended thinking mode is enabled

### Superadmin Portal (SUPER)

- [ ] **SUPER-01**: Operator can log in once and access all ClawForge instances from a single authenticated session with a superadmin role
- [ ] **SUPER-02**: Operator can switch between instances via an instance switcher UI without re-authenticating
- [ ] **SUPER-03**: Superadmin landing page shows instance health overview with active job count, runner status, and last job timestamp per instance
- [ ] **SUPER-04**: All data tables (chats, job_outcomes, cluster_runs, code_workspaces) are scoped by instanceId column for cross-instance isolation
- [ ] **SUPER-05**: Operator can search jobs across all instances by repo name, status, or keyword from the superadmin portal

### UI Operations Parity (OPS)

- [x] **OPS-01**: Operator can cancel a running job from the web UI, which stops and removes the Docker container
- [x] **OPS-02**: Operator can retry a failed job from the web UI, which re-dispatches with the original prompt and target repo
- [ ] **OPS-03**: Operator can add, edit, and delete target repos via a form-based admin page with slug/name/alias/dispatch validation
- [ ] **OPS-04**: Operator can edit all platform configuration keys (LLM provider, models, timeouts, auto-merge settings) from the admin general page
- [ ] **OPS-05**: Operator can view all instances with their status, configured repos, and active jobs from an instance management admin page

### Smart Execution (EXEC)

- [x] **EXEC-01**: Job container runs configurable quality gates (lint, typecheck, test) after Claude Code completes and before PR creation
- [x] **EXEC-02**: When quality gates fail, the agent automatically sees the failure output and attempts one self-correction pass before creating the PR
- [x] **EXEC-03**: Each repo in REPOS.json can specify a merge policy (auto, gate-required, manual) enforced by the auto-merge workflow
- [x] **EXEC-04**: Gate failures are surfaced in the operator's chat notification with failure excerpts, not just a PR label

## Future Requirements

Deferred to v2.3+. Tracked but not in current roadmap.

### Claude Code Chat Mode

- **TERM-F01**: Operator can approve or deny individual tool calls before execution (requires SDK package, not CLI)
- **TERM-F02**: Operator can pause a running Claude Code session and resume it later with full state preserved

### Superadmin Portal

- **SUPER-F01**: Superadmin can impersonate an instance admin's session for debugging
- **SUPER-F02**: Superadmin can view config differences between instances side-by-side

### UI Operations Parity

- **OPS-F01**: Operator can select multiple jobs and perform bulk actions (retry all, archive)
- **OPS-F02**: Operator can view live CPU/memory/network metrics for running job containers
- **OPS-F03**: Operator can view full raw job logs in an embedded viewer (not just GitHub Actions link)

### Smart Execution

- **EXEC-F01**: Quality gates execute in staged order (fast gates first) with early termination on failure
- **EXEC-F02**: Each gate has a configurable timeout with special failure reason on timeout
- **EXEC-F03**: Platform auto-sets GitHub branch protection rules matching configured quality gates
- **EXEC-F04**: Flaky test detection via automatic single retry before marking gate as failed

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Replace LangGraph with Agent SDK | LangGraph provides persistent memory, multi-tool orchestration, headless jobs. Agent SDK is additive, not a replacement. |
| Run Agent SDK in Event Handler process | Resource contention, PID accumulation. Must run in dedicated container. |
| Separate auth service (Auth0, Okta) | Over-engineered for 2 instances and 1-2 operators. Extend existing NextAuth v5. |
| Per-instance deployments with shared OAuth | Deployment complexity. Single deployment with URL-prefix routing instead. |
| Instance deletion via UI | Catastrophic if accidental. SSH-only with explicit volume pruning. |
| Unlimited self-correction iterations | Infinite loops on unfixable issues. Max 1 correction iteration (2 total attempts). |
| Parallel gate execution | Race conditions on shared state, ambiguous failure attribution. Sequential execution. |
| Security scanning gates (SAST) by default | High false-positive rates. Optional gate type, not default. |
| Real-time cross-instance activity feed | Requires pub/sub layer that doesn't exist. Aggregate stats instead. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXEC-01 | Phase 39 | Complete |
| EXEC-02 | Phase 39 | Complete |
| EXEC-03 | Phase 39 | Complete |
| EXEC-04 | Phase 39 | Complete |
| OPS-01 | Phase 40 | Complete |
| OPS-02 | Phase 40 | Complete |
| TERM-01 | Phase 41 | Pending |
| TERM-02 | Phase 41 | Pending |
| TERM-03 | Phase 41 | Pending |
| TERM-04 | Phase 41 | Pending |
| TERM-05 | Phase 41 | Pending |
| TERM-06 | Phase 41 | Pending |
| TERM-07 | Phase 41 | Pending |
| TERM-08 | Phase 41 | Pending |
| OPS-03 | Phase 42 | Pending |
| OPS-04 | Phase 42 | Pending |
| OPS-05 | Phase 42 | Pending |
| SUPER-01 | Phase 42 | Pending |
| SUPER-02 | Phase 42 | Pending |
| SUPER-03 | Phase 42 | Pending |
| SUPER-04 | Phase 42 | Pending |
| SUPER-05 | Phase 42 | Pending |

**Coverage:**
- v2.2 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-16 after roadmap creation — traceability complete*
