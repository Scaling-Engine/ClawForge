'use client';

import { useState, useEffect } from 'react';
import { SearchIcon } from './icons.js';
import { searchJobsAcrossInstances } from '../actions.js';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'merged', label: 'Merged' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
  { value: 'closed', label: 'Closed' },
];

function InstanceBadge({ name }) {
  // Generate a consistent color from the instance name
  const colors = [
    'bg-blue-500/10 text-blue-500',
    'bg-purple-500/10 text-purple-500',
    'bg-emerald-500/10 text-emerald-500',
    'bg-orange-500/10 text-orange-500',
    'bg-pink-500/10 text-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const color = colors[Math.abs(hash) % colors.length];

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {name}
    </span>
  );
}

function StatusBadge({ status }) {
  const styles = {
    merged: 'bg-emerald-500/10 text-emerald-500',
    failed: 'bg-destructive/10 text-destructive',
    pending: 'bg-yellow-500/10 text-yellow-500',
    closed: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || styles.closed}`}>
      {status}
    </span>
  );
}

function formatDate(timestamp) {
  if (!timestamp) return '--';
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function truncate(str, len = 60) {
  if (!str) return '--';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

export function SuperadminSearch() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ q: '', repo: '', status: '' });

  async function doSearch(searchFilters) {
    setLoading(true);
    setError(null);
    try {
      // Clean empty filter values
      const cleanFilters = {};
      if (searchFilters.q) cleanFilters.q = searchFilters.q;
      if (searchFilters.repo) cleanFilters.repo = searchFilters.repo;
      if (searchFilters.status) cleanFilters.status = searchFilters.status;

      const result = await searchJobsAcrossInstances(cleanFilters);
      if (result.error) {
        setError(result.error);
      } else {
        setJobs(result.jobs || []);
      }
    } catch {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    doSearch({});
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    doSearch(filters);
  }

  return (
    <div className="space-y-6">
      {/* Search form */}
      <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <SearchIcon size={16} />
          <h2 className="font-semibold text-sm">Cross-Instance Job Search</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <input
            type="text"
            placeholder="Search keyword..."
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Filter by repo..."
            value={filters.repo}
            onChange={(e) => setFilters((f) => ({ ...f, repo: e.target.value }))}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Results table */}
      {!loading && !error && (
        <div className="rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Agent</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Repo</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Summary</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">PR</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={`${job.instance}-${job.id}`} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2"><InstanceBadge name={job.instance} /></td>
                    <td className="px-3 py-2 font-mono text-xs">{job.targetRepo || '--'}</td>
                    <td className="px-3 py-2"><StatusBadge status={job.status} /></td>
                    <td className="px-3 py-2 text-muted-foreground">{truncate(job.logSummary)}</td>
                    <td className="px-3 py-2">
                      {job.prUrl ? (
                        <a
                          href={job.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline text-xs"
                        >
                          View PR
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(job.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {jobs.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              No jobs found matching your filters.
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton for table */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 rounded bg-muted animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
