/**
 * Superadmin configuration module.
 *
 * Reads hub mode and instance registry from environment variables.
 * No database dependency — pure env-based config.
 */

/**
 * Returns true if this instance is the superadmin hub.
 * @returns {boolean}
 */
export function isSuperadminHub() {
  return process.env.SUPERADMIN_HUB === 'true';
}

/**
 * Get the local instance name from env.
 * @returns {string}
 */
export function getLocalInstanceName() {
  return process.env.INSTANCE_NAME || 'default';
}

/**
 * Returns true if the given role string is 'superadmin'.
 * @param {string} userRole
 * @returns {boolean}
 */
export function getSuperadminRole(userRole) {
  return userRole === 'superadmin';
}

/**
 * Parse the SUPERADMIN_INSTANCES env var (JSON array) and always include the
 * local instance with `url: null` to indicate "query locally".
 *
 * Expected env format:
 *   SUPERADMIN_INSTANCES='[{"name":"noah","url":"https://noah.clawforge.dev","token":"xxx"}]'
 *
 * @returns {Array<{ name: string, url: string|null, token: string|null }>}
 */
export function getInstanceRegistry() {
  const localName = getLocalInstanceName();
  const local = { name: localName, url: null, token: null };

  const raw = process.env.SUPERADMIN_INSTANCES;
  if (!raw) return [local];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [local];

    // Filter out duplicates of the local instance, then prepend local
    const remote = parsed.filter(
      (i) => i && typeof i === 'object' && i.name !== localName
    );

    return [local, ...remote];
  } catch {
    return [local];
  }
}
