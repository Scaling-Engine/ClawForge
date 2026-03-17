'use client';

import { useState, useEffect } from 'react';
import { ServerIcon } from './icons.js';
import { getInstancesOverview } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Instance Card
// ─────────────────────────────────────────────────────────────────────────────

function InstanceCard({ instance }) {
  const statusColor =
    instance.status === 'online'
      ? 'bg-green-500'
      : instance.status === 'offline'
        ? 'bg-red-500'
        : 'bg-yellow-500';

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-md bg-muted p-2 mt-0.5">
          <ServerIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{instance.name}</p>
            {instance.isCurrent && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-500">
                Current
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`inline-block w-2 h-2 rounded-full ${statusColor}`} />
            <span className="text-xs text-muted-foreground capitalize">{instance.status}</span>
          </div>

          {instance.repos.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Repos</p>
              <div className="flex flex-wrap gap-1">
                {instance.repos.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-semibold tabular-nums">{instance.activeJobs}</p>
          <p className="text-[10px] text-muted-foreground">active job{instance.activeJobs !== 1 ? 's' : ''}</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function AdminInstancesPage() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInstancesOverview()
      .then((data) => {
        if (Array.isArray(data)) setInstances(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        {!loading && `${instances.length} instance${instances.length !== 1 ? 's' : ''}`}
      </p>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-border/50" />
          ))}
        </div>
      ) : instances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <ServerIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No instances found</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Instance directories were not detected. Running in single-instance mode.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {instances.map((inst) => (
            <InstanceCard key={inst.name} instance={inst} />
          ))}
        </div>
      )}
    </>
  );
}
