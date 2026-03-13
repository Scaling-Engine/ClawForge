'use client';

import { useState, useEffect } from 'react';
import { ZapIcon, ChevronDownIcon } from './icons.js';
import { getSwarmConfig } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Trigger Card
// ─────────────────────────────────────────────────────────────────────────────

function WebhookCard({ trigger }) {
  const [expanded, setExpanded] = useState(false);
  const disabled = trigger.enabled === false;
  const actions = trigger.actions || [];
  const webhookActions = actions.filter((a) => a.type === 'webhook');

  return (
    <div
      className={`rounded-lg border bg-card transition-opacity ${disabled ? 'opacity-60' : ''}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full text-left p-4 hover:bg-accent/50 rounded-lg"
      >
        <div className="shrink-0 rounded-md bg-muted p-2">
          <ZapIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{trigger.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="font-mono">{trigger.watch_path}</span>
            <span className="mx-1.5 text-border">|</span>
            {webhookActions.length} webhook{webhookActions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              disabled ? 'bg-muted text-muted-foreground' : 'bg-green-500/10 text-green-500'
            }`}
          >
            {disabled ? 'disabled' : 'enabled'}
          </span>
          <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
            <ChevronDownIcon size={14} />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 flex flex-col gap-2">
          {webhookActions.map((action, i) => (
            <div key={i} className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground font-medium">Webhook {i + 1}</span>
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-500/10 text-orange-500">
                  webhook
                </span>
              </div>
              <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono overflow-auto">
                {action.method && action.method !== 'POST' ? `${action.method} ` : ''}{action.url}
              </pre>
              {action.vars && Object.keys(action.vars).length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Variables</p>
                  <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48">
                    {JSON.stringify(action.vars, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function AdminWebhooksPage() {
  const [webhookTriggers, setWebhookTriggers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSwarmConfig()
      .then((data) => {
        if (data?.triggers) {
          const filtered = data.triggers.filter((t) =>
            t.actions?.some((a) => a.type === 'webhook')
          );
          setWebhookTriggers(filtered);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const enabled = webhookTriggers.filter((t) => t.enabled !== false);
  const disabled = webhookTriggers.filter((t) => t.enabled === false);

  return (
    <>
      {!loading && (
        <p className="text-sm text-muted-foreground mb-4">
          {webhookTriggers.length} webhook trigger{webhookTriggers.length !== 1 ? 's' : ''} configured, {enabled.length} enabled
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-border/50" />
          ))}
        </div>
      ) : webhookTriggers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <ZapIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No webhook triggers configured</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Add webhook triggers by editing <span className="font-mono">config/TRIGGERS.json</span> in your project.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {enabled.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-2 pb-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Enabled</span>
                <span className="text-xs text-muted-foreground">({enabled.length})</span>
              </div>
              {enabled.map((trigger, i) => (
                <WebhookCard key={`enabled-${i}`} trigger={trigger} />
              ))}
            </>
          )}
          {disabled.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-2 pb-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Disabled</span>
                <span className="text-xs text-muted-foreground">({disabled.length})</span>
              </div>
              {disabled.map((trigger, i) => (
                <WebhookCard key={`disabled-${i}`} trigger={trigger} />
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}
