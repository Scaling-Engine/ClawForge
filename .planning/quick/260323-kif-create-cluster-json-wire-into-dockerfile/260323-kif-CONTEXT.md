# Quick Task 260323-kif: Cluster config + admin UI - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Task Boundary

Create a default CLUSTER.json with multi-agent roles matching upstream PopeBot, wire it into Docker images (using defaults/ pattern to survive volume mounts), and add cluster management to admin UI.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Match upstream PopeBot pattern for roles (CTO, Security, UI/UX, Developer)
- Both instances get the same default cluster config
- Admin UI should allow full CRUD (create/edit/delete clusters and roles)
- Use the existing config.js loadClusterConfig/validateClusterConfig patterns

</decisions>

<specifics>
## Specific Ideas

### Existing infrastructure (already built, just needs config)
- `lib/cluster/coordinator.js` — full orchestrator with sequential dispatch, shared volumes, label-based routing, iteration limits
- `lib/cluster/config.js` — loads from `config/CLUSTER.json`, validates schema
- `lib/cluster/volume.js` — shared volume management, inbox/outbox copy
- `lib/db/cluster-runs.js` — DB tracking for runs and agent runs
- `lib/chat/components/clusters-page.jsx` — list page
- `lib/chat/components/cluster-detail-page.jsx` — detail with tabs
- `lib/chat/components/cluster-console-page.jsx` — SSE streaming console
- `lib/chat/components/cluster-logs-page.jsx` — log viewer
- `lib/chat/components/cluster-role-page.jsx` — role detail
- `lib/paths.js:51` — `clusterFile = path.join(PROJECT_ROOT, 'config', 'CLUSTER.json')`

### Schema from fixtures
```json
{
  "clusters": [{
    "name": "test-cluster",
    "roles": [{
      "name": "researcher",
      "systemPrompt": "You are a researcher.",
      "allowedTools": ["Read", "Grep"]
    }]
  }]
}
```

### Volume shadow issue
Same as REPOS.json — config/ is mounted as a Docker named volume. Need to:
1. Add CLUSTER.json to `defaults/` in Dockerfiles (like REPOS.json fix)
2. Update `loadClusterConfig` to check `defaults/CLUSTER.json` fallback
3. Or add `lib/paths.js` defaultClusterFile

### Admin UI
Need a new `/admin/clusters` page with:
- List all clusters with role count
- Create new cluster (name + system prompt + folders)
- Edit cluster (add/remove/edit roles)
- Delete cluster
- Each role: name, systemPrompt (textarea), allowedTools (multi-select or comma-separated)
- Save writes to config/CLUSTER.json (file-based, like existing config pattern)

</specifics>
