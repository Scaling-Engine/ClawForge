# Requirements: ClawForge v1.4 Docker Engine Foundation

**Defined:** 2026-03-06
**Core Value:** Agents receive intelligently-constructed prompts with full repo context, so every job starts warm and produces high-quality results without operator intervention

## v1.4 Requirements

Requirements for Docker Engine Foundation milestone. Each maps to roadmap phases.

### Context Hydration

- [ ] **HYDR-01**: Job prompt includes STATE.md content (capped at 4K chars) from target repo
- [ ] **HYDR-02**: Job prompt includes ROADMAP.md content (capped at 6K chars) from target repo
- [ ] **HYDR-03**: Job prompt includes last 10 commits on main branch as recent git history
- [ ] **HYDR-04**: Context hydration is gated on GSD hint (quick = minimal, plan-phase = full hydration)
- [x] **HYDR-05**: AGENT_QUICK.md variant used for simple jobs, full AGENT.md for complex jobs

### Docker Engine API

- [ ] **DOCK-01**: Docker Engine API client connects via Unix socket and can ping/version-check the daemon
- [ ] **DOCK-02**: Event handler can create and start ephemeral job containers with env vars, network, and labels
- [ ] **DOCK-03**: Event handler waits for container exit and captures exit code
- [ ] **DOCK-04**: Container logs are retrievable after job completion
- [ ] **DOCK-05**: Containers are cleaned up (removed) after logs are captured
- [ ] **DOCK-06**: Job containers run on their instance's Docker network (noah-net, strategyES-net)
- [ ] **DOCK-07**: Container IDs tracked in DB for lifecycle management and zombie detection
- [ ] **DOCK-08**: Startup reconciliation detects and cleans orphaned containers on Event Handler restart
- [ ] **DOCK-09**: Container startup time (dispatch-to-execution) is measured and logged in preflight.md
- [ ] **DOCK-10**: Running containers can be inspected for stuck job detection

### Dispatch Routing

- [ ] **DISP-01**: REPOS.json supports `dispatch` field per repo ("docker" or "actions")
- [ ] **DISP-02**: `createJobTool` routes to Docker API or GitHub Actions based on repo dispatch config
- [ ] **DISP-03**: GitHub Actions dispatch path remains unchanged and fully functional
- [ ] **DISP-04**: Docker-dispatched jobs produce identical outputs (commits, PR, notifications) to Actions-dispatched
- [ ] **DISP-05**: Multiple Docker jobs can dispatch in parallel without interference

### Named Volumes

- [ ] **VOL-01**: Named volumes created per repo per instance with convention `clawforge-{instance}-{repo-slug}`
- [ ] **VOL-02**: Entrypoint detects warm start (existing `.git` in volume) and uses `git fetch` instead of `git clone`
- [ ] **VOL-03**: Volume hygiene step runs before each job (clean locks, reset to origin, clean working tree)
- [ ] **VOL-04**: Concurrent jobs on same repo don't corrupt shared volume state

## Future Requirements

Deferred to v1.5+. Tracked but not in current roadmap.

### Persistent Workspaces

- **WORK-01**: Interactive "devbox" containers with browser terminal
- **WORK-02**: WebSocket proxy for xterm.js integration

### MCP Integration

- **MCP-01**: Per-instance MCP server configs in job containers
- **MCP-02**: MCP server lifecycle management in entrypoint

### Resource Management

- **RES-01**: Container CPU/memory resource limits
- **RES-02**: Real-time log streaming to operator channels
- **RES-03**: Volume pre-warming at instance startup

## Out of Scope

| Feature | Reason |
|---------|--------|
| Interactive workspace containers | v1.5 scope -- separate lifecycle, auth model, frontend |
| MCP server integration in jobs | v1.6 scope -- own lifecycle management, new failure modes |
| Bind mounts instead of named volumes | Security concern, portability issues, widens attack surface |
| Auto-scaling / k8s / Swarm | Deliberate single-VPS Docker Compose architecture |
| Host filesystem mounts for GSD | PROJECT.md constraint -- skills baked into Docker image |
| Pre-CI quality gates in entrypoint | v1.7 scope -- entrypoint must stabilize first |
| Volume sharing between instances | Breaks network isolation model |
| Container resource limits | Not blocking at 2-instance scale |
| Dockerode vs raw HTTP | Resolved: use dockerode@^4.0.9 (battle-tested, stream demuxing) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HYDR-01 | Phase 18 | Pending |
| HYDR-02 | Phase 18 | Pending |
| HYDR-03 | Phase 18 | Pending |
| HYDR-04 | Phase 18 | Pending |
| HYDR-05 | Phase 18 | Complete |
| DOCK-01 | Phase 19 | Pending |
| DOCK-02 | Phase 19 | Pending |
| DOCK-03 | Phase 19 | Pending |
| DOCK-04 | Phase 19 | Pending |
| DOCK-05 | Phase 19 | Pending |
| DOCK-06 | Phase 19 | Pending |
| DOCK-07 | Phase 19 | Pending |
| DOCK-08 | Phase 19 | Pending |
| DOCK-09 | Phase 19 | Pending |
| DOCK-10 | Phase 19 | Pending |
| DISP-01 | Phase 19 | Pending |
| DISP-02 | Phase 19 | Pending |
| DISP-03 | Phase 19 | Pending |
| DISP-04 | Phase 19 | Pending |
| DISP-05 | Phase 19 | Pending |
| VOL-01 | Phase 20 | Pending |
| VOL-02 | Phase 20 | Pending |
| VOL-03 | Phase 20 | Pending |
| VOL-04 | Phase 20 | Pending |

**Coverage:**
- v1.4 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-03-06*
*Last updated: 2026-03-06 after roadmap creation*
