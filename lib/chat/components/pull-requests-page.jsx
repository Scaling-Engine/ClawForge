'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { GitPullRequestIcon, SpinnerIcon, RefreshIcon } from './icons.js';
import { getPendingPullRequests, approvePullRequest, requestChanges } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PR Row
// ─────────────────────────────────────────────────────────────────────────────

function PRRow({ pr, onRemove }) {
  const [approving, setApproving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [owner, repo] = pr._repo.split('/');

  async function handleApprove() {
    setApproving(true);
    try {
      await approvePullRequest(owner, repo, pr.number);
      onRemove(pr.number);
    } catch (err) {
      console.error('Failed to approve PR:', err);
    } finally {
      setApproving(false);
    }
  }

  async function handleRequestChanges() {
    setRequesting(true);
    try {
      await requestChanges(owner, repo, pr.number);
      onRemove(pr.number);
    } catch (err) {
      console.error('Failed to request changes:', err);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      {/* Icon */}
      <div className="shrink-0 rounded-md bg-muted p-2 self-start">
        <GitPullRequestIcon size={16} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <a
            href={pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline truncate max-w-md"
          >
            {pr.title}
          </a>
          {pr.draft && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
              Draft
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono">{pr._repo}</span>
          <span>#{pr.number}</span>
          <span>
            <span className="font-mono">{pr.head?.ref}</span>
            <span className="mx-1">→</span>
            <span className="font-mono">{pr.base?.ref}</span>
          </span>
          <span>by {pr.user?.login}</span>
          <span>{timeAgo(pr.created_at)}</span>
        </div>
      </div>

      {/* Actions — only for non-draft PRs */}
      {!pr.draft && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleApprove}
            disabled={approving || requesting}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-green-500/10 text-green-600 hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {approving ? <SpinnerIcon size={12} /> : null}
            Approve
          </button>
          <button
            onClick={handleRequestChanges}
            disabled={approving || requesting}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {requesting ? <SpinnerIcon size={12} /> : null}
            Request Changes
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PR List
// ─────────────────────────────────────────────────────────────────────────────

function PRList({ prs, loading, onRemove }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-border/50" />
        ))}
      </div>
    );
  }

  if (!prs || prs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <GitPullRequestIcon size={24} />
        </div>
        <p className="text-sm font-medium mb-1">No open pull requests</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          All caught up — no open PRs across your allowed repos.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {prs.map((pr) => (
        <PRRow key={`${pr._repo}-${pr.number}`} pr={pr} onRemove={onRemove} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function PullRequestsPage({ session }) {
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);

  function loadPrs() {
    setLoading(true);
    getPendingPullRequests()
      .then((data) => setPrs(Array.isArray(data) ? data : []))
      .catch(() => setPrs([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPrs();
  }, []);

  function handleRemove(prNumber) {
    setPrs((prev) => prev.filter((pr) => pr.number !== prNumber));
  }

  const nonDraftCount = prs.filter((pr) => !pr.draft).length;

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Pull Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading
              ? 'Loading pull requests...'
              : `${prs.length} open PR${prs.length !== 1 ? 's' : ''} (${nonDraftCount} ready for review)`}
          </p>
        </div>
        <button
          onClick={loadPrs}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshIcon size={13} />
          Refresh
        </button>
      </div>

      {/* PR List */}
      <PRList prs={prs} loading={loading} onRemove={handleRemove} />
    </PageLayout>
  );
}
