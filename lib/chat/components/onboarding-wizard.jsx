'use client';

import { useState } from 'react';
import StepGithub from './onboarding-steps/step-github.js';
import StepDocker from './onboarding-steps/step-docker.js';
import StepChannel from './onboarding-steps/step-channel.js';
import StepFirstJob from './onboarding-steps/step-first-job.js';
import StepComplete from './onboarding-steps/step-complete.js';

const STEPS = ['github_connect', 'docker_verify', 'channel_connect', 'first_job', 'complete'];

const STEP_LABELS = {
  github_connect: 'GitHub',
  docker_verify: 'Docker',
  channel_connect: 'Slack',
  first_job: 'First Job',
  complete: 'Done',
};

function StepIcon({ status, index }) {
  if (status === 'complete') {
    return (
      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return <span className="text-xs font-semibold">{index + 1}</span>;
}

function StepIndicator({ steps, currentStep, stepStatuses }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.filter((s) => s !== 'complete').map((step, idx) => {
        const isActive = step === currentStep;
        const isDone = stepStatuses[step] === 'complete';
        const isFuture = !isActive && !isDone;

        return (
          <div key={step} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                  isDone
                    ? 'bg-green-500 border-green-500 text-white'
                    : isActive
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-400'
                }`}
              >
                <StepIcon status={isDone ? 'complete' : isActive ? 'active' : 'pending'} index={idx} />
              </div>
              <span
                className={`mt-1.5 text-xs font-medium ${
                  isDone
                    ? 'text-green-600 dark:text-green-400'
                    : isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
            {idx < steps.filter((s) => s !== 'complete').length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mb-4 ${
                  isDone ? 'bg-green-400' : 'bg-zinc-200 dark:bg-zinc-700'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingWizard({ initialState, user }) {
  const [currentStep, setCurrentStep] = useState(
    initialState?.currentStep || 'github_connect'
  );
  const [stepStatuses, setStepStatuses] = useState({
    github_connect: initialState?.githubConnect || 'pending',
    docker_verify: initialState?.dockerVerify || 'pending',
    channel_connect: initialState?.channelConnect || 'pending',
    first_job: initialState?.firstJob || 'pending',
  });

  function onStepComplete(step) {
    setStepStatuses((prev) => ({ ...prev, [step]: 'complete' }));
    const currentIdx = STEPS.indexOf(step);
    if (currentIdx !== -1 && currentIdx + 1 < STEPS.length) {
      setCurrentStep(STEPS[currentIdx + 1]);
    }
  }

  function renderStep() {
    switch (currentStep) {
      case 'github_connect':
        return <StepGithub onStepComplete={onStepComplete} />;
      case 'docker_verify':
        return <StepDocker onStepComplete={onStepComplete} />;
      case 'channel_connect':
        return <StepChannel onStepComplete={onStepComplete} />;
      case 'first_job':
        return <StepFirstJob onStepComplete={onStepComplete} />;
      case 'complete':
        return <StepComplete />;
      default:
        return <StepGithub onStepComplete={onStepComplete} />;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4 py-12">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-zinc-900 shadow-lg p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Set up ClawForge
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Let&apos;s verify your infrastructure is ready. This takes about 2 minutes.
          </p>
        </div>

        {currentStep !== 'complete' && (
          <StepIndicator
            steps={STEPS}
            currentStep={currentStep}
            stepStatuses={stepStatuses}
          />
        )}

        <div>{renderStep()}</div>
      </div>
    </div>
  );
}
