# Phase 18: Layer 2 Context Hydration - Research

**Researched:** 2026-03-06
**Domain:** Bash scripting / Docker entrypoint / prompt engineering
**Confidence:** HIGH

## Summary

This phase modifies `templates/docker/job/entrypoint.sh` to inject project planning state (STATE.md, ROADMAP.md), recent git history, and GSD-gated agent instructions into the Claude Code prompt. The job container already clones the target repo, reads CLAUDE.md, and builds a prompt -- this phase extends that prompt assembly with richer context sections.

The work is entirely within the entrypoint shell script and config file creation. No new libraries, no API changes, no database modifications. The key technical decisions are: (1) how to read planning files from the cloned repo, (2) how to gate context depth on the GSD hint, (3) how to create and select AGENT_QUICK.md vs AGENT.md, and (4) how to inject git history.

**Primary recommendation:** Extend the existing prompt assembly in entrypoint.sh (lines 104-200) with conditional sections that read `.planning/STATE.md`, `.planning/ROADMAP.md`, and `git log` output. Gate full hydration on the existing `GSD_HINT` variable. Create `AGENT_QUICK.md` as a stripped-down variant alongside existing `AGENT.md` in both `instances/*/config/` and `templates/docker/job/defaults/`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HYDR-01 | Job prompt includes STATE.md content (capped at 4K chars) from target repo | Read `.planning/STATE.md` from `/job/` after clone, truncate at 4000 chars, inject into FULL_PROMPT |
| HYDR-02 | Job prompt includes ROADMAP.md content (capped at 6K chars) from target repo | Read `.planning/ROADMAP.md` from `/job/`, truncate at 6000 chars, inject into FULL_PROMPT |
| HYDR-03 | Job prompt includes last 10 commits on main as recent git history | Run `git log` against the cloned repo's main/default branch, format as compact table |
| HYDR-04 | Context hydration gated on GSD hint (quick = minimal, plan-phase = full) | Existing `GSD_HINT` variable (line 134) already determines quick vs plan-phase -- use it to gate section injection |
| HYDR-05 | AGENT_QUICK.md used for simple jobs, full AGENT.md for complex jobs | Create AGENT_QUICK.md files, select based on GSD_HINT in prompt assembly (step 7) |
</phase_requirements>

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| bash | 5.x (Debian bookworm) | Entrypoint scripting | Already used, container base image |
| git | 2.x (Debian bookworm) | History retrieval | Already installed in Dockerfile |
| jq | 1.x | JSON processing | Already installed in Dockerfile |

### Supporting
No new dependencies required. This phase uses only tools already present in the job container image.

## Architecture Patterns

### Current Prompt Assembly Flow (entrypoint.sh)
```
Step 7: Build system prompt (SOUL.md + AGENT.md)
Step 8: Read job description (job.md)
Step 8b: Read repo context (CLAUDE.md + package.json)
Step 8c: Derive GSD hint from keywords
Step 11: Assemble FULL_PROMPT with sections
```

### Modified Flow (after this phase)
```
Step 7: Build system prompt (SOUL.md + AGENT.md or AGENT_QUICK.md) <-- HYDR-05
Step 8: Read job description (job.md)
Step 8b: Read repo context (CLAUDE.md + package.json)
Step 8c: Derive GSD hint from keywords
Step 8d: Read planning context (STATE.md + ROADMAP.md)             <-- HYDR-01, HYDR-02 (NEW)
Step 8e: Read git history (last 10 commits on main)                <-- HYDR-03 (NEW)
Step 11: Assemble FULL_PROMPT with conditional sections             <-- HYDR-04
```

### Pattern: Conditional Section Injection
**What:** Include or omit prompt sections based on GSD_HINT value
**When to use:** When prompt size matters and not all jobs need full context
**Example:**
```bash
# Gate full hydration on GSD hint
if [ "$GSD_HINT" = "plan-phase" ]; then
    # Include STATE.md, ROADMAP.md, full git history
    STATE_SECTION="## Project State\n\n${REPO_STATE_MD}"
    ROADMAP_SECTION="## Project Roadmap\n\n${REPO_ROADMAP_MD}"
    HISTORY_SECTION="## Recent Git History\n\n${GIT_HISTORY}"
else
    # Minimal prompt for quick jobs
    STATE_SECTION=""
    ROADMAP_SECTION=""
    HISTORY_SECTION=""
fi
```

### Pattern: Capped File Reading (already established)
**What:** Read a file, truncate if over character limit, flag truncation
**When to use:** For any file injected into the prompt where size must be bounded
**Example (existing pattern from CLAUDE.md reading, line 108-120):**
```bash
REPO_STATE_MD=""
REPO_STATE_MD_TRUNCATED=false
if [ -f "/job/.planning/STATE.md" ]; then
    RAW_STATE_MD=$(cat /job/.planning/STATE.md)
    CHAR_COUNT=${#RAW_STATE_MD}
    if [ "$CHAR_COUNT" -gt 4000 ]; then
        REPO_STATE_MD=$(printf '%s' "$RAW_STATE_MD" | head -c 4000)
        REPO_STATE_MD_TRUNCATED=true
    else
        REPO_STATE_MD="$RAW_STATE_MD"
    fi
fi
```

### Pattern: AGENT_QUICK.md Selection
**What:** Swap AGENT.md for AGENT_QUICK.md in system prompt assembly based on GSD_HINT
**Where:** Step 7 of entrypoint.sh (lines 86-93)
**Example:**
```bash
# Step 7: Build system prompt with hint-aware agent instructions
SYSTEM_PROMPT=""
if [ -f "/job/config/SOUL.md" ]; then
    SYSTEM_PROMPT=$(cat /job/config/SOUL.md)
    SYSTEM_PROMPT="${SYSTEM_PROMPT}\n\n"
fi

# Select agent instructions based on complexity
if [ "$GSD_HINT" = "quick" ] && [ -f "/job/config/AGENT_QUICK.md" ]; then
    SYSTEM_PROMPT="${SYSTEM_PROMPT}$(cat /job/config/AGENT_QUICK.md)"
elif [ -f "/job/config/AGENT.md" ]; then
    SYSTEM_PROMPT="${SYSTEM_PROMPT}$(cat /job/config/AGENT.md)"
fi
```

### Pattern: Git History Extraction
**What:** Get last N commits from main branch in a compact format
**Example:**
```bash
# Shallow clone only has 1 commit on the job branch.
# Fetch main branch refs to get history.
git fetch origin main --depth=11 2>/dev/null

GIT_HISTORY=$(git log origin/main --oneline -n 10 --format="%h %s (%cr)" 2>/dev/null || echo "[git history unavailable]")
```

### File Locations
```
templates/docker/job/
├── entrypoint.sh              # PRIMARY edit target
├── Dockerfile                 # May need COPY for AGENT_QUICK.md defaults
├── defaults/
│   ├── AGENT.md               # Existing (815 bytes)
│   ├── AGENT_QUICK.md         # NEW — stripped-down instructions
│   └── SOUL.md                # Existing (462 bytes) — unchanged
instances/noah/config/
│   ├── AGENT.md               # Existing (4012 bytes)
│   ├── AGENT_QUICK.md         # NEW — Noah-specific quick variant
│   └── SOUL.md                # Existing (531 bytes) — unchanged
instances/strategyES/config/
│   ├── AGENT.md               # Check if exists, create AGENT_QUICK.md
│   └── ...
```

### Anti-Patterns to Avoid
- **Bloating quick job prompts:** The entire point of HYDR-04 is that quick jobs stay lean. Never inject STATE.md/ROADMAP.md into quick job prompts.
- **Fetching from GitHub API in entrypoint:** The repo is already cloned to `/job/`. Read files from disk, not via API. The entrypoint runs inside the container with the cloned repo.
- **Hardcoding `.planning/` paths without graceful fallback:** Non-GSD repos won't have `.planning/STATE.md`. Always check `[ -f ... ]` before reading.
- **Using `git log` without fetching main first:** The job branch is cloned with `--depth 1 --single-branch`. Main branch history is not available unless explicitly fetched.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File truncation | Custom truncation logic | Reuse existing CLAUDE.md pattern (lines 108-120) | Already proven, consistent behavior |
| GSD hint detection | New detection logic | Existing `GSD_HINT` variable (line 134) | Already computed, just gate on it |
| Git history formatting | Custom git log parsing | `git log --oneline -n 10 --format="%h %s (%cr)"` | Git's built-in formatting is sufficient |

## Common Pitfalls

### Pitfall 1: Shallow Clone Has No Main Branch History
**What goes wrong:** `git log main` fails because the clone is `--single-branch --branch job/UUID --depth 1`
**Why it happens:** The cloned repo only has the job branch at depth 1. Main branch is not present.
**How to avoid:** Run `git fetch origin main --depth=11` before `git log origin/main`. Use `origin/main` not `main`.
**Warning signs:** Empty git history section or error messages in prompt.

### Pitfall 2: GSD Hint Must Be Computed Before Agent Selection
**What goes wrong:** AGENT_QUICK.md selection happens in Step 7 but GSD_HINT is computed in Step 8c.
**Why it happens:** Current script order has system prompt assembly before GSD hint derivation.
**How to avoid:** Move GSD hint computation (step 8c) to BEFORE system prompt assembly (step 7), or split the system prompt assembly into two parts. The simplest approach: move the GSD hint derivation earlier in the script, right after reading the job description.
**Warning signs:** AGENT.md always selected regardless of job type.

### Pitfall 3: echo -e Munging Special Characters
**What goes wrong:** `echo -e "$SYSTEM_PROMPT"` (line 148) interprets escape sequences in file content.
**Why it happens:** If STATE.md or ROADMAP.md contain backslash sequences, `echo -e` will interpret them.
**How to avoid:** Use `printf '%s'` instead of `echo -e` for content that may contain special characters. Note: the existing code already uses `echo -e` for the system prompt, so this is a pre-existing issue. For new sections injected into FULL_PROMPT, use `printf '%s'`.

### Pitfall 4: Non-GSD Repos Missing .planning Directory
**What goes wrong:** Script errors or empty sections when targeting repos without GSD planning files.
**Why it happens:** Not all repos have `.planning/STATE.md` or `.planning/ROADMAP.md`.
**How to avoid:** Always guard with `[ -f "/job/.planning/STATE.md" ]` before reading. Omit section entirely if file missing.
**Warning signs:** Error output in entrypoint logs.

### Pitfall 5: Prompt Token Budget
**What goes wrong:** Full hydration prompt becomes too large, wasting context window.
**Why it happens:** STATE.md (4K chars) + ROADMAP.md (6K chars) + CLAUDE.md (8K chars) + AGENT.md (~4K chars) + git history + job description.
**How to avoid:** The caps (4K for STATE, 6K for ROADMAP) are already defined in requirements. Total worst case: ~22K chars of injected context (~5.5K tokens) which is well within budget. Monitor actual sizes.

### Pitfall 6: defaults/ Fallback for AGENT_QUICK.md
**What goes wrong:** Instance config has AGENT.md but no AGENT_QUICK.md, so quick jobs get no agent instructions.
**Why it happens:** Existing fallback logic (line 86-93) checks `/job/config/AGENT.md` then falls back to `/defaults/AGENT.md`. Same pattern needed for AGENT_QUICK.md.
**How to avoid:** Implement the fallback chain: instance config first, then defaults. The Dockerfile already copies defaults.

## Code Examples

### Reading Planning Files (follows existing CLAUDE.md pattern)
```bash
# Source: entrypoint.sh lines 108-120 (existing pattern)

# Read STATE.md (capped at 4K chars per HYDR-01)
REPO_STATE_MD=""
if [ -f "/job/.planning/STATE.md" ]; then
    RAW=$(cat /job/.planning/STATE.md)
    if [ "${#RAW}" -gt 4000 ]; then
        REPO_STATE_MD=$(printf '%s' "$RAW" | head -c 4000)
        REPO_STATE_MD="${REPO_STATE_MD}

[TRUNCATED -- content exceeds 4,000 character limit]"
    else
        REPO_STATE_MD="$RAW"
    fi
fi

# Read ROADMAP.md (capped at 6K chars per HYDR-02)
REPO_ROADMAP_MD=""
if [ -f "/job/.planning/ROADMAP.md" ]; then
    RAW=$(cat /job/.planning/ROADMAP.md)
    if [ "${#RAW}" -gt 6000 ]; then
        REPO_ROADMAP_MD=$(printf '%s' "$RAW" | head -c 6000)
        REPO_ROADMAP_MD="${REPO_ROADMAP_MD}

[TRUNCATED -- content exceeds 6,000 character limit]"
    else
        REPO_ROADMAP_MD="$RAW"
    fi
fi
```

### Git History Extraction (HYDR-03)
```bash
# Fetch main branch history (shallow clone only has job branch)
git fetch origin main --depth=11 2>/dev/null || true

GIT_HISTORY=$(git log origin/main --oneline -n 10 --format="- %h %s (%cr)" 2>/dev/null || echo "[git history unavailable]")
```

### Conditional Prompt Assembly (HYDR-04)
```bash
# Build sections conditionally based on GSD hint
if [ "$GSD_HINT" = "plan-phase" ]; then
    # Full hydration for complex jobs
    if [ -n "$REPO_STATE_MD" ]; then
        STATE_SECTION="## Project State (from .planning/STATE.md)

${REPO_STATE_MD}"
    else
        STATE_SECTION=""
    fi

    if [ -n "$REPO_ROADMAP_MD" ]; then
        ROADMAP_SECTION="## Project Roadmap (from .planning/ROADMAP.md)

${REPO_ROADMAP_MD}"
    else
        ROADMAP_SECTION=""
    fi

    if [ -n "$GIT_HISTORY" ]; then
        HISTORY_SECTION="## Recent Git History (main branch)

${GIT_HISTORY}"
    else
        HISTORY_SECTION=""
    fi
else
    # Minimal prompt for quick jobs
    STATE_SECTION=""
    ROADMAP_SECTION=""
    HISTORY_SECTION=""
fi
```

### AGENT_QUICK.md Content (defaults variant)
```markdown
# Agent Instructions (Quick Mode)

You are executing a quick, targeted task. Focus on the specific change requested.

## Rules
- Make the minimum change needed
- Do not refactor unrelated code
- Use `/gsd:quick` for execution
- Commit with a clear message

Current datetime: {{datetime}}
```

### Reordered Script Flow
```bash
# Current order (problematic for HYDR-05):
# Step 7: System prompt (needs GSD_HINT)
# Step 8: Job description
# Step 8c: GSD hint (too late!)

# New order:
# Step 8: Job description
# Step 8c: GSD hint (moved up)
# Step 7: System prompt (can now use GSD_HINT)
# Step 8b-8e: Context reading
# Step 11: Assembly
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No project context in jobs | Layer 1 hydration via `get_project_state` tool (LangGraph) | Phase 17.1 (2026-03-06) | Event handler can read state before dispatching |
| Fixed AGENT.md for all jobs | Two-tier agent instructions (AGENT.md + AGENT_QUICK.md) | Phase 18 (this phase) | Right-sized instructions per job complexity |

**Key insight:** Layer 1 (Phase 17.1) added `get_project_state` as a LangGraph tool so the Event Handler can read state via GitHub API. Layer 2 (this phase) injects the same content directly into the job container's prompt from the cloned repo filesystem. They serve different purposes: Layer 1 helps the Event Handler make better job descriptions; Layer 2 helps the job agent understand project context.

## Open Questions

1. **StrategyES instance AGENT_QUICK.md**
   - What we know: StrategyES has its own config directory, likely has AGENT.md
   - What's unclear: Whether it needs a custom AGENT_QUICK.md or can use defaults
   - Recommendation: Create a generic one in `instances/strategyES/config/AGENT_QUICK.md` if AGENT.md exists there. If not, the defaults fallback handles it.

2. **Default branch name assumption**
   - What we know: `git fetch origin main` assumes `main` is the default branch
   - What's unclear: Whether any target repos use `master` or other default branches
   - Recommendation: Use `main` -- all ClawForge-managed repos use `main`. The `|| true` fallback handles repos where it fails.

## Sources

### Primary (HIGH confidence)
- `templates/docker/job/entrypoint.sh` -- current prompt assembly logic (lines 86-216)
- `templates/docker/job/Dockerfile` -- container image setup, defaults COPY
- `.planning/REQUIREMENTS.md` -- HYDR-01 through HYDR-05 specifications with exact caps
- `instances/noah/config/AGENT.md` -- full agent instructions (4012 bytes)
- `templates/docker/job/defaults/AGENT.md` -- generic agent instructions (815 bytes)
- `lib/ai/tools.js` -- Layer 1 context hydration via `get_project_state` tool (Phase 17.1)

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` -- phase dependencies and success criteria
- `docs/CONTEXT_ENGINEERING.md` -- design philosophy on context hydration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all bash/git
- Architecture: HIGH -- extending existing entrypoint.sh patterns with well-defined requirements
- Pitfalls: HIGH -- shallow clone git history issue is a known gotcha; script ordering issue is visible from code review

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, bash scripting patterns don't change)
