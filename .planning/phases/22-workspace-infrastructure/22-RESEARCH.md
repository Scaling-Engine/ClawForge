# Phase 22: Workspace Infrastructure - Research

**Researched:** 2026-03-08
**Domain:** Docker container lifecycle management, SQLite persistence, workspace Docker image
**Confidence:** HIGH

## Summary

Phase 22 builds the foundation layer for persistent workspaces: a new Docker image (ttyd + tmux + Claude Code CLI), container lifecycle management (create/start/stop/destroy with auto-recovery), database-backed state tracking, and resource controls (idle timeout, concurrent limits). This phase deliberately excludes WebSocket proxy, browser terminal UI, and LangGraph tool integration -- those belong to Phases 23 and 24. The scope is: containers that can be managed via internal APIs and whose state survives event handler restarts.

The implementation extends the existing v1.4 Docker Engine foundation. The same `dockerode` instance, Docker socket, and instance networking (noah-net, strategyES-net) are reused. A new `code_workspaces` Drizzle table tracks workspace state. New workspace functions in `lib/tools/docker.js` parallel the existing job container functions (`dispatchDockerJob` -> `ensureWorkspaceContainer`, `reconcileOrphans` -> `reconcileWorkspaces`). The workspace Docker image is a separate Dockerfile in `templates/docker/workspace/` that shares the same Node 22 + Claude Code CLI base as the job image but adds ttyd + tmux and uses a long-running entrypoint instead of a one-shot script.

The critical design decisions for this phase are: (1) workspace volumes use `clawforge-ws-{instance}-{id}` naming, separate from job volumes (`clawforge-{instance}-{slug}`), to prevent mutual interference; (2) containers use `RestartPolicy: unless-stopped` for auto-recovery; (3) idle timeout and max concurrent limits ship WITH workspace creation, not after; (4) feature branches are auto-created on workspace start using `clawforge/workspace-{shortId}` naming.

**Primary recommendation:** Build the workspace Dockerfile, Drizzle schema, and docker.js lifecycle functions as three parallel work streams that converge into API routes for create/stop/start/destroy operations, with idle timeout and reconciliation as the final integration step.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CNTR-01 | Workspace Docker image builds with Ubuntu + ttyd + tmux + Claude Code CLI, separate from job container image | Workspace Dockerfile pattern documented in Architecture Patterns and Stack sections; ttyd 1.7.7 binary install, tmux via apt, same Node 22 + Claude Code base as job image |
| CNTR-02 | Workspace container lifecycle supports create, start, stop, destroy, and auto-recover (exited/dead containers) | Container state machine pattern in Architecture section; `ensureWorkspaceContainer()` handles all states; `RestartPolicy: unless-stopped` for auto-recovery; reconciliation on startup |
| CNTR-03 | Workspace containers auto-stop after configurable idle timeout (default 30 min) | Idle timeout design in Common Pitfalls section; track last activity timestamp per workspace; interval-based check in event handler |
| CNTR-04 | Max concurrent workspace limit enforced per instance | Concurrent limit enforcement in `ensureWorkspaceContainer()` -- count running workspaces for instance before creation, reject if at cap |
| CNTR-05 | Workspace volumes use separate naming convention (`clawforge-ws-{instance}-{id}`) from job volumes | New `wsVolumeNameFor()` function with `clawforge-ws-` prefix, distinct from job's `clawforge-{instance}-{slug}` |
| CNTR-06 | Workspace containers join instance Docker network for isolation (noah-net, strategyES-net) | Same `NetworkMode: instanceName-net` pattern as job containers in `dispatchDockerJob()` |
| DATA-01 | `code_workspaces` SQLite table tracks workspace state | Drizzle schema addition following existing patterns (integer timestamps, text IDs, text status enum) |
| DATA-02 | Workspace records survive event handler restarts | SQLite on persistent volume (noah-data/ses-data); reconciliation function syncs DB state with Docker state on startup |
| DATA-03 | Feature branch auto-created on workspace start (e.g., `clawforge/workspace-{shortId}`) | Git operations in workspace entrypoint or via `docker.exec()` after container start; branch created from default branch |
</phase_requirements>

## Standard Stack

### Core (No New npm Dependencies for Phase 22)

Phase 22 requires no new npm packages in the event handler. All container management uses the existing `dockerode` ^4.0.9 already installed. The workspace Docker image adds system packages only.

| Technology | Version | Location | Purpose |
|------------|---------|----------|---------|
| `dockerode` | ^4.0.9 | Event handler (existing) | Container lifecycle via Docker Engine API |
| `drizzle-orm` | ^0.39.3 | Event handler (existing) | SQLite schema + CRUD for `code_workspaces` |
| `better-sqlite3` | ^11.8.1 | Event handler (existing) | SQLite driver |
| `ttyd` | 1.7.7 | Workspace Dockerfile | Terminal server inside container (binary download from GitHub releases) |
| `tmux` | distro default | Workspace Dockerfile | Session persistence (apt-get install) |

### Workspace Dockerfile System Packages

| Package | Install Method | Purpose |
|---------|---------------|---------|
| ttyd 1.7.7 | `curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -o /usr/local/bin/ttyd && chmod +x` | Terminal server exposing shell via WebSocket on port 7681 |
| tmux | `apt-get install -y tmux` | Session multiplexer -- survives WebSocket disconnects |
| curl | Already in job image base | Health check endpoint (`curl -sf http://localhost:7681/`) |

### What NOT to Add in Phase 22

| Avoid | Why | Phase |
|-------|-----|-------|
| `ws` (WebSocket) | WebSocket proxy is Phase 23 scope | 23 |
| `@xterm/xterm` | Browser terminal UI is Phase 23 scope | 23 |
| `node-pty` | ttyd handles PTY allocation -- no need for Node native bindings | N/A |
| `express` / `fastify` | Event handler is Next.js -- no additional HTTP framework needed | N/A |

## Architecture Patterns

### Recommended Project Structure (New/Modified Files)

```
templates/docker/workspace/
  Dockerfile                    # NEW: workspace container image
  entrypoint.sh                 # NEW: clone repo, setup git, start ttyd+tmux
lib/
  db/
    schema.js                   # MODIFIED: add code_workspaces table
    workspaces.js               # NEW: CRUD functions for workspace records
  tools/
    docker.js                   # MODIFIED: add workspace lifecycle functions
drizzle/
  0005_*.sql                    # NEW: migration for code_workspaces table
config/
  instrumentation.js            # MODIFIED: add workspace reconciliation on startup
api/
  index.js                      # MODIFIED: add workspace API routes
```

### Pattern 1: Container State Machine

**What:** Workspace containers have explicit states tracked in the DB, with deterministic transitions and recovery actions.

**States:** `creating` -> `running` -> `stopped` -> `running` (restart) | `destroyed`

**When to use:** Every workspace operation checks current state before acting.

```javascript
// State transitions in ensureWorkspaceContainer()
// 1. Check DB for existing workspace for this instance+repo
// 2. If found:
//    - status=running + container running -> return existing
//    - status=running + container exited  -> restart container, update DB
//    - status=running + container missing -> remove DB row, create new
//    - status=stopped                     -> start container, update DB
//    - status=creating                    -> treat as failed, clean up, create new
//    - status=error                       -> remove old, create new
// 3. If not found: create new container + DB row
```

### Pattern 2: Workspace Volume Separation

**What:** Workspace volumes use a different naming convention from job volumes to prevent mutual interference.

**Why:** Job containers use `clawforge-{instance}-{slug}` for repo caching. Workspace containers need persistent working state (node_modules, build artifacts, uncommitted changes). Sharing would cause: job `git clean -fdx` destroying workspace work; workspace artifacts bloating job clone times.

```javascript
// Job volumes (existing, unchanged)
volumeNameFor('noah', 'https://github.com/org/repo.git')
// -> 'clawforge-noah-repo'

// Workspace volumes (NEW)
wsVolumeNameFor('noah', workspaceId)
// -> 'clawforge-ws-noah-abc123'
```

### Pattern 3: Reconciliation on Startup

**What:** When the event handler restarts, sync DB state with actual Docker container state.

**Why:** The event handler process may crash or restart (PM2 restart, Docker restart, deploy). The DB may say a workspace is "running" but the container was removed. Or the container may be running but the DB lost the record.

```javascript
// reconcileWorkspaces() -- called from instrumentation.js after initDocker()
// 1. List all containers with label clawforge=workspace for this instance
// 2. For each container:
//    - If DB has matching record: update status to match container state
//    - If DB has no record: create a record (orphan recovery)
// 3. For each DB record with no matching container:
//    - If status was 'running': mark as 'error' (container disappeared)
//    - If status was 'stopped': leave as-is (expected)
```

### Pattern 4: Idle Timeout via Interval

**What:** A `setInterval` in the event handler checks workspace activity timestamps and stops idle workspaces.

**Why:** No natural lifecycle end for workspace containers. Without cleanup, zombie containers accumulate.

```javascript
// Started in instrumentation.js alongside reconcileWorkspaces()
// Runs every 5 minutes
// For each running workspace:
//   - If (now - lastActivityAt) > IDLE_TIMEOUT_MS: stop container, update DB
//   - lastActivityAt updated on: WebSocket connect, API call, container exec
```

### Pattern 5: Feature Branch Auto-Creation (DATA-03)

**What:** On workspace start, create a feature branch `clawforge/workspace-{shortId}` from the repo's default branch.

**Implementation:** After container starts, execute `docker exec` to create and push the branch:

```javascript
// In ensureWorkspaceContainer(), after container.start():
await container.exec({
  Cmd: ['bash', '-c', `
    cd /workspace &&
    git fetch origin &&
    git checkout -b clawforge/workspace-${shortId} origin/main &&
    git push -u origin clawforge/workspace-${shortId}
  `],
  // ... exec options
});
```

### Anti-Patterns to Avoid

- **Mounting Docker socket into workspace containers:** Non-negotiable. Workspace containers give users an interactive shell. Docker socket = full host access. Add a defensive check in `ensureWorkspaceContainer()` that throws if Mounts includes `/var/run/docker.sock`.

- **Sharing volumes between workspace and job containers:** Use separate `clawforge-ws-*` naming. Job containers do `git clean -fdx` which would destroy workspace work. Workspace `node_modules` would bloat job cache volumes.

- **Creating workspaces without idle timeout:** Every workspace created without cleanup becomes a zombie. Ship timeout WITH creation.

- **Storing container IP in database:** IPs change on restart. Always resolve via `docker.getContainer(id).inspect()` at connection time (relevant for Phase 23 proxy, but the DB schema should NOT include an IP column).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal server in container | Custom PTY over WebSocket | ttyd 1.7.7 binary | ttyd handles PTY allocation, flow control, resize, UTF-8 -- thousands of edge cases |
| Session persistence | Custom session state management | tmux | tmux survives disconnects, manages multiple panes, has battle-tested session attach/detach |
| Container lifecycle management | Custom Docker REST client | dockerode ^4.0.9 (existing) | Already initialized, handles auth, streams, events |
| Database migrations | Manual SQL execution | drizzle-kit generate + drizzle-orm migrate | Existing pattern; migrations tracked in `drizzle/` folder |
| UUID generation | Custom ID generation | `crypto.randomUUID()` | Node 22 built-in, matches existing pattern |

## Common Pitfalls

### Pitfall 1: Workspace Containers Accumulate Without Cleanup

**What goes wrong:** No natural lifecycle end. Operator creates workspace, closes browser, forgets. Container runs indefinitely consuming ~200-400MB RAM.
**Why it happens:** Browser tab close does not send reliable signal. WebSocket close unreliable on network drop.
**How to avoid:** Ship idle timeout (30 min default) and max concurrent limit (3 per instance) WITH workspace creation. Never create a workspace without registering it for timeout checking.
**Warning signs:** `docker stats` shows containers with 0% CPU for hours. Host memory usage climbing.

### Pitfall 2: Reconciliation Misses Edge Cases

**What goes wrong:** Event handler restarts. DB says workspace is "running" but container was removed by Docker (OOM kill, manual `docker rm`, daemon restart). Next `ensureWorkspaceContainer()` call finds DB record, tries to start a non-existent container, gets 404.
**How to avoid:** `reconcileWorkspaces()` must handle: container exists but DB doesn't (orphan), DB exists but container doesn't (stale record), both exist but states disagree (sync). Always wrap Docker API calls in try/catch -- container may vanish between check and action.
**Warning signs:** Error logs showing "no such container" for workspace operations.

### Pitfall 3: Volume Naming Collision with Job Volumes

**What goes wrong:** If workspace volumes use the same naming as job volumes, a job's `git clean -fdx` destroys workspace work-in-progress.
**How to avoid:** Use `clawforge-ws-{instance}-{id}` for workspace volumes (not `clawforge-{instance}-{slug}`). The workspace volume name includes the workspace ID, not the repo slug, because multiple workspaces could target the same repo in the future.
**Warning signs:** Workspace loses uncommitted files after a job runs for the same repo.

### Pitfall 4: Entrypoint Diverges from Job Entrypoint

**What goes wrong:** Workspace entrypoint needs shared logic (git setup, secret injection, gh auth). Copy-paste from job entrypoint leads to maintenance burden -- bug fixes to one not applied to the other.
**How to avoid:** Extract shared setup into `/scripts/common.sh` sourced by both entrypoints. Or accept the duplication for Phase 22 since workspace entrypoint is much simpler (no Claude Code prompt assembly, no PR creation).
**Warning signs:** Workspace containers have stale git config or missing auth that was fixed in job containers.

### Pitfall 5: Feature Branch Creation Fails Silently

**What goes wrong:** `docker exec` to create feature branch fails (network issue, auth failure, branch already exists) but workspace still starts. Operator works on detached HEAD or wrong branch.
**How to avoid:** Check `docker exec` exit code. If branch creation fails, update workspace status to `error` with a message. Handle "branch already exists" as success (checkout existing branch). Ensure GH_TOKEN is available in workspace container env for push.
**Warning signs:** Workspace containers running but no feature branch pushed to remote.

## Code Examples

### Drizzle Schema: code_workspaces Table

```javascript
// lib/db/schema.js -- add to existing file
export const codeWorkspaces = sqliteTable('code_workspaces', {
  id: text('id').primaryKey(),                    // UUID
  instanceName: text('instance_name').notNull(),  // 'noah', 'strategyES'
  repoSlug: text('repo_slug').notNull(),          // 'neurostory', 'clawforge'
  repoUrl: text('repo_url').notNull(),            // Full clone URL
  containerId: text('container_id'),              // Docker container ID
  containerName: text('container_name'),          // Human-readable name
  volumeName: text('volume_name').notNull(),      // clawforge-ws-{instance}-{id}
  featureBranch: text('feature_branch'),          // clawforge/workspace-{shortId}
  status: text('status').notNull().default('creating'),  // creating/running/stopped/error/destroyed
  threadId: text('thread_id'),                    // Originating chat thread (for Phase 24)
  lastActivityAt: integer('last_activity_at'),    // For idle timeout
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

### dockerode Container Configuration

```javascript
// lib/tools/docker.js -- ensureWorkspaceContainer()
const containerConfig = {
  name: `clawforge-ws-${instanceName}-${shortId}`,
  Image: workspaceImage,
  Env: [
    `REPO_URL=${repoUrl}`,
    `BRANCH=main`,
    `FEATURE_BRANCH=clawforge/workspace-${shortId}`,
    `INSTANCE_NAME=${instanceName}`,
    `GH_TOKEN=${secrets.GH_TOKEN}`,
    // AGENT_LLM_ secrets for Claude Code
    ...Object.entries(llmSecrets).map(([k, v]) => `${k}=${v}`),
  ],
  Labels: {
    'clawforge': 'workspace',
    'clawforge.instance': instanceName,
    'clawforge.repo': repoSlug,
    'clawforge.workspace_id': workspaceId,
    'clawforge.created_at': new Date().toISOString(),
  },
  ExposedPorts: { '7681/tcp': {} },
  HostConfig: {
    NetworkMode: `${instanceName}-net`,
    RestartPolicy: { Name: 'unless-stopped' },
    Memory: 2 * 1024 * 1024 * 1024,  // 2GB RAM limit
    CpuPeriod: 100000,
    CpuQuota: 100000,                // 1 CPU core
    Mounts: [{
      Type: 'volume',
      Source: volumeName,             // clawforge-ws-{instance}-{shortId}
      Target: '/workspace',
      ReadOnly: false,
    }],
  },
  Healthcheck: {
    Test: ['CMD', 'curl', '-sf', 'http://localhost:7681/'],
    Interval: 30_000_000_000,   // 30s in nanoseconds
    Timeout: 5_000_000_000,     // 5s
    Retries: 3,
    StartPeriod: 10_000_000_000, // 10s
  },
};

// DEFENSIVE CHECK: Never mount Docker socket in workspace containers
const hasDangerousMount = containerConfig.HostConfig.Mounts?.some(
  m => m.Source === '/var/run/docker.sock' || m.Target === '/var/run/docker.sock'
);
if (hasDangerousMount) {
  throw new Error('SECURITY: Docker socket must never be mounted in workspace containers');
}
```

### Workspace Entrypoint (Simplified)

```bash
#!/bin/bash
set -e

# Git setup (shared with job entrypoint logic)
if [ -n "$GH_TOKEN" ]; then
  echo "$GH_TOKEN" | gh auth login --with-token
  gh auth setup-git
fi

GH_USER_JSON=$(gh api user -q '{name: .name, login: .login, email: .email, id: .id}' 2>/dev/null || echo '{}')
GH_USER_NAME=$(echo "$GH_USER_JSON" | jq -r '.name // .login // "ClawForge"')
GH_USER_EMAIL=$(echo "$GH_USER_JSON" | jq -r '.email // "clawforge@noreply.github.com"')
git config --global user.name "$GH_USER_NAME"
git config --global user.email "$GH_USER_EMAIL"

# Clone or update repo in /workspace
if [ -d "/workspace/.git" ]; then
  cd /workspace
  git remote set-url origin "$REPO_URL" 2>/dev/null || true
  git fetch origin
else
  cd /workspace
  git clone "$REPO_URL" .
fi

# Create and checkout feature branch
if [ -n "$FEATURE_BRANCH" ]; then
  git checkout "$FEATURE_BRANCH" 2>/dev/null || \
    git checkout -b "$FEATURE_BRANCH" origin/main
  git push -u origin "$FEATURE_BRANCH" 2>/dev/null || true
fi

# Signal readiness
touch /tmp/.workspace-ready

# Start ttyd with tmux (PID 1, long-running)
exec ttyd -W -p 7681 --ping-interval 30 tmux new -A -s workspace
```

### Workspace CRUD Functions

```javascript
// lib/db/workspaces.js
import { eq, and } from 'drizzle-orm';
import { getDb } from './index.js';
import { codeWorkspaces } from './schema.js';

export function createWorkspace(workspace) {
  const db = getDb();
  return db.insert(codeWorkspaces).values(workspace).run();
}

export function getWorkspace(id) {
  const db = getDb();
  return db.select().from(codeWorkspaces).where(eq(codeWorkspaces.id, id)).get();
}

export function getWorkspaceByRepo(instanceName, repoSlug) {
  const db = getDb();
  return db.select().from(codeWorkspaces)
    .where(and(
      eq(codeWorkspaces.instanceName, instanceName),
      eq(codeWorkspaces.repoSlug, repoSlug)
    )).get();
}

export function listWorkspaces(instanceName) {
  const db = getDb();
  return db.select().from(codeWorkspaces)
    .where(eq(codeWorkspaces.instanceName, instanceName))
    .all();
}

export function updateWorkspace(id, updates) {
  const db = getDb();
  return db.update(codeWorkspaces)
    .set({ ...updates, updatedAt: Date.now() })
    .where(eq(codeWorkspaces.id, id))
    .run();
}

export function deleteWorkspace(id) {
  const db = getDb();
  return db.delete(codeWorkspaces).where(eq(codeWorkspaces.id, id)).run();
}
```

### API Routes

```javascript
// api/index.js additions (following existing pattern)
// POST /api/workspaces       -> create workspace
// GET  /api/workspaces       -> list workspaces for instance
// POST /api/workspaces/:id/stop   -> stop workspace
// POST /api/workspaces/:id/start  -> start workspace
// DELETE /api/workspaces/:id      -> destroy workspace
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ephemeral job containers only | Ephemeral jobs + persistent workspaces | v1.5 (this phase) | Two container lifecycles managed by same dockerode instance |
| Single volume naming (`clawforge-*`) | Separate job (`clawforge-*`) and workspace (`clawforge-ws-*`) volumes | v1.5 (this phase) | Prevents mutual interference between container types |
| `reconcileOrphans()` for jobs only | Separate `reconcileWorkspaces()` for workspace containers | v1.5 (this phase) | Workspaces need different recovery (restart vs remove) |

## Open Questions

1. **Workspace-per-repo or workspace-per-ID uniqueness?**
   - What we know: Requirements say one workspace per repo per instance (UNIQUE constraint on instance+repo). This prevents resource sprawl.
   - What's unclear: Whether an operator would want two workspaces for the same repo (e.g., different branches).
   - Recommendation: Start with one-per-repo-per-instance (UNIQUE constraint). This matches the reference implementation. Relax later if needed.

2. **Shared entrypoint logic extraction?**
   - What we know: Job entrypoint is 411 lines. Workspace entrypoint is ~40 lines. Overlap is git setup + gh auth (~20 lines).
   - What's unclear: Whether extracting a `/scripts/common.sh` is worth the complexity for 20 lines of shared code.
   - Recommendation: Accept duplication for now. The workspace entrypoint is fundamentally simpler. Extract shared logic when a third container type appears.

3. **Claude Code lazy initialization in workspaces?**
   - What we know: Claude Code CLI may consume API credits when idle. Workspace containers run 24/7 if not stopped.
   - What's unclear: Whether Claude Code consumes credits when idle (just sitting at a terminal prompt, not actively running).
   - Recommendation: Do NOT auto-start Claude Code in the workspace entrypoint. The operator types `claude` when they want it. ttyd + tmux + bash is the default shell. This is the safest approach for billing.

## Sources

### Primary (HIGH confidence)
- ClawForge `lib/tools/docker.js` -- existing dockerode integration, container lifecycle, volume naming (direct codebase inspection)
- ClawForge `lib/db/schema.js` -- existing Drizzle schema patterns, integer timestamps, text IDs (direct codebase inspection)
- ClawForge `templates/docker/job/Dockerfile` -- base image pattern, apt packages, Claude Code + GSD install (direct codebase inspection)
- ClawForge `templates/docker/job/entrypoint.sh` -- git setup, secret injection, volume hygiene (direct codebase inspection)
- ClawForge `docker-compose.yml` -- network isolation, Docker socket mount, Traefik routing (direct codebase inspection)
- ClawForge `config/instrumentation.js` -- startup flow, initDocker() call, reconciliation pattern (direct codebase inspection)
- ClawForge `instances/noah/Dockerfile` -- PM2 + Next.js, ecosystem config (direct codebase inspection)
- `.planning/research/ARCHITECTURE.md` -- workspace architecture patterns, component boundaries, data flows (milestone research)
- `.planning/research/STACK.md` -- ttyd 1.7.7, tmux, version decisions (milestone research)
- `.planning/research/PITFALLS.md` -- zombie containers, volume growth, socket exposure, entrypoint drift (milestone research)

### Secondary (MEDIUM confidence)
- [ttyd GitHub](https://github.com/tsl0922/ttyd) -- terminal server architecture, health check, ping-interval flag
- [dockerode API](https://github.com/apocas/dockerode) -- container create/start/stop/inspect/exec patterns
- thepopebot reference implementation -- `lib/code/`, `templates/docker/claude-code-workspace/` (analyzed in milestone research)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all technologies already in use (dockerode, Drizzle) or thoroughly researched (ttyd, tmux)
- Architecture: HIGH -- extends existing patterns with clear parallel structure (job functions -> workspace functions)
- Pitfalls: HIGH -- documented from codebase inspection + milestone research + reference implementation analysis

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable technologies, no fast-moving dependencies)
