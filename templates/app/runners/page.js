import { auth } from '../../lib/auth/index.js';
import { RunnersPage } from '../../lib/chat/components/index.js';

export default async function RunnersRoute() {
  const session = await auth();
  return <RunnersPage session={session} />;
}
