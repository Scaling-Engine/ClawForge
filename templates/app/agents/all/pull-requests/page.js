import { auth } from '../../../../../lib/auth/index.js';
import { AllAgentsPRsPage } from '../../../../../lib/chat/components/index.js';

export default async function AllAgentsPRsRoute() {
  const session = await auth();
  return <AllAgentsPRsPage session={session} />;
}
