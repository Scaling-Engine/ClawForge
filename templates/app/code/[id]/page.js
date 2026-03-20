import { auth } from 'clawforge/auth';
import { redirect } from 'next/navigation';
import { getWorkspace } from 'clawforge/db/workspaces';

/**
 * Server component for the Code IDE page.
 * Auth-gated, redirects to /chats if workspace not found or not running.
 */
export default async function CodePage({ params }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const workspace = getWorkspace(id);

  if (!workspace || workspace.status !== 'running') {
    redirect('/chats');
  }

  // Dynamic import of client component (avoids SSR issues with xterm.js)
  const { default: CodePageClient } = await import('./code-page.jsx');

  return (
    <CodePageClient
      workspaceId={workspace.id}
      repoSlug={workspace.repoSlug}
      featureBranch={workspace.featureBranch}
      user={session.user}
    />
  );
}
