import { log } from './logger.js';
import { writeError } from '../db/error-log.js';

/**
 * Keys allowed in error metadata stored to the DB.
 * All other keys are stripped to prevent accidental PII or secret leakage.
 */
const allowedKeys = ['route', 'jobId', 'threadId', 'platform', 'statusCode', 'code'];

/**
 * Strip any metadata keys not in the allowlist.
 *
 * @param {object} meta
 * @returns {object}
 */
function sanitizeMeta(meta) {
  const safe = {};
  for (const key of allowedKeys) {
    if (key in meta) {
      safe[key] = meta[key];
    }
  }
  return safe;
}

/**
 * Capture an error:
 *   1. Emit a structured log line to stdout via pino
 *   2. Persist a sanitized row to the error_log DB table
 *
 * Never throws — DB failures are swallowed and logged to stdout only.
 *
 * @param {string} context - Subsystem label (e.g. 'channel', 'webhook', 'startup')
 * @param {Error} err - The error to capture
 * @param {object} [meta={}] - Additional metadata (will be sanitized before DB persist)
 * @returns {Promise<void>}
 */
export async function captureError(context, err, meta = {}) {
  // Always emit to stdout via pino first (never fails)
  log('error', context, err.message, { stack: err.stack, ...meta });

  // Persist to DB with sanitized metadata
  try {
    await writeError({
      context,
      severity: 'error',
      message: err.message,
      stack: err.stack || null,
      metadata: JSON.stringify(sanitizeMeta(meta)),
      instanceName: process.env.INSTANCE_NAME || 'default',
    });
  } catch (dbErr) {
    // DB write failed — log to stdout only, never propagate
    log('warn', 'observability', `captureError DB write failed: ${dbErr.message}`);
  }
}
