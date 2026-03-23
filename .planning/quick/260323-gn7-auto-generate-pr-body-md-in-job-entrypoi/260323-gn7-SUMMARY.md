---
phase: quick
plan: 260323-gn7
subsystem: job-containers, chat-ui
tags: [pr-body, entrypoint, docker, pull-requests-page]
dependency_graph:
  requires: []
  provides: [PR-BODY-GEN]
  affects: [templates/docker/job/entrypoint.sh, docker/job/entrypoint.sh, lib/chat/components/pull-requests-page.jsx]
tech_stack:
  added: []
  patterns: [pure-git-pr-body, pre-whitespace-pre-wrap]
key_files:
  created: []
  modified:
    - templates/docker/job/entrypoint.sh
    - docker/job/entrypoint.sh
    - lib/chat/components/pull-requests-page.jsx
decisions:
  - "PR body generated with pure git commands (git log --oneline, git diff --stat, git diff --numstat) — no LLM call, runs synchronously before gh pr create"
  - "Filter out 'Automated job by ClawForge' fallback body in UI — only meaningful descriptions rendered"
  - "pre with whitespace-pre-wrap for PR body display — preserves markdown-like formatting from code fences and diff stats without requiring a full markdown renderer"
metrics:
  duration: "5 min"
  completed_date: "2026-03-23"
  tasks: 2
  files: 3
---

# Quick Task 260323-gn7: Auto-Generate PR Body in Job Entrypoint Summary

**One-liner:** Job containers now generate `/tmp/pr-body.md` with job ID, commit list, files-changed diff stats, and line count summary — all from pure git commands, picked up automatically by existing `gh pr create --body-file` logic.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Generate /tmp/pr-body.md in entrypoint after Claude Code completes | ff6668b | templates/docker/job/entrypoint.sh, docker/job/entrypoint.sh |
| 2 | Render PR body in pull-requests-page expanded section | c27af17 | lib/chat/components/pull-requests-page.jsx |

## What Was Built

**Entrypoint changes (both copies):**

A `GENERATE PR BODY` block inserted at the correct position — after `GATE_PASS` is read, before the `gh pr create` call. The block runs only when `HAS_NEW_COMMIT=true` and writes to `/tmp/pr-body.md`:

- `## Job \`{JOB_ID}\`` header
- `### Commits` — `git log --oneline main..HEAD`
- `### Files Changed` — `git diff --stat main..HEAD`
- `### Summary` — file count + line additions/deletions via `git diff --numstat`

The existing `if [ -f /tmp/pr-body.md ]` checks in the PR creation block were already in place — they now get a real file instead of falling back to the generic body.

**UI changes:**

In `PRRow` expanded section, a "Description" card appears above the file list when `pr.body` is present and is not the generic `"Automated job by ClawForge"` fallback. Displayed as `<pre>` with `whitespace-pre-wrap font-mono` to preserve the git diff formatting.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `templates/docker/job/entrypoint.sh` — GENERATE PR BODY block present
- [x] `docker/job/entrypoint.sh` — GENERATE PR BODY block present
- [x] `lib/chat/components/pull-requests-page.jsx` — pr.body rendered
- [x] `npm run build` — passes (Done in 35ms)
- [x] Commits ff6668b and c27af17 exist

## Self-Check: PASSED
