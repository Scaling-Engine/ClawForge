---
phase: 27
slug: mcp-tool-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — ClawForge has no test framework |
| **Config file** | none |
| **Quick run command** | N/A |
| **Full suite command** | N/A |
| **Estimated runtime** | N/A |

---

## Sampling Rate

- **After every task commit:** Code review of MCP config resolution logic
- **After every plan wave:** Verify docker dispatch env vars contain MCP_CONFIG_JSON
- **Before `/gsd:verify-work`:** Manual integration test with a real MCP server
- **Max feedback latency:** N/A (no automated tests)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | MCP-01 | code review | N/A | N/A | ⬜ pending |
| 27-01-02 | 01 | 1 | MCP-02 | code review | N/A | N/A | ⬜ pending |
| 27-01-03 | 01 | 1 | MCP-05 | code review | N/A | N/A | ⬜ pending |
| 27-01-04 | 01 | 1 | MCP-09 | code review | N/A | N/A | ⬜ pending |
| 27-02-01 | 02 | 2 | MCP-03 | manual integration | inspect container logs | N/A | ⬜ pending |
| 27-02-02 | 02 | 2 | MCP-04 | manual integration | check workspace env vars | N/A | ⬜ pending |
| 27-02-03 | 02 | 2 | MCP-06 | manual integration | point to bad MCP server | N/A | ⬜ pending |
| 27-02-04 | 02 | 2 | MCP-08 | manual integration | check job.md hydration | N/A | ⬜ pending |
| 27-03-01 | 03 | 2 | MCP-07 | manual | navigate to /settings/mcp | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No test framework to install — all verifications are manual integration or code review.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP_SERVERS.json parsed and loaded | MCP-01 | No test framework | Add server to JSON, verify loadMcpServers() returns it |
| Template vars resolved | MCP-02 | Env var dependency | Set AGENT_LLM_* env var, call buildMcpConfig(), check resolved JSON |
| --mcp-config passed to claude | MCP-03 | Requires Docker container | Run job, inspect container startup logs for --mcp-config flag |
| Workspace gets same MCP config | MCP-04 | Requires Docker container | Start workspace, check MCP_CONFIG_JSON env var matches job |
| Tool subset in allowedTools | MCP-05 | Requires Docker container | Check claude invocation includes mcp__name__tool entries |
| Health check logs failure | MCP-06 | Requires invalid MCP server | Configure bad server, run job, check mcp_startup log |
| Settings page renders servers | MCP-07 | Requires browser | Navigate to /settings/mcp, verify server list |
| Hydration prepends to prompt | MCP-08 | Requires MCP server | Configure hydrateTools, run job, check prompt in logs |
| Credentials not in git/UI | MCP-09 | Security review | grep for literal secrets, check settings page redaction |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < N/A
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
