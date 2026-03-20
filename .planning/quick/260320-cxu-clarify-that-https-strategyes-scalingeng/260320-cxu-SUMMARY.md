---
phase: quick
plan: 260320-cxu
subsystem: docs
tags: [docs, instances, epic, deployment]
dependency_graph:
  requires: []
  provides: [explicit-url-to-instance-mapping]
  affects: [CLAUDE.md, docs/DEPLOYMENT.md, docs/OPERATOR_GUIDE.md]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - CLAUDE.md (via AGENTS.md symlink)
    - docs/DEPLOYMENT.md
    - docs/OPERATOR_GUIDE.md
decisions:
  - "Updated strategyES Channels from 'Slack only' to 'Slack, Web Chat' — web chat is live at strategyes.scalingengine.com"
metrics:
  duration: ~4 minutes
  completed: 2026-03-20T13:29:00Z
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 260320-cxu: Clarify strategyes.scalingengine.com → Epic Mapping Summary

**One-liner:** Explicit URL-to-instance-to-agent mapping added across CLAUDE.md, DEPLOYMENT.md, and OPERATOR_GUIDE.md so any developer immediately sees strategyes.scalingengine.com = Epic.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update CLAUDE.md Instances table with URLs and agent names | 64c8dec | AGENTS.md (CLAUDE.md) |
| 2 | Add domain mapping to DEPLOYMENT.md and update OPERATOR_GUIDE.md Epic section | 3906c2f | docs/DEPLOYMENT.md, docs/OPERATOR_GUIDE.md |

## What Was Done

**Task 1 — CLAUDE.md Instances table:**
- Expanded table from 3 columns (Instance, Channels, Restriction) to 5 columns (Instance, Agent Name, URL, Channels, Restriction)
- Noah instance: Archie / clawforge.scalingengine.com
- strategyES instance: Epic / strategyes.scalingengine.com
- Corrected strategyES Channels from "Slack only" to "Slack, Web Chat" (web chat is live at that URL)
- Added note explaining SOUL.md drives dynamic agent name rendering at runtime

**Task 2 — DEPLOYMENT.md:**
- Added "Live Instance Domains" subsection after the DNS A record section
- Table maps domain → instance → agent name → env var for both instances

**Task 2 — OPERATOR_GUIDE.md:**
- Replaced `epic.domain.com` placeholder (line ~498) with `strategyes.scalingengine.com` in the Traefik diagram
- Added `URL: https://strategyes.scalingengine.com` to the Epic (strategyES) section
- Updated Channels in Epic section from "Slack only" to "Slack, Web Chat"

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `grep "strategyes.scalingengine.com" AGENTS.md` — FOUND
- [x] `grep "strategyes.scalingengine.com" docs/DEPLOYMENT.md` — FOUND
- [x] `grep "strategyes.scalingengine.com" docs/OPERATOR_GUIDE.md` — FOUND (2 hits)
- [x] Commit 64c8dec exists
- [x] Commit 3906c2f exists

## Self-Check: PASSED
