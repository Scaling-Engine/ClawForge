/**
 * Convert a snake_case tool ID to a human-readable Title Case display name.
 *
 * Examples:
 *   create_job                  → "Create Job"
 *   get_system_technical_specs  → "Get System Technical Specs"
 *   cancel_job                  → "Cancel Job"
 *
 * @param {string} toolName - The internal snake_case tool identifier
 * @returns {string} Human-readable Title Case display name
 */
export function getToolDisplayName(toolName) {
  return toolName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
