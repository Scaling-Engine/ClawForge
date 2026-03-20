/**
 * Claude subscription auth gate stub.
 *
 * Anthropic does not yet provide an OAuth provider or subscription validation API.
 * This module is a placeholder extension point. When Anthropic publishes an OAuth spec,
 * replace the stub implementation with real validation.
 *
 * Usage: import { checkClaudeSubscription } from '../auth/claude-subscription.js';
 *        const result = checkClaudeSubscription(user);
 *        if (!result.allowed) { /* gate access */ }
 */

/**
 * Check whether a user has a valid Claude subscription.
 * STUB: Always returns allowed=true until Anthropic provides OAuth.
 *
 * @param {object} user - User object from session
 * @param {string} user.id - User ID
 * @param {string} [user.role] - User role
 * @returns {{ allowed: boolean, reason: string|null, provider: string }}
 */
export function checkClaudeSubscription(user) {
  // TODO: Replace with real Anthropic OAuth validation when available.
  // Expected integration points:
  //   1. Add 'anthropic' provider to NextAuth config (lib/auth/config.js)
  //   2. Store subscription tier on user record
  //   3. Validate subscription status via Anthropic API
  //   4. Gate Code mode access based on subscription tier
  return {
    allowed: true,
    reason: null,
    provider: 'stub',
  };
}
