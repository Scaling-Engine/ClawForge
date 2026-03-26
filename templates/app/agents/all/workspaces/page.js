import { auth } from '../../../../../lib/auth/index.js';
import { AllAgentsWorkspacesPage } from '../../../../../lib/chat/components/index.js';

export default async function AllAgentsWorkspacesRoute() {
  const session = await auth();
  return <AllAgentsWorkspacesPage session={session} />;
}
