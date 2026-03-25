/**
 * Edge-safe auth configuration -- shared between middleware and server.
 * Contains only JWT/session/callbacks/pages config. No providers, no DB imports.
 * Both instances use the same AUTH_SECRET for JWT signing/verification.
 *
 * Official pattern: https://authjs.dev/guides/edge-compatibility
 */
export const authConfig = {
  providers: [],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  cookies: {
    sessionToken: {
      options: {
        domain: process.env.NODE_ENV === 'production' ? '.scalingengine.com' : undefined,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        // Hub only -- query agent assignments from hub DB
        if (process.env.SUPERADMIN_HUB === 'true') {
          const { getAgentSlugsForUser } = await import('../db/hub-users.js');
          token.assignedAgents = getAgentSlugsForUser(user.id);
        }
      }
      // assignedAgents persists across JWT refreshes (user is undefined on refresh)
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.assignedAgents = token.assignedAgents ?? [];
      }
      return session;
    },
  },
};
