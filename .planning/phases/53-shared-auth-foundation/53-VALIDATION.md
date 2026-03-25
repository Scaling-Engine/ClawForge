---
phase: 53
slug: shared-auth-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js assert + manual verification |
| **Config file** | none — no test framework in project |
| **Quick run command** | `node -e "require('./lib/db/hub.js')"` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build` + manual JWT decode check
- **Before `/gsd:verify-work`:** Full build must pass
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 1 | AUTH-02 | integration | `node -e "const {getHubDb}=require('./lib/db/hub.js'); const db=getHubDb(); console.log(db.pragma('table_info(hub_users)'))"` | ❌ W0 | ⬜ pending |
| 53-01-02 | 01 | 1 | AUTH-04 | config | `grep AUTH_SECRET docker-compose.yml` | ✅ | ⬜ pending |
| 53-01-03 | 01 | 1 | AUTH-05 | config | `grep -c 'ports:' docker-compose.yml` | ✅ | ⬜ pending |
| 53-02-01 | 02 | 1 | AUTH-01, AUTH-03 | integration | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/db/hub.js` — hub DB singleton + schema
- [ ] `lib/db/hub-schema.js` — Drizzle schema for hub_users + agent_assignments

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| JWT contains assignedAgents after login | AUTH-01, AUTH-03 | Requires active NextAuth session | Log in, decode JWT from cookie, verify assignedAgents array |
| Instance containers unreachable from internet | AUTH-05 | Requires Docker network inspection | Run `docker ps` and verify no host port bindings |
| Hub-issued JWT decodes on instance | AUTH-04 | Requires cross-container JWT validation | Decode hub JWT on instance using shared AUTH_SECRET |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
