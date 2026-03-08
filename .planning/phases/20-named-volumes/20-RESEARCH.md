# Phase 20: Named Volumes - Research

**Researched:** 2026-03-07
**Domain:** Docker named volumes, git warm-start optimization, concurrent volume safety
**Confidence:** HIGH

## Summary

Phase 20 adds Docker named volumes so repeat jobs on the same repo reuse a cached `.git` directory, replacing `git clone` (10-15s) with `git fetch` (2-3s). The implementation touches three layers: (1) the event handler's `dispatchDockerJob()` must create/ensure named volumes and mount them into job containers, (2) the entrypoint.sh must detect warm starts and switch from clone to fetch+checkout, and (3) a hygiene step must clean stale locks and dirty state before each job.

The critical challenge is VOL-04 (concurrent safety). Two jobs on the same repo must not corrupt the shared volume. The recommended solution is a per-job working copy: the volume holds the bare/cached `.git` data, and each container works in a separate directory or uses `git worktree`. However, given that ClawForge jobs operate on unique `job/{UUID}` branches and the entrypoint already writes to `/job`, the simpler approach is a flock-based mutex on the volume's git operations (fetch/checkout), with the actual Claude Code work happening after the lock is released.

**Primary recommendation:** Mount named volumes at `/repo-cache`, use flock for git operations, copy/link working tree to `/job`, and clean locks before each fetch.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VOL-01 | Named volumes created per repo per instance with convention `clawforge-{instance}-{repo-slug}` | Dockerode `createVolume()` API + `HostConfig.Mounts` for mounting. Volume naming derived from INSTANCE_NAME + repo slug. |
| VOL-02 | Entrypoint detects warm start (existing `.git` in volume) and uses `git fetch` instead of `git clone` | Entrypoint step 5 replacement: check for `.git` dir in volume mount, branch to fetch+checkout vs fresh clone |
| VOL-03 | Volume hygiene step runs before each job (clean locks, reset to origin, clean working tree) | `find .git -name "*.lock" -delete`, `git reset --hard`, `git clean -fdx` before fetch |
| VOL-04 | Concurrent jobs on same repo don't corrupt shared volume state | flock-based mutex on git operations within the volume, or worktree-based isolation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dockerode | ^4.0.9 | Docker Engine API client | Already in project, battle-tested, has `createVolume()` and `Mounts` support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| flock (util-linux) | system | File-based mutex for concurrent git access | Already available in node:22-bookworm-slim base image |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| flock mutex | git worktree | Worktrees are cleaner but add complexity to entrypoint; flock is simpler for sequential access |
| Named volumes | Bind mounts | Out of scope per REQUIREMENTS.md ("Security concern, portability issues") |
| Persistent bare repo + worktree | Full clone cache | Bare repo is more space-efficient but adds complexity; full clone cache is simpler |

**Installation:**
No new packages needed. dockerode is already installed. flock is part of util-linux in the base image.

## Architecture Patterns

### Volume Lifecycle

```
Event Handler (docker.js)                    Job Container (entrypoint.sh)
─────────────────────────                    ─────────────────────────────
1. ensureVolume(instance, repoSlug)
   - docker.createVolume() if not exists
   - Name: clawforge-{instance}-{slug}

2. dispatchDockerJob() with Mounts:
   - Source: clawforge-{instance}-{slug}
   - Target: /repo-cache
   - Type: volume
                                             3. Hygiene: clean locks, reset state
                                             4. Detect: .git exists in /repo-cache?
                                             5a. Warm: git fetch + checkout in /repo-cache
                                             5b. Cold: git clone into /repo-cache
                                             6. Copy/link working tree to /job
                                             7. Continue normal entrypoint flow
```

### Pattern 1: Volume Name Convention
**What:** Deterministic volume names from instance + repo slug
**When to use:** Every Docker-dispatched job
**Example:**
```javascript
// In docker.js
function volumeName(instanceName, repoUrl) {
  // Extract slug: "https://github.com/ScalingEngine/clawforge.git" -> "clawforge"
  const slug = repoUrl.replace(/\.git$/, '').split('/').pop();
  return `clawforge-${instanceName}-${slug}`;
}
```

### Pattern 2: Warm Start Detection in Entrypoint
**What:** Check volume mount for existing .git, branch to fetch vs clone
**When to use:** Step 5 of entrypoint.sh
**Example:**
```bash
REPO_CACHE="/repo-cache"

if [ -d "${REPO_CACHE}/.git" ]; then
    echo "=== WARM START: fetching ==="
    cd "${REPO_CACHE}"

    # Hygiene: clean stale locks
    find .git -name "*.lock" -type f -delete 2>/dev/null || true

    # Reset any dirty state from prior jobs
    git reset --hard HEAD 2>/dev/null || true
    git clean -fdx 2>/dev/null || true

    # Fetch the job branch
    git fetch origin "${BRANCH}" --depth 1
    git checkout -f "${BRANCH}"

    # Copy to /job for working directory
    cp -a "${REPO_CACHE}/." /job/
else
    echo "=== COLD START: cloning ==="
    git clone --single-branch --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${REPO_CACHE}"
    cp -a "${REPO_CACHE}/." /job/
fi

cd /job
```

### Pattern 3: Concurrent Access with flock
**What:** File-level mutex prevents two containers from running git operations simultaneously on same volume
**When to use:** VOL-04 -- when two jobs target the same repo
**Example:**
```bash
LOCK_FILE="/repo-cache/.clawforge-lock"

(
    flock -w 30 200 || { echo "ERROR: Could not acquire repo lock after 30s"; exit 1; }

    # All git operations inside the lock
    if [ -d "${REPO_CACHE}/.git" ]; then
        find .git -name "*.lock" -type f -delete 2>/dev/null || true
        git fetch origin "${BRANCH}" --depth 1
    else
        git clone --single-branch --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${REPO_CACHE}"
    fi

) 200>"${LOCK_FILE}"

# After lock released, copy to isolated /job directory
cp -a "${REPO_CACHE}/." /job/
cd /job
```

### Pattern 4: Volume Creation via Dockerode
**What:** Ensure volume exists before dispatching container
**When to use:** In dispatchDockerJob before createContainer
**Example:**
```javascript
async function ensureVolume(name) {
  try {
    const volume = docker.getVolume(name);
    await volume.inspect(); // throws if not found
  } catch {
    await docker.createVolume({ Name: name });
    console.log(`Created volume: ${name}`);
  }
}
```

### Anti-Patterns to Avoid
- **Sharing /job directly via volume:** The /job directory is where Claude Code works -- it must be isolated per container. The volume caches the git repo, /job is a copy.
- **Skipping hygiene step:** A crashed container can leave index.lock, shallow.lock, or dirty working tree. Always clean before fetch.
- **Using `git clone` into an existing directory:** Git clone fails if target exists. The warm path MUST use fetch+checkout.
- **Mounting volume as read-only:** The volume needs write access for git operations (fetch updates pack files, etc.)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File-level mutex | Custom lock mechanism with files/PIDs | `flock` (POSIX) | Race conditions, stale PID detection, cross-container compatibility |
| Volume existence check | Parsing `docker volume ls` output | `docker.getVolume(name).inspect()` | Proper error handling, atomic check |
| Git lock cleanup | Custom PID-based lock detection | `find .git -name "*.lock" -delete` | Git locks are always safe to remove when no git process is running (container just started) |

**Key insight:** The entrypoint runs fresh in each container -- there is guaranteed no running git process at step 5, so lock removal is always safe.

## Common Pitfalls

### Pitfall 1: Shallow Clone + Fetch Incompatibility
**What goes wrong:** `git fetch` on a shallow clone with `--depth 1` may fail or produce unexpected results when fetching a new branch that shares no history with the current shallow state.
**Why it happens:** Shallow clones have grafted history; fetching a divergent branch can confuse the pack negotiation.
**How to avoid:** Use `git fetch origin ${BRANCH}:${BRANCH} --depth 1` to fetch the specific branch ref, then `git checkout -f ${BRANCH}`. Or use `--no-tags` to reduce fetch scope.
**Warning signs:** "fatal: error in object" or "fatal: bad object" errors during fetch.

### Pitfall 2: cp -a Performance on Large Repos
**What goes wrong:** Copying the entire repo cache to /job adds overhead, partially defeating the warm-start benefit.
**Why it happens:** Large repos with many files or large .git/objects directories.
**How to avoid:** Use `git clone --reference /repo-cache` (local reference clone) or `git worktree add /job ${BRANCH}` instead of cp. Reference clone uses hardlinks for objects, making it near-instant. However, this adds complexity. For ClawForge's typical repo sizes (small-medium), cp -a is acceptable.
**Warning signs:** Warm start taking >5 seconds despite fast fetch.

### Pitfall 3: Volume Persists Stale Remote Config
**What goes wrong:** If REPO_URL changes (e.g., repo renamed or different fork), the cached .git/config points to the old remote.
**Why it happens:** Volume persists across jobs and the remote URL is baked into .git/config at clone time.
**How to avoid:** Always set `git remote set-url origin ${REPO_URL}` in the hygiene step, before fetch.
**Warning signs:** "Repository not found" errors on warm start.

### Pitfall 4: Docker Volume Not Cleaned Up
**What goes wrong:** Volumes accumulate over time as repos are added/removed.
**Why it happens:** Named volumes persist until explicitly removed. Unlike containers (AutoRemove), volumes have no auto-cleanup.
**How to avoid:** Not critical for v1.4 (2 instances, ~5 repos each = ~10 volumes). Can add cleanup in future RES-03 scope. Document that `docker volume prune` is available for manual cleanup.
**Warning signs:** `docker system df` shows growing volume usage.

### Pitfall 5: Concurrent cp -a Corruption
**What goes wrong:** If the flock only protects git fetch but two containers both cp -a from the same volume simultaneously, one may read partially-written objects.
**Why it happens:** cp -a reads files that git fetch is actively writing.
**How to avoid:** Keep the cp -a INSIDE the flock, or use git clone --reference (which is atomic). The flock should cover: hygiene + fetch + copy.
**Warning signs:** Corrupted objects in /job/.git/objects.

## Code Examples

### Complete dispatchDockerJob Modification
```javascript
// In lib/tools/docker.js

function deriveRepoSlug(repoUrl) {
  return repoUrl.replace(/\.git$/, '').split('/').pop();
}

function volumeNameFor(instanceName, repoUrl) {
  const slug = deriveRepoSlug(repoUrl);
  return `clawforge-${instanceName}-${slug}`;
}

async function ensureVolume(name) {
  try {
    await docker.getVolume(name).inspect();
  } catch {
    await docker.createVolume({ Name: name });
    console.log(`Created named volume: ${name}`);
  }
}

// Inside dispatchDockerJob, before createContainer:
const volName = volumeNameFor(instanceName, opts.repoUrl);
await ensureVolume(volName);

// In createContainer config, add Mounts:
const container = await docker.createContainer({
  name: containerName,
  Image: image,
  Env: env,
  Labels: { /* existing labels */ },
  HostConfig: {
    NetworkMode: opts.networkMode || 'bridge',
    AutoRemove: false,
    Mounts: [
      {
        Type: 'volume',
        Source: volName,
        Target: '/repo-cache',
        ReadOnly: false,
      },
    ],
  },
});
```

### Complete Entrypoint Warm/Cold Start Logic
```bash
# Replace step 5 in entrypoint.sh
REPO_CACHE="/repo-cache"
LOCK_FILE="${REPO_CACHE}/.clawforge-lock"

# Ensure repo-cache dir has proper ownership
mkdir -p "${REPO_CACHE}"

START_TS=$(date +%s%N)

(
    # Acquire exclusive lock with 30s timeout
    flock -w 30 200 || { echo "ERROR: Could not acquire repo lock"; exit 1; }

    if [ -d "${REPO_CACHE}/.git" ]; then
        echo "=== WARM START ==="
        cd "${REPO_CACHE}"

        # VOL-03: Hygiene
        find .git -name "*.lock" -type f -delete 2>/dev/null || true
        git remote set-url origin "${REPO_URL}" 2>/dev/null || true
        git reset --hard HEAD 2>/dev/null || true
        git clean -fdx -e .clawforge-lock 2>/dev/null || true

        # Fetch job branch
        git fetch origin "${BRANCH}" --depth 1 --no-tags
        git checkout -f FETCH_HEAD
    else
        echo "=== COLD START ==="
        cd "${REPO_CACHE}"
        git clone --single-branch --branch "${BRANCH}" --depth 1 "${REPO_URL}" .
    fi

    # Copy to isolated /job while still holding lock
    cp -a "${REPO_CACHE}/." /job/

) 200>"${LOCK_FILE}"

END_TS=$(date +%s%N)
SETUP_MS=$(( (END_TS - START_TS) / 1000000 ))
echo "Repo setup completed in ${SETUP_MS}ms"

cd /job
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `git clone` every job | Named volume cache + `git fetch` | Phase 20 | 10-15s -> 2-3s repo setup |
| No volume mounts on job containers | Volume mount at /repo-cache | Phase 20 | Persistent git object cache |
| No concurrency protection | flock-based mutex | Phase 20 | Safe concurrent jobs on same repo |

## Open Questions

1. **Should we use `git clone --reference` instead of `cp -a`?**
   - What we know: Reference clones hardlink .git/objects, making them near-instant. `cp -a` works but is slower for large repos.
   - What's unclear: Whether ClawForge repos are large enough to matter. Current repos are small-medium.
   - Recommendation: Start with `cp -a`. If warm starts exceed 5s target, switch to `--reference`. Keep it simple for v1.4.

2. **Should main branch also be fetched for hydration step 8e?**
   - What we know: Entrypoint step 8e does `git fetch origin main --depth=11` for commit history. On warm start, this fetch is separate from the branch fetch.
   - What's unclear: Whether both fetches can be combined or if main is already available from a prior job's fetch.
   - Recommendation: Fetch main inside the same flock section if needed. The volume cache may already have main from a prior job.

3. **flock timeout value**
   - What we know: 30s timeout is generous for a git fetch. Normal fetch is 2-3s.
   - What's unclear: Whether network issues could cause legitimate >30s fetches.
   - Recommendation: 30s is fine. If it times out, something is genuinely wrong. Log the timeout clearly.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `lib/tools/docker.js`, `templates/docker/job/entrypoint.sh`, `docker-compose.yml`
- [dockerode GitHub issue #265](https://github.com/apocas/dockerode/issues/265) - HostConfig.Mounts format for named volumes
- [Docker Volumes documentation](https://docs.docker.com/engine/storage/volumes/) - Named volume lifecycle and sharing

### Secondary (MEDIUM confidence)
- [dockerode npm page](https://www.npmjs.com/package/dockerode) - createVolume API
- [Git lock file best practices](https://learn.microsoft.com/en-us/azure/devops/repos/git/git-index-lock) - Safe lock removal
- [Docker volume best practices](https://www.devopstraininginstitute.com/blog/12-best-practices-for-docker-volume-management) - Naming conventions

### Tertiary (LOW confidence)
- None -- all findings verified against codebase and official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - dockerode already in use, flock is POSIX standard
- Architecture: HIGH - patterns derive directly from existing codebase structure
- Pitfalls: HIGH - git lock issues are well-documented, concurrent access patterns well-understood

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable domain, no fast-moving dependencies)
