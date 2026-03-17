/**
 * HTTP client for querying remote ClawForge instances.
 *
 * Local instance (url === null) is queried by importing the handler directly.
 * Remote instances are queried via fetch with Bearer token auth and a 5s timeout.
 */

import { getInstanceRegistry } from './config.js';

/**
 * Query a single instance for a given superadmin endpoint.
 *
 * @param {{ name: string, url: string|null, token: string|null }} instance
 * @param {string} endpoint - e.g. 'health', 'stats', 'jobs'
 * @param {Record<string, string>} [params] - query string params
 * @returns {Promise<object>}
 */
export async function queryInstance(instance, endpoint, params) {
  if (instance.url === null) {
    // Local instance — import handler directly
    const { handleSuperadminEndpoint } = await import('../../api/superadmin.js');
    return handleSuperadminEndpoint(endpoint, params || {});
  }

  // Remote instance — fetch with token auth
  const url = new URL(`/api/superadmin/${endpoint}`, instance.url);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null) url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${instance.token}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Query all registered instances in parallel for a given endpoint.
 * Never throws — returns partial results with per-instance error info.
 *
 * @param {string} endpoint
 * @param {Record<string, string>} [params]
 * @returns {Promise<Array<{ instance: string, data: object|null, error: string|null }>>}
 */
export async function queryAllInstances(endpoint, params) {
  const instances = getInstanceRegistry();

  const results = await Promise.allSettled(
    instances.map((inst) =>
      queryInstance(inst, endpoint, params).then((data) => ({
        instance: inst.name,
        data,
        error: null,
      }))
    )
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      instance: instances[i].name,
      data: null,
      error: result.reason?.message || 'Unknown error',
    };
  });
}
