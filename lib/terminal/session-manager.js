// Session registry: sessionId -> { query, abortController, createdAt }
const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function registerSession(sessionId, query, abortController) {
  sessions.set(sessionId, { query, abortController, createdAt: Date.now() });
}

export function getSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > SESSION_TTL_MS) {
    try { entry.abortController?.abort(); } catch {}
    sessions.delete(sessionId);
    return null;
  }
  return entry;
}

export function removeSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (entry) {
    try { entry.abortController?.abort(); } catch {}
    sessions.delete(sessionId);
  }
}

// Periodic cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.createdAt > SESSION_TTL_MS) {
      try { entry.abortController?.abort(); } catch {}
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);
