# Voice Input Architecture — ClawForge

## Overview

Voice-to-text input in the web chat interface via AssemblyAI real-time streaming. Operators speak into their microphone and see transcribed text appear in the chat input, then send as a normal message.

## Architecture

```
Browser Microphone → AudioWorklet (capture) → WebSocket → AssemblyAI Real-Time API → Transcription → Chat Input
```

### Components

- `lib/voice/recorder.js` — AudioWorklet-based microphone capture, PCM encoding
- `lib/voice/transcription.js` — AssemblyAI WebSocket client, interim/final result handling
- `lib/voice/config.js` — Voice feature configuration, API key management
- `lib/chat/components/voice-bars.jsx` — Real-time volume level visualization (animated bars)

### Flow

1. Operator clicks microphone button in chat input area
2. Browser requests microphone permission (graceful fallback on deny)
3. AudioWorklet captures PCM audio at 16kHz
4. Audio chunks streamed to AssemblyAI via WebSocket
5. AssemblyAI returns interim transcriptions (gray text) and final transcriptions
6. Final transcription inserted into chat input field
7. Operator reviews and sends (or edits) the transcribed text

## Constraints

- Browser-only feature — not available in Slack or Telegram channels
- AssemblyAI API key stored as environment variable (`ASSEMBLYAI_API_KEY`)
- Audio data is never stored server-side — purely real-time streaming
- No recording or playback capability — transcription only
- Requires HTTPS in production (microphone API requirement)

## Dependencies

- AssemblyAI Real-Time API (paid, usage-based)
- Web Audio API (AudioWorklet) — modern browsers only
- WebSocket API — native browser support
