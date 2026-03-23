---
phase: quick
plan: 260323-ks4
subsystem: ui, docs
tags: [rename, ux, documentation, subagents]
dependency_graph:
  requires: []
  provides: [subagents-ux-label, operator-docs, subagents-guide]
  affects: [support-page, admin-nav, sidebar, clusters-page]
tech_stack:
  added: []
  patterns: [operator-docs-pattern, friendly-title-mapping]
key_files:
  created:
    - docs/SUBAGENTS.md
  modified:
    - lib/chat/components/app-sidebar.jsx
    - lib/chat/components/admin-layout.jsx
    - lib/chat/components/admin-clusters-page.jsx
    - lib/chat/components/clusters-page.jsx
    - lib/chat/components/cluster-detail-page.jsx
    - lib/chat/components/cluster-role-page.jsx
    - lib/chat/actions.js
    - docs/OPERATOR_GUIDE.md
    - docs/CONFIGURATION.md
    - docs/DEPLOYMENT.md
    - docs/ARCHITECTURE.md
    - docs/SECURITY.md
    - docs/CHAT_INTEGRATIONS.md
    - docs/VOICE.md
    - docs/CODE_WORKSPACES_V2.md
    - docs/ADMIN_PANEL.md
    - docs/AUTO_MERGE.md
    - docs/CUSTOMIZATION.md
decisions:
  - "Only user-facing JSX text changed — all code identifiers (function names, variable names, import paths, route URLs) left intact"
  - "SUPPORT_GUIDES titles rewritten to operator-friendly friendly names (e.g., 'Architecture' → 'How It Works')"
  - "SUBAGENTS.md added as 12th guide with practical walkthrough — what/create/run/monitor"
  - "cluster-detail-tabs.jsx unchanged — tab labels (Overview/Console/Logs) are generic, no Cluster text present"
metrics:
  duration_seconds: 555
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_modified: 18
  files_created: 1
---

# Quick Task 260323-ks4: Rename Clusters to Subagents + Rewrite Docs

Renamed all user-facing "Clusters"/"Workflows" labels to "Subagents" across 6 UI components, rewrote all 11 existing docs as operator-friendly guides with friendly titles, and created a new SUBAGENTS.md walkthrough guide — all surfaced via 12-entry SUPPORT_GUIDES array in actions.js.

---

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Rename user-facing Clusters/Workflows labels to Subagents | 9307d15 | 6 .jsx files |
| 2 | Rewrite 11 docs as operator guides, create SUBAGENTS.md, update support mapping | a0b327b | 12 docs + actions.js |

---

## What Changed

### Task 1 — UI Label Rename

**6 component files updated** (only JSX text content, zero code identifiers changed):

- `app-sidebar.jsx` — "Workflows" span and tooltip → "Subagents"
- `admin-layout.jsx` — ADMIN_NAV label "Clusters" → "Subagents"
- `admin-clusters-page.jsx` — All labels, form fields, empty state, buttons → Subagent(s)
- `clusters-page.jsx` — Page title "Workflows" → "Subagents", section heading "Cluster Definitions" → "Subagent Definitions", empty state
- `cluster-detail-page.jsx` — Loading text → "Loading subagent run..."
- `cluster-role-page.jsx` — "Cluster:" breadcrumb label → "Subagent:", config-changed warning message

**3 files with NO changes** (no user-facing Cluster/Workflow text):
- `cluster-console-page.jsx` — No user-facing Cluster text in rendered content
- `cluster-logs-page.jsx` — No user-facing Cluster text in rendered content
- `cluster-detail-tabs.jsx` — Tab labels (Overview, Console, Logs) are generic

### Task 2 — Documentation Rewrite

**11 docs rewritten** with operator-friendly language, "you/your" framing, friendly H1 titles:

| File | Old Title | New Title |
|------|-----------|-----------|
| OPERATOR_GUIDE.md | ClawForge Operator Guide | Getting Started |
| CONFIGURATION.md | Configuration | Settings & Configuration |
| DEPLOYMENT.md | Production Deployment | Deploying Your Instance |
| ARCHITECTURE.md | ClawForge — End-to-End Architecture | How It Works |
| SECURITY.md | Security | Keeping Your Instance Safe |
| CHAT_INTEGRATIONS.md | Chat Integrations | Connecting Slack & Telegram |
| VOICE.md | Voice Input Architecture | Using Voice Input |
| CODE_WORKSPACES_V2.md | Enhanced Code Workspaces (V2) | Interactive Code Sessions |
| ADMIN_PANEL.md | Admin Panel Architecture | Admin Settings Guide |
| AUTO_MERGE.md | Auto-Merge Controls | Auto-Merge Rules |
| CUSTOMIZATION.md | Customization | Customizing Your Agent |

**1 new doc created:** `docs/SUBAGENTS.md` — "Using Subagents" — covers: what subagents are, how to create (via admin UI + CLUSTER.json), how to run, what the console shows, data sharing via `/tmp/shared/`, design patterns, example use cases, troubleshooting.

**`lib/chat/actions.js` updated:** SUPPORT_GUIDES array updated with 12 entries (11 with friendly titles + 1 new SUBAGENTS.md entry).

---

## Verification

- Build: `npm run build` succeeded after both tasks
- Doc check: All 12 docs exist with >200 chars each
- SUPPORT_GUIDES: 12 entries with friendly titles, includes `SUBAGENTS.md`
- No code identifiers renamed (verified by grep of JSX rendered content)

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Self-Check

Verified commits exist: 9307d15, a0b327b

## Self-Check: PASSED
