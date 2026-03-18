/**
 * Next.js instrumentation hook for ClawForge.
 * Loaded by Next.js on server start when instrumentationHook is enabled.
 */

let initialized = false;

export async function register() {
  // Only run on the server, and only once
  if (typeof window !== 'undefined' || initialized) return;
  initialized = true;

  // Skip database init and cron scheduling during `next build`
  if (process.argv.includes('build')) return;

  // Load .env from project root
  const dotenv = await import('dotenv');
  dotenv.config();

  // Validate AUTH_SECRET is set (required by Auth.js for session encryption)
  if (!process.env.AUTH_SECRET) {
    console.error('\n  ERROR: AUTH_SECRET is not set in your .env file.');
    console.error('  This is required for session encryption.');
    console.error('  Run "openssl rand -base64 32" to generate one.\n');
    throw new Error('AUTH_SECRET environment variable is required');
  }

  // Initialize auth database
  const { initDatabase } = await import('../lib/db/index.js');
  initDatabase();

  // Start cron scheduler
  const { loadCrons } = await import('../lib/cron.js');
  loadCrons();

  // Start built-in crons
  const { startBuiltinCrons } = await import('../lib/cron.js');
  startBuiltinCrons();

  // Probe Docker Engine availability (graceful fallback if no socket)
  const { initDocker } = await import('../lib/tools/docker.js');
  await initDocker();

  // Reconcile workspace containers (sync DB with Docker state after restart)
  const { reconcileWorkspaces, checkIdleWorkspaces } = await import('../lib/tools/docker.js');
  try {
    await reconcileWorkspaces();
  } catch (err) {
    console.warn(`[workspace-reconcile] Startup reconciliation failed: ${err.message}`);
  }

  // Start idle workspace timeout checker (every 5 minutes)
  const IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(async () => {
    try {
      const stopped = await checkIdleWorkspaces();
      if (stopped > 0) {
        console.log(`[workspace-idle] Stopped ${stopped} idle workspace(s)`);
      }
    } catch (err) {
      console.warn(`[workspace-idle] Check failed: ${err.message}`);
    }
  }, IDLE_CHECK_INTERVAL_MS);

  console.log('ClawForge initialized');
}

/**
 * Next.js instrumentation hook — auto-captures Server Component and API route errors.
 * Called by Next.js for every unhandled server-side error when SENTRY_DSN is configured.
 * This is a module-level export, separate from register().
 */
export async function onRequestError(err, request, context) {
  const Sentry = await import('@sentry/nextjs');
  await Sentry.captureRequestError(err, { request, context });
}
