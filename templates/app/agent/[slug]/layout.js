import { auth } from '../../../lib/auth/index.js';
import { redirect } from 'next/navigation';
import { AgentLayoutClient } from '../../../lib/chat/components/agent-layout-client.jsx';

export default async function AgentLayout({ children, params }) {
  const { slug } = await params;
  const session = await auth();

  const isAdmin = session?.user?.role === 'admin';
  const isHubMode = process.env.SUPERADMIN_HUB === 'true';
  const assignedAgents = session?.user?.assignedAgents ?? [];
  const hasAccess = !isHubMode || isAdmin || assignedAgents.includes(slug);

  if (!hasAccess) {
    redirect('/agents');
  }

  return (
    <AgentLayoutClient agentSlug={slug} user={session?.user}>
      {children}
    </AgentLayoutClient>
  );
}
