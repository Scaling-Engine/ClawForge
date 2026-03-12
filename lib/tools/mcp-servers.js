import fs from 'fs';
import { mcpServersFile } from '../paths.js';

/**
 * Load MCP server configs from config/MCP_SERVERS.json.
 * Reads on every call (no caching — env vars may change between dispatches).
 * @returns {Array<{name: string, command: string, args: string[], env: object, allowedTools: string[], hydrateTools: Array}>}
 */
function loadMcpServers() {
  try {
    const raw = fs.readFileSync(mcpServersFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.mcpServers) ? parsed.mcpServers : [];
  } catch {
    return [];
  }
}

/**
 * Build Claude Code MCP config from ClawForge server entries.
 *
 * Transforms ClawForge array format into Claude Code object map format,
 * resolves {{AGENT_LLM_*}} template variables from process.env,
 * and generates the allowedTools fragment string.
 *
 * @param {Array} [servers] - Server entries from loadMcpServers(). Defaults to loadMcpServers() result.
 * @returns {{configJson: string, allowedToolsFragment: string, hydrateSteps: Array<{serverName: string, tool: string, args: object}>} | null}
 */
function buildMcpConfig(servers) {
  const entries = servers ?? loadMcpServers();
  if (!entries.length) return null;

  const TEMPLATE_RE = /\{\{(AGENT_LLM_[^}]+)\}\}/g;
  const mcpServersObj = {};
  const toolFragments = [];
  const allHydrateSteps = [];

  for (const server of entries) {
    const { name, command, args, env, allowedTools, hydrateTools } = server;

    // Resolve template vars in env values
    const resolvedEnv = {};
    if (env && typeof env === 'object') {
      for (const [envKey, envVal] of Object.entries(env)) {
        resolvedEnv[envKey] = typeof envVal === 'string'
          ? envVal.replace(TEMPLATE_RE, (_match, key) => process.env[key] ?? '')
          : envVal;
      }
    }

    // Build Claude Code object map entry
    mcpServersObj[name] = {
      command,
      args: args || [],
      env: resolvedEnv,
    };

    // Build allowedTools fragment with mcp__servername__toolname format
    const tools = Array.isArray(allowedTools) ? allowedTools : [];
    for (const tool of tools) {
      toolFragments.push(`mcp__${name}__${tool}`);
    }

    // Collect hydrateTools entries for Plan 02
    const hydrate = Array.isArray(hydrateTools) ? hydrateTools : [];
    for (const step of hydrate) {
      allHydrateSteps.push({ serverName: name, ...step });
    }
  }

  return {
    configJson: JSON.stringify({ mcpServers: mcpServersObj }),
    allowedToolsFragment: toolFragments.join(','),
    hydrateSteps: allHydrateSteps,
  };
}

export { loadMcpServers, buildMcpConfig };
