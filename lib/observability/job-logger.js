import fs from 'fs';
import path from 'path';
import { logsDir } from '../paths.js';

/**
 * Append a structured event to the per-job JSONL log file.
 * Creates the logs/jobs/ directory if it doesn't exist.
 * Never throws — job execution must not fail due to logging errors.
 *
 * @param {string} jobId - The job identifier (used as filename)
 * @param {object} event - Event data to log
 * @param {string} [baseDir=logsDir] - Base directory for logs (overridable for testing)
 */
export function appendJobEvent(jobId, event, baseDir = logsDir) {
  try {
    const jobsDir = path.join(baseDir, 'jobs');
    if (!fs.existsSync(jobsDir)) {
      fs.mkdirSync(jobsDir, { recursive: true });
    }
    const line = JSON.stringify({ t: Date.now(), jobId, ...event }) + '\n';
    fs.appendFileSync(path.join(jobsDir, `${jobId}.jsonl`), line);
  } catch {
    // Silent — logging must not propagate to job execution
  }
}
