# Phase 48: Code Mode Unification - Research

**Researched:** 2026-03-19
**Domain:** React chat UI state management, Next.js client components, AI SDK v5 streaming
**Confidence:** HIGH

## Summary

Phase 48 collapses three independent chat input toggles (Code/Terminal/Shell) into a single unified "Code" toggle with a Plan/Code sub-mode dropdown. The work is entirely frontend — no new backend routes, no new DB tables, no new dependencies.

The current implementation has a logical conflict: "Code mode" wraps the user's input in backticks before sending to `/stream/chat` (the LangGraph agent), while "Terminal mode" routes the entire session to `/stream/terminal` (the Claude Code SDK bridge). Shell mode is a sub-state of terminal mode. These three toggles are conditionally shown/hidden relative to each other but never unified — the result is a confusing UX and a dead `codeMode` state that does nothing useful except change textarea font and wrap text in backticks.

The goal is to replace all three with one `</>` toggle that always routes to `/stream/terminal`, with a Plan/Code dropdown underneath it to control the *intent* (Plan = conversational job dispatch via LangGraph, Code = direct Claude Code CLI execution). Backtick-wrapping code mode is killed entirely.

Tool calls from `/stream/terminal` already emit `tool-input-start` / `tool-input-available` / `tool-output-available` events through the SDK bridge. The `TerminalToolCall` component already renders them with expandable Input/Output. The `message.jsx` already dispatches to `TerminalToolCall` for Claude Code tool names. The tool call rendering requirement ("show tool calls with expandable Input/Output") is already satisfied for terminal sessions — Phase 48 only needs to ensure the unified Code toggle always routes to terminal so users actually see them.

**Primary recommendation:** Refactor `chat.jsx` and `chat-input.jsx` only. Kill `codeMode` and `shellMode` states. Replace with a single `codeActive` boolean and a `codeSubMode` enum (`"plan" | "code"`). When `codeActive` is true, route to `/stream/terminal`. When false, route to `/stream/chat`. The `shellMode` body param is no longer user-controlled — remove it from the toggle surface (shell mode wrapping was a workaround for direct bash commands; the Plan/Code distinction supersedes it).

## Standard Stack

### Core (already installed, no new packages needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@ai-sdk/react` | `^2.0.0` | `useChat`, `DefaultChatTransport` | Already the transport layer |
| `ai` | `^5.0.0` | `createUIMessageStream`, `createUIMessageStreamResponse` | Already the streaming protocol |
| `react` | (Next.js bundled) | State management via `useState`, `useMemo`, `useCallback` | Already used throughout |
| `tailwindcss` | `^4.2.0` | Styling the new dropdown | Already used throughout |
| `clsx` / `tailwind-merge` | installed | `cn()` utility already in `lib/chat/utils.js` | Pattern established |

### No New Dependencies
Phase 48 adds zero new npm packages. All needed primitives (select/dropdown, state, transport) are already present.

## Architecture Patterns

### Recommended Project Structure (affected files only)
```
lib/chat/components/
├── chat.jsx              ← PRIMARY: replace 3 states with 2
├── chat-input.jsx        ← PRIMARY: replace 3 toggle props with 1 toggle + submode
└── message.jsx           ← NO CHANGE (TerminalToolCall already wired)
```

### Pattern 1: State Consolidation in chat.jsx

**What:** Replace `codeMode` (bool) + `terminalMode` (bool) + `shellMode` (bool) with `codeActive` (bool) + `codeSubMode` ("plan"|"code").

**When to use:** Whenever three mutually-exclusive flags exist on the same component, collapsing them reduces impossible state combinations (e.g. `codeMode=true` AND `terminalMode=true` was possible before).

**Current state (3 independent flags — has impossible combinations):**
```javascript
// chat.jsx — CURRENT (to be removed)
const [codeMode, setCodeMode] = useState(false);
const [terminalMode, setTerminalMode] = useState(false);
const [shellMode, setShellMode] = useState(false);
```

**New state (2 flags — no impossible combinations):**
```javascript
// chat.jsx — NEW
const [codeActive, setCodeActive] = useState(false);
const [codeSubMode, setCodeSubMode] = useState('plan'); // 'plan' | 'code'
```

### Pattern 2: Transport Routing

**What:** When `codeActive` is true, always route to `/stream/terminal`. When false, route to `/stream/chat`. The `shellMode` body param is dropped from user control.

**Current transport body:**
```javascript
// chat.jsx transport useMemo — CURRENT
body: {
  chatId,
  selectedRepo: selectedRepo?.slug || null,
  selectedBranch: selectedBranch || null,
  interactiveMode: codeMode,
  sessionId: terminalMode ? terminalSessionIdRef.current : undefined,
  shellMode: terminalMode ? shellMode : undefined,
  thinkingEnabled: terminalMode ? true : undefined,
},
fetch: terminalMode ? terminalFetch : undefined,
```

**New transport body:**
```javascript
// chat.jsx transport useMemo — NEW
body: {
  chatId,
  selectedRepo: selectedRepo?.slug || null,
  selectedBranch: selectedBranch || null,
  sessionId: codeActive ? terminalSessionIdRef.current : undefined,
  shellMode: false, // no longer user-controlled
  thinkingEnabled: codeActive ? true : undefined,
  codeSubMode: codeActive ? codeSubMode : undefined, // 'plan' | 'code'
},
fetch: codeActive ? terminalFetch : undefined,
```

Note: `interactiveMode` body param (for `/stream/chat`) is also dropped since codeMode is killed.

### Pattern 3: ChatInput Props Simplification

**What:** Replace three prop pairs with two.

**Current props (6 mode-related props):**
```javascript
// CURRENT
{ codeMode, onToggleCodeMode, terminalMode, onToggleTerminalMode, shellMode, onToggleShellMode }
```

**New props (2 mode-related props):**
```javascript
// NEW
{ codeActive, onToggleCode, codeSubMode, onChangeCodeSubMode }
```

### Pattern 4: Sub-Mode Dropdown in ChatInput

**What:** A simple HTML `<select>` (or styled button group) rendered below the main Code toggle button when `codeActive` is true.

**Example:**
```jsx
// Inside ChatInput, after the unified Code toggle button
{codeActive && (
  <select
    value={codeSubMode}
    onChange={(e) => onChangeCodeSubMode(e.target.value)}
    className="text-xs bg-transparent border border-border rounded px-1 py-0.5 text-muted-foreground focus:outline-none"
    disabled={isStreaming}
  >
    <option value="plan">Plan</option>
    <option value="code">Code</option>
  </select>
)}
```

Alternatively, two small pill buttons styled like the existing mode toggles. Either approach is valid — the `<select>` is simpler and matches the repo/branch selects in `chat-header.jsx`.

### Pattern 5: handleSend Simplification

**What:** Remove the backtick-wrapping logic. The `handleSend` in `chat.jsx` currently wraps input in triple backticks when `codeMode` is active — this entire branch is removed.

**Current (to remove):**
```javascript
// chat.jsx — CURRENT
const text = !terminalMode && codeMode && rawText.trim()
  ? `\`\`\`\n${rawText.trim()}\n\`\`\``
  : rawText;
```

**New:**
```javascript
// chat.jsx — NEW (no wrapping, ever)
const text = rawText;
```

### Pattern 6: codeSubMode Signal to Backend (Optional)

The `/stream/terminal` API currently accepts `shellMode` (bool). Phase 48 adds `codeSubMode` to the body. The backend can either:
1. Ignore `codeSubMode` entirely (Phase 48 — UI change only)
2. Inject it as a directive prefix, similar to how `shellMode` wraps in bash backticks

For Phase 48 scope (UI unification), option 1 is correct. The `codeSubMode` distinction is a frontend UX affordance — the Claude Code SDK executes the same way regardless. The sub-mode distinction becomes meaningful in Phase 49 (Interactive Code IDE) where "Plan" might map to job dispatch and "Code" to workspace execution.

### Anti-Patterns to Avoid

- **Keeping `shellMode` as a user toggle:** Shell mode was a workaround (wrap input as bash command). With unified Code toggle routing everything to the SDK bridge, the user types naturally and Claude Code interprets the intent. Remove shell mode as a user-visible concept.
- **Adding a new UI library for the dropdown:** The existing `<select>` pattern from `chat-header.jsx` is consistent. No Radix/headless-ui dropdown needed.
- **Touching `message.jsx`:** Tool call rendering already works. `TerminalToolCall` is already dispatched for Claude Code tool names. No changes needed there.
- **Touching `lib/chat/terminal-api.js`:** The `/stream/terminal` backend is correct as-is. Phase 48 is frontend-only.
- **Touching `lib/ai/agent.js`:** It's on the do-not-touch list in STATE.md and is irrelevant to this phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dropdown for sub-mode | Custom popover/portal | Native `<select>` or two pill buttons | Chat-header.jsx already uses `<select>` — consistent pattern, zero extra code |
| State machine for mode | Redux/Zustand | Two `useState` hooks | The state has only 2 variables with 4 valid combinations — overkill to formalize |
| Tool call display | Custom accordion | `TerminalToolCall` (already exists) | Already renders Input/Output expand/collapse — reuse it |
| Mode persistence | localStorage | No persistence | Mode resets per chat is correct UX — new chat = fresh intent |

**Key insight:** Phase 48 is entirely a state/prop simplification. The backend already supports everything needed. The rendering already works. The only work is deleting code and simplifying props.

## Common Pitfalls

### Pitfall 1: Forgetting to Drop `interactiveMode` from `/stream/chat` body
**What goes wrong:** `interactiveMode: codeMode` was injected into the `/stream/chat` body to signal the LangGraph agent. If codeMode is removed but the `interactiveMode` field lingers, `/stream/chat` receives `interactiveMode: undefined` — harmless but misleading.
**How to avoid:** Remove `interactiveMode` from the transport body entirely when refactoring. Confirm in `lib/chat/api.js` that `interactiveMode` is only read for the context injection prefix and won't break if absent.
**Warning signs:** Searching for `interactiveMode` in the codebase after the change — should return zero results.

### Pitfall 2: Breaking the Session ID Follow-Up Injection
**What goes wrong:** The `terminalSessionIdRef` pattern in `chat.jsx` is subtle — it's a ref (not state) so the transport `useMemo` doesn't re-create on every session ID update. If refactoring accidentally converts this to state, the transport will re-create on every response, breaking follow-up injection.
**How to avoid:** Keep `terminalSessionIdRef` as `useRef`. The `terminalSessionId` state is only for UI display purposes (not currently used in UI, but preserved for Phase 49 workspace linking).
**Warning signs:** Follow-up messages spawn new sessions instead of injecting into the running one.

### Pitfall 3: `useMemo` Dependency Array Mismatch
**What goes wrong:** The transport `useMemo` in `chat.jsx` lists `[chatId, selectedRepo, selectedBranch, codeMode, terminalMode, shellMode, terminalFetch]` as deps. After refactoring, this becomes `[chatId, selectedRepo, selectedBranch, codeActive, codeSubMode, terminalFetch]`. Missing deps cause stale transport closures.
**How to avoid:** Update the dep array precisely when renaming state variables.
**Warning signs:** Mode toggle doesn't change the API endpoint on first message after toggling.

### Pitfall 4: Both Chat Inputs (Greeting + Messages) Must Be Updated
**What goes wrong:** `chat.jsx` renders `ChatInput` in two places — once in the greeting state (no messages) and once in the messages state. Props passed to both must be updated identically.
**How to avoid:** Extract the shared props object and spread it into both `<ChatInput>` instances, or update both in a single pass.
**Warning signs:** Code toggle works in greeting but not in message state (or vice versa).

### Pitfall 5: Shell Mode Reference in Terminal API
**What goes wrong:** `lib/chat/terminal-api.js` reads `shellMode` from the request body. If the frontend stops sending it, the server defaults to `false` which is correct — `const { shellMode = false } = body` already has a default. But if Phase 48 accidentally sends `shellMode: undefined`, the destructuring default applies correctly. No backend change needed.
**How to avoid:** Verify `const { shellMode = false } = body` is present in `terminal-api.js` before removing the field from the frontend body.

## Code Examples

Verified from actual codebase inspection:

### Current Mode State in chat.jsx (lines 15-17)
```javascript
const [codeMode, setCodeMode] = useState(false);
const [terminalMode, setTerminalMode] = useState(false);
const [shellMode, setShellMode] = useState(false);
```

### Current Transport (lines 36-53)
```javascript
const transport = useMemo(
  () =>
    new DefaultChatTransport({
      api: terminalMode ? '/stream/terminal' : '/stream/chat',
      body: {
        chatId,
        selectedRepo: selectedRepo?.slug || null,
        selectedBranch: selectedBranch || null,
        interactiveMode: codeMode,
        sessionId: terminalMode ? terminalSessionIdRef.current : undefined,
        shellMode: terminalMode ? shellMode : undefined,
        thinkingEnabled: terminalMode ? true : undefined,
      },
      fetch: terminalMode ? terminalFetch : undefined,
    }),
  [chatId, selectedRepo, selectedBranch, codeMode, terminalMode, shellMode, terminalFetch]
);
```

### Current Backtick Wrap in handleSend (lines 85-87)
```javascript
const text = !terminalMode && codeMode && rawText.trim()
  ? `\`\`\`\n${rawText.trim()}\n\`\`\``
  : rawText;
```

### Current ChatInput Signature (line 45)
```javascript
export function ChatInput({ input, setInput, onSubmit, status, stop, files, setFiles,
  codeMode = false, onToggleCodeMode,
  terminalMode = false, onToggleTerminalMode,
  shellMode = false, onToggleShellMode })
```

### Tool Call Rendering Already Correct (message.jsx lines 399-404)
```javascript
if (part.type?.startsWith('tool-')) {
  const toolName = part.toolName || '';
  if (TERMINAL_TOOL_NAMES.has(toolName)) {
    return <TerminalToolCall key={part.toolCallId || i} part={part} />;
  }
  return <ToolCall key={part.toolCallId || i} part={part} />;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One code toggle (wraps backticks) | Three toggles (code/terminal/shell) | Phase 41 added terminal mode | Confusing — two different "code" concepts |
| Shell mode as standalone toggle | Shell mode as terminal sub-toggle | Phase 41 | Slightly better but still 3 toggles |
| After Phase 48: unified `</>` toggle | Single Code toggle + Plan/Code dropdown | Phase 48 | Clean — one toggle, one intent |

**Deprecated after this phase:**
- `codeMode` state (backtick wrapping) — replaced by unified Code toggle
- `shellMode` state as user-visible toggle — removed from UI (backend default: false)
- `onToggleCodeMode`, `onToggleTerminalMode`, `onToggleShellMode` props — replaced by `onToggleCode`, `onChangeCodeSubMode`
- `interactiveMode` body param in `/stream/chat` — removed

## Open Questions

1. **What does "Plan" sub-mode actually do differently from "Code" in Phase 48?**
   - What we know: The phase goal says "Add Plan/Code sub-mode dropdown" — the dropdown is the deliverable, not behavioral divergence
   - What's unclear: Should "Plan" send to `/stream/chat` (LangGraph job dispatch) while "Code" sends to `/stream/terminal`? Or does both send to `/stream/terminal` with a `codeSubMode` hint?
   - Recommendation: For Phase 48, both Plan and Code sub-modes route to `/stream/terminal` — the dropdown is a UX label for intent. Behavioral divergence (Plan = job dispatch, Code = workspace execution) is Phase 49's concern. The planner should make this explicit in the plan.

2. **Should the Code toggle appear only for admin users?**
   - What we know: `/stream/terminal` requires `role === 'admin'` (terminal-api.js:19-21). Non-admin users would get 403 if they hit it.
   - What's unclear: Should `ChatInput` gate the Code toggle on user role?
   - Recommendation: Yes — guard the Code toggle render on admin role, matching existing terminal mode behavior. The `session.user.role` is available in `chat-page.jsx` and can be passed down. Alternatively, the 403 response can be surfaced as an error via `onError` — but hiding the toggle for non-admins is cleaner.

3. **Is `thinkingEnabled: true` always sent for Code mode?**
   - What we know: Current terminal mode hardcodes `thinkingEnabled: true` in the transport body
   - What's unclear: Should this remain hardcoded or become a user toggle?
   - Recommendation: Keep hardcoded at `true` for Phase 48. Phase 50 (Code Mode Polish) is the right place for thinking controls.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None formal — package.json: `"test": "echo \"No tests yet\" && exit 0"` |
| Config file | none |
| Quick run command | `npm test` (exits 0, no tests) |
| Full suite command | `npm test` |

Existing `test/` directory contains manual/integration scripts (test-job.sh, test-instance-job.js), not unit tests. `test/billing/` and `test/observability/` contain Node.js scripts run manually.

### Phase Requirements → Test Map

Phase 48 has TBD requirements. Based on the goal statement, the behaviors are:

| Behavior | Test Type | Notes |
|----------|-----------|-------|
| Three old toggles removed from UI | Manual smoke test | Visual verification — no unit test infrastructure |
| Unified Code toggle routes to /stream/terminal | Manual smoke test | Send a message with Code active, verify SDK tool calls appear |
| Plan/Code dropdown renders when Code active | Manual smoke test | Toggle Code on, confirm dropdown appears |
| Backtick wrapping no longer occurs | Manual smoke test | Send code snippet, verify plain text sent |
| Non-admin users don't see Code toggle | Manual smoke test | Log in as non-admin, confirm toggle absent |

### Sampling Rate
- **Per task:** Manual browser smoke test (toggle Code, send a message, verify tool calls render)
- **Phase gate:** No automated gate — manual verification covers phase criteria

### Wave 0 Gaps
None — this phase requires no test infrastructure setup. Phase 48 is a pure UI refactor with no testable business logic units. Smoke testing via browser is the validation path.

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `lib/chat/components/chat.jsx` — current state structure and transport configuration
- Direct code inspection: `lib/chat/components/chat-input.jsx` — current toggle UI and props
- Direct code inspection: `lib/chat/components/message.jsx` — tool call dispatch logic
- Direct code inspection: `lib/chat/components/terminal-tool-call.jsx` — existing tool call rendering
- Direct code inspection: `lib/chat/terminal-api.js` — `/stream/terminal` backend, shellMode default
- Direct code inspection: `lib/terminal/sdk-bridge.js` — tool-input/output event structure
- Direct code inspection: `.planning/STATE.md` — do-not-touch list, decisions

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` Phase 48 description — goal statement interpretation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, everything verified in package.json
- Architecture: HIGH — all patterns derived from direct code inspection
- Pitfalls: HIGH — all pitfalls identified from actual code patterns in the files

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable frontend refactor — no external dependencies)
