'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { GitPullRequestIcon, SpinnerIcon, RefreshIcon, ChevronDownIcon } from './icons.js';
import { DiffView } from './diff-view.js';
import { getPullRequests, getPRFiles, approvePullRequest, requestChanges } from '../actions.js';

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
// Status Badge
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ pr }) {
  if (pr.merged_at) {
    return (
      <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-600 uppercase">
        Merged
      </span>
    );
  }
  if (pr.state === 'closed') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 uppercase">
        Closed
      </span>
    );
  }
  // Open badge — only shown on the "All" tab for visual distinction
  return (
    <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 uppercase">
      Open
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// File Row (inside expanded PR)
// ─────────────────────────────────────────────────────────────────────────────

function FileStatusBadge({ status }) {
  const map = {
    added: 'bg-green-500/10 text-green-600',
    removed: 'bg-red-500/10 text-red-600',
    modified: 'bg-yellow-500/10 text-yellow-600',
    renamed: 'bg-blue-500/10 text-blue-600',
  };
  const cls = map[status] || 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${cls}`}>
      {status}
    </span>
  );
}

function FileRow({ file }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* File header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs truncate">{file.filename}</span>
          <FileStatusBadge status={file.status} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(file.additions > 0 || file.deletions > 0) && (
            <span className="text-[10px] text-muted-foreground">
              <span className="text-green-600">+{file.additions}</span>
              {' '}
              <span className="text-red-500">-{file.deletions}</span>
            </span>
          )}
          <ChevronDownIcon
            size={14}
            className={`text-muted-foreground transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Diff — shown when expanded */}
      {open && (
        <div className="border-t border-border">
          {file.patch ? (
            <DiffView diff={file.patch} />
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground italic">No diff available</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PR Row
// ─────────────────────────────────────────────────────────────────────────────

function PRRow({ pr, onRemove, showStatusBadge }) {
  const [approving, setApproving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [owner, repo] = pr._repo.split('/');

  const isOpen = pr.state === 'open';

  async function handleApprove(e) {
    e.stopPropagation();
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

  async function handleRequestChanges(e) {
    e.stopPropagation();
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

  async function handleToggleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && files === null) {
      setLoadingFiles(true);
      try {
        const result = await getPRFiles(owner, repo, pr.number);
        setFiles(result);
      } catch {
        setFiles([]);
      } finally {
        setLoadingFiles(false);
      }
    }
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Clickable main row */}
      <div
        className="p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={handleToggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleToggleExpand()}
      >
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
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium hover:underline truncate max-w-md"
            >
              {pr.title}
            </a>
            {pr.draft && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                Draft
              </span>
            )}
            {showStatusBadge && <StatusBadge pr={pr} />}
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

        {/* Right side: actions + chevron */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Actions — only for non-draft open PRs */}
          {isOpen && !pr.draft && (
            <>
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
            </>
          )}

          <ChevronDownIcon
            size={16}
            className={`text-muted-foreground transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Expanded section: file list */}
      {expanded && (
        <div className="border-t border-border bg-muted/10 p-4">
          {/* PR description */}
          {pr.body && pr.body !== 'Automated job by ClawForge' && (
            <div className="mb-4 rounded-md bg-muted/30 p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Description</p>
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">{pr.body}</pre>
            </div>
          )}
          {loadingFiles ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <SpinnerIcon size={14} />
              <span>Loading files...</span>
            </div>
          ) : files && files.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground mb-1">
                {files.length} file{files.length !== 1 ? 's' : ''} changed
              </p>
              {files.map((file) => (
                <FileRow key={file.filename} file={file} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2">No files found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PR List
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_MESSAGES = {
  open: { title: 'No open pull requests', sub: 'All caught up — no open PRs across your allowed repos.' },
  closed: { title: 'No approved or merged pull requests', sub: 'No closed or merged PRs found.' },
  all: { title: 'No pull requests found', sub: 'No PRs found across your allowed repos.' },
};

function PRList({ prs, loading, onRemove, activeTab }) {
  const showStatusBadge = activeTab === 'all';

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
    const msg = EMPTY_MESSAGES[activeTab] || EMPTY_MESSAGES.open;
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <GitPullRequestIcon size={24} />
        </div>
        <p className="text-sm font-medium mb-1">{msg.title}</p>
        <p className="text-xs text-muted-foreground max-w-sm">{msg.sub}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {prs.map((pr) => (
        <PRRow
          key={`${pr._repo}-${pr.number}`}
          pr={pr}
          onRemove={onRemove}
          showStatusBadge={showStatusBadge}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Tabs
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'open', label: 'Open', apiState: 'open' },
  { id: 'closed', label: 'Approved / Merged', apiState: 'closed' },
  { id: 'all', label: 'All', apiState: 'all' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function PullRequestsPage({ session }) {
  const [activeTab, setActiveTab] = useState('open');
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);

  function loadPrs(tab) {
    const state = TABS.find((t) => t.id === tab)?.apiState || 'open';
    setLoading(true);
    getPullRequests(state)
      .then((data) => setPrs(Array.isArray(data) ? data : []))
      .catch(() => setPrs([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPrs(activeTab);
  }, []);

  function handleTabChange(tabId) {
    setActiveTab(tabId);
    loadPrs(tabId);
  }

  function handleRemove(prNumber) {
    setPrs((prev) => prev.filter((pr) => pr.number !== prNumber));
  }

  function getSubtitle() {
    if (loading) return 'Loading pull requests...';
    if (activeTab === 'open') {
      const nonDraft = prs.filter((pr) => !pr.draft).length;
      return `${prs.length} open PR${prs.length !== 1 ? 's' : ''} (${nonDraft} ready for review)`;
    }
    if (activeTab === 'closed') {
      return `${prs.length} closed/merged PR${prs.length !== 1 ? 's' : ''}`;
    }
    return `${prs.length} total PR${prs.length !== 1 ? 's' : ''}`;
  }

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Pull Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">{getSubtitle()}</p>
        </div>
        <button
          onClick={() => loadPrs(activeTab)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshIcon size={13} />
          Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 rounded-lg bg-muted/50 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-accent text-accent-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* PR List */}
      <PRList prs={prs} loading={loading} onRemove={handleRemove} activeTab={activeTab} />
    </PageLayout>
  );
}
