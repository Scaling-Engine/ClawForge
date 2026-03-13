# Phase 35: Voice Input - Research

**Researched:** 2026-03-13
**Domain:** AssemblyAI Streaming v3 WebSocket API, Web Audio API (AudioWorklet), browser microphone capture
**Confidence:** HIGH

## Summary

Phase 35 adds voice-to-text input to the web chat interface. Operators click a microphone button in the chat input area, speak, and see their speech transcribed into the text input field via AssemblyAI's real-time streaming API. The transcribed text is then sent as a normal message.

The architecture is entirely client-side except for one server-side concern: generating a temporary AssemblyAI token so the API key is never exposed to the browser. The project already has `ASSEMBLYAI_API_KEY` registered as a secret key in `lib/config.js` (line 40), and the admin panel docs mention a `/admin/voice` page for AssemblyAI config. The `docs/VOICE.md` file already defines the target architecture and file structure (`lib/voice/recorder.js`, `lib/voice/transcription.js`, `lib/voice/config.js`, `lib/chat/components/voice-bars.jsx`).

AssemblyAI recently migrated from Streaming v2 to v3 with a new WebSocket URL (`wss://streaming.assemblyai.com/v3/ws`), new message types (`Turn` instead of `PartialTranscript`/`FinalTranscript`), and a dedicated token endpoint (`GET https://streaming.assemblyai.com/v3/token`). The v3 API is the correct target for new implementations.

**Primary recommendation:** Build three new files (`lib/voice/recorder.js`, `lib/voice/transcription.js`, `lib/voice/config.js`), one new component (`lib/chat/components/voice-bars.jsx`), one server action for temporary token generation, and integrate a microphone button into the existing `chat-input.jsx`. No new npm dependencies required -- use the native WebSocket and Web Audio APIs directly.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VOICE-01 | Microphone button in chat input toggles recording; volume bars animate during capture | Add MicIcon to `icons.jsx`; add mic button to `chat-input.jsx` between code-mode toggle and textarea; `voice-bars.jsx` renders animated CSS bars driven by AudioWorklet volume data |
| VOICE-02 | Audio streamed to AssemblyAI in real-time; interim and final transcriptions appear in chat input | `lib/voice/transcription.js` connects to `wss://streaming.assemblyai.com/v3/ws` with temp token; sends PCM16 audio from AudioWorklet; v3 `Turn` messages with `turn_is_formatted` flag distinguish interim vs final text; final text injected into `setInput()` |
| VOICE-03 | Graceful handling of microphone permission denial (toast notification, no crash) | Wrap `navigator.mediaDevices.getUserMedia()` in try/catch; detect `NotAllowedError` and `NotFoundError`; show inline error state on mic button (no external toast library needed -- use existing pattern) |
| VOICE-04 | No audio data stored server-side -- purely client-to-AssemblyAI streaming | Server only provides temp token via server action; audio flows directly browser -> AssemblyAI WebSocket; no audio buffers persisted anywhere |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API (AudioWorklet) | Browser native | Microphone capture + PCM encoding | Modern replacement for deprecated ScriptProcessorNode; runs in separate thread |
| WebSocket API | Browser native | Direct connection to AssemblyAI | No library needed for client-side WebSocket |
| `lib/config.js` | n/a | `getConfig('ASSEMBLYAI_API_KEY')` resolution | Already has ASSEMBLYAI_API_KEY in SECRET_KEYS set (line 40) |
| `lib/chat/actions.js` | n/a | Server actions with `requireAuth()` | Established pattern for authenticated server-side operations |
| `@ai-sdk/react` useChat | ^2.0.0 | Chat state (input/setInput) | Already manages chat input state; voice injects text into same state |

### New (no new npm deps)
| Item | Purpose | Notes |
|------|---------|-------|
| `lib/voice/recorder.js` | AudioWorklet microphone capture | Pure browser API, no library |
| `lib/voice/transcription.js` | AssemblyAI WebSocket client | Native WebSocket, no SDK needed |
| `lib/voice/config.js` | Feature detection + configuration | Checks for AudioWorklet/getUserMedia support |
| `lib/chat/components/voice-bars.jsx` | Volume level visualization | CSS animation driven by AudioWorklet data |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw WebSocket | `assemblyai` npm SDK | SDK is 500KB+, designed for Node.js; overkill for a single WebSocket connection. The browser WebSocket API is sufficient. |
| AudioWorklet | `MediaRecorder` API | MediaRecorder outputs compressed audio (webm/opus); AssemblyAI needs raw PCM16. Would require server-side transcoding. AudioWorklet gives direct PCM access. |
| AudioWorklet | ScriptProcessorNode | Deprecated, runs on main thread, causes audio glitches. AudioWorklet is the modern replacement. |

**Installation:**
```bash
# No new npm dependencies required
```

## Architecture Patterns

### Target File Structure
```
lib/
├── voice/
│   ├── recorder.js          # NEW — AudioWorklet mic capture, PCM16 encoding
│   ├── transcription.js     # NEW — AssemblyAI v3 WebSocket client
│   └── config.js            # NEW — Feature detection, voice state
├── chat/
│   ├── actions.js           # EXTEND — add getVoiceToken() server action
│   └── components/
│       ├── chat-input.jsx   # EXTEND — add mic button, voice state
│       ├── voice-bars.jsx   # NEW — animated volume bars
│       └── icons.jsx        # EXTEND — add MicIcon, MicOffIcon
public/
└── voice-processor.js       # NEW — AudioWorklet processor (must be served as static file)
```

### Pattern 1: Temporary Token Server Action
**What:** Server action generates a short-lived AssemblyAI token so the API key never reaches the browser
**When to use:** Every time the user starts a voice recording session

```javascript
// lib/chat/actions.js
export async function getVoiceToken() {
  await requireAuth();
  const { getConfig } = await import('../config.js');
  const apiKey = getConfig('ASSEMBLYAI_API_KEY');
  if (!apiKey) return { error: 'Voice input not configured' };

  const res = await fetch(
    'https://streaming.assemblyai.com/v3/token?expires_in_seconds=60',
    { headers: { Authorization: apiKey } }
  );
  if (!res.ok) return { error: 'Failed to get voice token' };
  const { token } = await res.json();
  return { token };
}
```

### Pattern 2: AudioWorklet Processor (Static File)
**What:** A small JS file that runs in the AudioWorklet thread, captures PCM samples, and posts them to the main thread
**When to use:** This file MUST be served as a static file (e.g., `public/voice-processor.js`) because AudioWorklet loads processors via URL

```javascript
// public/voice-processor.js
class VoiceProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) {
      // Convert Float32 to Int16 PCM
      const pcm16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
      }
      this.port.postMessage({ pcm16, volume: Math.max(...input.map(Math.abs)) });
    }
    return true;
  }
}
registerProcessor('voice-processor', VoiceProcessor);
```

### Pattern 3: AssemblyAI v3 WebSocket Connection
**What:** Connect to AssemblyAI Streaming v3, send PCM16 audio, receive Turn messages
**When to use:** After obtaining temp token and starting AudioWorklet

```javascript
// lib/voice/transcription.js
const WS_URL = 'wss://streaming.assemblyai.com/v3/ws';

export function createTranscriber({ token, sampleRate = 16000, onTranscript, onError }) {
  const url = `${WS_URL}?sample_rate=${sampleRate}&token=${token}&format_turns=true`;
  const ws = new WebSocket(url);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'Turn') {
      onTranscript({
        text: msg.transcript,
        isFinal: msg.turn_is_formatted === true,
      });
    }
  };

  ws.onerror = () => onError?.('WebSocket connection failed');

  return {
    send: (pcm16Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pcm16Buffer);
      }
    },
    close: () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'Terminate' }));
        ws.close();
      }
    },
  };
}
```

### Pattern 4: Voice State in ChatInput
**What:** Mic button toggles recording state; voice bars show during recording; transcribed text injected into input
**When to use:** Inside `chat-input.jsx`

The mic button sits between the code-mode toggle and the textarea (or after the paperclip button). When recording:
- Mic button changes to active state (colored, pulsing)
- Voice bars component appears replacing or overlaying the textarea
- Interim text shown in gray in the textarea
- Final text replaces input value

### Anti-Patterns to Avoid
- **Exposing ASSEMBLYAI_API_KEY to browser:** Always use the temporary token endpoint. The API key stays server-side only.
- **Using `assemblyai` npm SDK in browser:** It's a Node.js SDK (500KB+). Use raw WebSocket instead.
- **Using ScriptProcessorNode:** Deprecated, causes jank. AudioWorklet is required.
- **Storing audio blobs:** VOICE-04 explicitly prohibits server-side audio storage. Audio flows browser -> AssemblyAI only.
- **Creating a new API route for token:** Use a server action (`lib/chat/actions.js`) per the established pattern. The `api/CLAUDE.md` rule says browser features use server actions, not `/api` routes.
- **Using v2 API endpoints:** AssemblyAI v2 (`wss://api.assemblyai.com/v2/realtime/ws`) is legacy. Use v3 (`wss://streaming.assemblyai.com/v3/ws`).

## AssemblyAI Streaming v3 API Reference

### Token Generation
| Property | Value |
|----------|-------|
| Endpoint | `GET https://streaming.assemblyai.com/v3/token` |
| Auth | `Authorization: {API_KEY}` header |
| Query params | `expires_in_seconds` (required, 1-600), `max_session_duration_seconds` (optional, default 10800) |
| Response | `{ token: string, expires_in_seconds: number }` |
| Token usage | One-time use, single session |

### WebSocket Connection
| Property | Value |
|----------|-------|
| URL | `wss://streaming.assemblyai.com/v3/ws` |
| Query params | `sample_rate=16000&token={TOKEN}&format_turns=true` |
| Audio format | PCM16 (16-bit signed integers, little-endian) or Mu-law |
| Sample rate | 16000 Hz minimum recommended |
| Send format | Binary WebSocket frames (raw PCM16 bytes) |
| Chunk size | ~800 frames (50ms at 16kHz) per AudioWorklet callback |

### Message Types (v3)
| Type | Direction | Description |
|------|-----------|-------------|
| `Begin` | Received | Session started, includes session `id` and `expires_at` |
| `Turn` | Received | Transcript update; `transcript` field has text, `turn_is_formatted` boolean indicates final |
| `Termination` | Received | Session ended with statistics |
| `Terminate` | Sent (JSON) | Graceful session close: `{ "type": "Terminate" }` |
| Binary | Sent | Raw PCM16 audio data |

### v2 vs v3 Key Differences
| Aspect | v2 (legacy) | v3 (current) |
|--------|-------------|--------------|
| WebSocket URL | `wss://api.assemblyai.com/v2/realtime/ws` | `wss://streaming.assemblyai.com/v3/ws` |
| Session start msg | `SessionBegins` | `Begin` |
| Transcript msg | `PartialTranscript` / `FinalTranscript` | `Turn` (with `turn_is_formatted`) |
| Text field | `text` | `transcript` |
| Type field | `message_type` | `type` |
| Terminate | Close WebSocket | Send `{ type: "Terminate" }` then close |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio capture | Custom getUserMedia + manual buffer management | AudioWorklet processor class | AudioWorklet handles threading, buffer sizing, and sample rate conversion correctly |
| PCM encoding | Manual Float32-to-Int16 in main thread | AudioWorklet postMessage with Int16Array | Encoding in the worklet thread prevents main thread jank |
| Token management | Proxy endpoint that forwards API key | Server action returning temp token | Server actions are the established pattern; temp tokens are one-time use and short-lived |
| Volume visualization | Manual requestAnimationFrame + canvas | CSS animation driven by volume level class/variable | Simpler, fewer bugs, matches existing UI patterns |
| WebSocket reconnection | Custom retry logic with exponential backoff | Simple "click mic again" UX | Voice sessions are short (seconds to minutes); automatic reconnect adds complexity for little value |

**Key insight:** The entire voice feature is a thin client-side integration layer. The heavy lifting (speech recognition) is done by AssemblyAI. The code we write is just plumbing: capture audio, send bytes, display text.

## Common Pitfalls

### Pitfall 1: AudioWorklet Processor Must Be a Separate Static File
**What goes wrong:** Trying to inline the AudioWorklet processor code or import it as a module
**Why it happens:** `audioContext.audioWorklet.addModule()` requires a URL to a JS file, not an inline script or bundled module
**How to avoid:** Place `voice-processor.js` in the `public/` directory so it's served as a static file. The URL will be `/voice-processor.js`.
**Warning signs:** `DOMException: Failed to load AudioWorklet module` errors

### Pitfall 2: HTTPS Required for Microphone Access
**What goes wrong:** `getUserMedia()` fails silently or throws in development
**Why it happens:** Browsers require HTTPS (or localhost) for microphone access
**How to avoid:** Development on `localhost` works without HTTPS. Production deployments must be HTTPS (which they already are via Vercel/VPS). Document this in voice config.
**Warning signs:** `NotAllowedError` even when user grants permission

### Pitfall 3: Microphone Permission UX
**What goes wrong:** App crashes or shows cryptic error when user denies microphone
**Why it happens:** `getUserMedia()` throws `NotAllowedError` on deny, `NotFoundError` if no mic
**How to avoid:** Wrap in try/catch, show friendly inline message (change mic button to error state with tooltip). Do not use browser `alert()`.
**Warning signs:** Unhandled promise rejection in console

### Pitfall 4: WebSocket Message Buffering
**What goes wrong:** Audio chunks queue up when WebSocket is in CONNECTING state
**Why it happens:** AudioWorklet starts producing audio immediately, but WebSocket takes time to connect
**How to avoid:** Only start AudioWorklet capture AFTER WebSocket `onopen` fires (or after `Begin` message received). Buffer strategy: discard audio before connection is ready.
**Warning signs:** Burst of data on connect, first few words missing from transcription

### Pitfall 5: Stale Token on Long Idle
**What goes wrong:** User clicks mic after sitting idle for minutes; token has expired
**Why it happens:** Token is generated with `expires_in_seconds=60` but user doesn't start immediately
**How to avoid:** Generate the token at the moment the user clicks the mic button, not ahead of time. The token request is fast (~100ms).
**Warning signs:** WebSocket connection immediately closes with auth error

### Pitfall 6: AudioContext Suspended State
**What goes wrong:** `AudioContext` created but stuck in "suspended" state
**Why it happens:** Browsers require user gesture to start audio contexts (autoplay policy)
**How to avoid:** Create `AudioContext` inside the mic button click handler (which is a user gesture). Call `audioContext.resume()` as well.
**Warning signs:** AudioWorklet produces silence (all zeros)

### Pitfall 7: Memory Leaks from Unclosed Resources
**What goes wrong:** MediaStream tracks, AudioContext, WebSocket left open after recording stops
**Why it happens:** Multiple async resources need coordinated cleanup
**How to avoid:** Single `stopRecording()` function that: (1) sends Terminate to WebSocket, (2) closes WebSocket, (3) stops all MediaStream tracks, (4) closes AudioContext. Call on mic button toggle-off AND on component unmount.
**Warning signs:** Browser mic indicator stays active after stopping, memory grows over time

## Code Examples

### Microphone Button Integration in ChatInput
```jsx
// In chat-input.jsx, add to the button row between code-mode toggle and textarea
{/* Mic button */}
<button
  type="button"
  onClick={isRecording ? stopRecording : startRecording}
  className={cn(
    'inline-flex items-center justify-center rounded-lg p-2',
    isRecording
      ? 'bg-red-500/10 text-red-500 animate-pulse'
      : 'text-muted-foreground hover:text-foreground'
  )}
  aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
  disabled={isStreaming}
>
  {isRecording ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
</button>
```

### Voice Bars Component
```jsx
// lib/chat/components/voice-bars.jsx
'use client';

export function VoiceBars({ volume = 0 }) {
  // 5 bars with staggered heights based on volume level
  const bars = [0.4, 0.7, 1.0, 0.7, 0.4];
  return (
    <div className="flex items-center gap-0.5 h-4">
      {bars.map((scale, i) => (
        <div
          key={i}
          className="w-0.5 rounded-full bg-red-500 transition-all duration-75"
          style={{ height: `${Math.max(2, volume * scale * 16)}px` }}
        />
      ))}
    </div>
  );
}
```

### AudioWorklet Recorder
```javascript
// lib/voice/recorder.js
export async function startMicCapture({ onAudioData, onVolume, onError }) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true }
    });

    const audioContext = new AudioContext({ sampleRate: 16000 });
    await audioContext.resume();
    await audioContext.audioWorklet.addModule('/voice-processor.js');

    const source = audioContext.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(audioContext, 'voice-processor');

    processor.port.onmessage = (event) => {
      const { pcm16, volume } = event.data;
      onAudioData(pcm16.buffer);
      onVolume?.(volume);
    };

    source.connect(processor);
    // Don't connect processor to destination (we don't want to hear ourselves)

    return {
      stop() {
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach(t => t.stop());
        audioContext.close();
      }
    };
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      onError?.('Microphone permission denied');
    } else if (err.name === 'NotFoundError') {
      onError?.('No microphone found');
    } else {
      onError?.('Failed to start microphone');
    }
    return null;
  }
}
```

## Existing Component Inventory

Components and modules that will be reused or extended:

| Component/Module | File | Current State | Phase 35 Change |
|-----------------|------|---------------|-----------------|
| `ChatInput` | `chat-input.jsx` | Has paperclip, code-mode, textarea, send/stop buttons | Add mic button, voice state, VoiceBars |
| `Chat` | `chat.jsx` | Manages `input`/`setInput` state | Pass voice-related callbacks to ChatInput |
| `icons.jsx` | `icons.jsx` | 40+ icons, no Mic icon | Add MicIcon, MicOffIcon |
| `lib/config.js` | `config.js` | Has `ASSEMBLYAI_API_KEY` in SECRET_KEYS | No change needed |
| `lib/chat/actions.js` | `actions.js` | Server actions with `requireAuth()` | Add `getVoiceToken()` action |
| Barrel exports | `index.js` | Exports all chat components | No change needed (ChatInput already exported) |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AssemblyAI Streaming v2 | Streaming v3 (Universal Streaming) | 2025 | New WebSocket URL, message format, token endpoint |
| ScriptProcessorNode | AudioWorklet | 2018+ (Chrome 64) | Required for modern browsers; ScriptProcessor is deprecated |
| `assemblyai` npm SDK for browser | Raw WebSocket API | Current best practice for browser | SDK is Node-focused; raw WebSocket is lighter and works natively in browser |
| OpenAI Whisper for transcription | AssemblyAI Real-Time | Project decision | AssemblyAI provides real-time streaming; Whisper is batch-only (existing Telegram/Slack voice uses Whisper for pre-recorded messages only) |

## Open Questions

1. **Interim text display strategy**
   - What we know: v3 `Turn` messages arrive with `turn_is_formatted: false` (interim) and `turn_is_formatted: true` (final). Interim text should appear as the user speaks.
   - What's unclear: Should interim text go directly into the textarea `input` state (which would overwrite any manually typed text), or show in a separate overlay element?
   - Recommendation: Show interim text in a separate overlay/placeholder inside the textarea area (gray text). Only inject final text into `setInput()`. This prevents overwriting existing typed text and makes the UX clear.

2. **Voice toggle in admin panel**
   - What we know: `docs/ADMIN_PANEL.md` lists `/admin/voice` as a planned route for AssemblyAI config and voice toggle.
   - What's unclear: Should Phase 35 include the admin toggle, or just the voice input feature?
   - Recommendation: Phase 35 focuses on the voice input feature itself. The admin voice settings page is a separate concern (config already works via `lib/config.js` + env vars).

3. **Browser compatibility scope**
   - What we know: AudioWorklet is supported in Chrome 64+, Firefox 76+, Safari 14.1+, Edge 79+. This covers all modern browsers.
   - What's unclear: Whether to add a polyfill for older browsers.
   - Recommendation: No polyfill. `lib/voice/config.js` should detect AudioWorklet support and hide the mic button if unsupported. The `docs/VOICE.md` already says "modern browsers only."

## Sources

### Primary (HIGH confidence)
- Codebase files examined directly:
  - `docs/VOICE.md` -- target architecture and file structure
  - `.claude/rules/voice.md` -- voice architecture rules and constraints
  - `lib/config.js` -- ASSEMBLYAI_API_KEY in SECRET_KEYS (line 40)
  - `lib/chat/components/chat-input.jsx` -- current chat input component (252 lines)
  - `lib/chat/components/chat.jsx` -- Chat component managing input state
  - `lib/chat/actions.js` -- server action patterns with requireAuth()
  - `lib/chat/api.js` -- streaming route pattern (session auth)
  - `lib/chat/components/icons.jsx` -- 40+ icons, no Mic icons yet
  - `api/CLAUDE.md` -- browser features use server actions, not /api routes
  - `docs/ADMIN_PANEL.md` -- /admin/voice planned for AssemblyAI config
  - `package.json` -- no AssemblyAI SDK currently installed

### Secondary (MEDIUM confidence)
- [AssemblyAI Streaming v3 token endpoint docs](https://www.assemblyai.com/docs/api-reference/streaming-api/generate-streaming-token) -- GET endpoint, query params, response format
- [AssemblyAI v2 to v3 migration guide](https://www.assemblyai.com/docs/guides/v2_to_v3_migration_js) -- message type changes, new WebSocket URL, Terminate flow
- [AssemblyAI browser example repo](https://github.com/AssemblyAI/realtime-transcription-browser-js-example) -- AudioWorklet pattern, token generation, browser architecture
- [AssemblyAI streaming getting started](https://www.assemblyai.com/docs/getting-started/transcribe-streaming-audio) -- SDK usage, audio format (PCM16, 16kHz), Turn message type

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; uses browser-native APIs + existing project infrastructure
- Architecture: HIGH -- file structure defined in docs/VOICE.md; integration points in existing components are clear
- AssemblyAI v3 API: MEDIUM-HIGH -- v3 endpoint/message formats from official migration guide and docs; some details inferred from multiple sources
- Pitfalls: HIGH -- AudioWorklet gotchas are well-documented; permission handling is standard browser API behavior

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable browser APIs and AssemblyAI v3)
