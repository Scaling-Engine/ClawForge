'use client';

import { useState, useEffect } from 'react';
import { CreditCardIcon, CheckIcon, SpinnerIcon } from './icons.js';
import { getBillingUsage, setBillingLimits } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage Progress Bar
// ─────────────────────────────────────────────────────────────────────────────

function UsageBar({ used, limit, label }) {
  if (limit === null || limit === undefined) return null;
  const pct = Math.min(Math.round((used / limit) * 100), 100);
  const color =
    pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-foreground';

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {used} / {limit} used
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Limits Editor (superadmin only)
// ─────────────────────────────────────────────────────────────────────────────

function LimitsEditor({ limits, onSaved }) {
  const [jobsPerMonth, setJobsPerMonth] = useState(
    limits?.jobsPerMonth !== null && limits?.jobsPerMonth !== undefined
      ? String(limits.jobsPerMonth)
      : ''
  );
  const [concurrentJobs, setConcurrentJobs] = useState(
    limits?.concurrentJobs !== null && limits?.concurrentJobs !== undefined
      ? String(limits.concurrentJobs)
      : ''
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error' | null
  const [statusMsg, setStatusMsg] = useState('');

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {};
      if (jobsPerMonth !== '') {
        payload.jobsPerMonth = Number(jobsPerMonth);
      } else {
        payload.jobsPerMonth = null;
      }
      if (concurrentJobs !== '') {
        payload.concurrentJobs = Number(concurrentJobs);
      } else {
        payload.concurrentJobs = null;
      }
      const result = await setBillingLimits(payload);
      if (result?.success) {
        setStatus('success');
        setStatusMsg('Saved');
        setTimeout(() => setStatus(null), 2000);
        onSaved?.();
      } else {
        setStatus('error');
        setStatusMsg(result?.error || 'Failed to save');
      }
    } catch (err) {
      setStatus('error');
      setStatusMsg(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 mt-4">
      <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wider">
        Limits (Superadmin)
      </h3>
      <div className="divide-y divide-border">
        <div className="flex items-center gap-3 py-2">
          <div className="w-48 shrink-0">
            <label className="text-sm font-medium">Jobs / Month</label>
            <p className="text-[10px] text-muted-foreground font-mono">jobs_per_month</p>
          </div>
          <input
            type="number"
            min="0"
            value={jobsPerMonth}
            onChange={(e) => setJobsPerMonth(e.target.value)}
            placeholder="Unlimited"
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-center gap-3 py-2">
          <div className="w-48 shrink-0">
            <label className="text-sm font-medium">Concurrent Jobs</label>
            <p className="text-[10px] text-muted-foreground font-mono">concurrent_jobs</p>
          </div>
          <input
            type="number"
            min="0"
            value={concurrentJobs}
            onChange={(e) => setConcurrentJobs(e.target.value)}
            placeholder="Unlimited"
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[11px] px-2.5 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {saving ? '...' : 'Save Limits'}
        </button>
        {status === 'success' && <CheckIcon size={14} className="text-green-500" />}
        {status === 'error' && (
          <span className="text-xs text-destructive">{statusMsg}</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function AdminBillingPage({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isSuperadmin = user?.role === 'superadmin';

  function loadUsage() {
    setLoading(true);
    setError(null);
    getBillingUsage()
      .then((result) => {
        setData(result);
      })
      .catch((err) => {
        setError(err?.message || 'Failed to load billing data');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadUsage();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-border/50" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  const jobCount = data?.summary?.jobCount ?? 0;
  const totalDuration = data?.summary?.totalDurationSeconds ?? 0;
  const period = data?.period ?? '—';
  const instance = data?.instance ?? '—';
  const limits = data?.limits ?? { jobsPerMonth: null, concurrentJobs: null };

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        Usage metrics for the current billing period.
      </p>

      {/* Usage Summary */}
      <div className="rounded-lg border bg-card p-4 mb-4">
        <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wider">
          Usage
        </h3>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">Instance</span>
            <span className="text-sm text-muted-foreground font-mono">{instance}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">Billing Period</span>
            <span className="text-sm text-muted-foreground font-mono">{period}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm font-medium">Jobs Dispatched</span>
              <UsageBar
                used={jobCount}
                limit={limits.jobsPerMonth}
                label={`${jobCount} of ${limits.jobsPerMonth} jobs`}
              />
            </div>
            <span className="text-sm font-mono">{jobCount}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">Total Duration</span>
            <span className="text-sm text-muted-foreground font-mono">
              {formatDuration(totalDuration)}
            </span>
          </div>
        </div>
      </div>

      {/* Limits (read-only display for non-superadmins) */}
      <div className="rounded-lg border bg-card p-4 mb-4">
        <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wider">
          Limits
        </h3>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">Jobs / Month</span>
            <span className="text-sm text-muted-foreground">
              {limits.jobsPerMonth !== null && limits.jobsPerMonth !== undefined
                ? limits.jobsPerMonth
                : 'Unlimited'}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">Concurrent Jobs</span>
            <span className="text-sm text-muted-foreground">
              {limits.concurrentJobs !== null && limits.concurrentJobs !== undefined
                ? limits.concurrentJobs
                : 'Unlimited'}
            </span>
          </div>
        </div>
      </div>

      {/* Edit form (superadmin only) */}
      {isSuperadmin && <LimitsEditor limits={limits} onSaved={loadUsage} />}
    </>
  );
}
