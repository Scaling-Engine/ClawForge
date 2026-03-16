# Phase 39: Smart Execution - Research

**Researched:** 2026-03-16
**Domain:** Docker entrypoint orchestration, GitHub Actions workflow extension, per-repo configuration, operator notification pipeline
**Confidence:** HIGH

## Summary

Phase 39 adds quality gates (configurable shell commands like lint/typecheck/test), a self-correction loop on gate failure, per-repo merge policies, and gate failure excerpts in operator notifications. All four requirements are additive: they extend existing files without replacing them.

The critical architectural constraint is the **dual dispatch path coverage gap**. The Docker dispatch path (`dispatchDockerJob()` in `lib/ai/tools.js`) does not go through GitHub Actions at all — it spawns a container directly. Quality gates placed only in `run-job.yml` are silently bypassed for all Docker-dispatched jobs (the default path). Gates **must** live in `entrypoint.sh` to cover both paths.

The operator notification requirement (EXEC-04) is solved without new infrastructure: gate failure excerpts written to `logs/{jobId}/gate-failures.md` on the branch are read by the existing notification workflows (`notify-job-failed.yml`, `notify-pr-complete.yml`) and included in the `results.log` field passed to `summarizeJob()`. The LLM-generated summary then surfaces the excerpts naturally.

**Primary recommendation:** Implement gates entirely inside `entrypoint.sh` (after `claude -p`, before `gh pr create`), write `gate-failures.md` to the branch for both notification and audit, extend `auto-merge.yml` with a single merge-policy check step wired into the aggregated `Merge PR` condition, and extend REPOS.json with `qualityGates` + `mergePolicy` fields.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXEC-01 | Job container runs configurable quality gates (lint, typecheck, test) after Claude Code completes and before PR creation | Gates run as shell commands inside `entrypoint.sh` after `claude -p` exits (line ~437), before `gh pr create` (line ~488). Gate list injected via `QUALITY_GATES` env var from REPOS.json. |
| EXEC-02 | When quality gates fail, the agent automatically sees the failure output and attempts one self-correction pass before creating the PR | Re-invoke `claude -p` with gate failure output prepended as context. Hard max: 1 correction iteration (2 total attempts). Track attempt count with `GATE_ATTEMPT` variable in entrypoint.sh. |
| EXEC-03 | Each repo in REPOS.json can specify a merge policy (auto, gate-required, manual) enforced by the auto-merge workflow | Add `"mergePolicy": "auto" | "gate-required" | "manual"` to each repo entry. Add new `check-merge-policy` step in `auto-merge.yml` wired into the existing `Merge PR` condition. |
| EXEC-04 | Gate failures are surfaced in the operator's chat notification with failure excerpts, not just a PR label | Write `logs/{jobId}/gate-failures.md` to branch. Notification workflows already read branch artifacts and include them in webhook payload. `summarizeJob()` receives gate output via `results.log` and generates operator-visible excerpts. |
</phase_requirements>

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `entrypoint.sh` (bash) | existing | Gate execution, self-correction loop | Already the job container orchestrator; runs in the Docker container |
| REPOS.json | existing | Per-repo configuration | Already the source of truth for repo settings; `dispatch` field follows same pattern |
| `auto-merge.yml` | existing | Merge policy enforcement | Already the merge gating workflow; has 4-step decision chain |
| `notify-job-failed.yml` | existing | Actions-path failure notification | Already reads branch artifacts and POSTs to webhook |
| `notify-pr-complete.yml` | existing | Success/PR notification | Already reads branch artifacts |
| `summarizeJob()` | existing | Operator-facing message generation | Already called by `waitAndNotify()` with `results.log` |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `gh` CLI (GitHub CLI) | pre-installed in container | PR labels, artifact push | `gh pr edit --add-label` for `needs-fixes` label; already used in entrypoint.sh |
| `git` | pre-installed | Committing gate-failures.md to branch | Already used in entrypoint.sh for job commits |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `entrypoint.sh` gates | `run-job.yml` pre-PR job step | Actions path only — silently bypasses Docker dispatch (default path). NEVER do this. |
| `gate-failures.md` artifact on branch | Inline gate output in webhook payload | Payloads become 50-200KB with full test output; branch artifact is pull-able by size |
| Single aggregation step in `auto-merge.yml` | Multiple `if:` conditions per step | Single aggregation step is the existing pattern; adding multiple step conditions creates maintenance surface |

**Installation:** No new dependencies. All tooling is pre-installed in the job container and existing workflows.

## Architecture Patterns

### Recommended Project Structure Changes

```
instances/{name}/config/
└── REPOS.json               # Add qualityGates[] + mergePolicy per repo

templates/docker/job/
└── entrypoint.sh            # Insert gates block between claude -p and gh pr create

templates/.github/workflows/
├── auto-merge.yml           # Add check-merge-policy step
├── notify-job-failed.yml    # Read gate-failures.md if present
└── notify-pr-complete.yml   # Read gate-failures.md if present

lib/tools/
└── repos.js                 # Add getQualityGates() + getMergePolicy() helpers

lib/ai/
└── tools.js                 # Pass QUALITY_GATES + MERGE_POLICY env vars to dispatchDockerJob()
```

### Pattern 1: Gate Execution Block in entrypoint.sh

**What:** After `claude -p` exits and before `gh pr create`, run each gate command in sequence. On any failure, write a trimmed excerpt to `gate-failures.md`, commit it to the branch, then either self-correct (attempt 1) or skip PR creation (attempt 2 failed).

**When to use:** Every Docker-dispatched job. Gates run regardless of dispatch path because they live in `entrypoint.sh`.

**Implementation sketch:**
```bash
# After CLAUDE_EXIT capture, before gh pr create (around line 440 in entrypoint.sh)

GATE_PASS=true
GATE_OUTPUT=""

if [ -n "$QUALITY_GATES" ]; then
  echo "$QUALITY_GATES" | while IFS= read -r gate_cmd; do
    [ -z "$gate_cmd" ] && continue
    echo "[GATE] Running: $gate_cmd"
    gate_out=$(eval "$gate_cmd" 2>&1)
    gate_status=$?
    if [ $gate_status -ne 0 ]; then
      GATE_PASS=false
      GATE_OUTPUT="$GATE_OUTPUT\n### Gate failed: $gate_cmd\n\`\`\`\n${gate_out:0:2000}\n\`\`\`\n"
      break  # Stop on first failure (sequential, not parallel)
    fi
  done
fi

if [ "$GATE_PASS" = "false" ]; then
  # Write artifact for notification workflows
  mkdir -p "$LOG_DIR"
  printf "%s" "$GATE_OUTPUT" > "$LOG_DIR/gate-failures.md"
  git add "$LOG_DIR/gate-failures.md"
  git commit -m "chore: record gate failures"
  git push origin "$BRANCH_NAME"

  if [ "${GATE_ATTEMPT:-0}" -eq 0 ]; then
    # Self-correction pass (EXEC-02)
    GATE_ATTEMPT=1
    CORRECTION_PROMPT="Quality gates failed. Fix the issues and try again.\n\n$GATE_OUTPUT"
    claude -p "$CORRECTION_PROMPT" ...  # same flags as original invocation
    # Re-run gates (recursive call avoided — inline re-run of gate block)
  fi
  # After correction: if gates still fail, label PR needs-fixes, skip auto-merge
fi
```

**Note:** The loop variable scope in bash subshells requires either using a temp file for `GATE_PASS` state or restructuring as a function. Use a temp file (`/tmp/gate_pass`) for reliable cross-subshell state.

### Pattern 2: REPOS.json Extended Schema

**What:** Add `qualityGates` and `mergePolicy` fields to each repo entry.

**When to use:** Any repo that needs configurable gates or merge behavior. Absent = no gates, `auto` merge policy.

```json
{
  "repos": [
    {
      "owner": "org",
      "slug": "repo-name",
      "name": "Repo Name",
      "aliases": ["alias"],
      "dispatch": "docker",
      "qualityGates": [
        "npm run lint",
        "npx tsc --noEmit",
        "npm test -- --passWithNoTests"
      ],
      "mergePolicy": "gate-required"
    }
  ]
}
```

### Pattern 3: auto-merge.yml Merge Policy Check

**What:** New step `check-merge-policy` reads `mergePolicy` from the PR branch's REPOS.json, outputs `allowed: true/false`. The existing `Merge PR` step's `if:` condition is extended with `&& steps.check-merge-policy.outputs.allowed == 'true'`.

**When to use:** Every PR from a `job/` branch. Default (`auto` or absent) = allowed.

```yaml
# New step added after check-paths, before Merge PR
- name: Check merge policy
  id: check-merge-policy
  run: |
    # Read mergePolicy from REPOS.json for this PR's target repo
    POLICY=$(node -e "
      const repos = require('./instances/noah/config/REPOS.json');
      const pr_repo = process.env.PR_REPO;
      const repo = repos.repos.find(r => r.slug === pr_repo || r.owner + '/' + r.slug === pr_repo);
      console.log(repo?.mergePolicy || 'auto');
    ")
    if [ "$POLICY" = "manual" ]; then
      echo "allowed=false" >> $GITHUB_OUTPUT
    elif [ "$POLICY" = "gate-required" ]; then
      # Check if gate-failures.md exists on this branch
      if git ls-files --error-unmatch "logs/*/gate-failures.md" 2>/dev/null; then
        echo "allowed=false" >> $GITHUB_OUTPUT
      else
        echo "allowed=true" >> $GITHUB_OUTPUT
      fi
    else
      echo "allowed=true" >> $GITHUB_OUTPUT
    fi
```

### Pattern 4: Gate Failure Notification (EXEC-04)

**What:** `notify-job-failed.yml` and `notify-pr-complete.yml` already read branch artifacts. Extend both to check for `gate-failures.md` and include its content in the webhook payload `log` field. `summarizeJob()` receives this and the LLM generates a human-readable excerpt.

**When to use:** Whenever a job branch has `logs/{jobId}/gate-failures.md` present.

```bash
# In notify workflows, after reading claude-output.jsonl:
GATE_FAILURES=""
GATE_FILE="logs/${JOB_ID}/gate-failures.md"
if [ -f "$GATE_FILE" ]; then
  GATE_FAILURES=$(cat "$GATE_FILE")
fi
# Include in JSON payload:
# "gate_failures": "$GATE_FAILURES"
```

### Anti-Patterns to Avoid

- **Gates in run-job.yml only:** Bypasses Docker dispatch path silently. Docker is the default dispatch. Always put gates in `entrypoint.sh`.
- **Iterating self-correction more than once:** Hard max is 1 correction pass (2 total). Track with `GATE_ATTEMPT` flag. Never loop.
- **Parallel gate execution:** Creates race conditions on shared state and ambiguous failure attribution. Run gates sequentially, stop on first failure.
- **Embedding full test output in webhook payload:** Full test output can be 50-200KB. Truncate to first 2000 chars per gate and write to branch artifact. Webhook body should stay small.
- **Adding merge policy step without wiring its output:** Adding a new check step but not updating the `Merge PR` `if:` condition creates a silent bypass. Always update the aggregated condition.
- **Losing GATE_PASS state across bash subshells:** Variables set inside `while IFS= read` loops sourced via process substitution are in a subshell. Use `/tmp/gate_pass` temp file or restructure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gate command execution | Custom process spawner | `eval "$gate_cmd"` in bash + `$?` capture | Already in a bash environment with full shell access |
| Self-correction context | Custom context builder | Prepend failure output to next `claude -p` prompt | `claude -p` accepts a prompt string directly; failure output is the context |
| Merge policy enforcement | Custom merge service | Extend `auto-merge.yml` step conditions | Workflow is already the enforcement point for all job/ branches |
| Notification excerpts | New notification channel/field | Extend `results.log` in existing `waitAndNotify()` | `summarizeJob()` already processes `results.log` for the operator message |
| Gate result persistence | Redis/DB storage | `gate-failures.md` committed to branch | Branch is already the persistence layer for all job artifacts |

**Key insight:** Phase 39 is entirely about configuration plumbing and control flow extension. The hard work (container orchestration, notification routing, PR creation, merge enforcement) is already done. Gates slot into existing seams.

## Common Pitfalls

### Pitfall 1: Docker Dispatch Path Bypasses run-job.yml Gates
**What goes wrong:** Developer adds quality gate steps to `run-job.yml` under the "Run Claude Code" job. Tests pass in CI. Docker-dispatched jobs (the default) run with no gates at all.
**Why it happens:** Docker dispatch (`dispatchDockerJob()` in `lib/ai/tools.js`) spawns a container directly — it never triggers a GitHub Actions workflow. `run-job.yml` only fires on branch create for Actions-dispatched repos.
**How to avoid:** All gate logic goes in `entrypoint.sh`. If gates are also wanted in the Actions path (belt-and-suspenders), they can be duplicated in `run-job.yml`, but `entrypoint.sh` is mandatory.
**Warning signs:** Gate failure logs never appear for jobs dispatched via the default Docker path.

### Pitfall 2: auto-merge.yml Silent Bypass (New Step Not Wired to Condition)
**What goes wrong:** A `check-merge-policy` step is added and correctly outputs `allowed: false` for `manual` repos. But the `Merge PR` step's `if:` condition is not updated to reference `steps.check-merge-policy.outputs.allowed`. All PRs still auto-merge.
**Why it happens:** GitHub Actions steps are independent unless explicitly wired. Forgetting to update the condition string is easy.
**How to avoid:** After adding any new check step, immediately update the `Merge PR` `if:` condition to include `&& steps.check-merge-policy.outputs.allowed == 'true'`.
**Warning signs:** PRs from repos with `mergePolicy: "manual"` still auto-merge.

### Pitfall 3: Self-Correction Loop Without Hard Limit
**What goes wrong:** Self-correction re-runs gates, gates fail again, correction re-runs, infinite loop until container timeout.
**Why it happens:** Gate failures on unfixable issues (e.g., broken test environment, missing dependency) will never self-heal.
**How to avoid:** Track `GATE_ATTEMPT` variable. On attempt 2, skip correction and proceed to PR creation with `needs-fixes` label.
**Warning signs:** Job containers running for hours; container timeout errors in logs.

### Pitfall 4: Bash Subshell Variable Scope (GATE_PASS Lost)
**What goes wrong:** `GATE_PASS=false` is set inside a `while IFS= read -r gate_cmd` loop that's sourced via process substitution (`while ...; done < <(...)`). The variable is set in a subshell and lost on exit. Gates always appear to pass.
**Why it happens:** Bash process substitution creates a subshell. Variable assignments inside don't propagate to the parent.
**How to avoid:** Use a temp file: `echo "false" > /tmp/gate_pass` inside the loop, then `GATE_PASS=$(cat /tmp/gate_pass)` after.
**Warning signs:** Gates log failures but self-correction never triggers; PRs created after gate failures.

### Pitfall 5: Webhook Payload Size from Raw Gate Output
**What goes wrong:** Full `npm test` output (10,000 lines) is embedded in the webhook JSON body. Webhook endpoint rejects with 413 or silently truncates. Operator sees no gate details.
**Why it happens:** Test output grows unboundedly; webhook endpoints typically have 1-10MB body limits.
**How to avoid:** Truncate gate output to 2000 chars per gate when writing `gate-failures.md`. Read the artifact URL from the branch in notification workflows rather than embedding inline.
**Warning signs:** Webhook 413 errors in notification workflow logs; gate excerpts absent from operator messages.

### Pitfall 6: REPOS.json Instance-Specificity
**What goes wrong:** `qualityGates` added to the template REPOS.json at `templates/` but never propagated to `instances/noah/config/REPOS.json` or `instances/strategyES/config/REPOS.json`. Gate commands are null for all deployed instances.
**Why it happens:** Templates are scaffolding only; running instances use their own config files.
**How to avoid:** Update `instances/{name}/config/REPOS.json` directly for each active instance. Templates get updated for future `npx thepopebot init` runs.
**Warning signs:** `QUALITY_GATES` env var is empty in container; gates never run.

## Code Examples

### entrypoint.sh: Insertion Point for Gates

The current structure (confirmed from file read):

```bash
# Line ~437 in entrypoint.sh:
CLAUDE_EXIT=$?
# ... tee to claude-output.jsonl ...

# <<< INSERT QUALITY GATES BLOCK HERE >>>

# Line ~488 in entrypoint.sh:
if [ "$CLAUDE_EXIT" -eq 0 ] && [ "$HAS_NEW_COMMIT" = "true" ]; then
  gh pr create ...
fi
```

The gate block condition should extend the PR creation guard:
```bash
# Modified condition after gate block:
GATE_PASS=$(cat /tmp/gate_pass 2>/dev/null || echo "true")

if [ "$CLAUDE_EXIT" -eq 0 ] && [ "$HAS_NEW_COMMIT" = "true" ] && [ "$GATE_PASS" = "true" ]; then
  gh pr create ...
elif [ "$CLAUDE_EXIT" -eq 0 ] && [ "$HAS_NEW_COMMIT" = "true" ] && [ "$GATE_PASS" = "false" ]; then
  # PR still created but labeled
  gh pr create --label "needs-fixes" ...
fi
```

### lib/tools/repos.js: New Helper Functions

Pattern following existing `getDispatchMethod()`:
```javascript
// Source: existing pattern in lib/tools/repos.js
export function getQualityGates(repo) {
  return repo?.qualityGates || [];
}

export function getMergePolicy(repo) {
  return repo?.mergePolicy || 'auto';
}
```

### lib/ai/tools.js: Passing Gate Config to Container

Following existing env var pass-through pattern in `dispatchDockerJob()`:
```javascript
// Source: existing pattern in lib/ai/tools.js dispatchDockerJob()
const qualityGates = getQualityGates(resolvedRepo);
const mergePolicy = getMergePolicy(resolvedRepo);

// Add to Docker env vars:
Env: [
  ...existingEnvVars,
  `QUALITY_GATES=${qualityGates.join('\n')}`,
  `MERGE_POLICY=${mergePolicy}`,
]
```

### auto-merge.yml: Current Merge PR Condition

```yaml
# Source: templates/.github/workflows/auto-merge.yml
- name: Merge PR
  if: |
    steps.merge-check.outputs.mergeable == 'MERGEABLE' &&
    steps.check-setting.outputs.enabled == 'true' &&
    steps.check-blocked.outputs.blocked != 'true' &&
    steps.check-paths.outputs.allowed == 'true'
  # After Phase 39, add:
  # && steps.check-merge-policy.outputs.allowed == 'true'
```

### summarizeJob() Receives Gate Failures Automatically

```javascript
// Source: lib/ai/index.js
// summarizeJob() already processes results.log:
// results.log gets gate-failures.md content appended by notification workflows
// No change needed to summarizeJob() itself — it receives the richer log and generates excerpts
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PR created unconditionally after claude -p | PR gated on quality gates passing | Phase 39 | Jobs produce higher-quality PRs; failing gates trigger self-correction |
| `mergePolicy` = always auto | Per-repo `mergePolicy: auto/gate-required/manual` | Phase 39 | Operations repos with sensitive paths can require human review |
| Operator notification: "job failed" generic | Operator notification includes gate failure excerpts | Phase 39 | Operators know exactly what failed without clicking into GitHub |

**No deprecated items for this phase.**

## Open Questions

1. **entrypoint.sh bash subshell pattern for GATE_PASS state**
   - What we know: Process substitution creates subshells; variable assignments don't propagate
   - What's unclear: Whether the current entrypoint.sh uses `while ... done < <(...)` or pipe-based loops (need to verify exact loop structure before writing)
   - Recommendation: Use `/tmp/gate_pass` temp file pattern unconditionally; safe regardless of loop style

2. **QUALITY_GATES env var encoding (multi-line commands with spaces)**
   - What we know: Docker env vars are single strings; newline-delimited gate lists need careful encoding
   - What's unclear: Whether Dockerode's `Env` array handles embedded newlines or needs URL encoding
   - Recommendation: Use newline delimiter (`\n`) in the string; in entrypoint.sh, use `while IFS= read -r` to split. Test with a gate command that contains spaces (e.g., `npm run lint -- --fix`).

3. **gate-failures.md location for multi-repo Docker dispatch**
   - What we know: `LOG_DIR="/job/logs/${JOB_ID}"` is defined in entrypoint.sh
   - What's unclear: Whether JOB_ID is always set for Docker-dispatched jobs (not just Actions)
   - Recommendation: Verify JOB_ID is passed as env var in `dispatchDockerJob()` before writing to `$LOG_DIR`; fall back to `/tmp/gate-failures.md` if LOG_DIR is absent.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected (no jest.config, no vitest.config, no package.json test script found) |
| Config file | none — see Wave 0 |
| Quick run command | `npm run build` (build validates Next.js compilation) |
| Full suite command | `npm run build && node -e "require('./lib/tools/repos.js')"` (smoke test module loading) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXEC-01 | Quality gates run after claude -p, before gh pr create | manual-only | Run a job with `qualityGates: ["exit 1"]` in REPOS.json; verify PR is not created | N/A |
| EXEC-01 | `getQualityGates()` returns array from REPOS.json | unit | `node -e "const {getQualityGates} = require('./lib/tools/repos.js'); console.assert(Array.isArray(getQualityGates({qualityGates: ['npm run lint']})))"` | ❌ Wave 0 |
| EXEC-02 | Self-correction fires exactly once on gate failure | manual-only | Run job with always-failing gate; verify claude -p is called twice, then stops | N/A |
| EXEC-03 | `getMergePolicy()` returns correct policy value | unit | `node -e "const {getMergePolicy} = require('./lib/tools/repos.js'); console.assert(getMergePolicy({mergePolicy: 'manual'}) === 'manual')"` | ❌ Wave 0 |
| EXEC-03 | auto-merge.yml blocks PR for manual policy | manual-only | Create test PR on repo with `mergePolicy: manual`; verify workflow outputs `allowed=false` | N/A |
| EXEC-04 | gate-failures.md written to branch on gate failure | manual-only | Run job with failing gate; verify `logs/{jobId}/gate-failures.md` committed to branch | N/A |
| EXEC-04 | Operator notification contains gate excerpt text | manual-only | Trigger job with failing gate; verify Slack/web notification contains failure text | N/A |

### Sampling Rate
- **Per task commit:** `npm run build`
- **Per wave merge:** `npm run build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `lib/tools/repos.test.js` — unit tests for `getQualityGates()` and `getMergePolicy()` covering absent field defaults (covers EXEC-01, EXEC-03 unit behavior)
- [ ] Manual smoke test script at `scripts/test-gate-failure.sh` — runs a no-op job with `qualityGates: ["exit 1"]` to verify end-to-end gate→notification flow without triggering real Claude Code

*(Most EXEC requirements are end-to-end integration behaviors in Docker containers and GitHub Actions — they cannot be unit tested meaningfully. Manual verification checklists in VERIFICATION.md are the primary validation approach.)*

## Sources

### Primary (HIGH confidence)
- `/Users/nwessel/Claude Code/Business/Products/clawforge/templates/docker/job/entrypoint.sh` — Full read; confirmed insertion point between lines 437 and 488; confirmed LOG_DIR, CLAUDE_EXIT, HAS_NEW_COMMIT variable names
- `/Users/nwessel/Claude Code/Business/Products/clawforge/templates/.github/workflows/auto-merge.yml` — Full read; confirmed 4-step decision chain and Merge PR `if:` condition string
- `/Users/nwessel/Claude Code/Business/Products/clawforge/lib/ai/tools.js` — Full read; confirmed `waitAndNotify()`, `results` object structure, `summarizeJob()` call
- `/Users/nwessel/Claude Code/Business/Products/clawforge/lib/ai/index.js` — Confirmed `summarizeJob()` signature and `results.log` usage
- `/Users/nwessel/Claude Code/Business/Products/clawforge/lib/tools/repos.js` — Confirmed `loadAllowedRepos()` and `getDispatchMethod()` patterns
- `/Users/nwessel/Claude Code/Business/Products/clawforge/instances/noah/config/REPOS.json` — Confirmed current repo schema (owner, slug, name, aliases, dispatch)
- `/Users/nwessel/Claude Code/Business/Products/clawforge/.planning/REQUIREMENTS.md` — EXEC-01 through EXEC-04 definitions and out-of-scope items
- `/Users/nwessel/Claude Code/Business/Products/clawforge/.planning/STATE.md` — Key architecture note confirming Docker vs Actions gate placement constraint; self-correction hard max
- `/Users/nwessel/Claude Code/Business/Products/clawforge/.planning/research/PITFALLS.md` — Pitfall 8 (Docker bypass) and Pitfall 9 (auto-merge condition bypass) confirmed
- `/Users/nwessel/Claude Code/Business/Products/clawforge/.planning/research/FEATURES.md` — Area 4 smart execution breakdown; REPOS.json schema extension design
- `/Users/nwessel/Claude Code/Business/Products/clawforge/.planning/research/SUMMARY.md` — Phase 39 characterized as entirely in entrypoint.sh + Actions; zero UI/schema changes

### Secondary (MEDIUM confidence)
- `/Users/nwessel/Claude Code/Business/Products/clawforge/templates/.github/workflows/notify-job-failed.yml` — Confirmed reads branch artifacts and POSTs to webhook
- `/Users/nwessel/Claude Code/Business/Products/clawforge/templates/.github/workflows/notify-pr-complete.yml` — Confirmed artifact reading pattern

### Tertiary (LOW confidence)
- None — all findings are from direct file reads of the active codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tooling confirmed by direct file reads; no new dependencies
- Architecture: HIGH — insertion points confirmed with line numbers; existing patterns verified
- Pitfalls: HIGH — Pitfalls 8 and 9 explicitly documented in project's own PITFALLS.md; bash subshell pitfall is well-known
- Validation: MEDIUM — test framework absent; validation approach is integration/manual-heavy by nature of Docker container execution

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable entrypoint.sh and workflow files; changes would invalidate line number references)
