# Quick Task 260321-w4q: Fix job result visibility - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Task Boundary

Improve job result visibility in the ClawForge web UI so operators can clearly see what jobs did, whether they succeeded or failed, and access commit/PR links. Also fix the error_log migration gap (already done on VPS, needs code fix to prevent recurrence).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Match upstream PopeBot patterns where applicable
- All implementation choices at Claude's discretion — user said "all clear"

</decisions>

<specifics>
## Specific Ideas

### Current State (from investigation)
1. `createNotification()` IS called for both success and failure jobs (lib/ai/tools.js:333)
2. The notifications page renders all notifications identically — no success/failure visual distinction
3. Notification text comes from `summarizeJob()` which uses LLM to generate summary — includes PR URL, commit message, changed files in the input but the output rendering may not surface them clearly
4. The `error_log` table was missing from SES instance DB — created manually via SSH. The code needs a migration guard or CREATE IF NOT EXISTS to prevent this on fresh instances.

### What needs to change
1. **Notification cards** — Add success (green)/failure (red) visual indicators (icon or border color based on payload status)
2. **Job ID link** — Failed notifications show job ID as a link but success ones may not. Ensure both link to a job detail view.
3. **PR/commit links** — Surface PR URL and commit info prominently in notification cards (not buried in LLM summary text)
4. **error_log migration** — Add CREATE TABLE IF NOT EXISTS guard in the migration or schema initialization code

### Key files
- `lib/chat/components/notifications-page.jsx` — notification card rendering
- `lib/db/notifications.js` — createNotification, getNotifications
- `lib/db/schema.js` — notification schema (check if payload is stored)
- `lib/ai/tools.js:333` — where notifications are created with payload
- `lib/chat/actions.js` — getNotifications server action (check if payload is returned)
- `drizzle/` — migration files for error_log

</specifics>
