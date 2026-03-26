'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getAgentPickerData, dispatchAgentJob } from '../actions.js';

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }) {
  const isOnline = status === 'online';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        isOnline
          ? 'bg-emerald-500/10 text-emerald-500'
          : 'bg-destructive/10 text-destructive'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-destructive'}`} />
      {isOnline ? 'Online' : 'Offline'}
    </span>
  );
}

function QuickLaunchModal({ agentName, onClose }) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await dispatchAgentJob(agentName, description.trim());
      if (result?.error) {
        setError(result.error);
      } else {
        router.push('/agent/' + agentName + '/chat');
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to dispatch job');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">New Job — {agentName}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            autoFocus
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Describe the job..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !description.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Launching...' : 'Launch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AgentCard({ agent, onSelect, onQuickLaunch }) {
  const router = useRouter();

  function handleClick() {
    onSelect(agent.name);
    router.push('/agent/' + agent.name + '/chat');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`rounded-lg border bg-card p-4 space-y-3 w-full text-left hover:bg-accent/50 transition-colors cursor-pointer${
        agent.status !== 'online' ? ' opacity-60' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{agent.name}</h3>
        <StatusBadge status={agent.status} />
      </div>

      {agent.error && (
        <p className="text-xs text-destructive">{agent.error}</p>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-2xl font-bold">{agent.activeJobs}</div>
          <div className="text-xs text-muted-foreground">Active Jobs</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{agent.openPrs}</div>
          <div className="text-xs text-muted-foreground">Open PRs</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{agent.activeWorkspaces}</div>
          <div className="text-xs text-muted-foreground">Workspaces</div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t pt-2">
        <span className="text-xs text-muted-foreground">Last job: {formatRelativeTime(agent.lastJobAt)}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickLaunch(agent.name);
          }}
          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          New Job
        </button>
      </div>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[1, 2].map((i) => (
        <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}

export function AgentPickerPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quickLaunchAgent, setQuickLaunchAgent] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const result = await getAgentPickerData();
      if (Array.isArray(result)) {
        setData(result);
        setError(null);
      } else if (result?.error) {
        setError(result.error);
      }
    } catch {
      setError('Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function onSelect(slug) {
    document.cookie = `lastAgent=${slug}; max-age=2592000; path=/; SameSite=Lax`;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Your Agents</h1>

      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </div>
          <p className="text-sm font-medium mb-1">No agents assigned yet.</p>
          <p className="text-sm text-muted-foreground">Contact your admin to get access.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((agent) => (
            <AgentCard key={agent.name} agent={agent} onSelect={onSelect} onQuickLaunch={setQuickLaunchAgent} />
          ))}
        </div>
      )}

      {quickLaunchAgent && (
        <QuickLaunchModal
          agentName={quickLaunchAgent}
          onClose={() => setQuickLaunchAgent(null)}
        />
      )}
    </div>
  );
}
