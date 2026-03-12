'use client';

import { useState, useEffect } from 'react';
import { getMcpServers } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper — matches settings-secrets-page pattern
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, description, children }) {
  return (
    <div className="pb-8 mb-8 border-b border-border last:border-b-0 last:pb-0 last:mb-0">
      <h2 className="text-base font-medium mb-1">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Server card — read-only display of a single MCP server
// ─────────────────────────────────────────────────────────────────────────────

function ServerCard({ server }) {
  const cmdLine = [server.command, ...(server.args || [])].join(' ');
  const tools = server.allowedTools || [];
  const hydrate = server.hydrateTools || [];

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">{server.name}</h3>

      <div className="space-y-2 text-sm">
        {/* Command */}
        <div>
          <span className="text-muted-foreground">Command: </span>
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            {cmdLine}
          </code>
        </div>

        {/* Allowed tools */}
        <div>
          <span className="text-muted-foreground">Allowed Tools: </span>
          {tools.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {tools.map((tool) => (
                <code
                  key={tool}
                  className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                >
                  mcp__{server.name}__{tool}
                </code>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              No tool restrictions (all tools allowed)
            </span>
          )}
        </div>

        {/* Hydration tools */}
        {hydrate.length > 0 && (
          <div>
            <span className="text-muted-foreground">Hydration: </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {hydrate.map((h, i) => (
                <code
                  key={i}
                  className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                >
                  {h.tool}
                </code>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsMcpPage() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMcpServers()
      .then((data) => setServers(data))
      .catch(() => setServers([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Section
        title="MCP Servers"
        description="Model Context Protocol servers configured for this instance. Servers provide additional tools to the job agent."
      >
        {loading ? (
          <div className="h-14 animate-pulse rounded-md bg-border/50" />
        ) : servers.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card p-6 flex flex-col items-center text-center">
            <p className="text-sm text-muted-foreground mb-1">
              No MCP servers configured
            </p>
            <p className="text-xs text-muted-foreground">
              Add servers to <code className="font-mono">config/MCP_SERVERS.json</code> to enable MCP tools.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {servers.map((server) => (
              <ServerCard key={server.name} server={server} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
