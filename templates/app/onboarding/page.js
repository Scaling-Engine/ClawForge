import { redirect } from 'next/navigation';
import { auth } from '../../lib/auth/index.js';
import { getOnboardingState } from '../../lib/onboarding/state.js';
import { OnboardingWizard } from '../../lib/chat/components/index.js';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const state = getOnboardingState();

  // If onboarding is already complete, exit to the main app.
  // This is the completion check that breaks the middleware redirect loop.
  if (state?.completedAt) redirect('/');

  return <OnboardingWizard initialState={state} user={session.user} />;
}
