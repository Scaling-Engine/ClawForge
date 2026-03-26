import { auth } from '../../../../lib/auth/index.js';
import { ClustersPage } from '../../../../lib/chat/components/index.js';

export default async function AgentClustersRoute({ params }) {
  const { slug } = await params;
  const session = await auth();
  return <ClustersPage session={session} agentSlug={slug} />;
}
