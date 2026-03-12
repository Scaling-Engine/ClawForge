/**
 * Stream Manager — In-memory singleton tracking active Docker log streams per jobId.
 *
 * Uses globalThis.__clawforge_streams to survive Next.js module hot-reloads,
 * following the same pattern as globalThis.__clawforge_docker in docker.js.
 *
 * Each entry:
 *   { logCleanup: Function, subscribers: Set<Function>, startedAt: number, slackStatusTs: string|null, slackChannel: string|null }
 */

// Reuse existing map across hot-reloads — do NOT reinitialize if already present.
if (!globalThis.__clawforge_streams) {
  globalThis.__clawforge_streams = new Map();
}

const streams = globalThis.__clawforge_streams;

export const streamManager = {
  /**
   * Register a new active job stream.
   *
   * @param {string} jobId
   * @param {Function} logCleanup - Calls .destroy() on the Docker log stream
   */
  register(jobId, logCleanup) {
    streams.set(jobId, {
      logCleanup,
      subscribers: new Set(),
      startedAt: Date.now(),
      slackStatusTs: null,
      slackChannel: null,
    });
  },

  /**
   * Subscribe to events for a job.
   * Returns an unsubscribe function. If jobId is not registered, returns a no-op.
   *
   * @param {string} jobId
   * @param {Function} callback - Called as callback(type, data)
   * @returns {Function} unsubscribe
   */
  subscribe(jobId, callback) {
    const entry = streams.get(jobId);
    if (!entry) {
      return () => {};
    }
    entry.subscribers.add(callback);
    return () => {
      const current = streams.get(jobId);
      if (current) {
        current.subscribers.delete(callback);
      }
    };
  },

  /**
   * Emit an event to all subscribers for a job.
   * Each subscriber is wrapped in try/catch so a broken subscriber cannot kill others.
   *
   * @param {string} jobId
   * @param {string} type - Semantic event type
   * @param {object} data
   */
  emit(jobId, type, data) {
    const entry = streams.get(jobId);
    if (!entry) return;
    for (const callback of entry.subscribers) {
      try {
        callback(type, data);
      } catch (err) {
        console.error(`[stream-manager] subscriber error for job ${jobId}:`, err.message);
      }
    }
  },

  /**
   * Mark a job as complete.
   * Emits 'complete' with elapsed ms, calls logCleanup, removes entry.
   *
   * @param {string} jobId
   */
  complete(jobId) {
    const entry = streams.get(jobId);
    if (!entry) return;
    const elapsedMs = Date.now() - entry.startedAt;
    this.emit(jobId, 'complete', { elapsedMs });
    try {
      entry.logCleanup();
    } catch (err) {
      console.error(`[stream-manager] logCleanup error for job ${jobId}:`, err.message);
    }
    streams.delete(jobId);
  },

  /**
   * Cancel a job.
   * Emits 'cancelled' with elapsed ms, calls logCleanup, removes entry.
   *
   * @param {string} jobId
   */
  cancel(jobId) {
    const entry = streams.get(jobId);
    if (!entry) return;
    const elapsedMs = Date.now() - entry.startedAt;
    this.emit(jobId, 'cancelled', { elapsedMs });
    try {
      entry.logCleanup();
    } catch (err) {
      console.error(`[stream-manager] logCleanup error for job ${jobId}:`, err.message);
    }
    streams.delete(jobId);
  },

  /**
   * Store the Slack message timestamp for edit-in-place updates (STRM-06).
   *
   * @param {string} jobId
   * @param {string} channel - Slack channel ID
   * @param {string} statusTs - Slack message timestamp (ts)
   */
  setSlackStatus(jobId, channel, statusTs) {
    const entry = streams.get(jobId);
    if (!entry) return;
    entry.slackChannel = channel;
    entry.slackStatusTs = statusTs;
  },

  /**
   * Retrieve Slack status metadata for a job.
   *
   * @param {string} jobId
   * @returns {{ channel: string, statusTs: string }|null}
   */
  getSlackStatus(jobId) {
    const entry = streams.get(jobId);
    if (!entry || entry.slackStatusTs == null) return null;
    return { channel: entry.slackChannel, statusTs: entry.slackStatusTs };
  },

  /**
   * Check whether a job stream is currently active.
   *
   * @param {string} jobId
   * @returns {boolean}
   */
  isActive(jobId) {
    return streams.has(jobId);
  },
};
