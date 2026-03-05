# Phase 17: End-to-End Validation - Research

**Researched:** 2026-03-05
**Domain:** End-to-end validation of instance creation pipeline (multi-turn conversation through PR creation)
**Confidence:** HIGH

## Summary

Phase 17 is a validation phase, not a code-writing phase. Its purpose is to execute the complete instance creation pipeline that Phases 13-16.1 built and verify that all components work together correctly. The deliverable (DELIV-03) requires a successful end-to-end run: multi-turn conversation with the LangGraph agent, operator approval, job dispatch via GitHub Actions, Claude Code container execution, and a PR with all 7 artifacts verified correct.

The pipeline has five stages that must connect: (1) Event Handler LangGraph agent receives "create an instance" intent and follows the intake flow defined in EVENT_HANDLER.md, (2) agent collects config across 3-4 turns and presents approval summary, (3) upon approval, agent calls `create_instance_job` tool which invokes `buildInstanceJobDescription()` then `createJob()` to push a job branch, (4) GitHub Actions `run-job.yml` triggers the Docker container which executes Claude Code with the instance scaffolding prompt, (5) container creates all files, commits, creates PR with `--body-file /tmp/pr-body.md`, and auto-merge workflow blocks the PR (blocked-paths check on `instances/*` and `docker-compose.yml`).

**Primary recommendation:** Run the validation as a live test through an actual messaging channel (Slack or Telegram). The test creates a real `testbot` instance, verifies the PR artifacts, then cleans up by closing the PR without merging. No mocks needed -- this validates the actual deployed system.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DELIV-03 | End-to-end validation run succeeds: multi-turn conversation -> approval -> job dispatch -> PR with all 7 artifacts verified correct | Full pipeline analysis below; validation checklist maps to all 7 artifacts; pipeline stages documented with verification points |
</phase_requirements>

## Architecture Patterns

### The Full Pipeline (What Must Be Validated)

```
Stage 1: Intake (Event Handler)
  User says "create an instance for testbot"
  -> LangGraph agent follows EVENT_HANDLER.md intake protocol
  -> Collects: name, purpose, allowed_repos, enabled_channels (3-4 turns)
  -> Presents summary, waits for approval

Stage 2: Dispatch (Event Handler -> GitHub)
  User says "yes" / "go ahead"
  -> Agent calls create_instance_job(config)
  -> buildInstanceJobDescription(config) generates comprehensive prompt
  -> createJob(description) pushes job/{UUID} branch with logs/{UUID}/job.md

Stage 3: Execution (GitHub Actions -> Docker Container)
  -> run-job.yml triggers on branch creation
  -> Docker container runs Claude Code CLI with job.md as prompt
  -> Claude Code generates all 7 artifacts
  -> entrypoint.sh commits, pushes, creates PR with --body-file

Stage 4: Pipeline Gating (GitHub Actions)
  -> auto-merge.yml fires on PR opened
  -> blocked-paths check detects instances/* and docker-compose.yml
  -> PR is NOT auto-merged (requires manual review)

Stage 5: Notification (GitHub Actions -> Event Handler)
  -> notify-pr-complete.yml fires after auto-merge completes
  -> Sends webhook to event handler with PR URL
  -> Agent summarizes and notifies operator
```

### Validation Points at Each Stage

| Stage | What to Verify | How to Check |
|-------|---------------|-------------|
| 1. Intake | Agent asks grouped questions per EVENT_HANDLER.md turn sequencing | Observe conversation in channel |
| 1. Intake | Optional fields (slack_user_ids, telegram_chat_id) never asked for | Observe conversation |
| 1. Intake | Summary presented before dispatch | Observe conversation |
| 2. Dispatch | create_instance_job called with correct params | Agent returns job_id and branch |
| 2. Dispatch | job.md content matches buildInstanceJobDescription output | `gh api` to read job.md from branch |
| 3. Execution | Docker container succeeds (exit 0) | Check GitHub Actions run status |
| 3. Execution | PR created with all 7 artifacts | `gh pr diff --name-only` |
| 3. Execution | PR body contains operator setup checklist | `gh pr view --json body` |
| 4. Gating | PR NOT auto-merged | `gh pr view --json mergedAt` shows null |
| 5. Notification | Agent sends completion message to channel | Observe notification in channel |

### The 7 Artifacts Checklist

Each artifact has specific correctness criteria:

1. **`instances/{name}/Dockerfile`** -- 4 COPY lines reference `instances/{name}/config/`
2. **`instances/{name}/config/SOUL.md`** -- Contains purpose text, no `$` or backticks outside code blocks
3. **`instances/{name}/config/AGENT.md`** -- Exact tool casing: **Read**, **Write**, **Edit**, **Bash**, **Glob**, **Grep**, **Task**, **Skill**
4. **`instances/{name}/config/EVENT_HANDLER.md`** -- Only mentions enabled channels, repo scope matches config
5. **`instances/{name}/config/REPOS.json`** -- Valid JSON, `"owner": "ScalingEngine"`, correct slugs
6. **`instances/{name}/.env.example`** -- Channel-conditional env vars present/absent correctly
7. **`docker-compose.yml` changes** -- New service block, network, volumes, traefik network entry; existing services unchanged

### Test Instance Configuration

Use a minimal test config that exercises the common path:

```json
{
  "name": "testbot",
  "purpose": "Test dev agent for QA validation",
  "allowed_repos": ["clawforge"],
  "enabled_channels": ["slack"]
}
```

This tests: single repo, single channel (the most common case for new instances), scope restrictions.

## Standard Stack

No new dependencies needed. Phase 17 uses the existing deployed system:

| Component | Version | Purpose |
|-----------|---------|---------|
| LangGraph agent | @langchain/langgraph (existing) | Multi-turn conversation with tool calling |
| createInstanceJobTool | lib/ai/tools.js | Dispatches instance creation job |
| buildInstanceJobDescription | lib/tools/instance-job.js | Generates comprehensive job prompt |
| createJob | lib/tools/create-job.js | Pushes job branch to GitHub |
| run-job.yml | GitHub Actions workflow | Triggers Docker container |
| auto-merge.yml | GitHub Actions workflow | Blocks instance PRs from auto-merge |
| entrypoint.sh | templates/docker/job/ | Container entry: clone, Claude Code, commit, PR |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Simulating the conversation | Mock LangGraph agent | Real conversation through Slack/Telegram | Mocks cannot validate the actual LLM behavior and EVENT_HANDLER.md instruction following |
| Artifact verification | Manual file-by-file inspection | `gh` CLI scripted checks against the PR | Repeatable, can be documented as a checklist |
| Pipeline monitoring | Custom status polling | GitHub Actions run status via `gh run list` | Already built and deployed |

## Common Pitfalls

### Pitfall 1: Test Instance Leaks Into Main
**What goes wrong:** The testbot PR gets accidentally merged, adding a real instance to docker-compose.yml.
**Why it happens:** Operator clicks merge on the PR, or someone manually merges it.
**How to avoid:** Close the PR without merging immediately after validation. Add a comment like "E2E validation -- do not merge" to the PR body.
**Warning signs:** docker-compose.yml on main has a testbot service.

### Pitfall 2: SQLite Checkpoint Corruption From Tool Change
**What goes wrong:** If any tool schema changed since the last conversation on the same thread, the LangGraph checkpoint may be incompatible.
**Why it happens:** The createInstanceJobTool was added in Phase 13 and its schema hasn't changed, but if the validation conversation reuses an existing thread with stale checkpoints, it could error.
**How to avoid:** Use a fresh thread (new Slack DM or Telegram message) for the validation run.
**Warning signs:** LangGraph throws serialization errors on the first invoke.

### Pitfall 3: GitHub Actions Runner Unavailable
**What goes wrong:** The org-level runner is busy or offline, so the Docker container never starts.
**Why it happens:** Self-hosted runner capacity constraints.
**How to avoid:** Check runner status before starting validation (`gh api /orgs/ScalingEngine/actions/runners`). The workflow also supports `ubuntu-latest` fallback via `vars.RUNS_ON`.
**Warning signs:** Job stays in "queued" state for >5 minutes.

### Pitfall 4: Job Container Uses Stale Docker Image
**What goes wrong:** The entrypoint.sh in the deployed Docker image doesn't have `--body-file` support (fixed in Phase 16.1).
**Why it happens:** The Docker image hasn't been rebuilt since the template was updated.
**How to avoid:** Verify the deployed image includes the 16.1 changes. If using GHCR, check the image tag date. If needed, rebuild: the run-job.yml pulls `JOB_IMAGE_URL` from vars.
**Warning signs:** PR body says "Automated job by ClawForge" instead of the operator setup checklist.

### Pitfall 5: ANTHROPIC_API_KEY Not Available to Job Container
**What goes wrong:** The Docker container's Claude Code CLI can't authenticate because the API key wasn't passed through the secrets mechanism.
**Why it happens:** AGENT_ANTHROPIC_API_KEY (or equivalent) not set as a GitHub repo secret.
**How to avoid:** Verify `AGENT_ANTHROPIC_API_KEY` exists in repo secrets before running validation.
**Warning signs:** Container exits with authentication error, no PR created.

### Pitfall 6: Notification Doesn't Route Back
**What goes wrong:** After PR creation, the operator never receives a completion notification in their channel.
**Why it happens:** The `notify-pr-complete.yml` workflow depends on `workflow_run` from auto-merge. Since auto-merge blocks the PR (doesn't merge), the notification path is: auto-merge completes (with blocked=true) -> notify workflow fires -> sends webhook. But if the auto-merge workflow doesn't complete normally when blocking, the notification may not trigger.
**How to avoid:** Understand the notification path. Since auto-merge runs to completion (just skips the merge step), notify should still fire. Verify by checking Actions tab.
**Warning signs:** No completion notification after PR is created. Check if auto-merge workflow ran and if notify workflow triggered.

## Validation Methodology

### Option A: Live Channel Test (Recommended)

Execute the full pipeline through an actual messaging channel:

1. Open fresh Slack DM or Telegram conversation with the bot
2. Say "create an instance for testbot"
3. Answer the intake questions across 3-4 turns
4. Approve the configuration summary
5. Wait for job dispatch confirmation (job_id returned)
6. Monitor GitHub Actions for the run-job workflow
7. When PR is created, run artifact verification checks
8. Verify notification arrives in channel
9. Close PR without merging
10. Clean up: delete the job branch

**Advantages:** Tests the actual deployed system. Validates LLM behavior, not just code paths. Catches integration issues (secrets, runner, image freshness).

**Disadvantages:** Requires deployed system to be running. Costs API tokens for LLM calls. Takes 5-15 minutes for the full pipeline.

### Option B: Scripted Verification Against PR

If the validation run has already been triggered (or for post-hoc verification), use `gh` CLI to verify artifacts:

```bash
# Get PR number from job ID
PR_NUMBER=$(gh pr list --head "job/${JOB_ID}" --json number -q '.[0].number')

# Check all 7 files are present
gh pr diff "$PR_NUMBER" --name-only | sort

# Expected output should include:
# docker-compose.yml
# instances/testbot/.env.example
# instances/testbot/Dockerfile
# instances/testbot/config/AGENT.md
# instances/testbot/config/EVENT_HANDLER.md
# instances/testbot/config/REPOS.json
# instances/testbot/config/SOUL.md

# Verify PR body has operator checklist
gh pr view "$PR_NUMBER" --json body -q '.body' | grep "Operator Setup Checklist"

# Verify PR was NOT auto-merged
gh pr view "$PR_NUMBER" --json mergedAt -q '.mergedAt'
# Should output: null

# Verify AGENT.md tool casing (fetch from PR branch)
gh api repos/ScalingEngine/clawforge/contents/instances/testbot/config/AGENT.md \
  --jq '.content' -H "Accept: application/vnd.github.raw" | grep -o '**Read**.*\|**Write**.*\|**Edit**.*\|**Bash**.*'

# Verify REPOS.json has correct owner
gh api repos/ScalingEngine/clawforge/contents/instances/testbot/config/REPOS.json \
  --jq '.content' -H "Accept: application/vnd.github.raw" | jq '.repos[0].owner'
```

### Cleanup Procedure

After validation, clean up test artifacts:

```bash
# Close PR without merging
gh pr close "$PR_NUMBER" --comment "E2E validation complete -- closing without merge"

# Delete the job branch
git push origin --delete "job/${JOB_ID}"
```

## Pre-Validation Checklist

Before running the E2E validation, verify these prerequisites:

- [ ] Event handler is deployed and responding (`curl https://archie.scalingengine.com/api/ping`)
- [ ] `AGENT_ANTHROPIC_API_KEY` is set in GitHub repo secrets
- [ ] Job Docker image is current (includes Phase 16.1 --body-file changes)
- [ ] GitHub Actions runner is available
- [ ] `createInstanceJobTool` is registered in agent tools array (Phase 13 -- already verified)
- [ ] `buildInstanceJobDescription` is imported and called by the tool (Phase 15 -- already verified)
- [ ] `auto-merge.yml` has blocked-paths step (Phase 16 -- already verified)
- [ ] `entrypoint.sh` uses `--body-file` (Phase 16.1 -- already verified)

## Open Questions

1. **Job Docker image freshness**
   - What we know: Phase 16.1 updated `templates/docker/job/entrypoint.sh` to use `--body-file`
   - What's unclear: Whether the deployed Docker image (pulled by run-job.yml) has been rebuilt to include this change
   - Recommendation: Check image build date. If stale, rebuild and push before validation. The `JOB_IMAGE_URL` var in the repo points to the image location.

2. **Notification path for blocked PRs**
   - What we know: `notify-pr-complete.yml` triggers on `workflow_run` completion from auto-merge. Auto-merge runs fully but skips the merge step when blocked.
   - What's unclear: Whether the `workflow_run` event fires as `completed` when auto-merge ends without merging (it should, since the workflow completes -- just the merge step is skipped).
   - Recommendation: Monitor Actions tab during validation. If notification doesn't fire, check workflow run status. The merge_result in the payload will be "not_merged" which is correct for instance PRs.

3. **LLM reliability of intake flow**
   - What we know: EVENT_HANDLER.md has detailed turn sequencing instructions
   - What's unclear: Whether the LLM consistently follows the exact turn sequence (grouped questions, never asking for optional fields, always showing summary)
   - Recommendation: This is part of what the E2E validation tests. If the LLM deviates, it indicates EVENT_HANDLER.md instructions need strengthening (which would be a follow-up fix, not a Phase 17 task).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual E2E validation through live channel + `gh` CLI verification |
| Config file | None |
| Quick run command | Trigger conversation in Slack/Telegram, observe results |
| Full suite command | Full pipeline run + artifact verification script |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DELIV-03 | Multi-turn conversation -> approval -> job dispatch | e2e / manual | Observe conversation in channel | N/A (manual) |
| DELIV-03 | PR with all 7 artifacts verified correct | smoke | `gh pr diff --name-only` + content checks via `gh api` | No -- create verification script |
| DELIV-03 | PR excluded from auto-merge | smoke | `gh pr view --json mergedAt` | No -- part of verification script |

### Sampling Rate
- **Per task commit:** N/A (this is a single validation run)
- **Per wave merge:** N/A
- **Phase gate:** Full E2E run succeeds, all artifact checks pass

### Wave 0 Gaps
- [ ] Verification script for artifact checking via `gh` CLI (optional -- can be done manually)
- [ ] Pre-validation checklist execution (image freshness, runner availability, secrets)

## Sources

### Primary (HIGH confidence)
- `lib/ai/tools.js` -- createInstanceJobTool implementation, tool registration in agent
- `lib/tools/instance-job.js` -- buildInstanceJobDescription full implementation (730 lines)
- `lib/tools/create-job.js` -- createJob implementation (branch creation, job.md push)
- `lib/ai/agent.js` -- LangGraph agent with all 4 tools registered
- `lib/ai/index.js` -- chat() and chatStream() conversation flow
- `instances/noah/config/EVENT_HANDLER.md` -- Intake protocol (lines 291-368)
- `templates/docker/job/entrypoint.sh` -- Full container entrypoint (--body-file, Claude Code invocation)
- `templates/.github/workflows/run-job.yml` -- Job execution workflow
- `templates/.github/workflows/auto-merge.yml` -- Blocked-paths check for instances/*
- `templates/.github/workflows/notify-pr-complete.yml` -- Notification routing

### Secondary (MEDIUM confidence)
- `.planning/phases/15-job-prompt-completeness/15-RESEARCH.md` -- Artifact specifications and pitfalls
- `.planning/REQUIREMENTS.md` -- DELIV-03 definition
- `tests/test-instance-job.js` -- Existing unit tests for buildInstanceJobDescription

## Metadata

**Confidence breakdown:**
- Pipeline stages: HIGH -- all code and workflows read directly; no gaps in understanding
- Artifact verification: HIGH -- exact criteria derived from implementation code and prior research
- Notification path: MEDIUM -- auto-merge -> notify workflow_run chain not yet tested with blocked PRs
- LLM intake behavior: MEDIUM -- depends on LLM instruction following; cannot be verified without running

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable -- pipeline components are frozen after Phase 16.1)
