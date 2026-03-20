import crypto from 'node:crypto';
import { auth } from '../auth/index.js';
import { getDb } from '../db/index.js';
import { terminalSessions, codeWorkspaces } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { registerSession, getSession, removeSession } from '../terminal/session-manager.js';
import { bridgeSDKToWriter } from '../terminal/sdk-bridge.js';

/**
 * POST /stream/terminal — streaming Claude Code terminal chat with session auth.
 * Mirrors lib/chat/api.js pattern exactly: auth() → createUIMessageStream → writer protocol.
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Terminal mode requires admin or superadmin role
  if (session.user.role !== 'admin' && session.user.role !== 'superadmin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const {
    messages,
    chatId: rawChatId,
    sessionId: existingSessionId,
    selectedRepo,
    shellMode = false,
    thinkingEnabled = false,
  } = body;

  if (!messages?.length) {
    return Response.json({ error: 'No messages' }, { status: 400 });
  }

  // Extract last user message text (same pattern as lib/chat/api.js)
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMessage) {
    return Response.json({ error: 'No user message' }, { status: 400 });
  }

  let userText =
    lastUserMessage.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n') ||
    lastUserMessage.content ||
    '';

  if (!userText.trim()) {
    return Response.json({ error: 'Empty message' }, { status: 400 });
  }

  // TERM-07: Shell mode wraps input as bash command directive
  if (shellMode && userText.trim()) {
    userText = `Run this shell command and show me the output:\n\`\`\`bash\n${userText.trim()}\n\`\`\``;
  }

  const chatId = rawChatId || crypto.randomUUID();

  // Check for existing active session (TERM-04: follow-up injection)
  if (existingSessionId) {
    const active = getSession(existingSessionId);
    if (active?.query?.streamInput) {
      // Inject follow-up into running session
      async function* followUpStream() {
        yield { type: 'human', message: { role: 'user', content: userText } };
      }
      try {
        active.query.streamInput(followUpStream());
        return Response.json({ ok: true, injected: true, sessionId: existingSessionId });
      } catch (err) {
        console.error('Failed to inject follow-up:', err);
        // Fall through to create new session
      }
    }
  }

  // Resolve workspace volume path for cwd (TERM-05)
  let cwdPath = undefined;
  let volumeName = undefined;
  if (selectedRepo) {
    const db = getDb();
    const workspace = db
      .select()
      .from(codeWorkspaces)
      .where(
        and(
          eq(codeWorkspaces.repoSlug, selectedRepo),
          eq(codeWorkspaces.status, 'running')
        )
      )
      .get();

    if (workspace?.volumeName) {
      volumeName = workspace.volumeName;
      // Volume is mounted in event handler container at this path
      cwdPath = `/mnt/workspaces/${workspace.volumeName}`;
    }
  }

  // Create terminal session record
  const sessionId = crypto.randomUUID();
  const db = getDb();
  db.insert(terminalSessions).values({
    id: sessionId,
    chatId,
    repoSlug: selectedRepo || null,
    volumeName: volumeName || null,
    cwdPath: cwdPath || null,
    status: 'running',
    thinkingEnabled: thinkingEnabled ? 1 : 0,
    shellMode: shellMode ? 1 : 0,
    totalCostUsd: 0,
    createdAt: Date.now(),
  }).run();

  const { createUIMessageStream, createUIMessageStreamResponse } = await import('ai');

  const stream = createUIMessageStream({
    onError: (error) => {
      console.error('Terminal stream error:', error);
      // Mark session as errored
      const db = getDb();
      db.update(terminalSessions)
        .set({ status: 'error', completedAt: Date.now() })
        .where(eq(terminalSessions.id, sessionId))
        .run();
      removeSession(sessionId);
      return error?.message || 'An error occurred in the terminal session.';
    },
    execute: async ({ writer }) => {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      const abortController = new AbortController();

      const queryOptions = {
        cwd: cwdPath || undefined,
        settingSources: [],
        env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
        includePartialMessages: true,
        abortController,
      };

      // TERM-08: Extended thinking
      if (thinkingEnabled) {
        queryOptions.thinking = { type: 'enabled', budgetTokens: 8000 };
      }

      const q = query(userText, queryOptions);

      // Register session for follow-up injection (TERM-04)
      registerSession(sessionId, q, abortController);

      try {
        await bridgeSDKToWriter(q, writer, sessionId);

        // Mark session complete
        const db = getDb();
        db.update(terminalSessions)
          .set({ status: 'complete', completedAt: Date.now() })
          .where(eq(terminalSessions.id, sessionId))
          .run();
      } catch (err) {
        console.error('Terminal SDK error:', err);
        const db = getDb();
        db.update(terminalSessions)
          .set({ status: 'error', completedAt: Date.now() })
          .where(eq(terminalSessions.id, sessionId))
          .run();
        throw err;
      } finally {
        removeSession(sessionId);
      }
    },
  });

  // Add sessionId to response headers so client can reference it for follow-ups
  const response = createUIMessageStreamResponse({ stream });
  response.headers.set('X-Terminal-Session-Id', sessionId);
  return response;
}
