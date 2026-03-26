# Phase 59: Cross-Agent Aggregate Views + Quick Launch - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Mode:** Smart discuss (grey areas presented, all accepted)

<domain>
## Phase Boundary

Multi-agent users see aggregate views of PRs, workspaces, and sub-agents across all their assigned agents. Quick launch lets users dispatch a job from the agent picker without entering an agent first.

</domain>

<decisions>
## Implementation Decisions

### D-01: Aggregate Route Structure
`/agents/all/pull-requests`, `/agents/all/workspaces`, `/agents/all/clusters` — under `/agents/` namespace. Sidebar shows "All Agents" nav section when on these routes. Not under `/agent/[slug]/`.

### D-02: Cross-Agent Data Fetching
`Promise.allSettled()` calling each spoke's API via HTTP proxy (`/agent/[slug]/api/...`). Failed/offline agents show stale indicator. Client-side aggregation — no server-side merge.

### D-03: Offline Agent Display
Show last-fetched data with yellow "Stale" badge + timestamp. If never fetched, show "Offline" row. Don't block the whole table for one offline agent.

### D-04: Quick Launch from Picker
Each agent card gets a small "New Job" button. Clicking opens a minimal modal: text input + "Launch" button. Creates job via `/agent/[slug]/api/jobs` POST targeting that agent. Redirects to `/agent/[slug]/chat` after dispatch.

### D-05: Quick Launch Scope
Per-card scoping only — no global agent selector. Each button is already scoped to that card's agent. Global command palette deferred to future work.

### Claude's Discretion
Implementation details for aggregate components, data fetching hooks, modal component, and job dispatch. Follow existing codebase patterns (PullRequestsPage for PR table, SwarmPage for clusters list).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/chat/components/pull-requests-page.js` — PR list component (needs agent column for aggregate)
- `lib/chat/components/swarm-page.js` — Clusters/sub-agents list
- `lib/chat/components/agent-picker-page.jsx` — Picker page (add quick launch button)
- `lib/proxy/http-proxy.js` — HTTP proxy for cross-agent API calls
- `lib/tools/create-job.js` — Job dispatch logic

### Key Patterns
- `queryAllInstances()` for health/status across agents
- `getUserAgentAssignments()` for user's assigned agents
- Existing table components with column patterns

</code_context>
