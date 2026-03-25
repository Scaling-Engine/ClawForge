---
phase: 55-http-proxy-layer
verified: 2026-03-25T14:00:00Z
status: gaps_found
score: 3/4 truths verified
gaps:
  - truth: "SSE job log streams (/api/jobs/[id]/stream) proxy correctly — browser receives incremental events without buffering gaps"
    status: partial
    reason: "The SSE implementation (x-accel-buffering, manual write/flush) is correct, but the proxy uses server.on('request') which registers AFTER the createServer() callback. This means Next.js handle() fires first. The proxy wins the race only because Next.js takes ~10-50ms to render a 404, while local Docker network round-trip is ~0.2-0.5ms. This is a non-deterministic race condition: if spoke containers are cold-starting or under load, Next.js 404 could win and the SSE stream would never proxy. Use server.prependListener('request', ...) instead of server.on('request', ...) to guarantee ordering."
    artifacts:
      - path: "lib/proxy/http-proxy.js"
        issue: "server.on('request') registers proxy AFTER Next.js listener; relies on timing not guaranteed ordering"
      - path: "lib/ws/server.js"
        issue: "Comment says 'fires before Next.js handles requests' — this is incorrect; listener order is createServer callback first, then server.on() listeners"
    missing:
      - "Change server.on('request', ...) to server.prependListener('request', ...) in attachHttpProxy() to guarantee proxy intercepts before Next.js"
      - "Or: add a /agent/[slug] catch-all route in templates/app/ so Next.js defers gracefully"
---

# Phase 55: HTTP Proxy Layer Verification Report

**Phase Goal:** The hub can forward any REST API call to any spoke instance — and spoke instances accept hub Bearer tokens on all API routes
**Verified:** 2026-03-25T14:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A spoke instance's /api/* routes accept a valid AGENT_SUPERADMIN_TOKEN Bearer token as authentication | VERIFIED | `checkAuth()` in `api/index.js:102-132` implements Bearer-first auth with `timingSafeEqual`; falls through to x-api-key if Bearer is absent or invalid |
| 2 | Slack, Telegram, and GitHub webhook routes keep their existing auth regardless of Bearer presence | VERIFIED | `PUBLIC_ROUTES` array on line 79 unchanged; webhook routes bypass all auth including Bearer check |
| 3 | A browser request to /agent/archie/api/jobs on the hub returns the same response as calling the archie instance's /api/jobs directly | VERIFIED | `lib/proxy/http-proxy.js` resolves slug from SUPERADMIN_INSTANCES, strips `/agent/[slug]` prefix, forwards to `[instance.url][spokePath]` with Bearer token; path translation verified correct |
| 4 | SSE job log streams (/api/jobs/[id]/stream) proxy correctly — browser receives incremental events without buffering gaps | PARTIAL | SSE detection (content-type check) and manual write/flush are correctly implemented; however proxy listener is registered AFTER Next.js handle() which creates a non-deterministic race condition (see Gaps) |

**Score:** 3/4 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `api/index.js` | Bearer token acceptance on all /api/* routes (additive alongside x-api-key) | VERIFIED | Lines 105-118 add Bearer block inside `checkAuth()`. `timingSafeEqual` already imported from `crypto`. `AGENT_SUPERADMIN_TOKEN` compared via timing-safe method. |
| `lib/proxy/http-proxy.js` | HTTP proxy function that resolves slug to instance URL and pipes request | VERIFIED | 169 lines. Exports `attachHttpProxy`. Contains `resolveInstance()`, `forwardRequest()`, SSE flush logic, hop-by-hop header stripping, Bearer injection. No npm package imports — only Node.js builtins. |
| `lib/ws/server.js` | Custom HTTP server with proxy handler registered for /agent/[slug]/* paths | VERIFIED | Line 8 imports `attachHttpProxy`. Line 29 calls `attachHttpProxy(server, handle)` — BEFORE `attachCodeProxy(server)` on line 33. WebSocket upgrade handler and code proxy untouched. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `api/index.js checkAuth()` | `AGENT_SUPERADMIN_TOKEN` | Inline Bearer check using `timingSafeEqual` | VERIFIED | Lines 107-117. Does NOT import from `api/superadmin.js` — instead re-implements the pattern inline. Functionally identical to `verifySuperadminToken()`. |
| `lib/ws/server.js createServer callback` | `lib/proxy/http-proxy.js attachHttpProxy()` | import and call in HTTP request handler | VERIFIED | Import on line 8; call on line 29 |
| `lib/proxy/http-proxy.js` | `SUPERADMIN_INSTANCES env var` | Direct `process.env.SUPERADMIN_INSTANCES` read in `resolveInstance()` | PARTIAL | Plan specified using `getInstanceRegistry()` from `lib/superadmin/config.js`, but implementation inlines the parse logic directly. Functionally equivalent for proxy use case (skips local instance with `url: null` correctly by checking `i.url` before matching). No functional gap, but bypasses the shared utility. |
| `lib/proxy/http-proxy.js` | `AGENT_SUPERADMIN_TOKEN` | `Authorization: Bearer ${token}` header on forwarded request | VERIFIED | Line 79: `forwardedHeaders['authorization'] = \`Bearer ${token}\`` |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces infrastructure/middleware (proxy layer, auth middleware), not components that render dynamic data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `api/index.js` contains Bearer check | `node` check on source | All 5 checks pass | PASS |
| `lib/proxy/http-proxy.js` exports and structure | `node` check on source | All 11 checks pass | PASS |
| `lib/ws/server.js` wiring | `node` check on source | All 6 checks pass (ordering confirmed) | PASS |
| Build passes | `npm run build` | Build succeeds, 0 errors | PASS |
| Commits exist in git history | `git log 2fb0b30 65bd3c1 4e29649` | All 3 commits found | PASS |
| Path translation for /agent/archie/api/jobs | `node` regex test | spokePath = `/api/jobs` (correct) | PASS |
| SSE path translation for /agent/archie/api/jobs/id/stream | `node` regex test | spokePath = `/api/jobs/id/stream` (correct) | PASS |
| Race condition: proxy vs Next.js for async upstream | `node` simulation with 1ms delay | Proxy loses when upstream has any latency | WARN |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PROXY-01 | 55-02-PLAN.md | HTTP requests to `/agent/[slug]/*` are proxied to correct instance container with hub auth token | SATISFIED | `lib/proxy/http-proxy.js` implements slug resolution from `SUPERADMIN_INSTANCES`, path stripping, and Bearer injection. Called from `lib/ws/server.js`. |
| PROXY-02 | 55-02-PLAN.md | Browser URL stays on clawforge.scalingengine.com — no redirects to instance subdomains | SATISFIED | Proxy is server-side pipe — browser issues request to hub, hub forwards transparently. No redirects issued. |
| PROXY-04 | 55-02-PLAN.md | SSE streams for job log streaming work through proxy layer | PARTIAL | SSE detection (`content-type: text/event-stream`) and `x-accel-buffering: no` + manual `write()/flush()` per chunk are correctly implemented. Race condition with Next.js listener ordering is a latent bug that would manifest if spoke containers are under load (see Gaps). |
| PROXY-05 | 55-01-PLAN.md | Spoke instances accept hub Bearer token on all API routes (not just /api/superadmin/*) | SATISFIED | `checkAuth()` in `api/index.js` accepts `AGENT_SUPERADMIN_TOKEN` Bearer on all non-PUBLIC_ROUTES. Timing-safe comparison. Falls through to x-api-key if Bearer is absent or invalid — zero regression. |

All 4 requirements claimed by this phase are accounted for. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/proxy/http-proxy.js` | 131-139 | Comment states "listener fires BEFORE Next.js handles requests" — this is architecturally incorrect | Warning | Misleading documentation; `server.on()` registers AFTER `createServer()` callback. Proxy wins the race through async timing, not listener ordering. |
| `lib/proxy/http-proxy.js` | 141 | `server.on('request', ...)` used instead of `server.prependListener('request', ...)` | Warning | Non-deterministic ordering for proxied routes. Works in practice (Docker network faster than Next.js 404 render), but not guaranteed under load. |

### Human Verification Required

#### 1. SSE Stream End-to-End Under Load

**Test:** Start a job and view its log stream via `/agent/[slug]/api/jobs/[id]/stream` on the hub. Simultaneously put the spoke under moderate load (e.g., multiple concurrent jobs).
**Expected:** Log events stream in real-time with no gaps or 404 interruptions.
**Why human:** The race condition between proxy and Next.js depends on actual Docker network latency vs Next.js route resolution time. Cannot verify deterministically via code inspection.

#### 2. Hub Activation Guard

**Test:** Deploy a spoke instance (without `SUPERADMIN_HUB=true`) and send a request to `/agent/archie/api/jobs`. Confirm the request reaches Next.js normally (not proxied).
**Expected:** Request falls through to Next.js with no proxy interference.
**Why human:** Requires runtime environment with specific env vars to verify `SUPERADMIN_HUB` guard behavior end-to-end.

---

## Gaps Summary

One gap found blocking full goal achievement:

**SSE stream proxy ordering (race condition):** The proxy's `server.on('request', ...)` listener registers AFTER the `createServer()` callback that calls Next.js `handle()`. Both listeners fire for every request. The proxy wins only because Next.js takes ~10-50ms to render a 404 for unknown routes while local Docker networking is ~0.2-0.5ms. This is not guaranteed — if spoke containers are under load, cold-starting, or Next.js's unmatched route handling becomes faster, the proxy will silently fail.

**Root cause:** `attachHttpProxy()` should use `server.prependListener('request', ...)` to guarantee pre-Next.js interception, not `server.on('request', ...)`.

**Impact on truths:** Truth #4 (SSE proxy correctness) is partial. Truths #1, #2, #3 are fully verified.

**Impact on requirements:** PROXY-04 is partial (same root cause).

**Fix:** In `lib/proxy/http-proxy.js` line 149, change `server.on('request', ...)` to `server.prependListener('request', ...)`. This is a one-line change.

---

_Verified: 2026-03-25T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
