'use client';

import { useState, useEffect } from 'react';
import { CheckIcon, SettingsSliderIcon } from './icons.js';
import { getConfigValues, updateConfigAction, getJobAuthMethod } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Config Field
// ─────────────────────────────────────────────────────────────────────────────

function ConfigField({ label, configKey, value, type, options, isSecret, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error' | null
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    const result = await updateConfigAction(configKey, localValue, isSecret);
    setSaving(false);
    if (result?.success) {
      setStatus('success');
      setStatusMsg('Saved');
      setEditing(false);
      onSaved?.();
      setTimeout(() => setStatus(null), 2000);
    } else {
      setStatus('error');
      setStatusMsg(result?.error || 'Failed');
    }
  }

  function renderInput() {
    if (type === 'select') {
      return (
        <select
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    if (type === 'toggle') {
      const checked = localValue === 'true' || localValue === '1';
      return (
        <button
          type="button"
          onClick={() => {
            const newVal = checked ? 'false' : 'true';
            setLocalValue(newVal);
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            checked ? 'bg-foreground' : 'bg-muted'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition-transform ${
              checked ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      );
    }

    if (type === 'number') {
      return (
        <input
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
        />
      );
    }

    if (isSecret && !editing) {
      return (
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm text-muted-foreground font-mono">{value || 'Not set'}</span>
          <button
            onClick={() => { setEditing(true); setLocalValue(''); }}
            className="text-[11px] px-2 py-0.5 rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Change
          </button>
        </div>
      );
    }

    return (
      <input
        type={isSecret ? 'password' : 'text'}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
        placeholder={isSecret ? 'Enter new value' : ''}
      />
    );
  }

  const showSaveButton = type !== 'toggle' && !(isSecret && !editing);

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-48 shrink-0">
        <label className="text-sm font-medium">{label}</label>
        <p className="text-[10px] text-muted-foreground font-mono">{configKey}</p>
      </div>
      {renderInput()}
      {type === 'toggle' && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[11px] px-2 py-1 rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {saving ? '...' : 'Save'}
        </button>
      )}
      {showSaveButton && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[11px] px-2.5 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {saving ? '...' : 'Save'}
        </button>
      )}
      {status === 'success' && <CheckIcon size={14} className="text-green-500" />}
      {status === 'error' && <span className="text-xs text-destructive">{statusMsg}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Section
// ─────────────────────────────────────────────────────────────────────────────

function ConfigSection({ title, children }) {
  return (
    <div className="rounded-lg border bg-card p-4 mb-4">
      <h3 className="text-sm font-medium mb-3 text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Field with Help Toggle
// ─────────────────────────────────────────────────────────────────────────────

function AuthFieldWithHelp({ label, configKey, value, onSaved, helpTitle, helpSteps, helpNote }) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-1.5 pt-2">
        <div className="flex-1">
          <ConfigField label={label} configKey={configKey} value={value} isSecret onSaved={onSaved} />
        </div>
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="text-[11px] px-1.5 py-0.5 rounded border text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
          title={showHelp ? 'Hide instructions' : 'How to find this'}
        >
          ?
        </button>
      </div>
      {showHelp && (
        <div className="ml-[12.5rem] mt-1 mb-2 rounded-md border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1.5">{helpTitle}</p>
          <ol className="list-decimal list-inside space-y-1">
            {helpSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          {helpNote && <p className="mt-2 text-[10px] opacity-75">{helpNote}</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function AdminGeneralPage() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [authInfo, setAuthInfo] = useState(null);

  function loadConfig() {
    setLoading(true);
    getConfigValues()
      .then((data) => {
        if (data && typeof data === 'object') setConfig(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadConfig();
    getJobAuthMethod().then(setAuthInfo).catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-border/50" />
        ))}
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        Platform configuration. Changes take effect on next job dispatch.
      </p>

      <ConfigSection title="Job Container Auth">
        <div className="flex items-center gap-3 py-2">
          <div className="w-48 shrink-0">
            <label className="text-sm font-medium">Status</label>
            <p className="text-[10px] text-muted-foreground font-mono">active method</p>
          </div>
          {authInfo ? (
            <div className="flex items-center gap-2">
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                authInfo.method === 'subscription' ? 'bg-green-500/15 text-green-600' :
                authInfo.method === 'api-key' ? 'bg-blue-500/15 text-blue-600' :
                'bg-orange-500/15 text-orange-600'
              }`}>
                {authInfo.method === 'subscription' ? 'Subscription' :
                 authInfo.method === 'api-key' ? 'API Key' : 'Not Configured'}
              </span>
              <span className="text-xs text-muted-foreground">{authInfo.detail}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Loading...</span>
          )}
        </div>
        <AuthFieldWithHelp
          label="Claude Subscription Token"
          configKey="CLAUDE_CODE_OAUTH_TOKEN"
          value={config.CLAUDE_CODE_OAUTH_TOKEN}
          onSaved={() => { loadConfig(); getJobAuthMethod().then(setAuthInfo); }}
          helpTitle="How to find your Claude subscription token"
          helpSteps={[
            'Open a terminal on the machine where Claude Code is logged in',
            'Run: claude auth status — verify you see "loggedIn: true"',
            'Run: security find-generic-password -s "Claude Code-credentials" -a "$(whoami)" -w | python3 -c "import sys,json; print(json.loads(sys.stdin.read())[\'claudeAiOauth\'][\'accessToken\'])"',
            'Copy the token that starts with sk-ant-oat01-... and paste it above',
          ]}
          helpNote="Uses your Claude Max/Pro subscription. No API billing — included in your plan."
        />
        <AuthFieldWithHelp
          label="Anthropic API Key"
          configKey="ANTHROPIC_API_KEY"
          value={config.ANTHROPIC_API_KEY}
          onSaved={() => { loadConfig(); getJobAuthMethod().then(setAuthInfo); }}
          helpTitle="How to find your Anthropic API key"
          helpSteps={[
            'Go to console.anthropic.com and sign in',
            'Navigate to Settings → API Keys',
            'Click "Create Key" or copy an existing one',
            'Paste the key that starts with sk-ant-api03-... above',
          ]}
          helpNote="Pay-per-use API billing. Used as fallback if no subscription token is set."
        />
      </ConfigSection>

      <ConfigSection title="LLM">
        <ConfigField
          label="Provider"
          configKey="LLM_PROVIDER"
          value={config.LLM_PROVIDER}
          type="select"
          options={['anthropic', 'openai', 'google']}
          onSaved={loadConfig}
        />
        <ConfigField
          label="Model"
          configKey="LLM_MODEL"
          value={config.LLM_MODEL}
          type="text"
          onSaved={loadConfig}
        />
      </ConfigSection>

      <ConfigSection title="Execution">
        <ConfigField
          label="Job Timeout (ms)"
          configKey="JOB_TIMEOUT_MS"
          value={config.JOB_TIMEOUT_MS}
          type="number"
          onSaved={loadConfig}
        />
        <ConfigField
          label="Auto Merge"
          configKey="AUTO_MERGE_ENABLED"
          value={config.AUTO_MERGE_ENABLED}
          type="toggle"
          onSaved={loadConfig}
        />
      </ConfigSection>

      <ConfigSection title="Integrations">
        <ConfigField
          label="AssemblyAI API Key"
          configKey="ASSEMBLYAI_API_KEY"
          value={config.ASSEMBLYAI_API_KEY}
          isSecret
          onSaved={loadConfig}
        />
        <ConfigField
          label="Brave Search API Key"
          configKey="BRAVE_API_KEY"
          value={config.BRAVE_API_KEY}
          isSecret
          onSaved={loadConfig}
        />
      </ConfigSection>

      <ConfigSection title="Slack">
        <ConfigField
          label="Require Mention"
          configKey="SLACK_REQUIRE_MENTION"
          value={config.SLACK_REQUIRE_MENTION}
          type="toggle"
          onSaved={loadConfig}
        />
      </ConfigSection>
    </>
  );
}
