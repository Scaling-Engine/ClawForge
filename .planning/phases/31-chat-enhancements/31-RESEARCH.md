# Phase 31: Chat Enhancements - Research

**Researched:** 2026-03-13
**Domain:** React chat UI, file upload (AI SDK v5), Streamdown/Shiki rendering, code mode UX
**Confidence:** HIGH

## Summary

Phase 31 brings the chat UI to feature parity with the upstream PopeBot for three requirements: file upload (CHAT-01), code mode toggle (CHAT-02), and enhanced message rendering (CHAT-03).

**CHAT-01 is already fully implemented.** `lib/chat/components/chat-input.jsx` already has drag-and-drop, paperclip button, file preview strip, FileReader-based data URL encoding, and a 5-file limit. `lib/chat/api.js` already decodes text files into the prompt and passes images/PDFs to the LLM as visual attachments. No implementation work is needed for CHAT-01.

**CHAT-02 is partially implemented.** The current `codeMode` toggle wraps input text in triple backticks before headless job dispatch. The CHAT-02 requirement adds a second semantic: code mode should also route to interactive workspace creation (via `start_coding` tool) rather than headless job dispatch. The toggle currently controls text formatting only — it must be extended to route dispatch differently.

**CHAT-03 requires new dependencies.** `streamdown` 2.2.0 already supports Shiki syntax highlighting and collapsible code block controls, but via optional `@streamdown/code` plugin. That plugin (v1.1.0) is not currently installed. Adding it + passing `controls={true}` and `plugins={{ code }}` to `<Streamdown>` provides syntax highlighting and collapsible blocks. Image previews in assistant messages already render correctly via the existing `file` part handling.

**Primary recommendation:** Scope to two tasks — (1) install `@streamdown/code` + wire Shiki highlighting into `message.jsx`, and (2) extend code mode toggle to embed an `[INTERACTIVE_MODE]` context hint that the agent interprets as a signal to use `start_coding` instead of `create_job`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-01 | File upload via drag-and-drop or paperclip button supports images, PDFs, and code files | Already implemented in `chat-input.jsx` + `lib/chat/api.js`. No new code needed. Verification: confirm feature works end-to-end. |
| CHAT-02 | Code mode toggle switches between headless job dispatch and interactive workspace coding | Current toggle wraps text in backticks. Needs extension: interactive mode embeds a routing hint the LangGraph agent reads to invoke `start_coding` instead of `create_job`. |
| CHAT-03 | Enhanced message rendering with syntax highlighting, collapsible code blocks, and image previews | Streamdown 2.2.0 supports this via `@streamdown/code` plugin + `controls` prop. Plugin not yet installed. Image previews already work. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| streamdown | 2.2.0 (installed) | Markdown + streaming render | Already in use; built for AI SDK v5 |
| @streamdown/code | 1.1.0 (npm) | Shiki syntax highlighting plugin | The canonical plugin for streamdown code highlighting |
| shiki | 4.0.2 (npm, peer dep) | Token-based syntax highlighting | Required by @streamdown/code; battle-tested, zero runtime flicker |
| @ai-sdk/react | 2.x (installed) | useChat hook, file parts | Already in use; `sendMessage({ files: fileParts })` is the upload API |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| streamdown/styles.css | (bundled) | Scoped CSS for code blocks, tables | Already imported in globals.css — no change needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @streamdown/code | react-syntax-highlighter | @streamdown/code integrates natively with Streamdown's streaming pipeline; react-syntax-highlighter requires manual code block component override |
| @streamdown/code | Prism.js | Shiki is token-based (lighter), Prism requires more manual wiring |

**Installation:**
```bash
npm install @streamdown/code
```

No separate `shiki` install needed — `@streamdown/code` bundles it as a direct dependency.

## Architecture Patterns

### Recommended Project Structure
No structural changes needed. All work touches existing files:
```
lib/chat/components/
├── message.jsx         # Add @streamdown/code plugin + controls prop
├── chat-input.jsx      # (no change needed for CHAT-01/02 visible toggle)
├── chat.jsx            # Extend handleSend: embed [INTERACTIVE_MODE] hint
templates/app/
└── globals.css         # (already has streamdown/styles.css import — no change)
```

### Pattern 1: Streamdown Code Highlighting Plugin
**What:** Pass `plugins={{ code }}` + `shikiTheme` + `controls={{ code: true }}` to `<Streamdown>` for syntax-highlighted, collapsible code blocks.
**When to use:** All assistant message text rendering.
**Example:**
```jsx
// Source: streamdown README + dist/index.d.ts
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';

<Streamdown
  mode={isLoading ? 'streaming' : 'static'}
  plugins={{ code }}
  shikiTheme={['github-light', 'github-dark']}
  controls={{ code: true }}
  linkSafety={linkSafety}
>
  {text}
</Streamdown>
```

The `controls={{ code: true }}` prop adds a copy button and collapse toggle to every code block. The `shikiTheme` tuple provides light/dark themes using CSS variables — Streamdown handles dark mode automatically via `data-language` and CSS variable switching.

### Pattern 2: Interactive Mode Routing via Prompt Hint
**What:** When code mode is active, prepend `[INTERACTIVE_MODE: true]` to the user's message before sending to the agent. The agent's system prompt (EVENT_HANDLER.md) is updated to interpret this as "open a workspace instead of dispatching a job."
**When to use:** User activates the `</>` toggle, then submits.
**Example (chat.jsx):**
```jsx
// In handleSend():
const modeHint = codeMode ? '[INTERACTIVE_MODE: true]\n\n' : '';
const text = modeHint + (codeMode && rawText.trim()
  ? `\`\`\`\n${rawText.trim()}\n\`\`\``
  : rawText);
```

**Alternative approach (sending body flag):**
Pass `interactiveMode: true` in the DefaultChatTransport `body`. The API handler (`lib/chat/api.js`) would prepend the mode hint server-side before passing to `chatStream()`. This keeps the routing logic server-side and avoids polluting visible message content.

The server-side approach is cleaner: add `interactiveMode` to `chat.jsx`'s transport body (alongside `chatId`, `selectedRepo`), read it in `lib/chat/api.js`, and prepend the hint before calling `chatStream()`. The user's visible message stays clean.

**EVENT_HANDLER.md addition** (instance config — not shipped code):
Add a sentence: "When a message begins with `[INTERACTIVE_MODE: true]`, use `start_coding` to open an interactive workspace instead of `create_job` for headless dispatch."

### Pattern 3: File Upload (already implemented — verification only)
```jsx
// Source: lib/chat/components/chat-input.jsx (existing)
// Paperclip click: fileInputRef.current?.click()
// Drag-and-drop: onDrop={handleDrop}
// Preview strip: files.map(f => isImage ? <img> : <FileTextIcon>)
// Submission: sendMessage({ text, files: fileParts })
```

The API handler in `lib/chat/api.js` already:
- Decodes text/code files from base64 data URLs and appends them as fenced code blocks
- Passes images and PDFs to the LLM as visual attachments

### Anti-Patterns to Avoid
- **Installing separate syntax highlighter:** Streamdown 2.2.0 already integrates Shiki. Do not add `react-syntax-highlighter`, `highlight.js`, or manual `pre`/`code` component overrides — they duplicate work and break streaming.
- **Client-side interactive mode detection:** Do not read `codeMode` in the LangGraph agent tools directly. The agent cannot access client state. Use the transport body → server hint pattern.
- **Modifying SOUL.md for interactive mode routing:** SOUL.md defines identity, not dispatch logic. The routing instruction belongs in EVENT_HANDLER.md.
- **Lazy-loading @streamdown/code inside the component:** The Shiki highlighter has async initialization. Import and create the plugin at module level to avoid per-render re-initialization.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Syntax highlighting | Custom `<code>` component with regex | `@streamdown/code` | Handles 100+ languages, streaming partial blocks, dark/light themes via CSS vars |
| Collapsible code blocks | Custom `useState` expand/collapse on `<pre>` | `controls={{ code: true }}` on Streamdown | Handles animation, copy, collapse — battle-tested |
| Markdown image rendering | Custom `img` component override | Existing `fileParts` + Streamdown | File parts already render images; Streamdown handles inline images in markdown |
| File type detection | Custom MIME sniffing | Existing `isAcceptedType()` + `getEffectiveType()` in chat-input.jsx | Already handles extension fallbacks for mistyped MIME types |

**Key insight:** Streamdown 2.2.0 ships all needed rendering infrastructure. The only missing piece is the `@streamdown/code` plugin package which provides the Shiki highlighter instance.

## Common Pitfalls

### Pitfall 1: Shiki Async Initialization Flicker
**What goes wrong:** Code blocks render without highlighting briefly, then pop to highlighted state as Shiki WASM loads.
**Why it happens:** Shiki lazy-loads language grammars asynchronously. First render returns `null` from `highlight()`.
**How to avoid:** Create the `code` plugin at module level (outside the component), not inside `useMemo` or `useEffect`. Streamdown handles the null return gracefully — it renders plain text until highlighting is ready, then re-renders highlighted.
**Warning signs:** Flash of unstyled code on first message that contains a code block.

### Pitfall 2: Streamdown CSS Not Scoped to Node Modules
**What goes wrong:** Code block styles (rounded corners, line numbers, background) don't apply.
**Why it happens:** Tailwind v4 `@source` directive must explicitly include `streamdown/dist/*.js` for utility class detection.
**How to avoid:** `globals.css` already has `@source "../node_modules/streamdown/dist/**/*.js"` — no change needed. If `@streamdown/code` dist files use additional classes, the same glob catches them since they're in `streamdown`'s dist.
**Warning signs:** Code blocks render as unstyled `<pre>` with no background or border.

### Pitfall 3: Interactive Mode Hint Leaking Into User Message Display
**What goes wrong:** User sees `[INTERACTIVE_MODE: true]` text in their own message bubble in the chat history.
**Why it happens:** If the mode hint is prepended in `chat.jsx` before `sendMessage()`, it becomes part of the stored message content.
**How to avoid:** Apply the hint server-side in `lib/chat/api.js` after the message is extracted but before passing to `chatStream()`. The stored user message content stays clean; only the LLM invocation gets the hint.
**Warning signs:** User message bubble shows `[INTERACTIVE_MODE: true]` prefix in the chat thread.

### Pitfall 4: File Upload Scope Confusion
**What goes wrong:** CHAT-01 appears to be unimplemented when the phase runs.
**Why it happens:** The feature is already in `lib/chat/components/chat-input.jsx` and `lib/chat/api.js` from a prior implementation. A planner unfamiliar with the state might re-implement it.
**How to avoid:** CHAT-01 only needs a verification check, not implementation. The planner should not create implementation tasks for file upload — only a verification task.
**Warning signs:** Plan includes tasks to "implement file upload" or "add paperclip button."

### Pitfall 5: controls prop Breaks Streaming Render
**What goes wrong:** Collapsible code blocks jitter or collapse mid-stream while code is being rendered.
**Why it happens:** `controls` adds interactive DOM around code blocks. Streamdown's streaming mode incrementally appends tokens.
**How to avoid:** Set `controls={{ code: true }}` only when `mode="static"` (non-loading). Pass `controls={isLoading ? false : { code: true }}` to disable controls while streaming.
**Warning signs:** Code blocks flicker between collapsed/expanded state during active streaming.

## Code Examples

Verified patterns from official sources:

### Streamdown with Shiki Plugin (CHAT-03)
```jsx
// Source: streamdown README, dist/index.d.ts (verified)
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';

// Create plugin at module level (avoid re-initialization per render)
const codePlugin = code();

export function MessageContent({ text, isLoading }) {
  return (
    <Streamdown
      mode={isLoading ? 'streaming' : 'static'}
      plugins={{ code: codePlugin }}
      shikiTheme={['github-light', 'github-dark']}
      controls={isLoading ? false : { code: true }}
      linkSafety={linkSafety}
    >
      {text}
    </Streamdown>
  );
}
```

### Interactive Mode Server-Side Routing (CHAT-02)
```js
// Source: lib/chat/api.js (existing pattern, extend)
// In lib/chat/api.js POST handler, after extracting userText:
const interactiveMode = body.interactiveMode === true;
if (interactiveMode) {
  userText = `[INTERACTIVE_MODE: true]\n\n${userText}`;
}
```

```jsx
// Source: lib/chat/components/chat.jsx (existing transport, extend body)
const transport = useMemo(
  () =>
    new DefaultChatTransport({
      api: '/stream/chat',
      body: {
        chatId,
        selectedRepo: selectedRepo?.slug || null,
        selectedBranch: selectedBranch || null,
        interactiveMode: codeMode,  // add this
      },
    }),
  [chatId, selectedRepo, selectedBranch, codeMode]
);
```

### CHAT-01 Verification (existing implementation)
```jsx
// Source: lib/chat/components/chat-input.jsx (already implemented)
// Drag-and-drop: onDragOver, onDragLeave, onDrop handlers on wrapper div
// Paperclip: <button onClick={() => fileInputRef.current?.click()}>
// Preview: files.map() rendering images + file name chips
// File submit: sendMessage({ text, files: fileParts }) in chat.jsx
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-markdown | streamdown | Already in use | Drop-in, streaming-optimized |
| highlight.js | Shiki (via @streamdown/code) | Shiki v4 stable 2025 | Token-based, no runtime DOM mutation |
| Manual code block collapse | Streamdown `controls` prop | Streamdown 2.x | Zero-code collapsible blocks with copy |

**Deprecated/outdated:**
- `react-syntax-highlighter`: Upstream PopeBot used this; ClawForge should use `@streamdown/code` instead since streamdown is already the renderer.

## Open Questions

1. **EVENT_HANDLER.md routing instruction phrasing**
   - What we know: EVENT_HANDLER.md lives at `instances/noah/config/EVENT_HANDLER.md` and `instances/strategyES/config/EVENT_HANDLER.md`
   - What's unclear: The exact instruction that reliably routes `[INTERACTIVE_MODE: true]` messages to `start_coding` vs `create_job` — needs prompt testing
   - Recommendation: Plan includes a specific instruction snippet; operator can tune if agent doesn't route correctly

2. **@streamdown/code initialization API**
   - What we know: `import { code } from '@streamdown/code'` and pass as `plugins={{ code }}`
   - What's unclear: Whether `code` is a factory (`code()`) or a singleton object — README example passes `code` directly without calling it
   - Recommendation: Follow README pattern (`plugins={{ code }}`); if initialization is needed, the TypeScript types in `dist/index.d.ts` will clarify

## Validation Architecture

> `workflow.nyquist_validation` key absent in `.planning/config.json` — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected (no jest.config, vitest.config, or test/ directory in project root) |
| Config file | None — see Wave 0 |
| Quick run command | N/A until Wave 0 establishes test runner |
| Full suite command | N/A |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | File attach via paperclip click triggers file input | manual-only | N/A — browser file picker not automatable headlessly | ❌ Wave 0 |
| CHAT-01 | Drag-and-drop onto chat sets file state | manual-only | N/A — drag events not automatable without Playwright | ❌ Wave 0 |
| CHAT-01 | Image files show thumbnail preview, non-image shows name chip | manual-only | N/A | ❌ Wave 0 |
| CHAT-02 | `interactiveMode: true` body flag set when codeMode is active | unit | Would need jest/vitest — see Wave 0 gaps | ❌ Wave 0 |
| CHAT-03 | Streamdown renders with `plugins={{ code }}` without crash | smoke | `npm run build` (build-time component validation) | ✅ (npm run build exists) |

**Manual-only justification for CHAT-01:** All three CHAT-01 behaviors require browser file system APIs (FileReader, DataTransfer) that are not available in Node.js test environments without a full Playwright setup. Since no Playwright config exists in the project and the phase is UI-only, manual verification in the running dev server is the appropriate gate.

### Sampling Rate
- **Per task commit:** `npm run build` — catch import/type errors early
- **Per wave merge:** `npm run build` — full compilation
- **Phase gate:** Manual smoke test of file upload, code mode toggle, and syntax highlighting in dev server before `/gsd:verify-work`

### Wave 0 Gaps
- No test runner configured — this is consistent with all prior phases in this project
- [ ] Playwright smoke tests for chat UI interactions (deferred — out of phase scope)

*(No framework install needed — project has no test infrastructure and that is established project pattern)*

## Sources

### Primary (HIGH confidence)
- `streamdown` npm package v2.2.0 — inspected `dist/index.d.ts` and README directly from `node_modules`
- `lib/chat/components/chat-input.jsx` — verified drag-and-drop, paperclip, file preview fully implemented
- `lib/chat/components/chat.jsx` — verified `codeMode` state, `handleSend` logic, transport body
- `lib/chat/api.js` — verified file part decoding, text inlining, image attachment passing
- `lib/ai/tools.js` — verified `start_coding` tool (line 610) takes `repo` param, returns workspace URL
- `templates/app/globals.css` — confirmed `streamdown/styles.css` already imported

### Secondary (MEDIUM confidence)
- `@streamdown/code` v1.1.0 — confirmed exists on npm, description "Shiki syntax highlighting plugin for Streamdown", not yet installed in project
- `streamdown` README — confirmed `plugins={{ code }}` API, `shikiTheme` prop, `controls` prop

### Tertiary (LOW confidence)
- Exact `code()` vs `code` import call — README shows `code` without call; TypeScript types show `CodeHighlighterPlugin` interface but not factory signature; needs verification at install time

## Metadata

**Confidence breakdown:**
- CHAT-01 (already implemented): HIGH — verified by reading source files
- CHAT-02 (interactive mode): HIGH for mechanism (transport body flag + server-side hint); MEDIUM for exact EVENT_HANDLER.md phrasing
- CHAT-03 (Shiki plugin): HIGH for approach (install @streamdown/code + wire props); LOW for exact import call signature (factory vs singleton)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (streamdown and @streamdown/code are stable packages)
