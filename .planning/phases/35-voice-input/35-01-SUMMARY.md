---
phase: 35-voice-input
plan: 01
subsystem: voice-input
tags: [voice, assemblyai, audioworklet, chat-input, streaming]
dependency_graph:
  requires: []
  provides: [voice-input, voice-transcription, mic-button]
  affects: [chat-input, actions]
tech_stack:
  added: [AssemblyAI v3 Streaming API, AudioWorklet API]
  patterns: [browser-to-service streaming, temporary token auth, feature detection]
key_files:
  created:
    - public/voice-processor.js
    - lib/voice/recorder.js
    - lib/voice/transcription.js
    - lib/voice/config.js
    - lib/chat/components/voice-bars.jsx
  modified:
    - lib/chat/actions.js
    - lib/chat/components/chat-input.jsx
    - lib/chat/components/icons.jsx
decisions:
  - AssemblyAI v3 WebSocket with Turn messages (not v2 with SessionBegins/FinalTranscript)
  - AudioWorklet processor as static file in public/ (cannot be bundled by esbuild)
  - Token generated on-click (not pre-fetched) to avoid stale 60s tokens
  - Audio never touches server — browser streams directly to AssemblyAI
metrics:
  duration: 158s
  completed: "2026-03-13T07:10:05Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 3
---

# Phase 35 Plan 01: Voice Input Summary

Voice-to-text input via AssemblyAI real-time streaming with AudioWorklet mic capture, animated volume bars, and mic button in chat input.

## What Was Built

### Voice Module (`lib/voice/`)

- **config.js** -- Feature detection for AudioWorklet + getUserMedia; returns false on SSR
- **recorder.js** -- `startMicCapture()` captures mic audio at 16kHz via AudioWorklet, streams PCM16 buffers with volume levels; handles NotAllowedError/NotFoundError gracefully
- **transcription.js** -- `createTranscriber()` connects to AssemblyAI v3 WebSocket, processes Turn messages for interim/final transcriptions, sends Terminate on close

### AudioWorklet Processor (`public/voice-processor.js`)

Static file loaded by AudioWorklet. Converts Float32 samples to Int16 PCM and calculates peak volume per frame.

### Server Action (`lib/chat/actions.js`)

`getVoiceToken()` -- auth-gated server action that fetches a temporary 60-second token from `streaming.assemblyai.com/v3/token` using the ASSEMBLYAI_API_KEY from config. No audio data touches the server.

### UI Components

- **MicIcon / MicOffIcon** -- Added to icons.jsx following existing SVG pattern
- **VoiceBars** -- 5 animated vertical bars with staggered height multipliers driven by real-time volume
- **Chat input integration** -- Mic button between code-mode toggle and textarea; toggles recording state with red highlight; shows interim text above input; auto-dismisses errors after 5s; hidden on unsupported browsers; cleans up on unmount

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- All content checks passed (exports, imports, patterns)
- `npm run build` passed with zero errors
- All 8 files created/modified as specified

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | b6a5713 | Voice module: AudioWorklet recorder, AssemblyAI v3 transcriber, token server action |
| 2 | 4094a94 | UI: mic button, VoiceBars, voice recording integration in chat input |
