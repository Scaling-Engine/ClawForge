import { auth } from '../../../../lib/auth/index.js';
import { PullRequestsPage } from '../../../../lib/chat/components/index.js';

export default async function AgentPullRequestsRoute({ params }) {
  const { slug } = await params;
  const session = await auth();
  return <PullRequestsPage session={session} agentSlug={slug} />;
}
