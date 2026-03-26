import { auth } from '../../../../../lib/auth/index.js';
import { ChatPage } from '../../../../../lib/chat/components/index.js';

export default async function AgentChatIdRoute({ params }) {
  const { slug, chatId } = await params;
  const session = await auth();
  return <ChatPage session={session} needsSetup={false} chatId={chatId} agentSlug={slug} />;
}
