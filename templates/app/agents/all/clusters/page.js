import { auth } from '../../../../../lib/auth/index.js';
import { AllAgentsClustersPage } from '../../../../../lib/chat/components/index.js';

export default async function AllAgentsClustersRoute() {
  const session = await auth();
  return <AllAgentsClustersPage session={session} />;
}
