# Auto-Merge Rules

This guide explains how ClawForge automatically merges job PRs and how you can control that behavior.

---

## How Auto-Merge Works

When your agent completes a job, it creates a pull request. The `auto-merge.yml` GitHub Actions workflow then checks whether the changed files are within your allowed paths. If yes, the PR is squash-merged automatically. If no, it stays open for your review.

By default, only changes to `logs/` auto-merge. This means your agent can write job logs automatically, but any code changes require your approval.

---

## Controlling Auto-Merge

Set these as **GitHub repository variables** (Settings → Secrets and variables → Actions → Variables tab):

### `AUTO_MERGE`

The master kill switch for all auto-merging.

| Value | Behavior |
|-------|----------|
| *(unset or any value)* | Auto-merge enabled |
| `false` | Auto-merge disabled — all job PRs stay open |

### `ALLOWED_PATHS`

Comma-separated path prefixes. If any changed file falls outside these paths, the PR stays open.

| Value | Behavior |
|-------|----------|
| *(unset)* | Defaults to `/logs` — only log files auto-merge |
| `/` | Everything auto-merges |
| `/logs` | Only changes to `logs/` auto-merge |
| `/logs,/docs` | Changes to either `logs/` or `docs/` auto-merge |

Path prefixes are matched from the repo root. A leading `/` is optional — `logs` and `/logs` are equivalent.

---

## Common Configurations

**Safe default — require review for all code changes:**
```
ALLOWED_PATHS = /logs
```

**Require manual review for everything:**
```
AUTO_MERGE = false
```

**Trust the agent completely — auto-merge everything:**
```
ALLOWED_PATHS = /
```

**Allow specific areas:**
```
ALLOWED_PATHS = /logs,/docs,/scripts
```

---

## Debugging Blocked PRs

If a PR is blocked from auto-merging, the workflow logs will show exactly which files were outside the allowed paths. Check the GitHub Actions run for your `auto-merge.yml` workflow to see the specific files that triggered the block.
