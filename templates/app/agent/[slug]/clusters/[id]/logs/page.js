import { auth } from '../../../../../../lib/auth/index.js';
import { ClusterLogsPage } from '../../../../../../lib/chat/components/index.js';

export default async function AgentClusterLogsRoute({ params }) {
  const { slug, id } = await params;
  const session = await auth();
  return <ClusterLogsPage session={session} runId={id} agentSlug={slug} />;
}
