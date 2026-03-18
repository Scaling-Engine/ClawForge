import Docker from 'dockerode';

/**
 * Verify the GitHub Personal Access Token (GH_TOKEN) by calling the GitHub /user endpoint.
 * Uses a 5-second AbortController timeout.
 *
 * @returns {{ success: boolean, login?: string, error?: string }}
 */
export async function verifyGithubPat() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `GitHub API returned ${res.status}: ${text}` };
    }
    const data = await res.json();
    return { success: true, login: data.login };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { success: false, error: 'GitHub API request timed out (5s)' };
    }
    return { success: false, error: err.message };
  }
}

/**
 * Verify the Docker daemon is running and accessible via the Unix socket.
 * Uses Promise.race with a 5-second timeout — critical guard against Docker hanging
 * when the daemon is down.
 *
 * @returns {{ success: boolean, error?: string }}
 */
export async function verifyDockerSocket() {
  try {
    const docker = new Docker({ socketPath: '/var/run/docker.sock' });
    const pingPromise = docker.ping();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Docker daemon not reachable (timeout)')), 5000)
    );
    await Promise.race([pingPromise, timeoutPromise]);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Verify a Slack incoming webhook URL by posting a test message.
 * Uses a 5-second AbortController timeout.
 *
 * @param {string} webhookUrl - The Slack incoming webhook URL to test
 * @returns {{ success: boolean, error?: string }}
 */
export async function verifySlackWebhook(webhookUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'ClawForge onboarding test - connection verified' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `Slack webhook returned ${res.status}: ${text}` };
    }
    return { success: true };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { success: false, error: 'Slack webhook request timed out (5s)' };
    }
    return { success: false, error: err.message };
  }
}
