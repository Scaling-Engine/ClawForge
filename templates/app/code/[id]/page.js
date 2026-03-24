import { auth } from 'clawforge/auth';
import { redirect } from 'next/navigation';
import { getWorkspace } from 'clawforge/db/workspaces';
import CodePageClient from './code-page.jsx';

/**
 * Server component for the Code IDE page.
 * Auth-gated, redirects to /chats if workspace not found or not running.
 * Renders CodePageClient directly (same pattern as chat page) to avoid
 * hydration mismatches from dynamic(ssr:false) wrapper.
 */
export default async function CodePage({ params }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const workspace = getWorkspace(id);

  if (!workspace || workspace.status !== 'running') {
    redirect('/chats');
  }

  return (
    <CodePageClient
      workspaceId={workspace.id}
      repoSlug={workspace.repoSlug}
      featureBranch={workspace.featureBranch}
      user={session.user}
    />
  );
}
