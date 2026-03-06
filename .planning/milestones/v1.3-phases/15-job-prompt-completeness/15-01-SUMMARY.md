---
phase: 15-job-prompt-completeness
plan: 01
subsystem: tools
tags: [instance-generator, job-prompt, template-system, scaffolding]

# Dependency graph
requires:
  - phase: 13-tool-infrastructure
    provides: createInstanceJobTool with Zod schema in lib/ai/tools.js
  - phase: 14-intake-flow
    provides: EVENT_HANDLER.md intake instructions that gather config before calling tool
provides:
  - buildInstanceJobDescription(config) produces comprehensive prompt with all 7 artifacts
  - Literal file templates with substitution values filled in JavaScript (not LLM-interpreted)
  - AGENT.md tools section with exact casing (Read,Write,Edit,Bash,Glob,Grep,Task,Skill)
  - Channel-conditional .env.example and EVENT_HANDLER.md content
  - docker-compose.yml Edit-based modification instructions
  - REPOS.json with ScalingEngine owner default
  - Validation checklist for container agent self-verification
affects: [16-pr-pipeline, phase-16, phase-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Template substitution in JavaScript, not in prompt — container agent receives exact file content"
    - "Literal template embedding for safety-critical sections (tool casing, REPOS.json schema)"

key-files:
  created:
    - lib/tools/instance-job.js
    - tests/test-instance-job.js
  modified:
    - lib/ai/tools.js

key-decisions:
  - "Fill template values in JS, not via LLM placeholder interpretation — eliminates ambiguity"
  - "Embed full EVENT_HANDLER.md template (~18KB) rather than skeleton — safest for boilerplate sections"
  - "Env prefix derived from name.toUpperCase().replace(/-/g, '_') — simple, deterministic"
  - "Use Edit tool instructions for docker-compose modifications — preserves comments"
  - "Scope restrictions added automatically when allowed_repos.length <= 2"
  - "SOUL.md persona name derived from capitalized instance name"
  - "Shell safety: explicit prohibition of $ and backtick characters in SOUL.md content"

patterns-established:
  - "Template-in-JS pattern: for safety-critical file generation, do substitution in code and embed final content in prompt"
  - "Scoped-by-default: instances with few repos get automatic scope restrictions in SOUL.md, AGENT.md, and EVENT_HANDLER.md"

requirements-completed: [SCAF-01, SCAF-02, SCAF-03, SCAF-04]

# Metrics
duration: 15min
completed: 2026-03-04
---

# Phase 15-01: Job Prompt Completeness Summary

**buildInstanceJobDescription() creates comprehensive 7-artifact prompt with literal templates, 14 unit tests passing**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-04
- **Completed:** 2026-03-04
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 1

## Accomplishments

- Created `lib/tools/instance-job.js` exporting `buildInstanceJobDescription(config)`
- Function produces prompt with 10 sections: config block, file manifest, 6 literal file templates, docker-compose Edit instructions, validation checklist
- All template values filled in JavaScript — container agent receives exact final file content
- AGENT.md tools section embedded verbatim with exact casing
- EVENT_HANDLER.md conditionally scopes to enabled channels only
- REPOS.json uses ScalingEngine owner default with slug-derived display names
- .env.example includes only channel-specific vars for enabled channels
- docker-compose instructions use targeted Edit insertions (not Write)
- SOUL.md prohibited from containing shell-unsafe characters
- Scope restrictions auto-generated for instances with limited repos
- Wired into createInstanceJobTool handler in tools.js, replacing Phase 13 stub
- 14 unit tests covering all requirements (tool casing, purpose-scoping, channel-conditional, repo scoping, shell safety, Edit instructions, env prefix)

## Files Created/Modified

- `lib/tools/instance-job.js` — 320 lines, buildInstanceJobDescription + 10 helper functions
- `tests/test-instance-job.js` — 14 tests covering all SCAF requirements
- `lib/ai/tools.js` — Added import, replaced stub description with buildInstanceJobDescription call

## Next Phase Readiness

Phase 15 complete. Ready for Phase 16: PR Pipeline and Auto-Merge Exclusion.

---
*Phase: 15-job-prompt-completeness*
*Completed: 2026-03-04*
