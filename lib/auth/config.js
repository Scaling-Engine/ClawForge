import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './edge-config.js';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        if (process.env.SUPERADMIN_HUB === 'true') {
          // Hub login — authenticate against hub_users table
          const { getHubUserByEmail, verifyHubPassword } = await import('../db/hub-users.js');
          const user = getHubUserByEmail(credentials.email);
          if (!user) return null;
          const valid = await verifyHubPassword(user, credentials.password);
          if (!valid) return null;
          return { id: user.id, email: user.email, role: user.role };
        } else {
          // Instance login — authenticate against instance users table (existing behavior)
          const { getUserByEmail, verifyPassword } = await import('../db/users.js');
          const user = getUserByEmail(credentials.email);
          if (!user) return null;
          const valid = await verifyPassword(user, credentials.password);
          if (!valid) return null;
          return { id: user.id, email: user.email, role: user.role };
        }
      },
    }),
  ],
});
