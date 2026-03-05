---
phase: 14-intake-flow
plan: 02
subsystem: ai
tags: [llm-instructions, intake-flow, human-verify, structural-validation]

# Dependency graph
requires:
  - phase: 14-intake-flow
    plan: 01
    provides: Instance Creation Intake section in EVENT_HANDLER.md
provides:
  - Intake instructions validated structurally — grouped turns, optional field suppression, approval gate, cancellation protocol confirmed present and well-formed
affects: [15-job-prompt]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/14-intake-flow/14-02-SUMMARY.md
  modified: []

key-decisions:
  - "Structural validation accepted in lieu of live behavioral test — operator deferred live testing; instructions verified by code review"
  - "Validation confirms: turn sequencing (lines 314-321), optional field suppression with NEVER emphasis (lines 309-312), approval gate with MANDATORY header (lines 334-355), cancellation protocol (lines 357-367)"
  - "Tool schema alignment verified: EVENT_HANDLER.md references `create_instance_job` matching tools.js registration"

requirements-completed: [INTAKE-02, INTAKE-03, INTAKE-04, INTAKE-05]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 14-02: Intake Verification Summary

**Structural validation of intake instructions — live behavioral test deferred by operator**

## Validation Method

Code review of `instances/noah/config/EVENT_HANDLER.md` (lines 291-367) confirming:

1. **Turn grouping (INTAKE-02):** Turn 1 explicitly asks name + purpose together. Turns 2-3 each ask one field group. Turn 4 is conditional. "Do NOT combine multiple question groups into one message" instruction prevents over-grouping.

2. **Optional field suppression (INTAKE-03):** Lines 309-312 use triple emphasis — "NEVER ask for them. NEVER mention them. NEVER prompt for them in any way." Fields are described as "invisible to the operator unless they bring them up first." This is the strongest possible LLM instruction phrasing.

3. **Approval gate (INTAKE-04):** Section header says "MANDATORY". Instructions require presenting summary even if operator says "yes" prematurely. Example summary format provided with exact field layout.

4. **Cancellation (INTAKE-05):** Four-step protocol: acknowledge, discard, confirm reset, treat next message as fresh. Explicit "Do NOT reference or use any configuration values from a cancelled intake" guard.

5. **Tool alignment:** EVENT_HANDLER.md references `create_instance_job` which matches the snake_case tool name registered in `lib/ai/tools.js` line 173. Schema fields (name, purpose, allowed_repos, enabled_channels, slack_user_ids, telegram_chat_id) match the Zod schema at lines 177-184.

## Risk Assessment

- Turn grouping and approval gate are high-confidence — LLM instructions are explicit and well-structured
- Optional field suppression uses maximum-strength language — low risk of LLM volunteering these questions
- Cancellation is the highest-risk behavior (LLM state management across turns) — will surface during Phase 17 end-to-end validation if issues exist

## Next Phase Readiness

Phase 14 complete. Ready for Phase 15: Job Prompt Completeness.

---
*Phase: 14-intake-flow*
*Completed: 2026-03-04 (structural validation)*
