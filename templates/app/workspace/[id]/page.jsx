import { auth } from 'clawforge/auth';
import { redirect } from 'next/navigation';
import { getWorkspace } from 'clawforge/db/workspaces';
import WorkspaceTerminalPage from './workspace-terminal-page.jsx';

/**
 * Server component for workspace terminal page.
 * Validates auth + workspace state, then renders the client terminal manager.
 */
export default async function WorkspacePage({ params }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const workspace = getWorkspace(id);

  if (!workspace) {
    redirect('/workspaces');
  }

  if (workspace.status !== 'running') {
    redirect('/workspaces');
  }

  return (
    <WorkspaceTerminalPage
      workspaceId={workspace.id}
      repoSlug={workspace.repoSlug}
      featureBranch={workspace.featureBranch}
    />
  );
}
