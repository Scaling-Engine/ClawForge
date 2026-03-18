'use client';

import { useState } from 'react';
import { dispatchOnboardingFirstJob } from '../../actions.js';

export default function StepFirstJob({ onStepComplete }) {
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [jobInfo, setJobInfo] = useState(null); // { jobId, branch }
  const [errorMsg, setErrorMsg] = useState('');

  async function handleDispatch() {
    setStatus('loading');
    setErrorMsg('');
    try {
      const result = await dispatchOnboardingFirstJob();
      if (result.success) {
        setJobInfo({ jobId: result.jobId, branch: result.branch });
        setStatus('success');
      } else {
        setErrorMsg(result.error || 'Job dispatch failed');
        setStatus('error');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Unexpected error');
      setStatus('error');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
          First Job
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Dispatch your first job to verify the full pipeline works end-to-end. This will push a
          job branch to GitHub, trigger the GitHub Actions workflow, and run Claude Code in a Docker
          container. The job creates a simple test file to confirm the agent pipeline is working.
        </p>
      </div>

      {status === 'success' && jobInfo && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3">
            <svg className="h-5 w-5 text-green-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-300">
                Job dispatched successfully!
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                Job ID: <code className="bg-green-100 dark:bg-green-900 px-1 rounded">{jobInfo.jobId}</code>
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                Branch: <code className="bg-green-100 dark:bg-green-900 px-1 rounded">{jobInfo.branch}</code>
              </p>
              <p className="text-xs text-green-500 dark:text-green-500 mt-1">
                GitHub Actions will run the job and create a PR. Check your repository to watch it in progress.
              </p>
            </div>
          </div>

          <button
            onClick={() => onStepComplete('first_job')}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            Complete Onboarding
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
          <svg className="h-5 w-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-300">{errorMsg}</p>
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
              Make sure <code className="bg-red-100 dark:bg-red-900 px-1 rounded">GH_OWNER</code> and{' '}
              <code className="bg-red-100 dark:bg-red-900 px-1 rounded">GH_REPO</code> are set in your .env file.
            </p>
          </div>
        </div>
      )}

      {status !== 'success' && (
        <div className="flex gap-3">
          <button
            onClick={handleDispatch}
            disabled={status === 'loading'}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'loading' ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Dispatching job...
              </>
            ) : (
              'Dispatch Test Job'
            )}
          </button>

          {status === 'error' && (
            <button
              onClick={handleDispatch}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
