'use client';

import { useState, useEffect, useRef } from 'react';
import { SpinnerIcon, CheckIcon, XIcon, FileTextIcon } from './icons.js';

/**
 * Maps a semantic event type to a human-readable activity label.
 *
 * @param {string} type - Semantic event type from SSE stream
 * @param {object} data - Event data payload
 * @returns {string} Activity label for the header row
 */
function getActivityLabel(type, data) {
  switch (type) {
    case 'file-change':    return 'Editing files';
    case 'bash-output':    return 'Running commands';
    case 'decision':       return 'Reasoning';
    case 'progress':       return data?.label || 'Working...';
    case 'error':          return 'Error encountered';
    default:               return 'Processing...';
  }
}

/**
 * Format elapsed seconds as "Xm Ys".
 *
 * @param {number} secs - Elapsed seconds
 * @returns {string} Formatted duration string
 */
function formatElapsed(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

/** Terminal icon (inline SVG — not in icons.js) */
function TerminalIcon({ size = 14 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  );
}

/** Arrow-right icon for progress events */
function ArrowRightIcon({ size = 14 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

/** Brain icon for decision events */
function BrainIcon({ size = 14 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  );
}

/**
 * Render a single event row in the stream viewer.
 *
 * @param {{ type: string, [key: string]: any }} event - Semantic event object
 * @param {number} i - List index (key)
 */
function EventRow({ event, i }) {
  const { type } = event;

  if (type === 'file-change') {
    const isCreate = event.operation === 'create' || event.operation === 'new';
    return (
      <div key={i} className="flex items-start gap-1.5 py-0.5">
        <FileTextIcon size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
        <span className={isCreate ? 'text-green-400' : 'text-yellow-400'}>
          {event.operation === 'delete' ? '−' : isCreate ? '+' : '~'}{' '}
          {event.path || '(unknown path)'}
        </span>
      </div>
    );
  }

  if (type === 'bash-output') {
    const cmd = (event.command || event.line || '').slice(0, 120);
    return (
      <div key={i} className="flex items-start gap-1.5 py-0.5">
        <TerminalIcon size={12} />
        <span className="text-muted-foreground truncate">{cmd}</span>
      </div>
    );
  }

  if (type === 'decision') {
    const txt = (event.text || '').slice(0, 120);
    return (
      <div key={i} className="flex items-start gap-1.5 py-0.5 italic text-muted-foreground/70">
        <BrainIcon size={12} />
        <span>{txt}</span>
      </div>
    );
  }

  if (type === 'progress') {
    return (
      <div key={i} className="flex items-start gap-1.5 py-0.5">
        <ArrowRightIcon size={12} />
        <span className="text-muted-foreground">{event.label || 'Working...'}</span>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div key={i} className="flex items-start gap-1.5 py-0.5 text-red-400">
        <XIcon size={12} />
        <span>{(event.message || 'Unknown error').slice(0, 120)}</span>
      </div>
    );
  }

  // Fallback — unknown type, show raw
  return (
    <div key={i} className="py-0.5 text-muted-foreground/50">
      {type}: {JSON.stringify(event).slice(0, 80)}
    </div>
  );
}

/**
 * JobStreamViewer — renders live SSE events inline in the web chat thread.
 *
 * Connects to /api/jobs/stream/[jobId] via EventSource, shows a progress
 * indicator with spinner + elapsed time, and lists the last 25 semantic events
 * as they arrive. Auto-scrolls to the latest event. Cleans up on unmount.
 *
 * @param {{ jobId: string }} props
 */
export function JobStreamViewer({ jobId }) {
  const [events, setEvents] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [activity, setActivity] = useState('Connecting...');
  const [status, setStatus] = useState('streaming'); // 'streaming' | 'complete' | 'cancelled' | 'error'

  const startRef = useRef(Date.now());
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/jobs/stream/${jobId}`);

    es.onmessage = (e) => {
      let event;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }

      const { type } = event;

      if (type === 'complete' || type === 'cancelled') {
        setStatus(type);
        setActivity(type === 'complete' ? 'Completed' : 'Cancelled');
        es.close();
        return;
      }

      if (type === 'error') {
        setStatus('error');
        setActivity('Error encountered');
        setEvents((prev) => [...prev.slice(-24), event]);
        es.close();
        return;
      }

      if (type === 'connected') {
        setActivity('Connected — waiting for events...');
        return;
      }

      // Semantic event — append to list (keep last 25) and update activity
      setEvents((prev) => [...prev.slice(-24), event]);
      setActivity(getActivityLabel(type, event));
    };

    es.onerror = () => {
      // Only move to error state if we haven't already finished
      setStatus((prev) => {
        if (prev === 'streaming') {
          setActivity('Stream disconnected');
          return 'error';
        }
        return prev;
      });
      es.close();
    };

    // Timer: update elapsed every second
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    return () => {
      es.close();
      clearInterval(timer);
    };
  }, [jobId]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const isStreaming = status === 'streaming';
  const isComplete = status === 'complete';
  const isCancelled = status === 'cancelled';

  const elapsedStr = formatElapsed(elapsed);

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/50 p-3 text-xs font-mono">
      {/* Header row */}
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {isStreaming && <SpinnerIcon size={12} />}
        {isComplete && <CheckIcon size={12} className="text-green-500" />}
        {isCancelled && <XIcon size={12} className="text-yellow-500" />}
        {status === 'error' && <XIcon size={12} className="text-red-500" />}

        <span className="flex-1 truncate">
          {isComplete
            ? `Completed in ${elapsedStr}`
            : isCancelled
            ? `Cancelled after ${elapsedStr}`
            : status === 'error'
            ? `Stream error after ${elapsedStr}`
            : activity}
        </span>

        {isStreaming && (
          <span className="shrink-0 tabular-nums text-muted-foreground/60">{elapsedStr}</span>
        )}
      </div>

      {/* Event list */}
      {events.length > 0 && (
        <div className="max-h-48 overflow-y-auto">
          {events.map((event, i) => (
            <EventRow key={i} event={event} i={i} />
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {events.length === 0 && isStreaming && (
        <div className="text-muted-foreground/50">Waiting for activity...</div>
      )}
    </div>
  );
}
