import { auth } from '../../../../lib/auth/index.js';
import { ClusterConsolePage } from '../../../../lib/chat/components/index.js';

export default async function ClusterConsoleRoute({ params }) {
  const session = await auth();
  const { id } = await params;
  return <ClusterConsolePage session={session} runId={id} />;
}
