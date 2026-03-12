---
phase: 28-multi-agent-clusters
verified: 2026-03-12T23:15:00Z
status: passed
score: 5/5 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "Operator defines a cluster in CLUSTER.json with named roles, role-specific system prompts, allowed tools, and MCP server assignments; the cluster runs end-to-end without additional config"
    - "Each agent in a cluster run operates in its own Docker container with its own isolated volume; no two concurrent agents share a named volume"
  gaps_remaining: []
  regressions: []
must_haves:
  truths:
    - "Operator defines a cluster in CLUSTER.json with named roles, role-specific system prompts, allowed tools, and MCP server assignments; the cluster runs end-to-end without additional config"
    - "Operator launches a cluster run by saying 'run the review cluster on repo X' and receives a single Slack thread with per-agent status updates as replies"
    - "Each agent in a cluster run operates in its own Docker container with its own isolated volume; no two concurrent agents share a named volume"
    - "A cluster that would loop infinitely terminates automatically after hitting the hard cap (5 iterations per agent, 15 per run) with a notification identifying the cycle"
    - "Cluster run history, per-agent status, labels emitted, and PR URLs are visible on the /clusters management page"
  artifacts:
    - path: "lib/cluster/config.js"
      provides: "CLST-01 config schema loading and validation"
    - path: "lib/cluster/volume.js"
      provides: "CLST-10 volume naming and isolation"
    - path: "lib/cluster/coordinator.js"
      provides: "CLST-02,04,09 dispatch loop, label routing, safety limits"
    - path: "lib/cluster/index.js"
      provides: "CLST-12 Slack thread orchestration entry point"
    - path: "lib/db/cluster-runs.js"
      provides: "CLST-05 DB tracking"
    - path: "lib/db/schema.js"
      provides: "cluster_runs and cluster_agent_runs tables"
    - path: "lib/ai/tools.js"
      provides: "CLST-06 createClusterJobTool"
    - path: "lib/actions.js"
      provides: "CLST-07 cluster action type"
    - path: "templates/docker/cluster-agent/entrypoint.sh"
      provides: "CLST-02,03,11 cluster agent Docker entrypoint"
    - path: "lib/chat/components/clusters-page.jsx"
      provides: "CLST-08 /clusters management page"
    - path: "lib/chat/actions.js"
      provides: "getClusterConfig, getClusterRuns, getClusterRunDetail server actions"
    - path: "templates/app/clusters/page.js"
      provides: "/clusters route"
  key_links:
    - from: "lib/cluster/index.js"
      to: "lib/cluster/config.js"
      via: "getCluster() call"
    - from: "lib/cluster/coordinator.js"
      to: "lib/tools/docker.js"
      via: "dispatchDockerJob() with _clusterEnv and _clusterVolume"
    - from: "lib/ai/tools.js"
      to: "lib/cluster/index.js"
      via: "dynamic import and runCluster() call"
    - from: "lib/chat/components/clusters-page.jsx"
      to: "lib/chat/actions.js"
      via: "getClusterConfig, getClusterRuns, getClusterRunDetail imports"
human_verification:
  - test: "End-to-end cluster execution: define a 2-role cluster in CLUSTER.json, say 'run the test cluster on repo X' in chat"
    expected: "Two containers spin up sequentially, each with role-specific prompts and tools; outbox from agent 1 appears in agent 2 inbox; single Slack thread shows per-agent status"
    why_human: "Requires live Docker daemon, Slack workspace, and actual Claude Code execution"
  - test: "Navigate to /clusters in browser after running at least one cluster"
    expected: "Cluster definitions section shows configured clusters with expandable roles; Run History section shows runs with expandable agent detail rows showing status badges, labels, exit codes, PR links"
    why_human: "Visual rendering, component layout, and data display need visual confirmation"
  - test: "Define a cluster with circular transitions (A->B->A), run it"
    expected: "Run terminates after hitting limits, Slack thread receives failure message identifying the cycle key"
    why_human: "Requires live Docker and Slack to confirm notification delivery and content"
---

# Phase 28: Multi-Agent Clusters Verification Report

**Phase Goal:** Operators can define and launch multi-agent pipelines where sequential agents with distinct roles collaborate via shared volume inbox/outbox, with hard safety limits preventing runaway cost
**Verified:** 2026-03-12T23:15:00Z
**Status:** passed
**Re-verification:** Yes -- after gap closure (commit f0e8a5f)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator defines a cluster in CLUSTER.json and it runs end-to-end | VERIFIED | index.js:44 now has `await getCluster(clusterName)` so the resolved cluster definition is passed to the coordinator; dispatchDockerJob() lines 122-127 merge `_clusterEnv` (ROLE_NAME, ROLE_SYSTEM_PROMPT_B64, ALLOWED_TOOLS, INBOX_DIR, OUTBOX_DIR, CLUSTER_RUN_ID) into container Env array; coordinator.js:193-206 passes both `_clusterEnv` and `_clusterVolume` to dispatchDockerJob |
| 2 | Operator launches cluster from conversation; single Slack thread with per-agent replies | VERIFIED | createClusterJobTool in tools.js:695-748 extracts channelId/threadTs; runCluster() in index.js posts parent message and passes slackClient to coordinator; coordinator posts thread replies per agent completion (coordinator.js:326-337) |
| 3 | Each agent in cluster run operates in its own container with isolated volume | VERIFIED | clusterVolumeNameFor() produces unique names per run+agent; dispatchDockerJob() lines 131-140 mount `_clusterVolume` with Source/Target from coordinator; each agent gets its own named volume at /workspace plus the shared repo-cache at /repo-cache |
| 4 | Infinite loop cluster terminates after hitting hard caps with notification | VERIFIED | AGENT_LIMIT=5, RUN_LIMIT=15 enforced in coordinator.js:256-268 via checkCycleLimit(); run status updated to failed with failReason |
| 5 | Cluster run history, per-agent status, labels, PRs visible on /clusters page | VERIFIED | ClustersPage component (375 lines) loads config and runs via server actions; RunRow expands to show AgentRunRow with status, label, exitCode, prUrl; route wired at templates/app/clusters/page.js; sidebar links to /clusters |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/cluster/config.js` | Config loading + validation | VERIFIED | loadClusterConfig, getCluster, validateClusterConfig -- all tested |
| `lib/cluster/volume.js` | Volume naming + isolation | VERIFIED | clusterVolumeNameFor, ensureClusterVolume, copyOutboxToInbox |
| `lib/cluster/coordinator.js` | Dispatch loop + routing + safety | VERIFIED | resolveNextRole, checkCycleLimit, runClusterLoop, dispatchClusterAgent -- passes _clusterEnv and _clusterVolume correctly |
| `lib/cluster/index.js` | Orchestration entry point | VERIFIED | runCluster() with `await getCluster()` on line 44; Slack thread logic correct |
| `lib/db/cluster-runs.js` | DB CRUD operations | VERIFIED | createClusterRun, updateClusterRun, createAgentRun, updateAgentRun, getClusterRuns, getClusterRunDetail |
| `lib/db/schema.js` | cluster_runs + cluster_agent_runs tables | VERIFIED | Tables defined with correct columns; migration 0006_cluster_tables.sql exists |
| `lib/ai/tools.js` | createClusterJobTool | VERIFIED | Tool defined (lines 695-748), exported, imported and wired into agent.js tools array |
| `lib/actions.js` | cluster action type | VERIFIED | type=cluster handled (lines 37-49), fire-and-forget pattern |
| `templates/docker/cluster-agent/entrypoint.sh` | Cluster agent entrypoint | VERIFIED | Decodes ROLE_SYSTEM_PROMPT_B64, creates inbox/outbox/reports dirs, requires ALLOWED_TOOLS |
| `lib/chat/components/clusters-page.jsx` | /clusters management page | VERIFIED | 375-line substantive component with ClusterDefinitions, RunHistory, expandable RunRow/AgentRunRow |
| `lib/chat/actions.js` | Server actions for clusters | VERIFIED | getClusterConfig, getClusterRuns, getClusterRunDetail -- all auth-gated |
| `templates/app/clusters/page.js` | /clusters route | VERIFIED | Server component with auth(), renders ClustersPage |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| lib/cluster/index.js | lib/cluster/config.js | getCluster() | WIRED | Line 44: `const cluster = await getCluster(clusterName)` -- properly awaited, resolved object passed to coordinator |
| lib/cluster/coordinator.js | lib/tools/docker.js | dispatchDockerJob() with _clusterEnv/_clusterVolume | WIRED | coordinator.js:193-206 passes both options; docker.js:122-127 merges _clusterEnv into Env array; docker.js:131-140 mounts _clusterVolume |
| lib/ai/tools.js | lib/cluster/index.js | dynamic import + runCluster() | WIRED | tools.js:714 imports cluster/index.js and calls runCluster with correct args |
| lib/ai/agent.js | lib/ai/tools.js | createClusterJobTool import | WIRED | agent.js imports and includes createClusterJobTool in tools array |
| lib/chat/components/clusters-page.jsx | lib/chat/actions.js | getClusterConfig, getClusterRuns, getClusterRunDetail | WIRED | All three imported and called in useEffect + handleExpand |
| lib/chat/components/app-sidebar.jsx | /clusters | navigation link | WIRED | Sidebar has /clusters link with ClusterIcon |
| lib/actions.js | lib/cluster/index.js | dynamic import + runCluster() | WIRED | actions.js:40 imports cluster/index.js and calls runCluster |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CLST-01 | 28-01 | Cluster config schema via CLUSTER.json | SATISFIED | config.js with loadClusterConfig, getCluster, validateClusterConfig |
| CLST-02 | 28-02, 28-03 | Sequential agent dispatch in Docker | SATISFIED | Coordinator loop dispatches via dispatchDockerJob with cluster env vars and volume now properly handled |
| CLST-03 | 28-02 | Agents communicate via shared volume inbox/outbox | SATISFIED | copyOutboxToInbox implemented; _clusterVolume mounted to /workspace in each container |
| CLST-04 | 28-03 | Label-based state machine routing | SATISFIED | resolveNextRole with transitions map |
| CLST-05 | 28-01 | DB tracking of cluster runs | SATISFIED | Full CRUD in cluster-runs.js, migration exists |
| CLST-06 | 28-04 | LangGraph tool for cluster dispatch | SATISFIED | createClusterJobTool wired into agent tools array |
| CLST-07 | 28-04 | executeAction cluster type | SATISFIED | type=cluster in actions.js, fire-and-forget |
| CLST-08 | 28-05 | /clusters management page | SATISFIED | Substantive React component with definitions, run history, agent detail |
| CLST-09 | 28-03 | Hard iteration limits + cycle detection | SATISFIED | AGENT_LIMIT=5, RUN_LIMIT=15, checkCycleLimit with cycle key |
| CLST-10 | 28-01 | Per-agent Docker volume isolation | SATISFIED | clusterVolumeNameFor produces unique names; dispatchDockerJob mounts _clusterVolume |
| CLST-11 | 28-02 | --allowedTools whitelist, no --dangerously-skip-permissions | SATISFIED | entrypoint.sh requires ALLOWED_TOOLS, exits on empty |
| CLST-12 | 28-03 | Single Slack thread per run with reply updates | SATISFIED | index.js posts parent message, coordinator posts thread replies per agent |

### Anti-Patterns Found

None. Previous blockers resolved:
- `lib/cluster/index.js:44` -- `await` added before `getCluster()` call
- `lib/tools/docker.js:122-140` -- `_clusterEnv` and `_clusterVolume` handling added

### Human Verification Required

### 1. End-to-end cluster execution

**Test:** Define a 2-role cluster in CLUSTER.json, say "run the test cluster on repo X" in chat
**Expected:** Two containers spin up sequentially, each with role-specific prompts and tools; outbox from agent 1 appears in agent 2 inbox; single Slack thread shows per-agent status
**Why human:** Requires live Docker daemon, Slack workspace, and actual Claude Code execution

### 2. /clusters page rendering

**Test:** Navigate to /clusters in browser after running at least one cluster
**Expected:** Cluster definitions section shows configured clusters with expandable roles; Run History section shows runs with expandable agent detail rows showing status badges, labels, exit codes, PR links
**Why human:** Visual rendering, component layout, and data display need visual confirmation

### 3. Cycle termination notification

**Test:** Define a cluster with circular transitions (A->B->A), run it
**Expected:** Run terminates after hitting limits, Slack thread receives failure message identifying the cycle key
**Why human:** Requires live Docker and Slack to confirm notification delivery and content

## Re-verification Summary

Both gaps from the initial verification have been closed:

1. **Missing await in index.js:44** -- Fixed. `getCluster()` is now properly awaited, so the resolved cluster definition object (not a Promise) is passed to the coordinator. The `!cluster` guard on line 45 will correctly trigger for unknown cluster names.

2. **dispatchDockerJob() ignoring cluster options** -- Fixed. `docker.js` now handles `_clusterEnv` (lines 122-127) by iterating the env object and pushing each key-value pair into the container Env array. It handles `_clusterVolume` (lines 131-140) by ensuring the volume exists and adding it to the Mounts array with the specified Source and Target. The repo-cache volume is always added alongside, so cluster agents get both their isolated workspace volume at /workspace and the shared repo-cache at /repo-cache.

No regressions detected in previously-passing truths (2, 4, 5). All key links remain wired. All 12 CLST requirements are now satisfied.

---

_Verified: 2026-03-12T23:15:00Z_
_Verifier: Claude (gsd-verifier)_
