# Connecting Slack & Telegram

This guide covers how to connect your ClawForge agent to Slack and Telegram, in addition to the built-in web chat interface.

---

## Web Chat (Built-In)

The web chat interface is included automatically at your `APP_URL`. No additional setup needed.

**Features:**
- Streaming AI responses in real-time
- File uploads — send images, PDFs, and text files
- Chat history — browse and resume past conversations grouped by date
- Job management — create and monitor agent jobs
- Notifications — job completion alerts with unread badges

---

## Slack

Each instance needs its own Slack app (with its own workspace, tokens, and OAuth scopes). Instances are never shared.

### Setup Steps

1. Create a new Slack app at [api.slack.com](https://api.slack.com/apps)
2. Under **Event Subscriptions**, enable events and set the Request URL to `https://{APP_URL}/api`
3. Subscribe to bot events: `message.channels`, `message.groups`, `message.im`, `app_mention`
4. Under **OAuth & Permissions**, install the app to your workspace
5. Copy the **Bot Token** (starts with `xoxb-`) and **Signing Secret**
6. Add these to your `.env`:
   ```
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_SIGNING_SECRET=...
   SLACK_ALLOWED_USERS=U12345,U67890
   ```
7. Invite your bot to relevant channels

**Optional:** Set `SLACK_ALLOWED_CHANNELS` to a comma-separated list of channel IDs to restrict your agent to specific channels.

### How Slack Threading Works

When you message the agent in Slack and it dispatches a job, the notification comes back as a **reply in the same thread**. The agent remembers which thread started each job and routes responses back there automatically.

---

## Telegram

### Automated Setup

```bash
npm run setup-telegram
```

The setup wizard guides you through:
1. Entering your bot token (from @BotFather)
2. Setting a webhook secret
3. Getting your Telegram chat ID (by messaging your bot a verification code)

### Manual Setup

If you can't run the setup script (e.g., deploying to a cloud platform):

1. Set environment variables:
   ```
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_WEBHOOK_SECRET=...
   TELEGRAM_VERIFICATION=verify-abc12345
   ```

2. Register the webhook:
   ```bash
   curl -X POST https://your-app.url/api/telegram/register \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_API_KEY" \
     -d '{"bot_token": "YOUR_BOT_TOKEN", "webhook_url": "https://your-app.url/api/telegram/webhook"}'
   ```

3. Message your bot with your verification code (e.g., `verify-abc12345`). It replies with your Telegram chat ID.

4. Add that chat ID to `TELEGRAM_ALLOWED_USERS` and restart.

### What Telegram Supports

- Text messages — sent directly to your agent
- Voice messages — transcribed to text before processing (requires `ASSEMBLYAI_API_KEY` for real-time transcription; falls back to OpenAI Whisper if configured)
- Photos and documents — attached as files for the agent to process

---

## Channel Architecture

All three channels (Slack, Telegram, web) normalize messages to the same internal format before passing them to the LangGraph agent. The agent is completely channel-agnostic — it receives the same `{ threadId, text, attachments, metadata }` structure regardless of source.

This means:
- Adding a new channel doesn't require any changes to the AI layer
- The same agent behavior, persona, and tools work across all channels
- Notification routing works correctly regardless of which channel started the job

---

## Adding a New Channel

If you want to add Discord, WhatsApp, or any other platform that supports webhooks:

1. Create an adapter in `lib/channels/` that extends the `ChannelAdapter` base class
2. Implement `receive()`, `acknowledge()`, `startProcessingIndicator()`, and `sendResponse()`
3. Add a factory function in `lib/channels/index.js`
4. Add a webhook route in `api/index.js`

The AI layer requires zero changes. See `lib/channels/telegram.js` for a reference implementation.
