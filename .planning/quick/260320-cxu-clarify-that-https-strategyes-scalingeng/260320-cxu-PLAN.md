---
phase: quick
plan: 260320-cxu
type: execute
wave: 1
depends_on: []
files_modified:
  - CLAUDE.md
  - docs/DEPLOYMENT.md
  - docs/OPERATOR_GUIDE.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "CLAUDE.md Instances table explicitly maps strategyes.scalingengine.com to Epic"
    - "docs/DEPLOYMENT.md includes a domain-to-instance mapping reference"
    - "Operator guide Epic section includes the live URL"
  artifacts:
    - path: "CLAUDE.md"
      provides: "Instance table with URL + agent name columns"
      contains: "strategyes.scalingengine.com"
    - path: "docs/DEPLOYMENT.md"
      provides: "Domain mapping section"
      contains: "strategyes.scalingengine.com"
    - path: "docs/OPERATOR_GUIDE.md"
      provides: "Epic instance section with live URL"
      contains: "strategyes.scalingengine.com"
  key_links: []
---

<objective>
Update documentation to explicitly connect https://strategyes.scalingengine.com to the Epic agent instance.

Purpose: The codebase already has the correct runtime behavior (page title reads "Epic" from SOUL.md, sidebar/header/greeting show "Epic", Traefik routes SES_APP_HOSTNAME to the strategyES container), but docs don't clearly state "this URL = Epic". Someone reading CLAUDE.md or deployment docs should immediately understand the URL-to-instance-to-agent mapping.

Output: Updated CLAUDE.md, DEPLOYMENT.md, and OPERATOR_GUIDE.md with explicit URL and agent name references.
</objective>

<execution_context>
@/Users/nwessel/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nwessel/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@docs/DEPLOYMENT.md
@docs/OPERATOR_GUIDE.md
@docs/ARCHITECTURE.md
@docker-compose.yml
@instances/strategyES/config/SOUL.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update CLAUDE.md Instances table with URLs and agent names</name>
  <files>CLAUDE.md</files>
  <action>
In CLAUDE.md, find the `## Instances` table (currently has Instance, Channels, Restriction columns). Expand it to include URL and Agent Name columns:

```
| Instance | Agent Name | URL | Channels | Restriction |
|----------|------------|-----|----------|-------------|
| noah | Archie | clawforge.scalingengine.com | Slack, Telegram, Web Chat | Noah's user ID |
| strategyES | Epic | strategyes.scalingengine.com | Slack, Web Chat | Jim's user ID, specific channels |
```

Note: Verify noah's agent name by reading `instances/noah/config/SOUL.md` first line. The strategyES Channels column should include "Web Chat" since the web interface is served at that URL (currently says "Slack only" which is outdated — the web chat is live at strategyes.scalingengine.com).

Also add a brief note below the table:
```
Agent names are read from `instances/{name}/config/SOUL.md` at runtime. The browser tab title, sidebar, chat header, and greeting all display the agent name dynamically.
```
  </action>
  <verify>
    <automated>grep -q "strategyes.scalingengine.com" CLAUDE.md && grep -q "Epic" CLAUDE.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>CLAUDE.md Instances table includes URL and agent name columns, strategyes.scalingengine.com explicitly mapped to Epic</done>
</task>

<task type="auto">
  <name>Task 2: Add domain mapping reference to DEPLOYMENT.md and update OPERATOR_GUIDE.md Epic section</name>
  <files>docs/DEPLOYMENT.md, docs/OPERATOR_GUIDE.md</files>
  <action>
**docs/DEPLOYMENT.md:** After the existing DNS A record section (around line 65), add a subsection:

```markdown
### Live Instance Domains

| Domain | Instance | Agent Name | Env Var |
|--------|----------|------------|---------|
| clawforge.scalingengine.com | noah | Archie | NOAH_APP_HOSTNAME |
| strategyes.scalingengine.com | strategyES | Epic | SES_APP_HOSTNAME |

Each domain is routed by Traefik via `Host()` rules in `docker-compose.yml`. The hostname env vars (e.g., `SES_APP_HOSTNAME`) are set in `.env` on the VPS.
```

**docs/OPERATOR_GUIDE.md:** Find the "### Epic (strategyES)" section (around line 703). Add the live URL to it:

After the existing content, ensure this line is present:
```
- **URL:** https://strategyes.scalingengine.com
```

Also update the `epic.domain.com` placeholder at line ~498 to use the real domain `strategyes.scalingengine.com` instead.
  </action>
  <verify>
    <automated>grep -q "strategyes.scalingengine.com" docs/DEPLOYMENT.md && grep -q "strategyes.scalingengine.com" docs/OPERATOR_GUIDE.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>DEPLOYMENT.md has domain mapping table, OPERATOR_GUIDE.md Epic section has live URL, placeholder domain replaced with real one</done>
</task>

</tasks>

<verification>
- `grep -r "strategyes.scalingengine.com" CLAUDE.md docs/` returns hits in all three docs
- `grep "Epic" CLAUDE.md` shows Epic in Instances table
- Build still passes: `npm run build`
</verification>

<success_criteria>
- Any developer reading CLAUDE.md immediately sees that strategyes.scalingengine.com = Epic
- Deployment and operator docs reference the real live URL, not placeholders
- No code changes needed — runtime already correctly shows "Epic" in browser tab, sidebar, header, and greeting via SOUL.md dynamic reading
</success_criteria>

<output>
After completion, create `.planning/quick/260320-cxu-clarify-that-https-strategyes-scalingeng/260320-cxu-SUMMARY.md`
</output>
