'use client';

import { useState, useEffect, useCallback } from 'react';
import { GlobeIcon } from './icons.js';
import { getSuperadminDashboard } from '../actions.js';

function formatUptime(seconds) {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

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

function InstanceCard({ instance }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{instance.name}</h3>
        <StatusBadge status={instance.status} />
      </div>

      {instance.error && (
        <p className="text-xs text-destructive">{instance.error}</p>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-2xl font-bold">{instance.activeJobs}</div>
          <div className="text-xs text-muted-foreground">Active Jobs</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{instance.repoCount}</div>
          <div className="text-xs text-muted-foreground">Repos</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{instance.userCount}</div>
          <div className="text-xs text-muted-foreground">Users</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
        <span>Last job: {formatRelativeTime(instance.lastJobAt)}</span>
        <span>Uptime: {formatUptime(instance.uptime)}</span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-16 rounded-lg bg-muted animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function SuperadminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const result = await getSuperadminDashboard();
      if (result.error) {
        setError(result.error);
      } else {
        setData(result);
        setError(null);
      }
    } catch {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  const instances = data?.instances || [];
  const totalJobs = instances.reduce((sum, i) => sum + i.activeJobs, 0);
  const onlineCount = instances.filter((i) => i.status === 'online').length;
  const healthPct = instances.length > 0 ? Math.round((onlineCount / instances.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <GlobeIcon size={20} />
          <h2 className="font-semibold">Cross-Instance Overview</h2>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold">{instances.length}</div>
            <div className="text-xs text-muted-foreground">Instances</div>
          </div>
          <div>
            <div className="text-3xl font-bold">{totalJobs}</div>
            <div className="text-xs text-muted-foreground">Active Jobs</div>
          </div>
          <div>
            <div className={`text-3xl font-bold ${healthPct === 100 ? 'text-emerald-500' : healthPct > 0 ? 'text-yellow-500' : 'text-destructive'}`}>
              {healthPct}%
            </div>
            <div className="text-xs text-muted-foreground">Health</div>
          </div>
        </div>
      </div>

      {/* Instance cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {instances.map((instance) => (
          <InstanceCard key={instance.name} instance={instance} />
        ))}
      </div>

      {instances.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-8">
          No instances configured. Set SUPERADMIN_INSTANCES environment variable.
        </div>
      )}
    </div>
  );
}
