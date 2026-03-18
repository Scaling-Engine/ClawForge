import { getConfigValue, setConfigValue } from '../db/config.js';
import { getConsecutiveFailureCount } from '../db/job-outcomes.js';

// Alert fires when this many consecutive failures are detected
const FAILURE_THRESHOLD = 3;

// Minimum time between alerts for the same instance (1 hour)
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Check for consecutive job failures and send a Slack alert if threshold is met.
 * Throttled to one alert per instance per hour to avoid spam.
 * Non-fatal — catches all errors internally.
 *
 * @param {string} instanceName - The instance to check (used for throttle key + alert message)
 * @returns {Promise<void>}
 */
export async function checkAndAlertConsecutiveFailures(instanceName) {
  const count = getConsecutiveFailureCount(FAILURE_THRESHOLD);
  if (count < FAILURE_THRESHOLD) return;

  // Check throttle: has an alert been sent within the cooldown window?
  const throttleKey = 'alert:consecutive_failure:' + instanceName;
  const lastAlertRaw = getConfigValue(throttleKey);
  const lastAlertAt = lastAlertRaw ? parseInt(lastAlertRaw, 10) : 0;
  if (Date.now() - lastAlertAt < ALERT_COOLDOWN_MS) return;

  // Send Slack alert using the same pattern as billing warnings
  try {
    const { SLACK_BOT_TOKEN, SLACK_OPERATOR_CHANNEL } = process.env;
    if (SLACK_BOT_TOKEN && SLACK_OPERATOR_CHANNEL) {
      const { WebClient } = await import('@slack/web-api');
      const slack = new WebClient(SLACK_BOT_TOKEN);
      await slack.chat.postMessage({
        channel: SLACK_OPERATOR_CHANNEL,
        text: `Alert: Instance "${instanceName}" has ${count} consecutive job failures. Check /admin/superadmin/monitoring for details.`,
      });
      // Record the alert timestamp to enforce cooldown
      setConfigValue(throttleKey, String(Date.now()));
    }
  } catch (err) {
    console.warn('Failed to send consecutive failure alert:', err.message);
  }
}
