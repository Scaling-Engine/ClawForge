import { auth } from '../../lib/auth/index.js';
import { SupportPage } from '../../lib/chat/components/index.js';

export default async function SupportRoute() {
  const session = await auth();
  return <SupportPage session={session} />;
}
