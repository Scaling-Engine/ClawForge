'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { ChevronDownIcon, SpinnerIcon, ClusterIcon } from './icons.js';
import { getClusterConfig, getClusterRuns, getClusterRunDetail } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return '—';
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
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Badges
// ─────────────────────────────────────────────────────────────────────────────

const runStatusStyles = {
  running: 'bg-yellow-500/10 text-yellow-500',
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

// ─────────────────────────────────────────────────────────────────────────────
// Cluster Definitions Section
// ─────────────────────────────────────────────────────────────────────────────

function RoleCard({ role }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border bg-muted/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-accent/50 rounded-md"
      >
        <span className="text-sm font-medium flex-1">{role.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {(role.allowedTools || []).length} tools
        </span>
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <ChevronDownIcon size={14} />
        </span>
      </button>

      {expanded && (
        <div className="border-t px-3 py-3 flex flex-col gap-3">
          {role.allowedTools && role.allowedTools.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Allowed Tools</p>
              <div className="flex flex-wrap gap-1">
                {role.allowedTools.map((tool) => (
                  <span key={tool} className="inline-flex items-center rounded-full bg-blue-500/10 text-blue-500 px-2 py-0.5 text-[10px] font-mono">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
          {role.mcpServers && role.mcpServers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">MCP Servers</p>
              <div className="flex flex-wrap gap-1">
                {role.mcpServers.map((s) => (
                  <span key={s} className="inline-flex items-center rounded-full bg-purple-500/10 text-purple-500 px-2 py-0.5 text-[10px] font-mono">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {role.transitions && Object.keys(role.transitions).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Transitions</p>
              <pre className="text-xs bg-muted rounded-md p-2 font-mono overflow-auto max-h-32">
                {JSON.stringify(role.transitions, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClusterCard({ cluster }) {
  const [expanded, setExpanded] = useState(false);
  const triggerTypes = cluster.triggers?.map((t) => t.type || t).join(', ') || '—';
  const roleCount = (cluster.roles || []).length;

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full text-left p-4 hover:bg-accent/50 rounded-lg"
      >
        <div className="shrink-0 rounded-md bg-muted p-2">
          <ClusterIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{cluster.name}</p>
          {cluster.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{cluster.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{roleCount} role{roleCount !== 1 ? 's' : ''}</span>
          <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
            <ChevronDownIcon size={14} />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 flex flex-col gap-3">
          {cluster.triggers && cluster.triggers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Trigger Types</p>
              <p className="text-xs font-mono">{triggerTypes}</p>
            </div>
          )}
          {(cluster.roles || []).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Roles</p>
              <div className="flex flex-col gap-2">
                {cluster.roles.map((role, i) => (
                  <RoleCard key={`${role.name}-${i}`} role={role} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClusterDefinitions({ clusters, loading }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-border/50" />
        ))}
      </div>
    );
  }

  if (!clusters || clusters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <ClusterIcon size={24} />
        </div>
        <p className="text-sm font-medium mb-1">No clusters configured</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Add a <span className="font-mono">CLUSTER.json</span> to your config directory.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {clusters.map((cluster, i) => (
        <ClusterCard key={`${cluster.name}-${i}`} cluster={cluster} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Run History Section
// ─────────────────────────────────────────────────────────────────────────────

function AgentRunRow({ agent }) {
  return (
    <div className="flex items-start gap-3 py-2 px-3 text-sm">
      <div className="w-24 shrink-0">
        <StatusBadge status={agent.status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{agent.role}</p>
        {agent.label && (
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{agent.label}</p>
        )}
      </div>
      <div className="text-xs text-muted-foreground shrink-0">
        exit: {agent.exitCode ?? '—'}
      </div>
      <div className="shrink-0">
        {agent.prUrl ? (
          <a
            href={agent.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline"
          >
            PR
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

function RunRow({ run }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) {
      setLoadingDetail(true);
      try {
        const d = await getClusterRunDetail(run.id);
        setDetail(d);
      } catch (err) {
        console.error('Failed to fetch cluster run detail:', err);
      } finally {
        setLoadingDetail(false);
      }
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={handleExpand}
        className="flex items-center gap-3 w-full text-left p-4 hover:bg-accent/50 rounded-lg"
      >
        <StatusBadge status={run.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{run.clusterName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {run.totalAgentRuns} agent run{run.totalAgentRuns !== 1 ? 's' : ''}
            <span className="mx-1.5 text-border">|</span>
            {timeAgo(run.createdAt)}
          </p>
        </div>
        <div className="text-xs text-muted-foreground shrink-0 text-right">
          {run.completedAt ? formatTs(run.completedAt) : 'running'}
        </div>
        <span className={`transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}>
          <ChevronDownIcon size={14} />
        </span>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3">
          {loadingDetail ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <SpinnerIcon size={14} />
              Loading agents...
            </div>
          ) : detail?.agentRuns && detail.agentRuns.length > 0 ? (
            <div className="divide-y divide-border">
              {detail.agentRuns.map((agent) => (
                <AgentRunRow key={agent.id} agent={agent} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2">No agent runs recorded.</p>
          )}
        </div>
      )}
    </div>
  );
}

function RunHistory({ runs, loading }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-border/50" />
        ))}
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No cluster runs yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {runs.map((run) => (
        <RunRow key={run.id} run={run} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function ClustersPage({ session }) {
  const [clusters, setClusters] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);

  useEffect(() => {
    getClusterConfig()
      .then((data) => setClusters(data?.clusters || []))
      .catch(() => setClusters([]))
      .finally(() => setLoadingConfig(false));

    getClusterRuns()
      .then((data) => setRuns(Array.isArray(data) ? data : []))
      .catch(() => setRuns([]))
      .finally(() => setLoadingRuns(false));
  }, []);

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Clusters</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-agent workflows — chain multiple agents together to tackle complex tasks in sequence.
          </p>
        </div>
      </div>

      {/* Cluster Definitions */}
      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3">Cluster Definitions</h2>
        <ClusterDefinitions clusters={clusters} loading={loadingConfig} />
      </section>

      {/* Run History */}
      <section>
        <h2 className="text-base font-semibold mb-3">Run History</h2>
        <RunHistory runs={runs} loading={loadingRuns} />
      </section>
    </PageLayout>
  );
}
