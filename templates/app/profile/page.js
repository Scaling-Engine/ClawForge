import { auth } from '../../lib/auth/index.js';
import { ProfilePage } from '../../lib/chat/components/index.js';

export default async function ProfileRoute() {
  const session = await auth();
  return <ProfilePage session={session} />;
}
