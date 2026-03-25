---
phase: 54-terminology-migration
plan: "01"
subsystem: admin-ui
tags: [terminology, ui-text, jsx, admin-panel, superadmin]
dependency_graph:
  requires: []
  provides: [TERM-01]
  affects: [admin-layout, instance-switcher, admin-instances-page, superadmin-dashboard, superadmin-monitoring, superadmin-search, admin-billing-page]
tech_stack:
  added: []
  patterns: [jsx-text-surgery, esbuild-compile]
key_files:
  created: []
  modified:
    - lib/chat/components/admin-layout.jsx
    - lib/chat/components/instance-switcher.jsx
    - lib/chat/components/admin-instances-page.jsx
    - lib/chat/components/superadmin-dashboard.jsx
    - lib/chat/components/superadmin-monitoring.jsx
    - lib/chat/components/superadmin-search.jsx
    - lib/chat/components/admin-billing-page.jsx
decisions:
  - "UI-only text changes: JS identifiers (InstanceCard, AdminInstancesPage, instances variable, activeInstance) left unchanged per TERM-01 constraint"
  - "Compiled .js outputs are gitignored and regenerated at build time via npm run build"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-25"
  tasks: 2
  files: 7
---

# Phase 54 Plan 01: Terminology Migration — UI Text (instance → agent) Summary

**One-liner:** Replaced all 12 user-visible "instance/instances" text strings with "agent/agents" across 7 admin UI JSX components with zero logic changes and successful esbuild recompile.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Update admin-layout, instance-switcher, admin-instances-page JSX text | 39a4e4e | admin-layout.jsx, instance-switcher.jsx, admin-instances-page.jsx |
| 2 | Update superadmin-dashboard, monitoring, search, billing + rebuild | c90e664 | superadmin-dashboard.jsx, superadmin-monitoring.jsx, superadmin-search.jsx, admin-billing-page.jsx |

## Changes Made

### admin-layout.jsx
- ADMIN_NAV entry: `label: 'Instances'` → `label: 'Agents'` (line 17)
- `href: '/admin/instances'` and `id: 'instances'` left unchanged (URL/code identifiers, TERM-02 scope)

### instance-switcher.jsx
- Dropdown label text node `Instance` → `Agent` (line 52)
- All JS identifiers (`InstanceSwitcher`, `instances`, `activeInstance`, `getInstanceRegistryAction`) unchanged

### admin-instances-page.jsx
- Count display template: `instance/instances` → `agent/agents` (line 84)
- Empty-state heading: `No instances found` → `No agents found` (line 98)
- Empty-state body: `Instance directories were not detected. Running in single-instance mode.` → `Agent directories were not detected. Running in single-agent mode.` (lines 99-100)
- All JS identifiers (`InstanceCard`, `AdminInstancesPage`, `instances`, `inst`) unchanged

### superadmin-dashboard.jsx
- Section heading: `Cross-Instance Overview` → `Cross-Agent Overview` (line 139)
- Stat label: `Instances` → `Agents` (line 144)
- Empty-state: `No instances configured...` → `No agents configured...` (line 168)

### superadmin-monitoring.jsx
- Section heading: `Instance Health Monitor` → `Agent Health Monitor` (line 195)
- Stat label: `Instances` → `Agents` (line 199)
- Empty-state: `No instances configured.` → `No agents configured.` (line 225)

### superadmin-search.jsx
- Table column header `<th>Instance</th>` → `<th>Agent</th>` (line 157)

### admin-billing-page.jsx
- Usage table row label `<span>Instance</span>` → `<span>Agent</span>` (line 218)

## Verification Results

```
# No user-facing "instance"/"instances" text remaining in .jsx sources
grep -rn '"Instance"\|"Instances"\|>Instance<\|>Instances<\|No instances\|single-instance\|instance${' lib/chat/components/*.jsx
→ CLEAN — no matches

# Agent text present in key files
grep -l "Agents\|agents\|Agent" lib/chat/components/admin-layout.jsx ...
→ All 4 key files returned

# npm run build
→ Done in 54ms — no errors
```

## Deviations from Plan

None — plan executed exactly as written.

The plan's acceptance criteria used `grep ">Agent<"` for the instance-switcher label, but the actual JSX structure has the text as an indented text node, not inline between tags. The label was correctly changed to `Agent`; the grep pattern was just imprecise. Verified with `grep -n "Agent" lib/chat/components/instance-switcher.jsx` which confirms line 52 contains `Agent`.

## Known Stubs

None. All changes are text substitutions in existing rendered UI — no data wiring required.

## Self-Check: PASSED

- lib/chat/components/admin-layout.jsx — FOUND (modified)
- lib/chat/components/instance-switcher.jsx — FOUND (modified)
- lib/chat/components/admin-instances-page.jsx — FOUND (modified)
- lib/chat/components/superadmin-dashboard.jsx — FOUND (modified)
- lib/chat/components/superadmin-monitoring.jsx — FOUND (modified)
- lib/chat/components/superadmin-search.jsx — FOUND (modified)
- lib/chat/components/admin-billing-page.jsx — FOUND (modified)
- Commit 39a4e4e — FOUND
- Commit c90e664 — FOUND
