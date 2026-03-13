import { auth } from '../../lib/auth/index.js';
import { PullRequestsPage } from '../../lib/chat/components/index.js';

export default async function PullRequestsRoute() {
  const session = await auth();
  return <PullRequestsPage session={session} />;
}
