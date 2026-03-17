import crypto from 'node:crypto';
import { persistCost } from './cost-tracker.js';

/**
 * Bridge Agent SDK SDKMessage events to UIMessageStream writer.
 * @param {AsyncGenerator} queryIterator - from query() call
 * @param {object} writer - UIMessageStream writer
 * @param {string} sessionId - for cost persistence
 * @returns {Promise<{totalCostUsd: number, usage: object|null}>}
 */
export async function bridgeSDKToWriter(queryIterator, writer, sessionId) {
  writer.write({ type: 'start' });

  let currentTextId = null;
  let textStarted = false;
  let lastResult = null;

  for await (const msg of queryIterator) {
    if (msg.type === 'assistant') {
      for (const block of (msg.message?.content || [])) {
        if (block.type === 'text') {
          if (!textStarted) {
            currentTextId = crypto.randomUUID();
            writer.write({ type: 'text-start', id: currentTextId });
            textStarted = true;
          }
          writer.write({ type: 'text-delta', id: currentTextId, delta: block.text });
        } else if (block.type === 'tool_use') {
          // Close open text block before tool events
          if (textStarted) {
            writer.write({ type: 'text-end', id: currentTextId });
            textStarted = false;
            currentTextId = null;
          }
          writer.write({
            type: 'tool-input-start',
            toolCallId: block.id,
            toolName: block.name,
          });
          writer.write({
            type: 'tool-input-available',
            toolCallId: block.id,
            toolName: block.name,
            input: block.input,
          });
        } else if (block.type === 'tool_result') {
          writer.write({
            type: 'tool-output-available',
            toolCallId: block.tool_use_id || block.id,
            output: block.content,
          });
        } else if (block.type === 'thinking') {
          // TERM-08: Emit thinking blocks as a special tool call
          const thinkingId = crypto.randomUUID();
          writer.write({
            type: 'tool-input-start',
            toolCallId: thinkingId,
            toolName: '_thinking',
          });
          writer.write({
            type: 'tool-input-available',
            toolCallId: thinkingId,
            toolName: '_thinking',
            input: { thinking: block.thinking },
          });
          writer.write({
            type: 'tool-output-available',
            toolCallId: thinkingId,
            output: 'Reasoning complete',
          });
        }
      }
    } else if (msg.type === 'result') {
      lastResult = msg;
      // Persist cost (TERM-06)
      await persistCost(sessionId, msg.total_cost_usd, msg.usage, msg.num_turns);

      // Emit cost data as a metadata text delta so frontend can display it
      if (textStarted) {
        writer.write({ type: 'text-end', id: currentTextId });
        textStarted = false;
      }
      const costTextId = crypto.randomUUID();
      writer.write({ type: 'text-start', id: costTextId });
      writer.write({
        type: 'text-delta',
        id: costTextId,
        delta: `\n\n---\n*Cost: $${(msg.total_cost_usd || 0).toFixed(4)} | Tokens: ${(msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0)} (${msg.usage?.input_tokens || 0} in / ${msg.usage?.output_tokens || 0} out)*`,
      });
      writer.write({ type: 'text-end', id: costTextId });
    }
  }

  // Close any open text block
  if (textStarted) {
    writer.write({ type: 'text-end', id: currentTextId });
  }

  writer.write({ type: 'finish' });

  return {
    totalCostUsd: lastResult?.total_cost_usd || 0,
    usage: lastResult?.usage || null,
  };
}
