import crypto from 'node:crypto';
import { getDb } from '../db/index.js';
import { terminalCosts, terminalSessions } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export async function persistCost(sessionId, totalCostUsd, usage, numTurns) {
  const costId = crypto.randomUUID();
  const now = Date.now();
  const db = getDb();

  db.insert(terminalCosts).values({
    id: costId,
    sessionId,
    turnIndex: numTurns ?? 0,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
    estimatedUsd: totalCostUsd ?? 0,
    createdAt: now,
  }).run();

  // Update session total
  db.update(terminalSessions)
    .set({ totalCostUsd: sql`total_cost_usd + ${totalCostUsd ?? 0}` })
    .where(eq(terminalSessions.id, sessionId))
    .run();

  return { costId, estimatedUsd: totalCostUsd };
}
