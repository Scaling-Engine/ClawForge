'use client';

import { useRouter } from 'next/navigation';

export default function StepComplete() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <svg className="h-10 w-10 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Onboarding Complete!
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 max-w-sm">
          Your ClawForge instance is set up and ready to go. GitHub, Docker, and the agent pipeline
          are all verified and working. You can now start dispatching jobs from the dashboard.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
