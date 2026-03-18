'use client';

import { useState, useEffect } from 'react';
import { DatabaseIcon, PlusIcon, PencilIcon, TrashIcon, XIcon } from './icons.js';
import { getRepoList, addRepoAction, updateRepoAction, deleteRepoAction } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Repo Form
// ─────────────────────────────────────────────────────────────────────────────

function RepoForm({ initial, isNew, onSave, onCancel }) {
  const [form, setForm] = useState({
    owner: initial?.owner || '',
    slug: initial?.slug || '',
    name: initial?.name || '',
    aliases: (initial?.aliases || []).join(', '),
    dispatch: initial?.dispatch || 'docker',
    qualityGates: (initial?.qualityGates || []).join('\n'),
    mergePolicy: initial?.mergePolicy || 'auto',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function handleChange(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const repoData = {
      owner: form.owner.trim(),
      slug: form.slug.trim().toLowerCase(),
      name: form.name.trim(),
      aliases: form.aliases.split(',').map((a) => a.trim()).filter(Boolean),
      dispatch: form.dispatch,
      qualityGates: form.qualityGates.split('\n').map((g) => g.trim()).filter(Boolean),
      mergePolicy: form.mergePolicy,
    };

    const result = isNew
      ? await addRepoAction(repoData)
      : await updateRepoAction(initial.slug, repoData);

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
        <h3 className="text-sm font-medium">{isNew ? 'Add Repo' : `Edit ${initial.slug}`}</h3>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <XIcon size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Owner *</label>
          <input
            type="text"
            value={form.owner}
            onChange={(e) => handleChange('owner', e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            placeholder="github-org"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Slug * {!isNew && '(read-only)'}</label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => handleChange('slug', e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
            placeholder="my-repo"
            disabled={!isNew}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          placeholder="My Repository"
          required
        />
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Aliases (comma-separated)</label>
        <input
          type="text"
          value={form.aliases}
          onChange={(e) => handleChange('aliases', e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          placeholder="repo, my-repo, mr"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Dispatch</label>
          <select
            value={form.dispatch}
            onChange={(e) => handleChange('dispatch', e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="docker">Docker</option>
            <option value="actions">GitHub Actions</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Merge Policy</label>
          <select
            value={form.mergePolicy}
            onChange={(e) => handleChange('mergePolicy', e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="auto">Auto</option>
            <option value="gate-required">Gate Required</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Quality Gates (one per line)</label>
        <textarea
          value={form.qualityGates}
          onChange={(e) => handleChange('qualityGates', e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm min-h-[60px]"
          placeholder="npm run build&#10;npm run test"
        />
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
          {saving ? 'Saving...' : isNew ? 'Add Repo' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo Card
// ─────────────────────────────────────────────────────────────────────────────

function RepoCard({ repo, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    const result = await deleteRepoAction(repo.slug);
    if (result?.success) {
      onDelete();
    }
    setDeleting(false);
    setConfirming(false);
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-md bg-muted p-2 mt-0.5">
          <DatabaseIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{repo.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {repo.owner}/{repo.slug}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
              {repo.dispatch || 'docker'}
            </span>
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
              {repo.mergePolicy || 'auto'}
            </span>
            {repo.qualityGates?.length > 0 && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-500">
                {repo.qualityGates.length} gate{repo.qualityGates.length !== 1 ? 's' : ''}
              </span>
            )}
            {repo.aliases?.length > 0 && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                {repo.aliases.length} alias{repo.aliases.length !== 1 ? 'es' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(repo)}
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

export function AdminReposPage() {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // 'new' | slug | null

  function loadRepos() {
    setLoading(true);
    getRepoList()
      .then((data) => {
        if (Array.isArray(data)) setRepos(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRepos();
  }, []);

  function handleSave() {
    setEditing(null);
    loadRepos();
  }

  function handleEdit(repo) {
    setEditing(repo.slug);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {!loading && `${repos.length} repo${repos.length !== 1 ? 's' : ''} configured`}
        </p>
        {editing !== 'new' && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90"
          >
            <PlusIcon size={12} />
            Add Repo
          </button>
        )}
      </div>

      {editing === 'new' && (
        <div className="mb-4">
          <RepoForm isNew onSave={handleSave} onCancel={() => setEditing(null)} />
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-border/50" />
          ))}
        </div>
      ) : repos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-4">📦</div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">No repositories configured</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 max-w-md">
            Add your first repository to enable job dispatch. ClawForge needs at least one repo to create branches and pull requests.
          </p>
          <button onClick={() => setEditing('new')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            Add First Repository
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {repos.map((repo) =>
            editing === repo.slug ? (
              <RepoForm
                key={repo.slug}
                initial={repo}
                isNew={false}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <RepoCard
                key={repo.slug}
                repo={repo}
                onEdit={handleEdit}
                onDelete={loadRepos}
              />
            )
          )}
        </div>
      )}
    </>
  );
}
