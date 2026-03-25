'use client';

import { useState, useEffect, useCallback } from 'react';
import { getMonitoringDashboard } from '../actions.js';

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

function getHealthColor(rate) {
  if (rate === null || rate === undefined) return 'text-muted-foreground';
  if (rate >= 0.9) return 'text-emerald-500';
  if (rate >= 0.7) return 'text-yellow-500';
  return 'text-destructive';
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

function OnboardingBadge({ onboarding }) {
  if (!onboarding) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
        N/A
      </span>
    );
  }
  if (onboarding.completedAt) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-500">
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-500/10 text-yellow-600">
      Step: {onboarding.currentStep}
    </span>
  );
}

function UsageBar({ used, limit }) {
  if (limit === null || limit === undefined) {
    return (
      <p className="text-xs text-muted-foreground">{used} jobs (no limit)</p>
    );
  }
  const pct = Math.min((used / limit) * 100, 100);
  const barColor =
    pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{used} / {limit} jobs</p>
    </div>
  );
}

function MonitoringCard({ instance }) {
  const rate = instance.jobSuccessRate?.rate ?? null;
  const rateDisplay = rate !== null ? `${Math.round(rate * 100)}%` : '--';
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{instance.name}</h3>
        <StatusBadge status={instance.status} />
      </div>

      {/* Error row */}
      {instance.error && (
        <p className="text-xs text-destructive">{instance.error}</p>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-2xl font-bold">{instance.errorCount24h ?? 0}</div>
          <div className="text-xs text-muted-foreground">Errors (24h)</div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${getHealthColor(rate)}`}>{rateDisplay}</div>
          <div className="text-xs text-muted-foreground">Success Rate</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{instance.jobSuccessRate?.total ?? 0}</div>
          <div className="text-xs text-muted-foreground">Jobs (24h)</div>
        </div>
      </div>

      {/* Usage section */}
      <div className="border-t pt-2">
        <UsageBar
          used={instance.usage?.jobsDispatched ?? 0}
          limit={instance.usage?.limits?.jobsPerMonth ?? null}
        />
      </div>

      {/* Footer row */}
      <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
        <OnboardingBadge onboarding={instance.onboarding} />
        <span>Last error: {formatRelativeTime(instance.lastErrorAt)}</span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 rounded-lg bg-muted animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-52 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function MonitoringDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const result = await getMonitoringDashboard();
      if (result.error) {
        setError(result.error);
      } else {
        setData(result);
        setError(null);
      }
    } catch {
      setError('Failed to load monitoring dashboard');
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
  const totalErrors = instances.reduce((sum, i) => sum + (i.errorCount24h ?? 0), 0);
  const ratesWithData = instances
    .map((i) => i.jobSuccessRate?.rate)
    .filter((r) => r !== null && r !== undefined);
  const avgRate =
    ratesWithData.length > 0
      ? Math.round((ratesWithData.reduce((a, b) => a + b, 0) / ratesWithData.length) * 100)
      : null;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold mb-3">Agent Health Monitor</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold">{instances.length}</div>
            <div className="text-xs text-muted-foreground">Agents</div>
          </div>
          <div>
            <div className={`text-3xl font-bold ${getHealthColor(avgRate !== null ? avgRate / 100 : null)}`}>
              {avgRate !== null ? `${avgRate}%` : '--'}
            </div>
            <div className="text-xs text-muted-foreground">Avg Success Rate</div>
          </div>
          <div>
            <div className={`text-3xl font-bold ${totalErrors > 0 ? 'text-destructive' : 'text-emerald-500'}`}>
              {totalErrors}
            </div>
            <div className="text-xs text-muted-foreground">Errors (24h)</div>
          </div>
        </div>
      </div>

      {/* Instance cards grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {instances.map((instance) => (
          <MonitoringCard key={instance.name} instance={instance} />
        ))}
      </div>

      {instances.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-8">
          No agents configured.
        </div>
      )}
    </div>
  );
}
