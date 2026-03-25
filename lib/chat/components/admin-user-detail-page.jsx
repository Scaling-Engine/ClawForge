'use client';

import { useState, useEffect } from 'react';
import { UserIcon, ShieldIcon } from './icons.js';
import { getHubUserById, getUserAgentAssignments, setUserAgentAssignments } from '../actions.js';

const AGENT_ROLES = ['viewer', 'operator', 'admin'];

export function AdminUserDetailPage({ userId, knownAgents = [] }) {
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]); // [{agentSlug, agentRole}]
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // {type: 'success'|'error', text: string}

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [u, a] = await Promise.all([
        getHubUserById(userId),
        getUserAgentAssignments(userId),
      ]);
      setUser(u);
      setAssignments(a.map(r => ({ agentSlug: r.agentSlug, agentRole: r.agentRole })));
      setLoading(false);
    }
    load();
  }, [userId]);

  // All known agent slugs: union of knownAgents prop + currently assigned slugs
  const allSlugs = Array.from(new Set([
    ...knownAgents,
    ...assignments.map(a => a.agentSlug),
  ])).sort();

  function isAssigned(slug) {
    return assignments.some(a => a.agentSlug === slug);
  }

  function getRoleForSlug(slug) {
    return assignments.find(a => a.agentSlug === slug)?.agentRole ?? 'operator';
  }

  function toggleAssignment(slug, checked) {
    if (checked) {
      setAssignments(prev => [...prev, { agentSlug: slug, agentRole: 'operator' }]);
    } else {
      setAssignments(prev => prev.filter(a => a.agentSlug !== slug));
    }
  }

  function setRole(slug, role) {
    setAssignments(prev =>
      prev.map(a => a.agentSlug === slug ? { ...a, agentRole: role } : a)
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const result = await setUserAgentAssignments(userId, assignments);
    if (result?.success) {
      setMessage({ type: 'success', text: 'Assignments saved.' });
    } else {
      setMessage({ type: 'error', text: result?.error ?? 'Failed to save.' });
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-border/50" />
        ))}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        User not found.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* User info header */}
      <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
        <div className="shrink-0 rounded-md bg-muted p-2">
          <UserIcon size={16} />
        </div>
        <div>
          <p className="text-sm font-medium">{user.email}</p>
          <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
        </div>
      </div>

      {/* Agent assignments form */}
      <form onSubmit={handleSave} className="space-y-4">
        <h2 className="text-sm font-semibold">Agent Assignments</h2>

        {allSlugs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No agents configured. Set SUPERADMIN_INSTANCES to define available agents.
          </p>
        )}

        <div className="space-y-2">
          {allSlugs.map(slug => {
            const assigned = isAssigned(slug);
            const role = getRoleForSlug(slug);
            return (
              <div
                key={slug}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <input
                  type="checkbox"
                  id={`agent-${slug}`}
                  checked={assigned}
                  onChange={e => toggleAssignment(slug, e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <label
                  htmlFor={`agent-${slug}`}
                  className="flex-1 text-sm font-medium cursor-pointer select-none"
                >
                  {slug}
                </label>
                {assigned && (
                  <select
                    value={role}
                    onChange={e => setRole(slug, e.target.value)}
                    className="text-xs rounded-md border bg-background px-2 py-1 text-muted-foreground"
                  >
                    {AGENT_ROLES.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>

        {message && (
          <div
            className={`rounded-lg p-3 text-sm ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {message.text}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Assignments'}
        </button>
      </form>
    </div>
  );
}
