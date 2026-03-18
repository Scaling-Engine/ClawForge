# Slack Notification Audit — v3.0 Launch Readiness

**Audited:** 2026-03-18
**AUDIT RESULT:** PASS — No pre-v3.0 notification formats were modified

---

## Summary

- **13 total Slack notification call sites** (across 5 files)
- **10 pre-v3.0** (unchanged; format preserved since before Phase 43)
- **3 new in v3.0** (additive only; routed exclusively to `SLACK_OPERATOR_CHANNEL`, not user threads)
- **1 conversational reply** (`SlackAdapter.sendResponse` — unmodified since initial fork)

No pre-v3.0 message format string was changed by Phases 43-46. All new v3.0 notifications are additive and go to the operator channel only.

---

## Pre-v3.0 Notifications (Must Not Change)

### Job Notifications — `lib/ai/tools.js`

| Call Site | Line | Format | Type | Destination |
|-----------|------|--------|------|-------------|
| Job started status message | 220 | `Job \`${jobId.slice(0,8)}\` started — warming up...` | Plain text | `channel` + `thread_ts` (user thread reply) |
| Job running edit-in-place update | 244 | `Job \`${jobId.slice(0,8)}\` — ${lastActivity} (${mins}m ${secs}s)` | Plain text | `chat.update` on status message ts |
| Job completion: edit status to final | 397 | `Job \`${jobId.slice(0,8)}\` ${status === 'success' ? 'completed' : 'failed'}: ${message.slice(0,200)}` | Plain text | `chat.update` on status message ts |
| Job completion: full summary to thread | 403 | `${message}` (full `summarizeJob()` output) | Plain text | `channel` + `thread_ts` (streaming path) |
| Job completion: non-streaming fallback | 406 | `${message}` (full `summarizeJob()` output) | Plain text | `channel` + `thread_ts` (fallback path) |

**Git evidence:** Status update pattern added in Phase 25 (`feat(25-03): add Slack edit-in-place status updates in waitAndNotify` — commit `cca405d`). No format changes since Phases 43-46 (commits `cf2ba84`, `1a3613f` only added usage recording and alert wiring — message templates untouched).

**Notes on STRM-06 (Phases 25/39):**
- The `lastActivity` variable feeds off `streamManager.subscribe()` events (`file-change`, `bash-output`, `progress`, `error`) — these format strings were introduced in Phase 25 and have not changed.
- The gate failure detection logic added in Phase 39 (`feat(39-02)`) only modified how `log` is built before calling `summarizeJob()` — the Slack message format itself (`text: message`) was not altered.

---

### Workspace Notifications — `lib/tools/docker.js`

| Call Site | Line | Format | Type | Destination |
|-----------|------|--------|------|-------------|
| Workspace event (closed, crashed, recovered, idle_stopped) | 1128 | Variable `message` from switch/case — see below | Plain text | `channel` + `thread_ts` (user thread reply) |

**Message formats (from `notifyWorkspaceEvent` switch/case):**
- `closed`: `Workspace closed (${ws.repoSlug}). ${extra.commits?.length ? 'Commits:\n' + ... : 'No new commits.'}`
- `crashed`: `Workspace crashed (${ws.repoSlug}). Container exited unexpectedly. It will auto-recover on next access.`
- `recovered`: `Workspace recovered (${ws.repoSlug}). Container restarted successfully.`
- `idle_stopped`: `Workspace stopped (${ws.repoSlug}) after idle timeout. ${extra.commits?.length ? 'Commits during session:\n' + ... : 'No new commits.'}`
- default: `Workspace event (${ws.repoSlug}): ${eventType}`

**Git evidence:** Introduced in Phase 24 (`feat(24-02): add closeWorkspace, commit surfacing, and workspace event notifications` — commit `22df685`). Last modified by Phase 36 DnD tab changes (`97785cb`) — workspace notification switch/case was not touched. Phases 43-46 did not modify `docker.js` notification code.

---

### Cluster Notifications — `lib/cluster/index.js` and `lib/cluster/coordinator.js`

| Call Site | File | Line | Format | Type | Destination |
|-----------|------|------|--------|------|-------------|
| Cluster run started parent message | `lib/cluster/index.js` | 61 | `Cluster run started: *${clusterName}*\nRun ID: \`${runId}\`` | Plain text (Slack markdown) | `channel` (new parent thread) |
| Cluster run completion message | `lib/cluster/index.js` | 106 | `Cluster *${clusterName}* complete after ${totalAgentRuns} agent run${...}.` OR `Cluster *${clusterName}* failed: ${failReason \|\| 'unknown error'}` | Plain text (Slack markdown) | `channel` + `thread_ts` |
| Cluster run failure (unhandled error) | `lib/cluster/index.js` | 133 | `Cluster *${clusterName}* failed with unhandled error: ${err.message}` | Plain text (Slack markdown) | `channel` + `thread_ts` |
| Per-agent completion in cluster thread | `lib/cluster/coordinator.js` | 351 | `${emoji} Agent *${currentRole.name}* (step ${agentIndex + 1}) ${agentStatus} — label: \`${label}\`` | Plain text (Slack markdown) | `channel` + `thread_ts` |

**Git evidence:** Cluster Slack messages introduced in Phase 28 (`feat(28-03): runCluster entry point with Slack parent thread` — commit `e5c5521`; coordinator `feat(28-03): implement coordinator dispatch loop` — commit `0e1739c`). Phase 37 added log streaming to coordinator (`a4c8866`) but did not modify Slack message format strings. Phases 43-46 did not touch cluster files.

---

### GitHub Actions Webhook — `api/index.js`

| Call Site | Line | Format | Type | Destination |
|-----------|------|--------|------|-------------|
| Job result to originating thread | 332 | `${message}` (full `summarizeJob()` output) | Plain text | `channel` + `thread_ts` (user thread reply) |

**Git evidence:** Actions webhook Slack notification established in Phase 11 (`feat(11-02): wire target_repo passthrough and Telegram thread-origin routing` — commit `b793513`). Phase 44 added usage recording in the webhook handler (`feat(44-02): usage recording for GitHub Actions path` — commit `8ecbd5a`) — only billing code was added; the `chat.postMessage` call at line 332 and its format (`text: message`) were not modified. Phase 43 added `captureError` import (`feat(43-01)` — commit `3817fa1`) — did not touch the notification code path.

---

### Conversational Replies — `lib/channels/slack.js`

| Call Site | Line | Format | Type | Destination |
|-----------|------|--------|------|-------------|
| `SlackAdapter.sendResponse` — agent conversational reply | 271 | `${chunk}` (split message text, up to 4000 chars per call) | Plain text | `channel` + `thread_ts` |

**Git evidence:** `SlackAdapter` created in the initial fork (`fdd78d7`). Only minor additions: `requireMention` config (`ca57283`), audio transcription via Whisper (`df5b765`). The `sendResponse` method and its `chat.postMessage` call were not modified by Phases 43-46.

---

## New v3.0 Notifications (Additive Only)

All new v3.0 notifications are routed **exclusively to `SLACK_OPERATOR_CHANNEL`** — an operator-only environment variable distinct from user conversation channels. These notifications cannot reach user threads.

### 1. Billing 80% Usage Warning — `lib/ai/tools.js:102`

- **Phase added:** Phase 44 (`feat(44-02)` — commit `cf2ba84`)
- **Format:** `Warning: Instance "${instanceName}" has used ${limitCheck.current}/${limitCheck.limit} jobs this month (${Math.round(limitCheck.percentUsed * 100)}%). Limit resets (UTC): ${limitCheck.resetDate}`
- **Destination:** `SLACK_OPERATOR_CHANNEL` (operator channel, not user thread)
- **Type:** Plain text, `chat.postMessage` (no `thread_ts`)
- **Trigger condition:** `limitCheck.percentUsed >= 0.8` AND `limitCheck.limit !== null` AND warning not already sent this period (per `wasWarningSent` / `markWarningSent` dedup)
- **Non-fatal:** If `SLACK_BOT_TOKEN` or `SLACK_OPERATOR_CHANNEL` is not set, the warning is silently skipped; the job proceeds regardless.

### 2. Consecutive Failure Alert — `lib/monitoring/alerts.js:34`

- **Phase added:** Phase 46 (`feat(46-01)` — commit `1a3613f` wired into waitAndNotify; `ce87c51` added the module)
- **Format:** `Alert: Instance "${instanceName}" has ${count} consecutive job failures. Check /admin/superadmin/monitoring for details.`
- **Destination:** `SLACK_OPERATOR_CHANNEL` (operator channel, not user thread)
- **Type:** Plain text, `chat.postMessage` (no `thread_ts`)
- **Trigger condition:** `getConsecutiveFailureCount(3) >= 3` AND no alert sent in the last 60 minutes (throttle via `config` table key `alert:consecutive_failure:{instanceName}`)
- **Both paths:** Fires in both the `origin`-thread path and the no-origin path of `waitAndNotify` — all jobs contribute to consecutive failure counting regardless of channel source.
- **Non-fatal:** If `SLACK_BOT_TOKEN` or `SLACK_OPERATOR_CHANNEL` is not set, silently skipped.

---

## Call Site Count by File

| File | `chat.postMessage` | `chat.update` | `sendResponse` | Total |
|------|--------------------|---------------|----------------|-------|
| `lib/ai/tools.js` | 4 | 2 | — | 6 |
| `lib/monitoring/alerts.js` | 1 | — | — | 1 |
| `lib/cluster/index.js` | 3 | — | — | 3 |
| `lib/cluster/coordinator.js` | 1 | — | — | 1 |
| `lib/tools/docker.js` | 1 | — | — | 1 |
| `api/index.js` | 1 | — | — | 1 |
| `lib/channels/slack.js` | 1 (via `sendResponse`) | — | 1 | 1 |
| **Total** | **12** | **2** | **1** | **14** |

---

## Verification

- [x] Every `chat.postMessage` call in `lib/` and `api/` is listed above (12 calls confirmed via grep)
- [x] Every `chat.update` call in `lib/` and `api/` is listed above (2 calls confirmed via grep)
- [x] No pre-v3.0 message format string was modified by Phases 43-46
- [x] New v3.0 notifications (billing warning + consecutive failure alert) go to `SLACK_OPERATOR_CHANNEL` only — not user threads
- [x] `SlackAdapter.sendResponse` (conversational replies) is unchanged since Phase 43+

---

## How Classification Was Determined

**PRE-V3.0** = The `chat.postMessage` / `chat.update` call existed before Phase 43 (first v3.0 phase). Verified using `git log --oneline --all -- {file}` — the last commit touching the notification format was before `feat(43-*)` commits.

**NEW-V3.0** = The call was introduced in Phases 43-46. Verified by commit message referencing Phase 44 or 46.

**Phase boundary:** v3.0 work begins at Phase 43 (Observability). Phases 43-46 are all v3.0. Phase 47 (this audit) is the final hardening phase before launch.

---

## Confirmation: summarizeJob() Format Unchanged

The `summarizeJob()` function in `lib/ai/index.js` generates the `message` text used by the job completion notifications (tools.js lines 403/406, api/index.js line 332). This function was not modified by any Phase 43-46 commit — its output format is therefore identical to pre-v3.0.
