---
status: awaiting_human_verify
trigger: "job-false-negative-status — Job ac372de1 succeeded but event handler reported failure"
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED. Root cause was two-fold: (1) notify-job-failed.yml fires when run-job.yml concludes non-success, before notify-pr-complete.yml which fires after auto-merge completes. PR-existence guard added to suppress false failure notification when Claude actually produced a PR. (2) CRITICAL BUG IN FIX: notify-job-failed.yml was missing pull-requests: read permission, making the gh pr list guard call fail silently every time — fix was non-functional without this permission.

test: Read both workflow files end-to-end, compared permissions blocks, traced every code path in entrypoint.sh, handleGithubWebhook, summarizeJob, and addToThread.
expecting: With pull-requests: read added, the guard can now successfully query PR existence and suppress false failure notifications.
next_action: Human verification that fixed workflow behaves correctly on next job dispatch.

## Symptoms

expected: Job should report success since the change was actually deployed and the menu title was updated
actual: Event handler says "the job failed" with a GitHub auth error message, but the change DID go through successfully
errors: "The agent couldn't authenticate with GitHub — it looks like there was a credential/token issue when the container started up. No changes were made to the codebase."
reproduction: Job ac372de1 on branch job/ac372de1-a463-41f1-a871-d307c81f6e93. User asked to rename "Mission Meeting" to "Meetings", job was dispatched, reported failure, but the change was actually applied.
timeline: This specific job. Unknown if this is a recurring pattern.

## Eliminated

- hypothesis: Race condition where status was checked before job completed
  evidence: The job DID complete — it made the change. The issue is not about checking too early, but about which notification wins.
  timestamp: 2026-03-23T00:01:00Z

- hypothesis: LLM hallucination of failure from ambiguous status data
  evidence: The status sent is explicitly "failure" from notify-job-failed.yml, not ambiguous. The LLM is interpreting correctly, but the input data is wrong.
  timestamp: 2026-03-23T00:01:00Z

## Evidence

- timestamp: 2026-03-23T00:00:30Z
  checked: notify-job-failed.yml trigger condition (line 12-13)
  found: Fires whenever Run ClawForge Job concludes with conclusion != 'success'. This fires even if Claude made successful commits but the container exited non-zero (e.g., due to a non-fatal startup issue or git push error that Claude worked around)
  implication: ANY non-zero container exit triggers a failure notification, regardless of actual work done

- timestamp: 2026-03-23T00:00:31Z
  checked: notify-job-failed.yml failure_stage detection (lines 47-53)
  found: failure_stage defaults to "docker_pull", then "auth" if preflight.md exists, then "claude" only if claude-output.jsonl exists AND is non-empty. If Claude ran but didn't commit claude-output.jsonl (or it's empty), failure_stage stays at "auth"
  implication: A container that ran Claude Code successfully but had auth issues at git push startup would be reported as failure_stage="auth" — exactly what the user saw

- timestamp: 2026-03-23T00:00:32Z
  checked: handleGithubWebhook dedup guard (api/index.js lines 263-267)
  found: Dedup only checks isJobNotified() which tracks Docker-dispatched jobs. GitHub Actions jobs are NOT deduplicated between notify-job-failed.yml and notify-pr-complete.yml
  implication: Both failure AND success notifications can hit the webhook for the same job. Whichever arrives first gets injected into thread memory (addToThread). If failure arrives first, user sees failure despite job succeeding.

- timestamp: 2026-03-23T00:00:33Z
  checked: notify-pr-complete.yml — when it fires (line 5-6)
  found: Fires on workflow_run completion of "Auto-Merge ClawForge PR". This is a separate, LATER workflow. notify-job-failed.yml fires on "Run ClawForge Job" completion. So failure notification fires first (before auto-merge even runs)
  implication: The failure notification ALWAYS fires before success notification in this scenario. The failure notification wins the race every time.

- timestamp: 2026-03-23T00:00:34Z
  checked: JOB_SUMMARY.md + summarizeJob() in lib/ai/index.js
  found: summarizeJob receives failure_stage="auth" and status="failure" — the LLM correctly interprets this as auth failure and generates the auth error message. The LLM is not at fault.
  implication: Root cause is upstream data, not LLM interpretation

- timestamp: 2026-03-23T00:00:35Z
  checked: notify-job-failed.yml — whether it checks if a PR was created
  found: It does NOT check if a PR was created or merged. It only looks at log files on the branch. Changed_files is always [] in failure payloads (line 83), pr_url is always "" (line 82)
  implication: Even if Claude made the change and created a PR that merged, the failure notification has no PR URL and no changed_files — making it look like nothing was done

- timestamp: 2026-03-23T00:02:00Z
  checked: notify-job-failed.yml permissions block (lines 14-15) vs notify-pr-complete.yml permissions (lines 12-14)
  found: notify-job-failed.yml only had `contents: read`. The PR guard added in the fix calls `gh pr list` which requires `pull-requests: read`. Without it, the gh call fails silently (|| echo "" catches it), PR_NUMBER is always empty, guard never triggers. Fix was non-functional.
  implication: Added pull-requests: read to notify-job-failed.yml permissions. Guard now has the access it needs to query PR existence.

- timestamp: 2026-03-23T00:02:01Z
  checked: entrypoint.sh exit code path — when does Claude exit non-zero but still produce a PR?
  found: PR creation (line 588) requires CLAUDE_EXIT -eq 0. If Claude exits non-zero, no PR is created. So the primary scenario where guard fires (PR exists despite failure) requires Claude to have exited 0 but the run-job.yml workflow itself failed for another reason (e.g., GHCR login step, or git operations before Claude ran).
  implication: The guard correctly handles the case where Claude succeeded (CLAUDE_EXIT=0, PR created) but run-job.yml failed due to an outer step. This is the actual false-negative scenario.

- timestamp: 2026-03-23T00:02:02Z
  checked: handleGithubWebhook dedup for dual-notification scenario (both failure + success arrive)
  found: No dedup between failure and success Actions notifications. If both arrive (guard fails), both are processed: two calls to addToThread(), two Slack messages, two job outcomes saved.
  implication: Residual risk: if gh API fails in guard, user gets two messages. Acceptable — guard failure is a fallback to old behavior, not a new failure mode. Success message arrives later so LangGraph memory ends with correct state.

## Resolution

root_cause: Two independent notification workflows (notify-job-failed.yml and notify-pr-complete.yml) can both fire for the same successful job when the GitHub Actions container exits with non-zero code. The failure notification fires first (it triggers on Run ClawForge Job completion, while success triggers on Auto-Merge completion which is a later workflow). The failure notification uses absence of log files to detect failure_stage, defaulting to "auth" even when Claude ran successfully. Since handleGithubWebhook has no dedup between these two notification paths, the failure message gets injected into thread memory first, and the user sees a false failure report with a misleading auth error message.

fix: Two-part fix:
  1. In notify-job-failed.yml: Add a PR existence check BEFORE sending the failure notification. If a PR exists for this job branch (even if not yet merged), the job DID do work — upgrade the failure or skip the notification entirely.
  2. In handleGithubWebhook (api/index.js): Add job-level dedup for Actions notifications — track which job_ids have had notifications sent, and if a success/merged notification arrives after a failure one, send a correction message.
  The simplest targeted fix: modify notify-job-failed.yml to check if a PR was created for this branch before firing. If a PR exists, the job ran and committed code — the failure is at the git/PR level, not auth. Skip the notification or adjust failure_stage accordingly.

verification: Deep verification complete. Fix required a critical correction: notify-job-failed.yml was missing pull-requests: read permission. Without it, the gh pr list guard call fails silently (returns empty), making the PR guard non-functional — fix would have had zero effect. Added pull-requests: read to permissions block. Now the guard correctly reads PR state before deciding to suppress the failure notification.

Edge cases verified:
- PR closed (not merged): --state all catches it, guard suppresses. Acceptable tradeoff (notify-pr-complete.yml handles outcome correctly).
- gh API rate limit or permission error: || echo "" fallback sends failure notification. Safe default.
- Claude exits non-zero + NO PR created: guard finds no PR, sends failure. Correct.
- Claude exits 0 + PR creation fails silently (|| true): no PR, no auto-merge, no notification from either path. Pre-existing silent-failure gap, not introduced by this fix.
- Double notification if guard fails: both failure + success hit webhook. Second message (success) overwrites LangGraph context. User sees both messages but success wins in memory.

files_changed:
  - .github/workflows/notify-job-failed.yml
