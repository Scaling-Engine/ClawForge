# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.3 — Instance Generator

**Shipped:** 2026-03-06
**Phases:** 7 | **Plans:** 9

### What Was Built
- Conversational instance creation: multi-turn intake with grouped questions, approval gate, cancellation protocol
- `buildInstanceJobDescription()` generating all 7 instance artifacts with literal JS template substitution
- Auto-merge exclusion for instance PRs (blocked-paths defense layer)
- `--body-file` PR creation for robust long PR bodies
- `get_project_state` LangGraph tool for Layer 1 project awareness via GitHub Contents API
- E2E validation script verifying the full pipeline from conversation to PR artifacts

### What Worked
- **EVENT_HANDLER.md as behavior control**: Multi-turn intake flow implemented entirely via LLM instructions, zero code changes for conversational behavior
- **Gap closure phases (16.1, 17.1)**: Milestone audit caught real integration gaps (entrypoint sync, Layer 1 context), decimal phases fixed them cleanly
- **Template substitution in JS, not in prompt**: Container agents receive exact file content — no LLM interpretation of template syntax means reliable artifact generation

### What Was Inefficient
- **8 requirements lack formal VERIFICATION.md** for phases 14/15 — code works (E2E passed) but verification gap accumulated because phases were executed before the verification workflow was consistently applied
- **Audit came late** — running the milestone audit earlier would have caught the entrypoint sync gap sooner
- **Phase 17.2 scoped but not needed for v1.3** — Layer 2 context hydration was aspirational; should have been scoped to v1.4 from the start

### Patterns Established
- `--body-file` over inline `--body` for all PR creation (preserves markdown formatting)
- Blocked-paths check runs before ALLOWED_PATHS in auto-merge (defense in depth)
- `fetchRepoFile()` pattern for raw GitHub Contents API access (bypasses githubApi wrapper for text files)
- Literal template embedding for safety-critical sections (tool casing, REPOS.json schema)

### Key Lessons
1. **Run milestone audit mid-milestone, not at the end** — integration gaps are cheaper to fix when caught between phases
2. **VERIFICATION.md should be non-negotiable** — the E2E test covered it, but formal phase verification creates a paper trail that matters for confidence
3. **Scope aggressively** — Phase 17.2 should never have been in v1.3; context hydration for Layer 2 is a separate concern from instance generation

### Cost Observations
- Model mix: ~90% sonnet (executors/verifiers), ~10% opus (orchestration)
- Notable: Single-plan phases (13, 15, 16, 16.1, 17, 17.1) executed fastest — minimal wave coordination overhead

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 4 | 6 | Foundation — established GSD-in-Docker pattern |
| v1.1 | 4 | 7 | Pipeline hardening — smart prompts, prior context |
| v1.2 | 4 | 10 | Cross-repo — largest plan count, most complex wiring |
| v1.3 | 7 | 9 | Instance generator — first milestone with gap closure phases |

### Top Lessons (Verified Across Milestones)

1. **Template sync matters** — v1.1 established it, v1.3 proved it when entrypoint drift caused a real bug (DELIV-01)
2. **Imperative instructions > advisory** — v1.0 lesson, reinforced in v1.3 intake flow (MUST/NEVER language in EVENT_HANDLER.md)
3. **Audit early, fix early** — v1.3 lesson; milestone audit should run after the last feature phase, not after E2E
