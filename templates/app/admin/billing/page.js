import { auth } from '../../../lib/auth/index.js';
import { AdminBillingPage } from '../../../lib/chat/components/index.js';

export default async function AdminBillingRoute() {
  const session = await auth();
  return <AdminBillingPage user={session?.user} />;
}
