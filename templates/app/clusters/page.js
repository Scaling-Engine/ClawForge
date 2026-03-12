import { auth } from '../../lib/auth/index.js';
import { ClustersPage } from '../../lib/chat/components/index.js';

export default async function ClustersRoute() {
  const session = await auth();
  return <ClustersPage session={session} />;
}
