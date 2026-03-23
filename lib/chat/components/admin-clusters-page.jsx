'use client';

import { useState, useEffect } from 'react';
import { ClusterIcon, PlusIcon, PencilIcon, TrashIcon, XIcon } from './icons.js';
import { getClusterConfig, saveClusterAction, deleteClusterAction } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Role Form — sub-component within ClusterForm
// ─────────────────────────────────────────────────────────────────────────────

function RoleRow({ role, onChange, onRemove, index }) {
  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Role {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          title="Remove role"
        >
          <XIcon size={12} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Name *</label>
          <input
            type="text"
            value={role.name}
            onChange={(e) => onChange('name', e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            placeholder="Developer"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Allowed Tools (comma-separated)</label>
          <input
            type="text"
            value={(role.allowedTools || []).join(', ')}
            onChange={(e) =>
              onChange(
                'allowedTools',
                e.target.value.split(',').map((t) => t.trim()).filter(Boolean)
              )
            }
            className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            placeholder="Read, Glob, Grep, Write, Edit, Bash"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">System Prompt *</label>
        <textarea
          value={role.systemPrompt}
          onChange={(e) => onChange('systemPrompt', e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs min-h-[60px]"
          placeholder="Describe what this role does..."
          required
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster Form
// ─────────────────────────────────────────────────────────────────────────────

function ClusterForm({ initial, isNew, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt || '');
  const [roles, setRoles] = useState(
    initial?.roles?.length
      ? initial.roles.map((r) => ({ ...r }))
      : [{ name: '', systemPrompt: '', allowedTools: [] }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function updateRole(index, field, value) {
    setRoles((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setError(null);
  }

  function addRole() {
    setRoles((prev) => [...prev, { name: '', systemPrompt: '', allowedTools: [] }]);
  }

  function removeRole(index) {
    setRoles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const clusterData = {
      name: name.trim(),
      ...(systemPrompt.trim() ? { systemPrompt: systemPrompt.trim() } : {}),
      roles: roles.map((r) => ({
        name: r.name.trim(),
        systemPrompt: r.systemPrompt.trim(),
        allowedTools: r.allowedTools || [],
      })),
    };

    const result = await saveClusterAction(clusterData, isNew ? null : initial.name);

    setSaving(false);
    if (result?.error) {
      setError(result.error);
    } else {
      onSave();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">{isNew ? 'Add Cluster' : `Edit ${initial.name}`}</h3>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <XIcon size={14} />
        </button>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Cluster Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          placeholder="default"
          required
        />
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Cluster System Prompt (optional)</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm min-h-[60px]"
          placeholder="High-level instructions shared across all roles in this cluster..."
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs text-muted-foreground">Roles *</label>
          <button
            type="button"
            onClick={addRole}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PlusIcon size={10} />
            Add Role
          </button>
        </div>
        {roles.map((role, i) => (
          <RoleRow
            key={i}
            index={i}
            role={role}
            onChange={(field, value) => updateRole(i, field, value)}
            onRemove={() => removeRole(i)}
          />
        ))}
        {roles.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Add at least one role.</p>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-md border text-muted-foreground hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : isNew ? 'Add Cluster' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster Card
// ─────────────────────────────────────────────────────────────────────────────

function ClusterCard({ cluster, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    const result = await deleteClusterAction(cluster.name);
    if (result?.success) {
      onDelete();
    }
    setDeleting(false);
    setConfirming(false);
  }

  const roleCount = cluster.roles?.length || 0;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-md bg-muted p-2 mt-0.5">
          <ClusterIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{cluster.name}</p>
          {cluster.systemPrompt && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{cluster.systemPrompt}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
              {roleCount} role{roleCount !== 1 ? 's' : ''}
            </span>
            {cluster.roles?.map((r) => (
              <span
                key={r.name}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-500"
              >
                {r.name}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(cluster)}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Edit"
          >
            <PencilIcon size={13} />
          </button>
          {confirming ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-[11px] px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 font-medium"
              >
                {deleting ? '...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Delete"
            >
              <TrashIcon size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function AdminClustersPage() {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // 'new' | cluster name | null

  function loadClusters() {
    setLoading(true);
    getClusterConfig()
      .then((data) => {
        if (Array.isArray(data?.clusters)) setClusters(data.clusters);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadClusters();
  }, []);

  function handleSave() {
    setEditing(null);
    loadClusters();
  }

  function handleEdit(cluster) {
    setEditing(cluster.name);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {!loading && `${clusters.length} cluster${clusters.length !== 1 ? 's' : ''} configured`}
        </p>
        {editing !== 'new' && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90"
          >
            <PlusIcon size={12} />
            Add Cluster
          </button>
        )}
      </div>

      {editing === 'new' && (
        <div className="mb-4">
          <ClusterForm isNew onSave={handleSave} onCancel={() => setEditing(null)} />
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-border/50" />
          ))}
        </div>
      ) : clusters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-4">
            <ClusterIcon size={40} />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">No clusters configured</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 max-w-md">
            Clusters define multi-agent teams. Add a cluster with roles to enable parallel agent dispatch.
          </p>
          <button
            onClick={() => setEditing('new')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Add First Cluster
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {clusters.map((cluster) =>
            editing === cluster.name ? (
              <ClusterForm
                key={cluster.name}
                initial={cluster}
                isNew={false}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <ClusterCard
                key={cluster.name}
                cluster={cluster}
                onEdit={handleEdit}
                onDelete={loadClusters}
              />
            )
          )}
        </div>
      )}
    </>
  );
}
