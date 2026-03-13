'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { ClusterDetailTabs } from './cluster-detail-tabs.jsx';
import { getClusterRunDetail } from '../actions.js';
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
 * Cluster run overview page — shows run metadata and agent timeline.
 *
 * @param {{ session: object, runId: string }} props
 */
export function ClusterDetailPage({ session, runId }) {
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [promptExpanded, setPromptExpanded] = useState(false);

  useEffect(() => {
    getClusterRunDetail(runId)
      .then((data) => setRun(data))
      .catch(() => setRun(null))
      .finally(() => setLoading(false));
  }, [runId]);

  return (
    <PageLayout session={session}>
      <ClusterDetailTabs runId={runId} activeTab="overview" />

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
          <SpinnerIcon size={16} />
          Loading cluster run...
        </div>
      )}

      {!loading && !run && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Run not found.
        </div>
      )}

      {!loading && run && (
        <>
          {/* Run Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-semibold">{run.clusterName}</h1>
              <StatusBadge status={run.status} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Instance: <span className="font-medium text-foreground">{run.instanceName}</span></span>
              <span>Agents: <span className="font-medium text-foreground">{run.totalAgentRuns}</span></span>
              <span>Started: {formatTs(run.createdAt)}</span>
              {run.completedAt && <span>Completed: {formatTs(run.completedAt)}</span>}
              {run.completedAt && run.createdAt && (
                <span>Duration: {Math.round((run.completedAt - run.createdAt) / 1000)}s</span>
              )}
            </div>

            {/* Initial prompt */}
            {run.initialPrompt && (
              <div className="mt-3">
                <button
                  onClick={() => setPromptExpanded(!promptExpanded)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {promptExpanded ? 'Hide prompt' : 'Show prompt'}
                </button>
                {promptExpanded && (
                  <pre className="mt-1 text-xs bg-muted rounded-md p-3 font-mono whitespace-pre-wrap max-h-40 overflow-auto">
                    {run.initialPrompt}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Fail reason alert */}
          {run.failReason && (
            <div className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm font-medium text-red-500 mb-1">Run Failed</p>
              <p className="text-xs text-red-400">{run.failReason}</p>
            </div>
          )}

          {/* Agent Timeline */}
          <h2 className="text-sm font-semibold mb-3">Agent Timeline</h2>
          {run.agentRuns && run.agentRuns.length > 0 ? (
            <div className="flex flex-col gap-0">
              {run.agentRuns.map((agent, i) => (
                <div key={agent.id} className="flex items-start gap-3 relative">
                  {/* Vertical connector line */}
                  {i < run.agentRuns.length - 1 && (
                    <div className="absolute left-3 top-6 w-0.5 h-full bg-border" />
                  )}
                  {/* Status dot with index number */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                    agent.status === 'running' ? 'bg-yellow-500/20 text-yellow-500' :
                    agent.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                    'bg-red-500/20 text-red-500'
                  }`}>
                    {agent.agentIndex + 1}
                  </div>
                  {/* Agent info row */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{agent.role}</span>
                      <StatusBadge status={agent.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      label: {agent.label || '---'} | exit: {agent.exitCode ?? '---'} | {timeAgo(agent.createdAt)}
                    </p>
                    {agent.prUrl && (
                      <a href={agent.prUrl} target="_blank" rel="noopener noreferrer"
                         className="text-xs text-blue-400 hover:underline mt-0.5 block">
                        {agent.prUrl}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No agent runs recorded.</p>
          )}
        </>
      )}
    </PageLayout>
  );
}
