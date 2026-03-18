import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export default logger;

/**
 * Emit a structured log line to stdout via pino.
 *
 * @param {'trace'|'debug'|'info'|'warn'|'error'|'fatal'} level
 * @param {string} context - Subsystem label (e.g. 'channel', 'startup', 'db')
 * @param {string} message - Human-readable message
 * @param {object} [meta={}] - Additional key-value metadata
 */
export function log(level, context, message, meta = {}) {
  logger[level]({ context, ...meta }, message);
}
