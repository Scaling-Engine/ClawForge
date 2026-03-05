# Phase 16: PR Pipeline and Auto-Merge Exclusion - Research

**Researched:** 2026-03-05
**Domain:** GitHub Actions workflow modification, PR merge policy, instance PR identification
**Confidence:** HIGH

## Summary

Phase 16 ensures that PRs created by the instance generator (Phase 15's `buildInstanceJobDescription`) are NOT auto-merged. Currently, `auto-merge.yml` checks changed files against `ALLOWED_PATHS` (a GitHub repo variable, default `/logs`). Since instance scaffolding PRs modify `instances/` and `docker-compose.yml`, they already fail the path check when `ALLOWED_PATHS` is set to `/logs`. However, if a repo has `ALLOWED_PATHS=/` (all paths allowed), instance PRs would auto-merge -- which is dangerous because broken instance configs could reach `main` and be deployed.

The phase has two requirements: DELIV-01 (PR body includes operator setup checklist) and DELIV-02 (instance PRs excluded from auto-merge). DELIV-01 is already substantially handled by Phase 15 -- `buildInstanceJobDescription()` already instructs the container agent to write `/tmp/pr-body.md` with a complete operator setup checklist, and `entrypoint.sh` already reads this file for the PR body (line 270-271). The remaining work is ensuring the auto-merge workflow explicitly blocks instance PRs regardless of ALLOWED_PATHS configuration, and confirming the PR body delivery mechanism works end-to-end.

**Primary recommendation:** Add an explicit path exclusion check in `auto-merge.yml` that blocks PRs touching `instances/` or `docker-compose.yml` from auto-merging, regardless of the `ALLOWED_PATHS` setting. This is a ~10-line addition to the existing workflow. Also update the template copy.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DELIV-01 | PR body includes an instance-specific operator setup checklist (exact GitHub secret names, Slack app scopes, PAT permissions, post-merge commands) | Phase 15's `buildInstanceJobDescription()` already generates the PR body template via `buildValidationChecklist()` which writes `/tmp/pr-body.md`. Entrypoint.sh reads this file (line 270-271). Phase 16 should verify this mechanism works and the checklist content is correct. |
| DELIV-02 | Instance scaffolding PRs are excluded from auto-merge and require manual operator review before merge | Auto-merge.yml needs an explicit exclusion for `instances/` and `docker-compose.yml` paths, independent of ALLOWED_PATHS. Research documents exact implementation. |
</phase_requirements>

## Architecture Patterns

### Current Auto-Merge Pipeline

The auto-merge pipeline has 4 steps, all in `.github/workflows/auto-merge.yml`:

1. **Gate:** Only runs on `job/*` branches targeting `main` (line 11: `if: startsWith(github.event.pull_request.head.ref, 'job/')`)
2. **Mergeable check:** Polls GitHub API up to 30 times (5 min) waiting for merge status
3. **AUTO_MERGE kill switch:** Checks `vars.AUTO_MERGE` -- if `"false"`, stops (line 41)
4. **ALLOWED_PATHS check:** Gets changed files via `gh pr diff --name-only`, checks each against comma-separated path prefixes in `vars.ALLOWED_PATHS` (default: `/logs`)

If all checks pass, the PR is squash-merged.

### Notification Pipeline Interaction

`notify-pr-complete.yml` triggers on `workflow_run` completion of "Auto-Merge ClawForge PR" (line 5). It:
1. Finds the PR number from the job branch
2. Checks actual merge state via `gh pr view --json mergedAt`
3. Sets `merge_result` to `"merged"` or `"not_merged"`
4. Sends payload to the event handler webhook

This means the notification pipeline already handles the "not_merged" case correctly. When auto-merge is blocked, the notification still fires with `merge_result: "not_merged"`, and the event handler's `summarizeJob()` will include this in the summary sent back to the operator's thread.

### PR Body Delivery Mechanism

Entrypoint.sh (lines 269-276):
```bash
PR_BODY="Automated job by ClawForge"
if [ -f /tmp/pr-body.md ]; then
    PR_BODY=$(cat /tmp/pr-body.md)
fi
gh pr create \
    --title "clawforge: job ${JOB_ID}" \
    --body "$PR_BODY" \
    --base main || true
```

Phase 15's `buildValidationChecklist()` already instructs the container agent to write `/tmp/pr-body.md` with a complete operator setup checklist including:
- Files created list
- Env var copy instructions
- Secret generation commands (`openssl rand -base64 32`)
- GitHub webhook setup
- Channel-specific setup (Slack app, Telegram bot)
- Docker compose build and up commands
- Health check verification

### The Exclusion Strategy

There are two approaches to blocking instance PRs:

**Option A: Add BLOCKED_PATHS to auto-merge.yml (Recommended)**

Add a new step before the ALLOWED_PATHS check that explicitly blocks PRs touching sensitive paths. This is defense-in-depth -- it works regardless of what ALLOWED_PATHS is set to.

```yaml
- name: Check for blocked paths
  if: steps.merge-check.outputs.mergeable == 'MERGEABLE' && steps.check-setting.outputs.enabled == 'true'
  id: check-blocked
  env:
    GH_TOKEN: ${{ github.token }}
  run: |
    PR_NUMBER="${{ github.event.pull_request.number }}"
    CHANGED_FILES=$(gh pr diff "$PR_NUMBER" --name-only --repo "${{ github.repository }}")

    # Instance scaffolding PRs must never auto-merge
    BLOCKED=false
    while IFS= read -r file; do
      [ -z "$file" ] && continue
      if [[ "$file" == instances/* ]] || [[ "$file" == "docker-compose.yml" ]]; then
        echo "BLOCKED (instance scaffolding): $file"
        BLOCKED=true
      fi
    done <<< "$CHANGED_FILES"

    echo "blocked=$BLOCKED" >> "$GITHUB_OUTPUT"
```

Then update the Merge PR step condition to include `&& steps.check-blocked.outputs.blocked != 'true'`.

**Option B: Rely on ALLOWED_PATHS alone**

If `ALLOWED_PATHS` is set to `/logs` (the default), instance PRs are already blocked because they touch `instances/` and `docker-compose.yml`. But this fails if someone sets `ALLOWED_PATHS=/` -- which is a documented valid configuration.

**Recommendation: Option A.** It is explicit, self-documenting, and cannot be accidentally bypassed by changing ALLOWED_PATHS. The cost is ~15 lines of workflow YAML.

### What About the PR Title?

The prior research (SUMMARY.md) mentions setting the PR title to `feat(instances): add {name} instance` so instance PRs are identifiable. Currently, entrypoint.sh hardcodes the PR title as `clawforge: job ${JOB_ID}` (line 273). Changing this would require either:

1. The container agent setting a custom title (possible via a file convention similar to `/tmp/pr-body.md`)
2. Modifying entrypoint.sh to accept a custom title

Since DELIV-01 and DELIV-02 do not require a custom PR title, and adding a new file convention adds complexity, this should be deferred. The blocked-paths mechanism in auto-merge.yml does not depend on PR title.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PR identification | Branch naming convention or PR labels | File path detection in auto-merge.yml | Already have `gh pr diff --name-only`; path-based detection is deterministic |
| Merge policy engine | Custom merge policy system | Simple blocked-paths check in existing workflow | Phase 31 (v1.7) plans a full merge policy engine; this phase just needs a targeted fix |
| PR body generation | New PR body rendering system | Existing `/tmp/pr-body.md` convention | Phase 15 already handles this; entrypoint.sh already reads it |

## Common Pitfalls

### Pitfall 1: ALLOWED_PATHS=/ Bypasses Instance Protection
**What goes wrong:** If a repo has `ALLOWED_PATHS=/` to allow all agent changes to auto-merge, instance scaffolding PRs also auto-merge without review.
**Why it happens:** ALLOWED_PATHS is a positive allow-list with no explicit deny-list.
**How to avoid:** Add an explicit blocked-paths check that runs before ALLOWED_PATHS and cannot be overridden by ALLOWED_PATHS configuration.
**Warning signs:** An instance PR shows as "Merged" in GitHub without any human review.

### Pitfall 2: Template Workflow Gets Out of Sync
**What goes wrong:** The auto-merge.yml in `templates/.github/workflows/` is a copy that gets scaffolded into user projects. If only `.github/workflows/auto-merge.yml` is updated, new projects won't have the instance exclusion.
**Why it happens:** Two copies of the same workflow file exist.
**How to avoid:** Update both files in the same commit. The files are currently identical.
**Warning signs:** `diff .github/workflows/auto-merge.yml templates/.github/workflows/auto-merge.yml` shows differences.

### Pitfall 3: Notification Shows "Merged" When It Wasn't
**What goes wrong:** The notification pipeline already handles `merge_result: "not_merged"` correctly, but the summarizeJob prompt may not clearly communicate that the PR requires manual review.
**Why it happens:** The job summary template was written for the auto-merge-or-fail case, not the "intentionally blocked from auto-merge" case.
**How to avoid:** Verify that `summarizeJob()` produces a clear message when `merge_result` is `"not_merged"`. The existing implementation should be fine -- it passes merge_result to the LLM which generates a summary.
**Warning signs:** Operator gets a notification saying the job "failed" when the PR was intentionally held for review.

### Pitfall 4: PR Body Too Long for gh CLI --body Flag
**What goes wrong:** If the PR body is very long, the `gh pr create --body "$PR_BODY"` command may fail due to shell argument length limits.
**Why it happens:** The operator setup checklist can be verbose, especially with many channels enabled.
**How to avoid:** Use `--body-file /tmp/pr-body.md` instead of `--body "$PR_BODY"`. This avoids shell argument length limits entirely.
**Warning signs:** PR creation fails with "Argument list too long" in the job container logs.

## Code Examples

### Blocked Paths Addition to auto-merge.yml

```yaml
# Source: derived from existing auto-merge.yml structure
# Insert after "Check AUTO_MERGE setting" step, before "Check ALLOWED_PATHS"

      - name: Check for blocked paths (instance scaffolding)
        if: steps.merge-check.outputs.mergeable == 'MERGEABLE' && steps.check-setting.outputs.enabled == 'true'
        id: check-blocked
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          PR_NUMBER="${{ github.event.pull_request.number }}"
          CHANGED_FILES=$(gh pr diff "$PR_NUMBER" --name-only --repo "${{ github.repository }}")

          # Instance scaffolding and docker-compose changes must never auto-merge
          BLOCKED=false
          while IFS= read -r file; do
            [ -z "$file" ] && continue
            if [[ "$file" == instances/* ]] || [[ "$file" == "docker-compose.yml" ]]; then
              echo "BLOCKED (instance scaffolding): $file"
              BLOCKED=true
            fi
          done <<< "$CHANGED_FILES"

          echo "blocked=$BLOCKED" >> "$GITHUB_OUTPUT"
```

Update the existing ALLOWED_PATHS check condition:
```yaml
      - name: Check ALLOWED_PATHS
        if: steps.merge-check.outputs.mergeable == 'MERGEABLE' && steps.check-setting.outputs.enabled == 'true' && steps.check-blocked.outputs.blocked != 'true'
```

Update the Merge PR step condition:
```yaml
      - name: Merge PR
        if: steps.merge-check.outputs.mergeable == 'MERGEABLE' && steps.check-setting.outputs.enabled == 'true' && steps.check-blocked.outputs.blocked != 'true' && steps.check-paths.outputs.allowed == 'true'
```

### Entrypoint PR Body-File Fix (Optional but Recommended)

```bash
# Replace lines 269-276 in entrypoint.sh with:
if [ -f /tmp/pr-body.md ]; then
    gh pr create \
        --title "clawforge: job ${JOB_ID}" \
        --body-file /tmp/pr-body.md \
        --base main || true
else
    gh pr create \
        --title "clawforge: job ${JOB_ID}" \
        --body "Automated job by ClawForge" \
        --base main || true
fi
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Rely on ALLOWED_PATHS to block instance PRs | Explicit blocked-paths check independent of ALLOWED_PATHS | Defense-in-depth; cannot be accidentally bypassed |
| `--body "$PR_BODY"` in entrypoint | `--body-file /tmp/pr-body.md` when available | Avoids shell argument length limits for long PR bodies |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | GitHub Actions workflow (YAML validation) + manual PR test |
| Config file | `.github/workflows/auto-merge.yml` |
| Quick run command | `diff .github/workflows/auto-merge.yml templates/.github/workflows/auto-merge.yml` (sync check) |
| Full suite command | `npm test` (existing suite, no regressions) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DELIV-01 | PR body includes operator setup checklist | unit | `node --test tests/test-instance-job.js` | Yes (Phase 15) |
| DELIV-02 | Instance PRs excluded from auto-merge | manual-only | Open a test PR touching `instances/` and verify auto-merge skips it | N/A -- workflow behavior |

### Sampling Rate
- **Per task commit:** `diff .github/workflows/auto-merge.yml templates/.github/workflows/auto-merge.yml` (files match)
- **Per wave merge:** `npm test`
- **Phase gate:** Manual verification that the workflow YAML is valid (no syntax errors)

### Wave 0 Gaps
None -- existing test infrastructure covers DELIV-01 via Phase 15 tests. DELIV-02 is a workflow file change that cannot be unit-tested but will be validated in Phase 17 (end-to-end).

## Open Questions

1. **Should entrypoint.sh switch to --body-file?**
   - What we know: `--body "$PR_BODY"` works today for typical PR bodies. The instance PR body checklist is ~20 lines, well within shell limits.
   - What's unclear: Whether edge cases (very long checklists, special characters) could cause issues.
   - Recommendation: Switch to `--body-file` as a defensive improvement in this phase. Low risk, small change, avoids a class of potential issues.

2. **Should docker-compose.yml be in the blocked list?**
   - What we know: Instance PRs modify docker-compose.yml. But other jobs might also legitimately modify docker-compose.yml.
   - What's unclear: Whether blocking all docker-compose.yml changes from auto-merge is too aggressive.
   - Recommendation: Include `docker-compose.yml` in the blocked list. Any docker-compose change is infrastructure-critical and warrants human review. Regular jobs should not be modifying docker-compose.yml.

## Sources

### Primary (HIGH confidence)
- `.github/workflows/auto-merge.yml` -- current auto-merge logic, ALLOWED_PATHS handling
- `templates/.github/workflows/auto-merge.yml` -- template copy (currently identical)
- `.github/workflows/notify-pr-complete.yml` -- notification pipeline, merge_result handling
- `templates/docker/job/entrypoint.sh` -- PR creation (lines 269-276), pr-body.md convention
- `lib/tools/instance-job.js` -- `buildValidationChecklist()` generates PR body with operator checklist
- `.planning/research/PITFALLS.md` -- auto-merge risk documented (lines 285, 353)
- `.planning/research/SUMMARY.md` -- Phase 4 deliverables (lines 103-107)

### Secondary (MEDIUM confidence)
- `docs/AUTO_MERGE.md` -- ALLOWED_PATHS documentation and examples
- `docs/SECURITY.md` -- auto-merge security guidance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; only workflow YAML changes
- Architecture: HIGH -- existing pipeline well-understood from direct code inspection
- Pitfalls: HIGH -- prior research (PITFALLS.md) already identified the key risk; confirmed against actual code

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable -- GitHub Actions workflow syntax unlikely to change)
