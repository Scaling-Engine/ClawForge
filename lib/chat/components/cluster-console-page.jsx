'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PageLayout } from './page-layout.js';
import { ClusterDetailTabs } from './cluster-detail-tabs.jsx';
import { getActiveClusterAgent } from '../actions.js';
import { SpinnerIcon, CheckIcon, XIcon, FileTextIcon } from './icons.js';

// ── Utilities ───────────────────────────────────────────────────────────────

const runStatusStyles = {
  running: 'bg-yellow-500/10 text-yellow-500',
  completed: 'bg-green-500/10 text-green-500',
  complete: 'bg-green-500/10 text-green-500',
  failed: 'bg-red-500/10 text-red-500',
  'limit-exceeded': 'bg-orange-500/10 text-orange-500',
};

function StatusBadge({ status }) {
  const cls = runStatusStyles[status] || 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${cls}`}>
      {status || 'unknown'}
    </span>
  );
}

// ── Event rendering ─────────────────────────────────────────────────────────

function EventRow({ event }) {
  const { type } = event;

  if (type === 'file-change') {
    const isCreate = event.operation === 'create' || event.operation === 'new';
    return (
      <div className="flex items-start gap-1.5 py-0.5">
        <FileTextIcon size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
        <span className={isCreate ? 'text-green-400' : 'text-yellow-400'}>
          {event.operation === 'delete' ? '-' : isCreate ? '+' : '~'}{' '}
          {event.path || '(unknown path)'}
        </span>
      </div>
    );
  }

  if (type === 'bash-output') {
    return (
      <div className="flex items-start gap-1.5 py-0.5">
        <span className="text-muted-foreground/60 shrink-0">$</span>
        <span className="text-muted-foreground truncate">{(event.command || event.line || '').slice(0, 200)}</span>
      </div>
    );
  }

  if (type === 'decision') {
    return (
      <div className="flex items-start gap-1.5 py-0.5 italic text-muted-foreground/70">
        <span className="shrink-0">~</span>
        <span>{(event.text || '').slice(0, 200)}</span>
      </div>
    );
  }

  if (type === 'progress') {
    return (
      <div className="flex items-start gap-1.5 py-0.5">
        <span className="text-blue-400 shrink-0">{'>'}</span>
        <span className="text-muted-foreground">{event.label || 'Working...'}</span>
      </div>
    );
  }

  if (type === 'complete') {
    return (
      <div className="flex items-start gap-1.5 py-0.5 text-green-400">
        <CheckIcon size={12} className="mt-0.5 shrink-0" />
        <span>Agent completed{event.elapsedMs ? ` in ${Math.round(event.elapsedMs / 1000)}s` : ''}</span>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div className="flex items-start gap-1.5 py-0.5 text-red-400">
        <XIcon size={12} className="mt-0.5 shrink-0" />
        <span>{(event.message || 'Unknown error').slice(0, 200)}</span>
      </div>
    );
  }

  // Fallback
  return (
    <div className="py-0.5 text-muted-foreground/50">
      {type}: {JSON.stringify(event).slice(0, 100)}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

/**
 * Cluster console page — live SSE streaming from the active cluster agent.
 *
 * @param {{ session: object, runId: string }} props
 */
export function ClusterConsolePage({ session, runId }) {
  const [run, setRun] = useState(null);
  const [activeAgent, setActiveAgent] = useState(null);
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const eventsEndRef = useRef(null);
  const pollRef = useRef(null);

  // Poll for active agent
  const pollForAgent = useCallback(async () => {
    try {
      const result = await getActiveClusterAgent(runId);
      if (result) {
        setRun(result.run);
        if (result.activeAgent) {
          setActiveAgent(result.activeAgent);
          // Stop polling once we have an active agent
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }
    } catch {
      // Ignore polling errors
    } finally {
      setLoading(false);
    }
  }, [runId]);

  // Initial load + polling
  useEffect(() => {
    pollForAgent();
    pollRef.current = setInterval(pollForAgent, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollForAgent]);

  // SSE connection when active agent is found
  useEffect(() => {
    if (!activeAgent?.id) return;

    setEvents([]);
    const es = new EventSource(`/api/jobs/stream/${activeAgent.id}`);

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      let event;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }

      const { type } = event;

      if (type === 'connected') return;

      if (type === 'complete' || type === 'error') {
        setEvents((prev) => [...prev, event]);
        setConnected(false);
        es.close();
        // Re-poll for next active agent
        setActiveAgent(null);
        setLoading(false);
        pollRef.current = setInterval(pollForAgent, 5000);
        return;
      }

      setEvents((prev) => [...prev, event]);
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Re-poll for next active agent
      setActiveAgent(null);
      pollRef.current = setInterval(pollForAgent, 5000);
    };

    return () => {
      es.close();
    };
  }, [activeAgent?.id, pollForAgent]);

  // Auto-scroll
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <PageLayout session={session}>
      <ClusterDetailTabs runId={runId} activeTab="console" />

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
          <SpinnerIcon size={16} />
          Looking for active agent...
        </div>
      )}

      {!loading && !activeAgent && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-2">No agent currently executing</p>
          {run && (
            <p className="text-xs text-muted-foreground">
              Run status: <StatusBadge status={run.status} />
              {run.agentRuns && run.agentRuns.length > 0 && (
                <span className="ml-2">
                  Last agent: {run.agentRuns[run.agentRuns.length - 1].role}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {activeAgent && (
        <>
          {/* Active agent header */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm font-medium">{activeAgent.role}</span>
            <span className="text-xs text-muted-foreground">Step {activeAgent.agentIndex + 1}</span>
            <StatusBadge status={activeAgent.status} />
            <span className={`ml-auto flex items-center gap-1 text-xs ${connected ? 'text-green-500' : 'text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-400'}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Event stream display */}
          <div
            className="rounded-lg p-4 overflow-y-auto text-xs font-mono"
            style={{
              backgroundColor: '#0d1117',
              color: '#c9d1d9',
              maxHeight: '70vh',
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              fontSize: '12px',
              lineHeight: '1.5',
            }}
          >
            {events.length === 0 && (
              <div className="text-muted-foreground/50">Waiting for activity...</div>
            )}
            {events.map((event, i) => (
              <EventRow key={i} event={event} />
            ))}
            <div ref={eventsEndRef} />
          </div>
        </>
      )}
    </PageLayout>
  );
}
