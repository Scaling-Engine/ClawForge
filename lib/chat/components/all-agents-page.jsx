'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLayout } from './page-layout.js';
import { SpinnerIcon, RefreshIcon } from './icons.js';
import {
  getAllAgentPullRequests,
  getAllAgentWorkspaces,
  getAllAgentClusters,
} from '../actions.js';

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StaleBanner({ agentSlug, error }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-600">
      <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2 py-0.5 font-medium uppercase">Stale</span>
      <span className="font-mono font-medium">{agentSlug}</span>
      <span className="text-muted-foreground">— {error || 'offline'}</span>
    </div>
  );
}

// ─── AllAgentsPRsPage ────────────────────────────────────────────────────────

function PRStatusBadge({ pr }) {
  if (pr.merged_at) return <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-600 uppercase">Merged</span>;
  if (pr.state === 'closed') return <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 uppercase">Closed</span>;
  return <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 uppercase">Open</span>;
}

export function AllAgentsPRsPage({ session }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState('open');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllAgentPullRequests(state);
      setRows(Array.isArray(result) ? result : []);
    } finally {
      setLoading(false);
    }
  }, [state]);

  useEffect(() => { load(); }, [load]);

  const staleAgents = rows.filter(r => r.stale);
  const allPrs = rows.flatMap(r => r.prs.map(pr => ({ ...pr, _agentSlug: r.agentSlug })));

  return (
    <PageLayout session={session}>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">All Agents — Pull Requests</h1>
        <div className="flex items-center gap-2">
          {['open', 'closed', 'all'].map(s => (
            <button
              key={s}
              onClick={() => setState(s)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${state === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
            >
              {s}
            </button>
          ))}
          <button onClick={load} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <RefreshIcon className="h-3 w-3" /> Refresh
          </button>
        </div>

        {staleAgents.length > 0 && (
          <div className="space-y-1">
            {staleAgents.map(r => <StaleBanner key={r.agentSlug} agentSlug={r.agentSlug} error={r.error} />)}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><SpinnerIcon className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : allPrs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No pull requests found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 text-left font-medium">Agent</th>
                  <th className="pb-2 pr-4 text-left font-medium">Title</th>
                  <th className="pb-2 pr-4 text-left font-medium">Repo</th>
                  <th className="pb-2 pr-4 text-left font-medium">Status</th>
                  <th className="pb-2 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allPrs.map(pr => (
                  <tr key={`${pr._agentSlug}-${pr._repo}-${pr.number}`} className="hover:bg-muted/30">
                    <td className="py-2 pr-4">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium">{pr._agentSlug}</span>
                    </td>
                    <td className="py-2 pr-4 max-w-xs">
                      <a href={pr.html_url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline line-clamp-1">
                        #{pr.number} {pr.title}
                      </a>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{pr._repo}</td>
                    <td className="py-2 pr-4"><PRStatusBadge pr={pr} /></td>
                    <td className="py-2 text-xs text-muted-foreground">{timeAgo(pr.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

// ─── AllAgentsWorkspacesPage ─────────────────────────────────────────────────

function WorkspaceStatusBadge({ status }) {
  const map = {
    running: 'bg-green-500/10 text-green-600',
    stopped: 'bg-muted text-muted-foreground',
    starting: 'bg-yellow-500/10 text-yellow-600',
    error: 'bg-red-500/10 text-red-600',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${map[status] || 'bg-muted text-muted-foreground'}`}>
      {status || 'unknown'}
    </span>
  );
}

export function AllAgentsWorkspacesPage({ session }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllAgentWorkspaces();
      setRows(Array.isArray(result) ? result : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const staleAgents = rows.filter(r => r.stale);
  const allWorkspaces = rows.flatMap(r => r.workspaces.map(ws => ({ ...ws, _agentSlug: r.agentSlug })));

  return (
    <PageLayout session={session}>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">All Agents — Workspaces</h1>
        <div className="flex items-center justify-end">
          <button onClick={load} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <RefreshIcon className="h-3 w-3" /> Refresh
          </button>
        </div>

        {staleAgents.length > 0 && (
          <div className="space-y-1">
            {staleAgents.map(r => <StaleBanner key={r.agentSlug} agentSlug={r.agentSlug} error={r.error} />)}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><SpinnerIcon className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : allWorkspaces.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No active workspaces.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 text-left font-medium">Agent</th>
                  <th className="pb-2 pr-4 text-left font-medium">Repo</th>
                  <th className="pb-2 pr-4 text-left font-medium">Status</th>
                  <th className="pb-2 text-left font-medium">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allWorkspaces.map(ws => (
                  <tr key={`${ws._agentSlug}-${ws.id}`} className="hover:bg-muted/30">
                    <td className="py-2 pr-4">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium">{ws._agentSlug}</span>
                    </td>
                    <td className="py-2 pr-4 font-medium">{ws.repoOwner}/{ws.repoSlug}</td>
                    <td className="py-2 pr-4"><WorkspaceStatusBadge status={ws.status} /></td>
                    <td className="py-2 text-xs text-muted-foreground">{timeAgo(ws.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

// ─── AllAgentsClustersPage ───────────────────────────────────────────────────

const conclusionBadgeStyles = {
  success: 'bg-green-500/10 text-green-500',
  failure: 'bg-red-500/10 text-red-500',
  cancelled: 'bg-yellow-500/10 text-yellow-500',
  skipped: 'bg-muted text-muted-foreground',
};

export function AllAgentsClustersPage({ session }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllAgentClusters();
      setRows(Array.isArray(result) ? result : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const staleAgents = rows.filter(r => r.stale);
  const allRuns = rows.flatMap(r => r.runs.map(run => ({ ...run, _agentSlug: r.agentSlug })));

  return (
    <PageLayout session={session}>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">All Agents — Sub-Agents</h1>
        <div className="flex items-center justify-end">
          <button onClick={load} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <RefreshIcon className="h-3 w-3" /> Refresh
          </button>
        </div>

        {staleAgents.length > 0 && (
          <div className="space-y-1">
            {staleAgents.map(r => <StaleBanner key={r.agentSlug} agentSlug={r.agentSlug} error={r.error} />)}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><SpinnerIcon className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : allRuns.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sub-agent runs found.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {allRuns.map((run, i) => {
              const isActive = run.status === 'in_progress' || run.status === 'queued';
              return (
                <div key={`${run._agentSlug}-${i}`} className="flex items-center gap-3 py-3 px-1">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium shrink-0">{run._agentSlug}</span>
                  {run.status === 'in_progress' && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 animate-pulse" />}
                  {run.status === 'queued' && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-yellow-500" />}
                  {!isActive && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase shrink-0 ${conclusionBadgeStyles[run.conclusion] || 'bg-muted text-muted-foreground'}`}>
                      {run.conclusion || 'unknown'}
                    </span>
                  )}
                  <span className="text-sm font-medium truncate">{run.workflow_name || run.branch}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{timeAgo(run.updated_at || run.started_at)}</span>
                  <div className="flex-1" />
                  {run.html_url && (
                    <a href={run.html_url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground shrink-0">View</a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
