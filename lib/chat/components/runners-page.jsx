'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { ServerIcon, RefreshIcon } from './icons.js';
import { getRunners } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Status Indicator
// ─────────────────────────────────────────────────────────────────────────────

function RunnerStatus({ status, busy }) {
  if (busy) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 shrink-0" />
        <span className="text-xs text-yellow-600 font-medium">Busy</span>
      </span>
    );
  }
  if (status === 'online') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500 shrink-0" />
        <span className="text-xs text-green-600 font-medium">Online</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" />
      <span className="text-xs text-muted-foreground font-medium">Offline</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner Card
// ─────────────────────────────────────────────────────────────────────────────

function RunnerCard({ runner }) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-start gap-4">
      {/* Icon */}
      <div className="shrink-0 rounded-md bg-muted p-2 self-start">
        <ServerIcon size={16} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-3 mb-1.5">
          <p className="text-sm font-medium truncate">{runner.name}</p>
          <RunnerStatus status={runner.status} busy={runner.busy} />
        </div>

        {/* Labels */}
        {runner.labels && runner.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {runner.labels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-full bg-blue-500/10 text-blue-500 px-2 py-0.5 text-[10px] font-mono"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner List
// ─────────────────────────────────────────────────────────────────────────────

function RunnerList({ runners, loading }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-border/50" />
        ))}
      </div>
    );
  }

  if (!runners || runners.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <ServerIcon size={24} />
        </div>
        <p className="text-sm font-medium mb-1">No runners configured</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          GitHub Actions runners require <span className="font-mono">admin:org</span> scope on your GitHub token.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {runners.map((runner) => (
        <RunnerCard key={runner.id} runner={runner} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function RunnersPage({ session }) {
  const [runners, setRunners] = useState([]);
  const [loading, setLoading] = useState(true);

  function loadRunners() {
    setLoading(true);
    getRunners()
      .then((data) => setRunners(Array.isArray(data) ? data : []))
      .catch(() => setRunners([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRunners();
  }, []);

  const onlineCount = runners.filter((r) => r.status === 'online' || r.busy).length;

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Runners</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading
              ? 'Loading runners...'
              : `${runners.length} runner${runners.length !== 1 ? 's' : ''} (${onlineCount} online)`}
          </p>
        </div>
        <button
          onClick={loadRunners}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshIcon size={13} />
          Refresh
        </button>
      </div>

      {/* Runner List */}
      <RunnerList runners={runners} loading={loading} />
    </PageLayout>
  );
}
