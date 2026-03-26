import { redirect } from 'next/navigation';
import { auth } from '../../../../../lib/auth/index.js';
import { getWorkspace } from '../../../../../lib/db/workspaces.js';
import WorkspaceTerminalPage from '../../../../workspace/[id]/workspace-terminal-page.jsx';

/**
 * Agent-scoped workspace terminal page.
 * Validates auth + workspace state, renders terminal with hub WS routing.
 *
 * Routes WS connections through the hub relay:
 *   wss://[hub-host]/agent/[slug]/ws/terminal/[workspaceId]
 * instead of the spoke-direct path (/ws/terminal/[workspaceId]).
 *
 * @param {{ params: Promise<{ slug: string, id: string }> }} props
 */
export default async function AgentWorkspaceTerminalRoute({ params }) {
  const { slug, id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  const workspace = getWorkspace(id);
  if (!workspace) redirect(`/agent/${slug}/workspaces`);
  if (workspace.status !== 'running') redirect(`/agent/${slug}/workspaces`);

  return (
    <WorkspaceTerminalPage
      workspaceId={workspace.id}
      repoSlug={workspace.repoSlug}
      featureBranch={workspace.featureBranch}
      agentSlug={slug}
    />
  );
}
