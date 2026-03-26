# Context Engineering Analysis for ClawForge

Analysis of Roman's "3 Levels of Context Engineering" and "How OpenClaw Works" applied to ClawForge's autonomous job execution and day-to-day Claude Code usage.

---

## Part 1: What This Means for ClawForge

### ClawForge Already Gets the Big Things Right

Reading these against ClawForge's actual architecture, ClawForge is **already a sniper agent system by design**, not a generalist like OpenClaw. The two-layer architecture is the key insight Roman argues for without naming it:

| OpenClaw Problem | ClawForge Solution (Already Shipped) |
|---|---|
| Context bloat from 7K to 173K tokens over months | **Fresh clone per job** -- zero accumulated state. Every container starts at ~0 tokens of historical baggage |
| Generalist "exoskeleton" carrying everything | **Two separate agents**, each purpose-built: Layer 1 (conversational routing) and Layer 2 (code execution) |
| Single flat-file memory with truncation | **Repo-as-memory** via `.planning/STATE.md` + `ROADMAP.md` -- GSD maintains structured state that survives across jobs |
| Session persistence via JSONL replay | **LangGraph SQLite checkpoints** for Layer 1; Layer 2 has no session persistence (by design) |
| Heartbeat/cron for autonomy | **GitHub Actions triggers** -- deterministic, auditable, no self-modifying behavior |

**The "sniper agent" model is exactly what ClawForge already does.** Each job container is a sniper agent that carries only:
- SOUL.md + AGENT.md (~15 lines + ~90 lines = ~800 tokens)
- CLAUDE.md from the target repo (capped at 8K chars / ~2K tokens)
- package.json dependencies
- The job description itself
- GSD skill routing hint

That's roughly **3-4K tokens of fixed overhead** before the job prompt. Compare to OpenClaw's 173K after 6 months. ClawForge's Layer 2 agent operates in the model's absolute performance sweet spot.

### Where ClawForge Can Improve (Context Hydration)

The trajectory engineering concepts from Article 1 map to a specific ClawForge gap: **the quality of job.md determines everything**, and right now the context hydration is minimal.

Current state of `entrypoint.sh` context injection (lines 86-200):
1. SOUL.md + AGENT.md -> system prompt
2. CLAUDE.md from repo (truncated at 8K chars)
3. package.json dependencies
4. Job description from job.md
5. GSD routing hint (keyword-based)

What's missing -- mapped to the articles' frameworks:

#### A. Trunk Context (from the Context Tree Model)
The "trunk" in Roman's tree metaphor is the foundational context that should always be present. For ClawForge jobs, this means:
- **Current project state**: `.planning/STATE.md`, `ROADMAP.md`, current phase -- the GSD state files that tell the agent where the project is
- **Recent git history**: Last 5-10 commits on main to understand what just changed
- **Open issues/PRs**: What's in-flight that the agent should know about

This is exactly what the README calls "context hydration" (v1.1) and references Stripe's "pre-hydration" pattern. The `entrypoint.sh` already reads CLAUDE.md, but it doesn't read GSD state files. Those files ARE the trunk.

#### B. Prior Job Context (Already Partially Shipped)
`tools.js:29-51` already injects prior job outcomes into new job descriptions when you're in the same thread. This is good. But it's limited to:
- Previous PR URL
- Status and merge result
- Changed files list
- Log summary

It doesn't include the *content* of what was built or the *decisions* that were made. The agent gets "here's what happened" but not "here's where the project stands now."

#### C. Sniper-Scoping the System Prompt
The current AGENT.md for Noah's instance is ~90 lines with a full GSD command reference. For a job that just needs `/gsd:quick` to fix a typo, that's wasted context. The GSD routing hint (`entrypoint.sh:132-139`) already determines which GSD command to suggest -- the system prompt could be trimmed accordingly.

### The Four Zones Applied to ClawForge

Roman's "Four Zones of Agent Design" maps perfectly:

| Zone | ClawForge Layer 1 (Event Handler) | ClawForge Layer 2 (Job Container) |
|---|---|---|
| **Triggers** | Slack events, Telegram webhooks, web chat messages | GitHub Actions `run-job.yml` on `job/*` branch push |
| **Injected per turn** | EVENT_HANDLER.md system prompt, SQLite conversation history, tool schemas (3 tools) | SOUL.md + AGENT.md + CLAUDE.md + package.json + job.md + GSD hint |
| **Tools** | `create_job`, `get_job_status`, `get_system_technical_specs` | Read, Write, Edit, Bash, Glob, Grep, Task, Skill |
| **Outputs** | Messages to user, job dispatch (git push), SQLite memory | Git commits, PR creation, log files |

Layer 1 is clean -- only 3 tools. Layer 2 is lean -- only filesystem + GSD skills. Neither is a generalist.

### Actionable Improvements for ClawForge

**Priority 1: Context Hydration in entrypoint.sh**
Before running Claude Code, the entrypoint should fetch GSD state from the cloned repo:
```bash
# Read .planning/STATE.md if it exists (project state)
# Read ROADMAP.md if it exists (phase context)
# Read last 10 git log entries from main
# Inject all of this into the FULL_PROMPT
```
This gives the agent the "trunk" -- where the project is, what phase it's in, what was done recently. Cost: maybe 2-3K additional tokens. Value: the agent doesn't waste its first actions reading these files.

**Priority 2: Dynamic System Prompt Scoping**
Instead of always including the full GSD command reference in AGENT.md, scope it based on the GSD hint:
- `quick` hint -> trim AGENT.md to just the quick task section
- `plan-phase` hint -> include the full planning + execution sections
- This keeps the "trunk" lean per Roman's model

**Priority 3: Layer 1 Pre-Hydration (Stripe Pattern)**
Before writing job.md, have Layer 1 fetch project state via GitHub API:
```
gh api repos/{owner}/{repo}/contents/.planning/STATE.md
```
This lets the conversational agent write better job descriptions because it *understands where the project is*. The README already describes this as planned but it's not implemented in `tools.js`.

---

## Part 2: How Noah Should Use Claude Code Day-to-Day

### You're Already Tier 2+

Based on the CLAUDE.md structure, memory files, GSD workflow, and how this conversation is structured -- you're solidly in Tier 2 (intentional developer) and approaching Tier 3. The key habits to adopt:

### Trajectory Engineering Tactics

**1. Use Escape-Escape (/re) After Every Tangent**
After debugging a bug, researching an approach, or exploring something that produced noise -- double-Escape back to before the tangent. Summarize what you learned in one line, then proceed from clean context.

*Example:* You ask Claude to debug a Drizzle migration issue. 15 messages later it's fixed. Instead of continuing with all that debugging noise, /re back to before the bug, type "The migration issue was X, fixed by Y. Now continue with Z."

**2. Fork for Uncertain Approaches**
When you're not sure how to approach something (e.g., "should I use Supabase RLS or middleware for this?"), fork two sessions:
- Session A: "Implement with RLS"
- Session B: "Implement with middleware"

Compare outputs. Pick the winner. The cost of two explorations is less than one polluted context window.

**3. The Recon-Then-Trim Pattern for Job Descriptions**
This is directly applicable to ClawForge: before dispatching a job, have Claude explore the target repo's current state in one branch of conversation. Note the key findings. Then /re back and write the job description with those findings baked in as clean context.

**4. Context Tree for Long Sessions**
For your typical work pattern (portal updates, client deliverables, ClawForge development):
- **Trunk**: CLAUDE.md + project state + what you're trying to accomplish today
- **Branches**: Individual tasks, bug fixes, explorations
- **Trim rule**: After completing any discrete task, /re back and note what was done

**5. Subagents as Built-In Trajectory Engineering**
You already have this -- the Agent tool spawns subagents that explore in isolation without polluting your main context. This IS trajectory engineering. The subagent explores a branch, returns a summary, and your trunk stays clean.

### The Compounding Effect

Roman's key insight: clean context compounds. Every trimmed tangent means every subsequent response is slightly better. Over a 2-hour session, this is the difference between productive-to-the-end and "why did Claude get so bad?"

Your GSD workflow already enforces this for autonomous jobs (fresh container = forced clean context). The gap is in your interactive sessions where context accumulates unchecked.

---

## Part 3: Skills & Plugins Persistence Across All Agents

### How It Works Today

GSD is **baked into the Docker image at build time** (`templates/docker/job/Dockerfile:38`):

```dockerfile
RUN npx get-shit-done-cc@latest --claude --global
```

This installs GSD commands to `/root/.claude/commands/gsd/` inside the image. Every container spun from that image gets GSD automatically. The entrypoint even verifies it (`entrypoint.sh:60-64`):

```bash
if [ ! -d "${HOME}/.claude/commands/gsd/" ]; then
    echo "ERROR: GSD not installed..." | tee "${LOG_DIR}/preflight.md"
    exit 1
fi
```

**Answer: Yes, skills absolutely persist across all agents.** They're part of the Docker image layer. Any skill installed during `docker build` is available to every job container.

### The Pattern for Adding New Skills/Plugins

To add a new skill or plugin for all ClawForge agents:

1. **Add the install command to `templates/docker/job/Dockerfile`**
2. **Add a verification step** (like the GSD check)
3. **Rebuild the image** -- all future containers get it
4. **Reference the skill in AGENT.md** so the agent knows it's available

```dockerfile
# Example: adding a hypothetical "claude-lint" skill
RUN npx claude-lint@latest --install --global
RUN test -d /root/.claude/commands/lint/ || (echo "ERROR: lint skill failed" && exit 1)
```

### Hooks Also Persist

The Dockerfile also installs Claude Code hooks (`Dockerfile:46-62`). The GSD invocation observer hook is baked in:

```dockerfile
COPY hooks/gsd-invocations.js /root/.claude/hooks/gsd-invocations.js
# Merges hook config into /root/.claude/settings.json
```

So hooks, skills, and settings all persist at the image layer.

### Per-Instance vs. Global Skills

Right now, all job containers use the same `templates/docker/job/Dockerfile`. This means every instance gets the same skill set. If you wanted different skills per instance:

**Option A: Single image, skill activation via AGENT.md** (recommended)
- Install ALL skills in the base image
- Only reference relevant skills in each instance's AGENT.md
- The agent only uses what it's told about (lean context)
- This is the sniper approach -- same toolbox, scoped instructions

**Option B: Per-instance job Dockerfiles**
- Each instance could have its own job Dockerfile
- More isolation but more maintenance
- Only worth it if skill installations conflict

**Option A is the right call** -- it aligns with both the sniper agent model (lean context per job) and the context efficiency principle (don't inject skill docs you won't use).

### What This Means for ClawForge as a Product

This is a **key differentiator**: ClawForge's skill layer is deterministic and version-controlled. Compare:

| | OpenClaw | ClawForge |
|---|---|---|
| Skill installation | Runtime, user-initiated, accumulates bloat | Build-time, Dockerfile, versioned |
| Skill persistence | Local filesystem, survives across sessions (context rot) | Docker image layer, fresh per container (no rot) |
| Skill removal | Manual, often forgotten | Remove from Dockerfile, rebuild |
| Skill versioning | Whatever's on disk | Pinned in Dockerfile (`@latest` or `@1.2.3`) |

---

## Part 4: Implementation Plan

### Change 1: Context Hydration in entrypoint.sh

**File:** `templates/docker/job/entrypoint.sh`
**Location:** Between step 8b (repo context) and step 9 (Claude Code configuration)

Add GSD state file reading:

```bash
# 8d. Read GSD project state for context hydration
PROJECT_STATE=""
if [ -f "/job/.planning/STATE.md" ]; then
    RAW_STATE=$(cat /job/.planning/STATE.md)
    if [ ${#RAW_STATE} -gt 6000 ]; then
        PROJECT_STATE=$(printf '%s' "$RAW_STATE" | head -c 6000)
        PROJECT_STATE="${PROJECT_STATE}\n\n[TRUNCATED]"
    else
        PROJECT_STATE="$RAW_STATE"
    fi
fi

ROADMAP_CONTEXT=""
if [ -f "/job/.planning/ROADMAP.md" ]; then
    RAW_ROADMAP=$(cat /job/.planning/ROADMAP.md)
    if [ ${#RAW_ROADMAP} -gt 4000 ]; then
        ROADMAP_CONTEXT=$(printf '%s' "$RAW_ROADMAP" | head -c 4000)
        ROADMAP_CONTEXT="${ROADMAP_CONTEXT}\n\n[TRUNCATED]"
    else
        ROADMAP_CONTEXT="$RAW_ROADMAP"
    fi
fi

# 8e. Recent git history (last 10 commits on main)
RECENT_COMMITS=""
if git log main --oneline -10 2>/dev/null; then
    RECENT_COMMITS=$(git log main --oneline -10 2>/dev/null)
fi
```

Then inject into FULL_PROMPT between STACK_SECTION and Task:

```bash
${STATE_SECTION}

${ROADMAP_SECTION}

${COMMITS_SECTION}
```

**Estimated token cost:** ~2-4K tokens additional. Well within the sniper agent budget.

### Change 2: Dynamic System Prompt Scoping

**File:** `templates/docker/job/entrypoint.sh`
**Location:** Step 7 (system prompt building)

Instead of always injecting full AGENT.md, create scoped variants:

**New files:**
- `templates/docker/job/defaults/AGENT_QUICK.md` -- trimmed to just quick task instructions (~20 lines)
- `templates/docker/job/defaults/AGENT_PLAN.md` -- full planning + execution reference (~90 lines, current AGENT.md)

**Entrypoint change:**
```bash
# Select AGENT.md variant based on GSD hint
AGENT_FILE="/job/config/AGENT.md"
if [ "$GSD_HINT" = "quick" ] && [ -f "/job/config/AGENT_QUICK.md" ]; then
    AGENT_FILE="/job/config/AGENT_QUICK.md"
fi
```

**Note:** This requires moving GSD hint detection (step 8c) before step 7, since the hint is needed to select the right AGENT variant.

### Change 3: Layer 1 Pre-Hydration

**File:** `lib/ai/tools.js` -- enhance `createJobTool`
**File:** `lib/tools/github.js` -- add `fetchRepoFile()` helper

Before writing the job description, Layer 1 fetches project state from the target repo:

```javascript
// In createJobTool handler, after resolving target repo:
let projectContext = '';
if (resolvedTarget || process.env.GH_REPO) {
    const repo = resolvedTarget
        ? `${resolvedTarget.owner}/${resolvedTarget.slug}`
        : `${process.env.GH_OWNER}/${process.env.GH_REPO}`;

    const state = await fetchRepoFile(repo, '.planning/STATE.md');
    if (state) {
        projectContext += `\n\n## Current Project State\n\n${state.slice(0, 3000)}`;
    }
}

if (projectContext) {
    enrichedDescription = `${projectContext}\n\n---\n\n${enrichedDescription}`;
}
```

**New helper in `lib/tools/github.js`:**
```javascript
async function fetchRepoFile(repoSlug, filePath) {
    try {
        const resp = await githubApi(`/repos/${repoSlug}/contents/${filePath}`);
        return Buffer.from(resp.content, 'base64').toString('utf8');
    } catch {
        return null;
    }
}
```

### Execution Order

1. **Change 1** (entrypoint hydration) -- highest impact, lowest risk
2. **Change 2** (dynamic system prompt) -- requires creating AGENT_QUICK.md variant + moving GSD hint detection
3. **Change 3** (Layer 1 pre-hydration) -- requires GitHub API calls in the event handler, moderate complexity

### Verification

1. **Change 1:** Create a test job against a repo with `.planning/STATE.md` -- verify the FULL_PROMPT includes the state section in `claude-output.jsonl`
2. **Change 2:** Create a quick job and a plan-phase job -- verify different AGENT.md content in the system prompt via preflight.md
3. **Change 3:** In the event handler, create a job targeting a repo with GSD state -- verify the job description includes "Current Project State" section

---

## Summary

| Concept | ClawForge Status | Personal Workflow |
|---|---|---|
| Sniper agents (purpose-built, lean context) | Already the architecture -- each job is a sniper | Use subagents for exploration, keep main context clean |
| Context tree (trunk + branches + trimming) | Partially -- GSD state files ARE the trunk but aren't hydrated into jobs | Adopt /re aggressively after tangents |
| Four zones (triggers, injection, tools, output) | Clean separation across both layers | N/A (framework concept) |
| Context rot prevention | Fresh clone per job eliminates this for Layer 2 | /re after debugging, recon-then-trim for complex prompts |
| Prior job continuity | Shipped (tools.js thread-scoped injection) | Use same Slack thread for related jobs |
| Pre-hydration (Stripe pattern) | Planned, not implemented | Recon-then-trim manually achieves this |

### Bottom Line

ClawForge is architecturally ahead of OpenClaw on the context efficiency problem. The main improvement opportunity is **context hydration** -- giving the job container more of the "trunk" (GSD state, recent history, project context) upfront so it doesn't waste its clean context window re-discovering where the project is. For personal workflow, the biggest unlock is internalizing /re as a core primitive, not a recovery mechanism.
