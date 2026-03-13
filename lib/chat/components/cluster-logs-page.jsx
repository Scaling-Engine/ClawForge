'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { ClusterDetailTabs } from './cluster-detail-tabs.jsx';
import { getClusterRunDetail, getAgentRunLogs } from '../actions.js';
import { SpinnerIcon } from './icons.js';

// ── Utilities ───────────────────────────────────────────────────────────────

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
 * Cluster logs page — historical log viewer for completed agents.
 *
 * @param {{ session: object, runId: string }} props
 */
export function ClusterLogsPage({ session, runId }) {
  const [run, setRun] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [agentLogs, setAgentLogs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  // Fetch run detail on mount
  useEffect(() => {
    getClusterRunDetail(runId)
      .then((data) => {
        setRun(data);
        // Auto-select first completed agent
        if (data?.agentRuns) {
          const first = data.agentRuns.find(a => a.status === 'completed' || a.status === 'failed');
          if (first) setSelectedAgentId(first.id);
        }
      })
      .catch(() => setRun(null))
      .finally(() => setLoading(false));
  }, [runId]);

  // Fetch logs when selected agent changes
  useEffect(() => {
    if (!selectedAgentId) return;
    setLogsLoading(true);
    getAgentRunLogs(selectedAgentId)
      .then((data) => setAgentLogs(data))
      .catch(() => setAgentLogs(null))
      .finally(() => setLogsLoading(false));
  }, [selectedAgentId]);

  return (
    <PageLayout session={session}>
      <ClusterDetailTabs runId={runId} activeTab="logs" />

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
          <SpinnerIcon size={16} />
          Loading...
        </div>
      )}

      {!loading && !run && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Run not found.
        </div>
      )}

      {!loading && run && (
        <>
          {/* Agent selector */}
          {run.agentRuns && run.agentRuns.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {run.agentRuns.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      selectedAgentId === agent.id
                        ? 'bg-accent text-accent-foreground border-accent'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50 border-transparent'
                    }`}
                  >
                    <span className="font-medium">{agent.role}</span>
                    <StatusBadge status={agent.status} />
                  </button>
                ))}
              </div>

              {/* Log display */}
              {logsLoading && (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <SpinnerIcon size={14} />
                  Loading logs...
                </div>
              )}

              {!logsLoading && agentLogs?.logs ? (
                <pre
                  className="rounded-lg p-4 overflow-x-auto overflow-y-auto max-h-[70vh] whitespace-pre-wrap"
                  style={{
                    backgroundColor: '#0d1117',
                    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                    fontSize: '12px',
                    lineHeight: '1.5',
                    color: '#c9d1d9',
                  }}
                >
                  {agentLogs.logs}
                </pre>
              ) : !logsLoading && selectedAgentId ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  No logs available for this agent.
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No completed agents yet.
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}
