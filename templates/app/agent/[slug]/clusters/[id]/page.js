import { auth } from '../../../../../lib/auth/index.js';
import { ClusterDetailPage } from '../../../../../lib/chat/components/index.js';

export default async function AgentClusterDetailRoute({ params }) {
  const { slug, id } = await params;
  const session = await auth();
  return <ClusterDetailPage session={session} runId={id} agentSlug={slug} />;
}
