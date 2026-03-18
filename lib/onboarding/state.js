import { getDb } from '../db/index.js';
import { onboardingState } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Step order for the onboarding wizard.
 * Used to advance current_step when a step is marked complete.
 */
const STEP_ORDER = ['github_connect', 'docker_verify', 'channel_connect', 'first_job'];

/**
 * Map from step name to column name in the onboarding_state table.
 */
const STEP_COLUMN = {
  github_connect: 'githubConnect',
  docker_verify: 'dockerVerify',
  channel_connect: 'channelConnect',
  first_job: 'firstJob',
};

/**
 * Get the current onboarding state (singleton row).
 * Returns null if no onboarding has been started.
 *
 * @returns {object|null}
 */
export function getOnboardingState() {
  const db = getDb();
  return db.select().from(onboardingState).where(eq(onboardingState.id, 'singleton')).get() ?? null;
}

/**
 * Update a single onboarding step status, and advance current_step if the step completed.
 * Creates the singleton row on first call.
 *
 * @param {string} step   - One of 'github_connect', 'docker_verify', 'channel_connect', 'first_job'
 * @param {string} status - 'pending' | 'complete' | 'failed'
 */
export function upsertOnboardingStep(step, status) {
  const db = getDb();
  const now = Date.now();

  const existing = db.select().from(onboardingState).where(eq(onboardingState.id, 'singleton')).get();

  // Determine next current_step when this step completes
  let nextStep = existing?.currentStep ?? 'github_connect';
  if (status === 'complete') {
    const idx = STEP_ORDER.indexOf(step);
    if (idx !== -1 && idx + 1 < STEP_ORDER.length) {
      nextStep = STEP_ORDER[idx + 1];
    }
  }

  if (existing) {
    db.update(onboardingState)
      .set({
        [STEP_COLUMN[step]]: status,
        currentStep: nextStep,
        updatedAt: now,
      })
      .where(eq(onboardingState.id, 'singleton'))
      .run();
  } else {
    db.insert(onboardingState).values({
      id: 'singleton',
      currentStep: nextStep,
      githubConnect: step === 'github_connect' ? status : 'pending',
      dockerVerify: step === 'docker_verify' ? status : 'pending',
      channelConnect: step === 'channel_connect' ? status : 'pending',
      firstJob: step === 'first_job' ? status : 'pending',
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    }).run();
  }
}

/**
 * Mark the entire onboarding wizard as complete.
 * Sets completed_at to the current ISO timestamp.
 */
export function markOnboardingComplete() {
  const db = getDb();
  db.update(onboardingState)
    .set({
      completedAt: new Date().toISOString(),
      updatedAt: Date.now(),
    })
    .where(eq(onboardingState.id, 'singleton'))
    .run();
}

/**
 * Reset (delete) the onboarding state singleton.
 * Useful for testing or allowing re-onboarding.
 */
export function resetOnboardingState() {
  const db = getDb();
  db.delete(onboardingState).where(eq(onboardingState.id, 'singleton')).run();
}
