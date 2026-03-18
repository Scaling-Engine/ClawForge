'use client';

import { useState, useEffect } from 'react';
import { KeyIcon, CopyIcon, CheckIcon, TrashIcon, RefreshIcon, PlusIcon, ShieldIcon, PencilIcon, XIcon } from './icons.js';
import {
  createNewApiKey, getApiKeys, deleteApiKey,
  listGitHubSecrets, createGitHubSecret, updateGitHubSecret, deleteGitHubSecret,
  listGitHubVariables, createGitHubVariable, updateGitHubVariable, deleteGitHubVariable,
} from '../actions.js';

function timeAgo(ts) {
  if (!ts) return 'Never';
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

function formatDate(ts) {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper — reusable for each secrets section
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, description, children }) {
  return (
    <div className="pb-8 mb-8 border-b border-border last:border-b-0 last:pb-0 last:mb-0">
      <h2 className="text-base font-medium mb-1">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// API Key section
// ─────────────────────────────────────────────────────────────────────────────

function ApiKeySection() {
  const [currentKey, setCurrentKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [error, setError] = useState(null);

  const loadKey = async () => {
    try {
      const result = await getApiKeys();
      setCurrentKey(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKey();
  }, []);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    setConfirmRegenerate(false);
    try {
      const result = await createNewApiKey();
      if (result.error) {
        setError(result.error);
      } else {
        setNewKey(result.key);
        await loadKey();
      }
    } catch {
      setError('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    try {
      await deleteApiKey();
      setCurrentKey(null);
      setNewKey(null);
      setConfirmDelete(false);
    } catch {
      // ignore
    }
  };

  const handleRegenerate = () => {
    if (!confirmRegenerate) {
      setConfirmRegenerate(true);
      setTimeout(() => setConfirmRegenerate(false), 3000);
      return;
    }
    handleCreate();
  };

  if (loading) {
    return <div className="h-14 animate-pulse rounded-md bg-border/50" />;
  }

  return (
    <div>
      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      {/* New key banner */}
      {newKey && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 mb-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              API key created — copy it now. You won't be able to see it again.
            </p>
            <button
              onClick={() => setNewKey(null)}
              className="text-xs text-muted-foreground hover:text-foreground shrink-0"
            >
              Dismiss
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all select-all">
              {newKey}
            </code>
            <CopyButton text={newKey} />
          </div>
        </div>
      )}

      {currentKey ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="shrink-0 rounded-md bg-muted p-2">
                <KeyIcon size={16} />
              </div>
              <div>
                <code className="text-sm font-mono">{currentKey.keyPrefix}...</code>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Created {formatDate(currentKey.createdAt)}
                  {currentKey.lastUsedAt && (
                    <span className="ml-2">· Last used {timeAgo(currentKey.lastUsedAt)}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRegenerate}
                disabled={creating}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border ${
                  confirmRegenerate
                    ? 'border-yellow-500 text-yellow-600 hover:bg-yellow-500/10'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                } disabled:opacity-50`}
              >
                <RefreshIcon size={12} />
                {creating ? 'Generating...' : confirmRegenerate ? 'Confirm regenerate' : 'Regenerate'}
              </button>
              <button
                onClick={handleDelete}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border ${
                  confirmDelete
                    ? 'border-destructive text-destructive hover:bg-destructive/10'
                    : 'border-border text-muted-foreground hover:text-destructive hover:border-destructive/50'
                }`}
              >
                <TrashIcon size={12} />
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-card p-6 flex flex-col items-center text-center">
          <p className="text-sm text-muted-foreground mb-3">No API key configured</p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {creating ? 'Creating...' : 'Create API key'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Secrets section
// ─────────────────────────────────────────────────────────────────────────────

function GitHubSecretsSection() {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingName, setEditingName] = useState(null);
  const [formPrefix, setFormPrefix] = useState('AGENT_');
  const [formName, setFormName] = useState('');
  const [formValue, setFormValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteName, setConfirmDeleteName] = useState(null);

  const loadSecrets = async () => {
    try {
      const result = await listGitHubSecrets();
      if (result.error) {
        setError(result.error);
      } else {
        setSecrets(result);
        setError(null);
      }
    } catch {
      setError('Failed to load secrets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSecrets();
  }, []);

  const openCreateForm = () => {
    setEditingName(null);
    setFormPrefix('AGENT_');
    setFormName('');
    setFormValue('');
    setShowValue(false);
    setShowForm(true);
  };

  const openEditForm = (name) => {
    setEditingName(name);
    setFormValue('');
    setShowValue(false);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingName(null);
    setFormName('');
    setFormValue('');
    setShowValue(false);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      let result;
      if (editingName) {
        result = await updateGitHubSecret(editingName, formValue);
      } else {
        const fullName = formPrefix + formName;
        result = await createGitHubSecret(fullName, formValue);
      }
      if (result.error) {
        setError(result.error);
      } else {
        closeForm();
        await loadSecrets();
      }
    } catch {
      setError('Failed to save secret');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name) => {
    if (confirmDeleteName !== name) {
      setConfirmDeleteName(name);
      setTimeout(() => setConfirmDeleteName(null), 3000);
      return;
    }
    try {
      const result = await deleteGitHubSecret(name);
      if (result.error) {
        setError(result.error);
      } else {
        setConfirmDeleteName(null);
        await loadSecrets();
      }
    } catch {
      setError('Failed to delete secret');
    }
  };

  if (loading) {
    return <div className="h-14 animate-pulse rounded-md bg-border/50" />;
  }

  return (
    <div>
      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="rounded-lg border bg-card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">
              {editingName ? `Update ${editingName}` : 'Create Secret'}
            </h3>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <XIcon size={14} />
            </button>
          </div>

          {!editingName && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Prefix</label>
              <select
                value={formPrefix}
                onChange={(e) => setFormPrefix(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="AGENT_">AGENT_ — passed to container, hidden from LLM</option>
                <option value="AGENT_LLM_">AGENT_LLM_ — passed to container, visible to LLM</option>
              </select>
            </div>
          )}

          {!editingName && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                Name (suffix)
                <span
                  title="Prefix with AGENT_ to pass this secret to job containers. Prefix with AGENT_LLM_ to also make it accessible to the LLM. Secrets without AGENT_ prefix are NOT passed to containers."
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted-foreground text-muted-foreground text-[9px] font-bold cursor-help leading-none"
                >
                  i
                </span>
              </label>
              <div className="flex items-center gap-0">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-border bg-muted px-3 py-2 text-sm text-muted-foreground font-mono">
                  {formPrefix}
                </span>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                  placeholder="MY_SECRET_NAME"
                  title="Prefix with AGENT_ to pass this secret to job containers. Prefix with AGENT_LLM_ to also make it accessible to the LLM. Secrets without AGENT_ prefix are NOT passed to containers."
                  className="flex-1 rounded-r-md border border-border bg-background px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Value</label>
            <div className="relative">
              <input
                type={showValue ? 'text' : 'password'}
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="Secret value"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono pr-16"
              />
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showValue ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-3">
            Secrets with <code className="font-mono">AGENT_</code> prefix are passed to job containers but hidden from the LLM. Secrets with <code className="font-mono">AGENT_LLM_</code> prefix are visible to the LLM in the container.
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || (!editingName && !formName) || !formValue}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? 'Saving...' : editingName ? 'Update Secret' : 'Create Secret'}
            </button>
            <button
              onClick={closeForm}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Secrets list */}
      {secrets.length > 0 ? (
        <div className="space-y-2">
          {secrets.map((secret) => (
            <div key={secret.name} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 rounded-md bg-muted p-2">
                    <ShieldIcon size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{secret.name}</code>
                      {secret.name.startsWith('AGENT_LLM_') ? (
                        <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-1.5 py-0.5 rounded">Container + LLM</span>
                      ) : secret.name.startsWith('AGENT_') ? (
                        <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded">Container</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground font-mono">
                        {secret.masked || '(value not cached locally)'}
                      </span>
                      {secret.updated_at && (
                        <span className="text-xs text-muted-foreground">
                          · Updated {formatDate(secret.updated_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditForm(secret.name)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <PencilIcon size={12} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(secret.name)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border ${
                      confirmDeleteName === secret.name
                        ? 'border-destructive text-destructive hover:bg-destructive/10'
                        : 'border-border text-muted-foreground hover:text-destructive hover:border-destructive/50'
                    }`}
                  >
                    <TrashIcon size={12} />
                    {confirmDeleteName === secret.name ? 'Confirm delete' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!showForm && (
            <button
              onClick={openCreateForm}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground mt-2"
            >
              <PlusIcon size={14} />
              Add Secret
            </button>
          )}
        </div>
      ) : !showForm ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-4">🔑</div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">No secrets configured</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 max-w-md">
            Add GitHub Actions secrets to pass environment variables to job containers. Use the AGENT_ prefix to make secrets available inside containers.
          </p>
          <button onClick={openCreateForm} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            Add First Secret
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Variables section
// ─────────────────────────────────────────────────────────────────────────────

function GitHubVariablesSection() {
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingName, setEditingName] = useState(null);
  const [formName, setFormName] = useState('');
  const [formValue, setFormValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteName, setConfirmDeleteName] = useState(null);

  const loadVariables = async () => {
    try {
      const result = await listGitHubVariables();
      if (result.error) {
        setError(result.error);
      } else {
        setVariables(result);
        setError(null);
      }
    } catch {
      setError('Failed to load variables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVariables();
  }, []);

  const openCreateForm = () => {
    setEditingName(null);
    setFormName('');
    setFormValue('');
    setShowForm(true);
  };

  const openEditForm = (name, value) => {
    setEditingName(name);
    setFormName(name);
    setFormValue(value);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingName(null);
    setFormName('');
    setFormValue('');
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      let result;
      if (editingName) {
        result = await updateGitHubVariable(editingName, formValue);
      } else {
        result = await createGitHubVariable(formName, formValue);
      }
      if (result.error) {
        setError(result.error);
      } else {
        closeForm();
        await loadVariables();
      }
    } catch {
      setError('Failed to save variable');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name) => {
    if (confirmDeleteName !== name) {
      setConfirmDeleteName(name);
      setTimeout(() => setConfirmDeleteName(null), 3000);
      return;
    }
    try {
      const result = await deleteGitHubVariable(name);
      if (result.error) {
        setError(result.error);
      } else {
        setConfirmDeleteName(null);
        await loadVariables();
      }
    } catch {
      setError('Failed to delete variable');
    }
  };

  if (loading) {
    return <div className="h-14 animate-pulse rounded-md bg-border/50" />;
  }

  return (
    <div>
      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="rounded-lg border bg-card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">
              {editingName ? `Update ${editingName}` : 'Create Variable'}
            </h3>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <XIcon size={14} />
            </button>
          </div>

          {!editingName && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                placeholder="VARIABLE_NAME"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          )}

          <div className="mb-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Value</label>
            <input
              type="text"
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder="Variable value"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || (!editingName && !formName) || !formValue}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? 'Saving...' : editingName ? 'Update Variable' : 'Create Variable'}
            </button>
            <button
              onClick={closeForm}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Variables list */}
      {variables.length > 0 ? (
        <div className="space-y-2">
          {variables.map((variable) => (
            <div key={variable.name} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 rounded-md bg-muted p-2">
                    <KeyIcon size={16} />
                  </div>
                  <div className="min-w-0">
                    <code className="text-sm font-mono">{variable.name}</code>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-xs text-muted-foreground font-mono truncate">
                        {variable.value}
                      </code>
                      <CopyButton text={variable.value} />
                      {variable.updated_at && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          · Updated {formatDate(variable.updated_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <button
                    onClick={() => openEditForm(variable.name, variable.value)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <PencilIcon size={12} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(variable.name)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border ${
                      confirmDeleteName === variable.name
                        ? 'border-destructive text-destructive hover:bg-destructive/10'
                        : 'border-border text-muted-foreground hover:text-destructive hover:border-destructive/50'
                    }`}
                  >
                    <TrashIcon size={12} />
                    {confirmDeleteName === variable.name ? 'Confirm delete' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!showForm && (
            <button
              onClick={openCreateForm}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground mt-2"
            >
              <PlusIcon size={14} />
              Add Variable
            </button>
          )}
        </div>
      ) : !showForm ? (
        <div className="rounded-lg border border-dashed bg-card p-6 flex flex-col items-center text-center">
          <p className="text-sm text-muted-foreground mb-3">No GitHub variables configured</p>
          <button
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90"
          >
            Create a variable
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsSecretsPage() {
  return (
    <div>
      <Section
        title="API Key"
        description="Authenticates external requests to /api endpoints. Pass via the x-api-key header."
      >
        <ApiKeySection />
      </Section>

      <Section
        title="GitHub Secrets"
        description="AGENT_* secrets passed to job containers via GitHub Actions. Values are write-only — GitHub never returns them after creation."
      >
        <GitHubSecretsSection />
      </Section>

      <Section
        title="GitHub Variables"
        description="Non-sensitive configuration variables for GitHub Actions workflows. Values are stored in plaintext."
      >
        <GitHubVariablesSection />
      </Section>
    </div>
  );
}
