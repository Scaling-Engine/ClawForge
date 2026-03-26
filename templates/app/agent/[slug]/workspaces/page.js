import { auth } from '../../../../lib/auth/index.js';
import { SwarmPage } from '../../../../lib/chat/components/index.js';

export default async function AgentWorkspacesRoute({ params }) {
  const { slug } = await params;
  const session = await auth();
  return <SwarmPage session={session} agentSlug={slug} />;
}
