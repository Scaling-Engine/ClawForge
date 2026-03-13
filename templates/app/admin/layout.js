import { auth } from '../../lib/auth/index.js';
import { AdminLayout } from '../../lib/chat/components/index.js';

export default async function Layout({ children }) {
  const session = await auth();
  return <AdminLayout session={session}>{children}</AdminLayout>;
}
