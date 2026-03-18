'use client';

import { useState } from 'react';
import { verifyOnboardingSlack } from '../../actions.js';

export default function StepChannel({ onStepComplete }) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  async function handleVerify() {
    if (!webhookUrl.trim()) {
      setErrorMsg('Please enter a Slack webhook URL');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const result = await verifyOnboardingSlack(webhookUrl.trim());
      if (result.success) {
        setStatus('success');
        setTimeout(() => onStepComplete('channel_connect'), 1500);
      } else {
        setErrorMsg(result.error || 'Verification failed');
        setStatus('error');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Unexpected error');
      setStatus('error');
    }
  }

  function handleSkip() {
    onStepComplete('channel_connect');
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          Slack Channel
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect a Slack channel to receive job notifications. ClawForge will post updates when
          jobs complete, fail, or need your attention. This step is optional — you can skip it and
          set it up later in Settings.
        </p>
      </div>

      {status === 'success' && (
        <div className="flex items-center gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3">
          <svg className="h-5 w-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm text-green-700 dark:text-green-300">
            Slack webhook verified — test message sent successfully!
          </p>
        </div>
      )}

      {status !== 'success' && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 block">
              Slack Incoming Webhook URL
            </span>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => {
                setWebhookUrl(e.target.value);
                if (status === 'error') setStatus(null);
              }}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </label>

          {status === 'error' && errorMsg && (
            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
              <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              {errorMsg}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {status !== 'success' && (
          <button
            onClick={handleVerify}
            disabled={status === 'loading'}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'loading' ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Verifying...
              </>
            ) : (
              'Verify Webhook'
            )}
          </button>
        )}

        <button
          onClick={handleSkip}
          className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline underline-offset-2 transition-colors"
        >
          Skip this step
        </button>
      </div>
    </div>
  );
}
