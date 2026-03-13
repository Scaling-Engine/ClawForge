import { auth } from '../../../../../lib/auth/index.js';
import { ClusterRolePage } from '../../../../../lib/chat/components/index.js';

export default async function ClusterRoleRoute({ params }) {
  const session = await auth();
  const { id, roleId } = await params;
  return <ClusterRolePage session={session} runId={id} roleId={roleId} />;
}
