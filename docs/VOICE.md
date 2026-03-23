# Using Voice Input

This guide explains how to use voice input in the web chat interface — speaking to your agent instead of typing.

---

## How It Works

Click the microphone button in the chat input area. Your browser captures audio from your microphone, streams it to AssemblyAI in real-time, and the transcribed text appears in the chat input. Review it, make any edits, then send as a normal message.

```
Click mic → Browser captures audio → AssemblyAI transcribes → Text appears in input → You send it
```

**What you'll see:**
- Animated volume bars while recording
- Gray text showing interim transcription (updates as you speak)
- Final transcription inserted into the input field when you stop

---

## Setup

Voice input requires an AssemblyAI API key. Set it in your `.env`:

```
ASSEMBLYAI_API_KEY=...
```

Once set, restart your instance and the microphone button appears in the chat input.

---

## Limitations

- **Web chat only** — Voice input is not available in Slack or Telegram channels
- **HTTPS required in production** — Browsers block microphone access on plain HTTP. Your production instance must have SSL enabled
- **No server-side recording** — Audio is streamed directly to AssemblyAI and never stored on your server
- **Modern browsers only** — Uses the Web Audio API (AudioWorklet), which requires Chrome, Edge, Firefox, or Safari (current versions)

---

## Microphone Permission

The first time you click the microphone button, your browser asks for microphone permission. If you deny it, voice input won't work. To re-enable:

- **Chrome/Edge:** Click the lock icon in the address bar → Site settings → Microphone → Allow
- **Firefox:** Click the lock icon → Clear the blocked microphone permission → Reload
- **Safari:** Safari menu → Settings for this website → Microphone → Allow

---

## AssemblyAI API Key

AssemblyAI's real-time transcription API is usage-based (pay per minute of audio). Sign up at [assemblyai.com](https://www.assemblyai.com) to get your API key.

The API key is stored as `ASSEMBLYAI_API_KEY` in your environment — never committed to git.

---

## Technical Details

For those who want to understand how it's built:

- **Audio capture:** AudioWorklet captures PCM audio at 16kHz from the browser microphone
- **Streaming:** Audio chunks are streamed to AssemblyAI via WebSocket
- **Transcription types:** AssemblyAI returns both interim (partial) and final transcriptions. Interim results are shown in gray; final results are committed to the input field
- **No playback:** This is transcription-only — there's no recording or audio playback capability
