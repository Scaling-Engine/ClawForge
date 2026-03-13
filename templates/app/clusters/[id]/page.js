import { auth } from '../../../lib/auth/index.js';
import { ClusterDetailPage } from '../../../lib/chat/components/index.js';

export default async function ClusterDetailRoute({ params }) {
  const session = await auth();
  const { id } = await params;
  return <ClusterDetailPage session={session} runId={id} />;
}
