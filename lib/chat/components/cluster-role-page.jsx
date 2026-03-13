'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { ClusterDetailTabs } from './cluster-detail-tabs.jsx';
import { getClusterRunDetail, getClusterDefinition } from '../actions.js';
import { SpinnerIcon } from './icons.js';

// ── Utilities (duplicated from clusters-page — not exported there) ──────────

function timeAgo(ts) {
  if (!ts) return '---';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTs(ts) {
  if (!ts) return '---';
  return new Date(ts).toLocaleString();
}

const runStatusStyles = {
  running: 'bg-yellow-500/10 text-yellow-500',
  completed: 'bg-green-500/10 text-green-500',
  complete: 'bg-green-500/10 text-green-500',
  failed: 'bg-red-500/10 text-red-500',
  'limit-exceeded': 'bg-orange-500/10 text-orange-500',
};

function StatusBadge({ status }) {
  const cls = runStatusStyles[status] || 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${cls}`}>
      {status || 'unknown'}
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

/**
 * Cluster role detail page — shows role config and agent history for a specific role.
 *
 * @param {{ session: object, runId: string, roleId: string }} props
 */
export function ClusterRolePage({ session, runId, roleId }) {
  const [run, setRun] = useState(null);
  const [roleConfig, setRoleConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configNotFound, setConfigNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const detail = await getClusterRunDetail(runId);
        if (cancelled) return;
        setRun(detail);

        if (detail?.clusterName) {
          const cluster = await getClusterDefinition(detail.clusterName);
          if (cancelled) return;
          if (cluster?.roles) {
            const role = cluster.roles.find((r) => r.name === roleId);
            if (role) {
              setRoleConfig(role);
            } else {
              setConfigNotFound(true);
            }
          } else {
            setConfigNotFound(true);
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [runId, roleId]);

  // Filter agent runs to only those matching this role
  const matchingAgents = run?.agentRuns?.filter((a) => a.role === roleId) || [];

  // Label history sequence
  const labelSequence = matchingAgents
    .filter((a) => a.label)
    .map((a) => a.label);

  return (
    <PageLayout session={session}>
      <ClusterDetailTabs runId={runId} activeTab={null} />

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
          <SpinnerIcon size={16} />
          Loading role detail...
        </div>
      )}

      {!loading && !run && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Run not found.
        </div>
      )}

      {!loading && run && (
        <>
          {/* Role heading */}
          <div className="mb-6">
            <h1 className="text-xl font-semibold mb-1">{roleId}</h1>
            <p className="text-xs text-muted-foreground">
              Cluster: {run.clusterName} | Run: {runId.slice(0, 8)}...
            </p>
          </div>

          {/* Role config section */}
          {configNotFound ? (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 mb-6">
              <p className="text-sm text-yellow-500">
                Role configuration not found. The cluster config may have changed since this run.
              </p>
            </div>
          ) : roleConfig ? (
            <div className="mb-6 space-y-4">
              <h2 className="text-sm font-semibold">Role Configuration</h2>

              {/* System prompt */}
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  System Prompt
                </summary>
                <pre
                  className="mt-2 rounded-md p-3 whitespace-pre-wrap text-xs max-h-60 overflow-auto"
                  style={{
                    backgroundColor: '#0d1117',
                    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                    fontSize: '12px',
                    lineHeight: '1.5',
                    color: '#c9d1d9',
                  }}
                >
                  {roleConfig.systemPrompt}
                </pre>
              </details>

              {/* Allowed tools */}
              {roleConfig.allowedTools && roleConfig.allowedTools.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Allowed Tools</p>
                  <div className="flex flex-wrap gap-1.5">
                    {roleConfig.allowedTools.map((tool) => (
                      <span
                        key={tool}
                        className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* MCP servers */}
              {roleConfig.mcpServers && roleConfig.mcpServers.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">MCP Servers</p>
                  <ul className="list-disc list-inside text-xs text-foreground">
                    {roleConfig.mcpServers.map((server) => (
                      <li key={typeof server === 'string' ? server : server.name}>
                        {typeof server === 'string' ? server : server.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Transitions */}
              {roleConfig.transitions && Object.keys(roleConfig.transitions).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Transitions</p>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Label</th>
                          <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Next Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(roleConfig.transitions).map(([label, nextRole]) => (
                          <tr key={label} className="border-t">
                            <td className="px-3 py-1.5 font-mono">{label}</td>
                            <td className="px-3 py-1.5">
                              {nextRole ? (
                                <span className="text-foreground">{nextRole}</span>
                              ) : (
                                <span className="text-muted-foreground italic">terminate</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Agent history section */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold mb-3">Agent History ({matchingAgents.length} runs)</h2>

            {matchingAgents.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Step</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Label</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Exit</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Started</th>
                      <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">PR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchingAgents.map((agent) => (
                      <tr key={agent.id} className="border-t">
                        <td className="px-3 py-1.5 font-mono">{agent.agentIndex + 1}</td>
                        <td className="px-3 py-1.5"><StatusBadge status={agent.status} /></td>
                        <td className="px-3 py-1.5 font-mono">{agent.label || '---'}</td>
                        <td className="px-3 py-1.5">{agent.exitCode ?? '---'}</td>
                        <td className="px-3 py-1.5">{timeAgo(agent.createdAt)}</td>
                        <td className="px-3 py-1.5">
                          {agent.prUrl ? (
                            <a href={agent.prUrl} target="_blank" rel="noopener noreferrer"
                               className="text-blue-400 hover:underline">
                              PR
                            </a>
                          ) : '---'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No agent runs for this role.</p>
            )}
          </div>

          {/* Label history */}
          {labelSequence.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2">Label Sequence</h2>
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {labelSequence.map((label, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="rounded bg-muted px-2 py-0.5 font-mono">{label}</span>
                    {i < labelSequence.length - 1 && (
                      <span className="text-muted-foreground">{'->'}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}
