---
phase: quick
plan: 260323-kif
type: execute
wave: 1
depends_on: []
files_modified:
  - config/CLUSTER.json
  - lib/paths.js
  - lib/cluster/config.js
  - lib/chat/actions.js
  - lib/chat/components/admin-clusters-page.jsx
  - lib/chat/components/admin-layout.jsx
  - lib/chat/components/index.js
  - templates/app/admin/clusters/page.js
  - instances/noah/Dockerfile
  - instances/strategyES/Dockerfile
autonomous: true
requirements: [QUICK-260323-KIF]

must_haves:
  truths:
    - "Default CLUSTER.json exists with CTO, Security, UI/UX, Developer roles"
    - "Docker images bake CLUSTER.json into defaults/ so it survives volume mounts"
    - "loadClusterConfig falls back to defaults/CLUSTER.json when config/ copy is missing"
    - "Admin UI at /admin/clusters lists clusters with full CRUD"
  artifacts:
    - path: "config/CLUSTER.json"
      provides: "Default cluster config with 4 roles"
    - path: "templates/app/admin/clusters/page.js"
      provides: "Admin clusters route"
    - path: "lib/chat/components/admin-clusters-page.jsx"
      provides: "Cluster CRUD admin page"
  key_links:
    - from: "lib/cluster/config.js"
      to: "lib/paths.js"
      via: "defaultClusterFile import"
      pattern: "defaultClusterFile"
    - from: "lib/chat/components/admin-clusters-page.jsx"
      to: "lib/chat/actions.js"
      via: "server actions for cluster CRUD"
      pattern: "getClusterConfig|saveClusterConfig"
---

<objective>
Create default CLUSTER.json with multi-agent roles, wire into Docker images via defaults/ pattern, add defaults/ fallback to loadClusterConfig, and build admin CRUD page for cluster management.

Purpose: Clusters infrastructure exists (coordinator, volume, DB tracking, UI pages) but has no default config and no way to manage clusters from the admin panel.
Output: Working cluster config with Docker persistence and admin CRUD.
</objective>

<execution_context>
@/Users/nwessel/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nwessel/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@config/CLUSTER.json (will be created)
@lib/cluster/config.js
@lib/paths.js
@lib/chat/actions.js
@lib/chat/components/admin-layout.jsx
@lib/chat/components/admin-repos-page.jsx (CRUD pattern reference)
@lib/chat/components/index.js
@instances/noah/Dockerfile
@instances/strategyES/Dockerfile
@templates/app/admin/repos/page.js (page shell pattern reference)

<interfaces>
<!-- From lib/paths.js — add defaultClusterFile alongside existing defaultReposFile -->
export const defaultsDir = path.join(PROJECT_ROOT, 'defaults');
export const defaultReposFile = path.join(PROJECT_ROOT, 'defaults', 'REPOS.json');
export const clusterFile = path.join(PROJECT_ROOT, 'config', 'CLUSTER.json');

<!-- From lib/cluster/config.js — existing functions to extend -->
export async function loadClusterConfig(filePath): Promise<{clusters: Array}>
export async function getCluster(name, filePath): Promise<object|null>
export function validateClusterConfig(config): { valid: boolean, errors: string[] }

<!-- From lib/chat/actions.js — auth helpers -->
async function requireAdmin(): Promise<User>

<!-- From lib/chat/components/admin-layout.jsx — nav array to extend -->
const ADMIN_NAV = [
  { id: 'general', label: 'General', href: '/admin/general', icon: SettingsSliderIcon },
  { id: 'repos', label: 'Repos', href: '/admin/repos', icon: DatabaseIcon },
  // ... add clusters entry here
];

<!-- Cluster config schema (from test fixtures + validateClusterConfig) -->
{
  "clusters": [{
    "name": "string",
    "systemPrompt": "string (optional, cluster-level)",
    "folders": ["string (optional)"],
    "roles": [{
      "name": "string",
      "systemPrompt": "string",
      "allowedTools": ["string"],
      "transitions": {} // optional
    }]
  }]
}
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create CLUSTER.json, wire defaults/ fallback, update Dockerfiles</name>
  <files>config/CLUSTER.json, lib/paths.js, lib/cluster/config.js, instances/noah/Dockerfile, instances/strategyES/Dockerfile</files>
  <action>
1. Create `config/CLUSTER.json` with a single default cluster matching upstream PopeBot roles:
```json
{
  "clusters": [
    {
      "name": "default",
      "systemPrompt": "You are part of a multi-agent development team. Collaborate through the shared workspace to complete tasks efficiently.",
      "roles": [
        {
          "name": "CTO",
          "systemPrompt": "You are the CTO agent. You review architecture decisions, set technical direction, and ensure code quality standards. You coordinate the other agents and make final decisions on implementation approach.",
          "allowedTools": ["Read", "Glob", "Grep", "Write", "Edit", "Bash"]
        },
        {
          "name": "Security",
          "systemPrompt": "You are the Security agent. You review code for vulnerabilities, ensure proper input validation, check for secrets exposure, and verify authentication/authorization patterns.",
          "allowedTools": ["Read", "Glob", "Grep"]
        },
        {
          "name": "UI/UX",
          "systemPrompt": "You are the UI/UX agent. You implement user interfaces, ensure responsive design, accessibility compliance, and consistent styling patterns.",
          "allowedTools": ["Read", "Glob", "Grep", "Write", "Edit"]
        },
        {
          "name": "Developer",
          "systemPrompt": "You are the Developer agent. You implement features, write tests, fix bugs, and handle the bulk of code production. You follow the patterns set by the CTO and address issues flagged by Security.",
          "allowedTools": ["Read", "Glob", "Grep", "Write", "Edit", "Bash"]
        }
      ]
    }
  ]
}
```

2. Add `defaultClusterFile` to `lib/paths.js` — same pattern as `defaultReposFile`:
```js
export const defaultClusterFile = path.join(PROJECT_ROOT, 'defaults', 'CLUSTER.json');
```

3. Update `loadClusterConfig` in `lib/cluster/config.js` to fall back to `defaultClusterFile` when the primary `clusterFile` is ENOENT. Import `defaultClusterFile` from paths.js. In the ENOENT catch, try reading `defaultClusterFile` before returning empty `{ clusters: [] }`.

4. Add a `saveClusterConfig` function to `lib/cluster/config.js`:
```js
export async function saveClusterConfig(config, filePath) {
  const resolvedPath = filePath || clusterFile;
  await fs.writeFile(resolvedPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}
```

5. Update both Dockerfiles (`instances/noah/Dockerfile` and `instances/strategyES/Dockerfile`): After the existing `COPY instances/.../config/REPOS.json ./defaults/REPOS.json` line, add:
```dockerfile
COPY config/CLUSTER.json ./defaults/CLUSTER.json
```
Note: CLUSTER.json is shared (in config/, not instance-specific) unlike REPOS.json which is per-instance. Both instances get the same default cluster config.
  </action>
  <verify>
    <automated>node -e "import('./lib/cluster/config.js').then(m => m.loadClusterConfig()).then(c => { if (c.clusters.length === 0) throw new Error('empty'); if (c.clusters[0].roles.length !== 4) throw new Error('wrong role count'); console.log('OK:', c.clusters[0].roles.map(r => r.name).join(', ')); })" && node -e "import('./lib/paths.js').then(m => { if (!m.defaultClusterFile) throw new Error('missing defaultClusterFile'); console.log('OK:', m.defaultClusterFile); })"</automated>
  </verify>
  <done>CLUSTER.json exists with 4 roles, loadClusterConfig reads it with defaults/ fallback, saveClusterConfig can write it, both Dockerfiles copy to defaults/</done>
</task>

<task type="auto">
  <name>Task 2: Add cluster CRUD server actions and admin page</name>
  <files>lib/chat/actions.js, lib/chat/components/admin-clusters-page.jsx, lib/chat/components/admin-layout.jsx, lib/chat/components/index.js, templates/app/admin/clusters/page.js</files>
  <action>
1. Add server actions to `lib/chat/actions.js` (at the bottom, following existing patterns with dynamic imports):

- `getClusterConfig()` — requireAdmin, dynamically import loadClusterConfig from '../cluster/config.js', return the config object.
- `saveClusterConfigAction(config)` — requireAdmin, dynamically import validateClusterConfig and saveClusterConfig from '../cluster/config.js', validate first (return {error} if invalid), then save and return {success: true}.
- `deleteClusterAction(clusterName)` — requireAdmin, load config, filter out the named cluster, save, return {success: true}.
- `saveClusterAction(clusterData, originalName)` — requireAdmin, load config, if originalName find and replace that cluster entry, else push new cluster. Validate entire config before saving. Return {success: true} or {error}.

2. Create `lib/chat/components/admin-clusters-page.jsx` — follow the CRUD pattern from admin-repos-page.jsx:

- 'use client' at top
- Import useState, useEffect from react
- Import icons: ClusterIcon, PlusIcon, PencilIcon, TrashIcon, XIcon from './icons.js'
- Import getClusterConfig, saveClusterAction, deleteClusterAction from '../actions.js'

Component structure:
- `ClusterForm({ initial, isNew, onSave, onCancel })` — form for cluster name, systemPrompt (textarea), and a roles sub-section. Each role has: name (input), systemPrompt (textarea), allowedTools (comma-separated input). Add/remove role buttons within the form. Save button calls saveClusterAction.
- `AdminClustersPage()` — main component. Lists clusters in cards showing name + role count. Each card has Edit/Delete buttons. "Add Cluster" button at top. Edit opens ClusterForm inline (same pattern as repos page). Delete has confirmation.

Styling: Match the existing admin pages — card borders, text-sm labels, muted-foreground for secondary text, destructive color for delete. Use the same button/input class patterns as admin-repos-page.jsx.

3. Add `ClusterIcon` import to `admin-layout.jsx` (it's already exported from icons.js, used in app-sidebar.jsx). Add entry to ADMIN_NAV array after 'repos':
```js
{ id: 'clusters', label: 'Clusters', href: '/admin/clusters', icon: ClusterIcon },
```

4. Add export to `lib/chat/components/index.js`:
```js
export { AdminClustersPage } from './admin-clusters-page.js';
```

5. Create `templates/app/admin/clusters/page.js` following the repos page shell pattern:
```js
import { AdminClustersPage } from '../../../../lib/chat/components/index.js';

export default function AdminClustersRoute() {
  return <AdminClustersPage />;
}
```
  </action>
  <verify>
    <automated>npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>Admin panel shows "Clusters" in sidebar nav, /admin/clusters page renders with cluster list from CLUSTER.json, users can create/edit/delete clusters and roles through the UI, changes persist to config/CLUSTER.json</done>
</task>

</tasks>

<verification>
1. `node -e "import('./lib/cluster/config.js').then(m => m.loadClusterConfig()).then(c => console.log(JSON.stringify(c.clusters.map(cl => ({name: cl.name, roles: cl.roles.length})))))"` — shows default cluster with 4 roles
2. `npm run build` — succeeds (esbuild + Next.js)
3. `grep -q 'CLUSTER.json.*defaults' instances/noah/Dockerfile && echo OK` — Dockerfile wiring present
4. `grep -q 'clusters' lib/chat/components/admin-layout.jsx && echo OK` — nav link present
</verification>

<success_criteria>
- config/CLUSTER.json exists with default cluster (CTO, Security, UI/UX, Developer roles)
- loadClusterConfig falls back to defaults/CLUSTER.json on ENOENT
- Both instance Dockerfiles copy CLUSTER.json to defaults/
- Admin panel has Clusters nav link and functional CRUD page
- npm run build passes
</success_criteria>

<output>
After completion, create `.planning/quick/260323-kif-create-cluster-json-wire-into-dockerfile/260323-kif-SUMMARY.md`
</output>
