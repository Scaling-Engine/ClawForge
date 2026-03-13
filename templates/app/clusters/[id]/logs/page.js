import { auth } from '../../../../lib/auth/index.js';
import { ClusterLogsPage } from '../../../../lib/chat/components/index.js';

export default async function ClusterLogsRoute({ params }) {
  const session = await auth();
  const { id } = await params;
  return <ClusterLogsPage session={session} runId={id} />;
}
