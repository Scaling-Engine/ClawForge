/**
 * Log Parser — Converts raw Docker container stdout lines into typed semantic events.
 *
 * Two exported functions:
 *   scrubSecrets(text)           — Remove sensitive values from any string
 *   parseLineToSemanticEvent(line) — Map a single stdout line to a semantic event or null
 *
 * Handles BOTH structured Claude Code JSONL (when --output-format stream-json is used)
 * and plain-text output (current default, claude -p without stream-json flag).
 */

// ─── Secret scrubbing patterns ───────────────────────────────────────────────

const SECRET_PATTERNS = [
  // AGENT_VAR=value environment variable assignments
  /AGENT_\w+=[^\s]+/g,
  // GitHub Personal Access Tokens (ghp_...)
  /ghp_[A-Za-z0-9]{36,}/g,
  // OpenAI API keys (sk-...)
  /sk-[A-Za-z0-9]{40,}/g,
  // Slack bot tokens
  /xoxb-[A-Za-z0-9-]+/g,
  // Slack user tokens
  /xoxp-[A-Za-z0-9-]+/g,
  // Bearer tokens (Authorization header values)
  /Bearer\s+[A-Za-z0-9._-]{20,}/g,
];

/**
 * Scrub sensitive values from a string, replacing matches with [REDACTED].
 *
 * @param {string} text
 * @returns {string}
 */
export function scrubSecrets(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex between calls since patterns use /g flag
    pattern.lastIndex = 0;
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

// ─── Semantic event mapping ───────────────────────────────────────────────────

/**
 * Map a single tool_use block from a Claude Code assistant message to a semantic event.
 * Returns null if the tool does not produce a meaningful surface event.
 *
 * @param {{ name: string, input: object }} block
 * @returns {object|null}
 */
function mapToolUseBlock(block) {
  const { name, input = {} } = block;

  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') {
    const path = scrubSecrets(input.path || input.file_path || '');
    return { type: 'file-change', operation: name.toLowerCase(), path };
  }

  if (name === 'Bash') {
    const command = scrubSecrets((input.command || '').slice(0, 120));
    return { type: 'bash-output', command };
  }

  return null;
}

/**
 * Map a Claude Code JSONL object to a semantic event.
 * Returns null if the event type should be suppressed.
 *
 * @param {object} parsed
 * @returns {object|null}
 */
function mapJsonEvent(parsed) {
  const { type } = parsed;

  // Suppress raw streaming fragments and system init messages
  if (type === 'stream_event' || type === 'system') {
    return null;
  }

  // Assistant messages — extract meaningful tool_use blocks
  if (type === 'assistant') {
    const content = parsed.message?.content;
    if (!Array.isArray(content)) return null;

    for (const block of content) {
      if (block.type === 'tool_use') {
        const event = mapToolUseBlock(block);
        if (event) return event;
      }

      // Substantial text blocks surface as decisions/reasoning
      if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 20) {
        const text = scrubSecrets(block.text.slice(0, 200));
        return { type: 'decision', text };
      }
    }

    return null;
  }

  // Job result — signals completion
  if (type === 'result') {
    const result = parsed.result
      ? scrubSecrets(String(parsed.result).slice(0, 300))
      : undefined;
    return { type: 'complete', subtype: parsed.subtype, result };
  }

  // GSD hook events — surface as progress milestones
  if (type === 'gsd' || (typeof parsed.event === 'string' && parsed.event.startsWith('gsd:'))) {
    const event = parsed.event || '';
    const label = scrubSecrets(parsed.label || parsed.task || event.replace('gsd:', '') || 'progress');
    return { type: 'progress', label };
  }

  return null;
}

/**
 * Parse a single line of container stdout to a typed semantic event.
 *
 * Processing order:
 *  1. Scrub secrets on the raw line (defense in depth)
 *  2. Try to parse as JSON — if it succeeds, delegate to mapJsonEvent()
 *  3. Fall through to unstructured text rules
 *
 * @param {string} rawLine
 * @returns {object|null}
 */
export function parseLineToSemanticEvent(rawLine) {
  if (typeof rawLine !== 'string') return null;

  const line = scrubSecrets(rawLine.trim());

  // Suppress blank / single-char lines
  if (line.length <= 1) return null;

  // ── Structured JSONL path ──────────────────────────────────────────────────
  if (line.startsWith('{') || line.startsWith('[')) {
    try {
      const parsed = JSON.parse(line);
      return mapJsonEvent(parsed);
    } catch {
      // Not valid JSON — fall through to text rules
    }
  }

  // ── Unstructured text path ─────────────────────────────────────────────────

  // stderr prefix → error event
  if (line.startsWith('[stderr]')) {
    return { type: 'error', message: line.slice(0, 200) };
  }

  // Git operations → progress event
  if (
    line.includes('git commit') ||
    line.includes('git push') ||
    line.includes('[git]') ||
    /^\[[\w/.-]+\s+[a-f0-9]+\]/.test(line) // e.g. [main 07f8855] commit message
  ) {
    return { type: 'progress', label: line.slice(0, 100) };
  }

  // All other unstructured lines are suppressed (raw noise)
  return null;
}
