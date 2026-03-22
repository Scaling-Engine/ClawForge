'use client';

import { useState, useEffect } from 'react';
import { Streamdown } from 'streamdown';
import { PageLayout } from './page-layout.js';
import { BellIcon, CircleCheckIcon, XIcon, GitPullRequestIcon } from './icons.js';
import { linkSafety } from './message.js';
import { getNotifications, markNotificationsRead } from '../actions.js';

function timeAgo(ts) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
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

function parsePayload(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function NotificationCard({ n }) {
  const payload = parsePayload(n.payload);
  const status = payload?.status; // "success" | "failure" | undefined
  const jobId = payload?.job ? payload.job.slice(0, 8) : null;
  const prUrl = payload?.pr_url || '';
  const commitMessage = payload?.commit_message || '';
  const changedFiles = Array.isArray(payload?.changed_files) ? payload.changed_files : [];
  const targetRepo = payload?.target_repo || '';

  // Border class
  let borderClass = 'border border-border';
  if (status === 'success') borderClass = 'border-l-4 border-l-green-500 border border-border';
  else if (status === 'failure') borderClass = 'border-l-4 border-l-red-500 border border-border';

  // Status icon
  let statusIcon;
  if (status === 'success') {
    statusIcon = <CircleCheckIcon size={16} className="text-green-500" />;
  } else if (status === 'failure') {
    statusIcon = <XIcon size={16} className="text-red-500" />;
  } else {
    statusIcon = <BellIcon size={16} className="text-muted-foreground" />;
  }

  // Job header label
  let jobHeader = null;
  if (jobId && status === 'success') {
    jobHeader = (
      <p className="text-sm font-semibold text-green-600 mb-1">
        Job {jobId} completed
      </p>
    );
  } else if (jobId && status === 'failure') {
    jobHeader = (
      <p className="text-sm font-semibold text-red-600 mb-1">
        Job {jobId} failed
      </p>
    );
  }

  // PR / meta row
  let metaRow = null;
  if (prUrl || commitMessage || changedFiles.length > 0 || targetRepo) {
    metaRow = (
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-500 hover:underline"
          >
            <GitPullRequestIcon size={12} />
            View PR
          </a>
        )}
        {commitMessage && (
          <span className="truncate max-w-[240px]" title={commitMessage}>
            {commitMessage.length > 60 ? commitMessage.slice(0, 60) + '…' : commitMessage}
          </span>
        )}
        {changedFiles.length > 0 && (
          <span>{changedFiles.length} {changedFiles.length === 1 ? 'file' : 'files'} changed</span>
        )}
        {targetRepo && (
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
            {targetRepo}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-3 p-4 ${borderClass} rounded-lg`}>
      <div className="mt-0.5 shrink-0">
        {statusIcon}
      </div>
      <div className="flex-1 min-w-0">
        {jobHeader}
        <div className="text-sm prose-sm">
          <Streamdown mode="static" linkSafety={linkSafety}>{n.notification}</Streamdown>
        </div>
        {metaRow}
        <span className="text-xs text-muted-foreground">
          {timeAgo(n.createdAt)}
        </span>
      </div>
    </div>
  );
}

export function NotificationsPage({ session }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await getNotifications();
        setNotifications(result);
        // Mark all as read on view
        await markNotificationsRead();
      } catch (err) {
        console.error('Failed to load notifications:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Notifications</h1>
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground mb-4">
        {notifications.length} {notifications.length === 1 ? 'notification' : 'notifications'}
      </p>

      {/* Notification list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-border/50" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No notifications yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((n) => (
            <NotificationCard key={n.id} n={n} />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
