'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLayout } from './page-layout.js';
import { SpinnerIcon, RefreshIcon } from './icons.js';
import { getSwarmStatus, cancelJob, retryJob, getDockerJobs } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-md bg-border/50" />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow List
// ─────────────────────────────────────────────────────────────────────────────

const conclusionBadgeStyles = {
  success: 'bg-green-500/10 text-green-500',
  failure: 'bg-red-500/10 text-red-500',
  cancelled: 'bg-yellow-500/10 text-yellow-500',
  skipped: 'bg-muted text-muted-foreground',
};

function SwarmWorkflowList({ runs }) {
  if (!runs || runs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No workflow runs.
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {runs.map((run) => {
        const isActive = run.status === 'in_progress' || run.status === 'queued';
        const isRunning = run.status === 'in_progress';
        const isQueued = run.status === 'queued';

        return (
          <div key={run.run_id} className="flex items-center gap-3 py-3 px-1">
            {/* Status indicator */}
            {isRunning && (
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 animate-pulse" />
            )}
            {isQueued && (
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-yellow-500" />
            )}
            {!isActive && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase shrink-0 ${
                  conclusionBadgeStyles[run.conclusion] || 'bg-muted text-muted-foreground'
                }`}
              >
                {run.conclusion || 'unknown'}
              </span>
            )}

            {/* Workflow name */}
            <span className="text-sm font-medium truncate">
              {run.workflow_name || run.branch}
            </span>

            {/* Duration or time ago */}
            <span className="text-xs text-muted-foreground shrink-0">
              {isActive
                ? formatDuration(run.duration_seconds)
                : timeAgo(run.updated_at || run.started_at)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Link */}
            {run.html_url && (
              <a
                href={run.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline shrink-0"
              >
                View
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Docker Jobs List
// ─────────────────────────────────────────────────────────────────────────────

function DockerJobsList({ jobs, session, onRefresh }) {
  const [cancelling, setCancelling] = useState(null);
  const [retrying, setRetrying] = useState(null);
  const isAdmin = session?.user?.role === 'admin';

  const handleCancel = async (jobId) => {
    setCancelling(jobId);
    try {
      const result = await cancelJob(jobId);
      if (result.error) {
        console.error('Cancel failed:', result.error);
        alert(result.error);
      } else {
        onRefresh?.();
      }
    } catch (err) {
      console.error('Cancel error:', err);
    } finally {
      setCancelling(null);
    }
  };

  const handleRetry = async (jobId) => {
    setRetrying(jobId);
    try {
      const result = await retryJob(jobId);
      if (result.error) {
        console.error('Retry failed:', result.error);
        alert(result.error);
      } else {
        onRefresh?.();
      }
    } catch (err) {
      console.error('Retry error:', err);
    } finally {
      setRetrying(null);
    }
  };

  if (!jobs || jobs.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Active Docker Jobs
      </h2>
      <div className="flex flex-col divide-y divide-border rounded-md border border-border">
        {jobs.map((job) => {
          const isRunning = job.containerRunning;
          const isFailed = !isRunning && job.outcome?.status === 'failure';

          return (
            <div key={job.jobId} className="flex items-center gap-3 py-3 px-3">
              {/* Status indicator */}
              {isRunning && (
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 animate-pulse" />
              )}
              {isFailed && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase shrink-0 bg-red-500/10 text-red-500">
                  failed
                </span>
              )}
              {!isRunning && !isFailed && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase shrink-0 bg-muted text-muted-foreground">
                  {job.containerStatus || 'stopped'}
                </span>
              )}

              {/* Job ID (truncated) */}
              <span className="text-sm font-mono truncate" title={job.jobId}>
                {job.jobId.slice(0, 8)}
              </span>

              {/* Time */}
              <span className="text-xs text-muted-foreground shrink-0">
                {timeAgo(job.createdAt)}
              </span>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Admin-only controls */}
              {isAdmin && isRunning && (
                <button
                  onClick={() => handleCancel(job.jobId)}
                  disabled={cancelling === job.jobId}
                  className="text-xs text-red-500 hover:underline shrink-0 disabled:opacity-50"
                >
                  {cancelling === job.jobId ? 'Cancelling...' : 'Cancel'}
                </button>
              )}
              {isAdmin && isFailed && (
                <button
                  onClick={() => handleRetry(job.jobId)}
                  disabled={retrying === job.jobId}
                  className="text-xs text-blue-500 hover:underline shrink-0 disabled:opacity-50"
                >
                  {retrying === job.jobId ? 'Retrying...' : 'Retry'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function SwarmPage({ session }) {
  const [runs, setRuns] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dockerJobs, setDockerJobs] = useState([]);

  const fetchPage = useCallback(async (p) => {
    try {
      const data = await getSwarmStatus(p);
      setRuns(data.runs || []);
      setHasMore(data.hasMore || false);
      setPage(p);
    } catch (err) {
      console.error('Failed to fetch swarm status:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchDockerJobs = useCallback(async () => {
    try {
      const jobs = await getDockerJobs();
      setDockerJobs(Array.isArray(jobs) ? jobs : []);
    } catch (err) {
      console.error('Failed to fetch Docker jobs:', err);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchPage(1); }, [fetchPage]);
  useEffect(() => { fetchDockerJobs(); }, [fetchDockerJobs]);

  // Auto-refresh current page and Docker jobs every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPage(page);
      fetchDockerJobs();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchPage, fetchDockerJobs, page]);

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All jobs dispatched to Claude Code containers — one row per task sent to an agent.
          </p>
        </div>
        {!loading && (
          <button
            onClick={() => { setRefreshing(true); fetchPage(1); }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
          >
            {refreshing ? (
              <>
                <SpinnerIcon size={14} />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshIcon size={14} />
                Refresh
              </>
            )}
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <div>
          <DockerJobsList
            jobs={dockerJobs}
            session={session}
            onRefresh={() => { fetchDockerJobs(); fetchPage(page); }}
          />
          <SwarmWorkflowList runs={runs} />
          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <button
              onClick={() => { setRefreshing(true); fetchPage(page - 1); }}
              disabled={page <= 1 || refreshing}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
            >
              Previous
            </button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <button
              onClick={() => { setRefreshing(true); fetchPage(page + 1); }}
              disabled={!hasMore || refreshing}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
