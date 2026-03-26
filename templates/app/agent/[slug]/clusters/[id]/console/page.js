import { auth } from '../../../../../../lib/auth/index.js';
import { ClusterConsolePage } from '../../../../../../lib/chat/components/index.js';

export default async function AgentClusterConsoleRoute({ params }) {
  const { slug, id } = await params;
  const session = await auth();
  return <ClusterConsolePage session={session} runId={id} agentSlug={slug} />;
}
