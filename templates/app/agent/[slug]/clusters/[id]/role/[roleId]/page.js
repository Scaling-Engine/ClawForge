import { auth } from '../../../../../../../lib/auth/index.js';
import { ClusterRolePage } from '../../../../../../../lib/chat/components/index.js';

export default async function AgentClusterRoleRoute({ params }) {
  const { slug, id, roleId } = await params;
  const session = await auth();
  return <ClusterRolePage session={session} runId={id} roleId={roleId} agentSlug={slug} />;
}
