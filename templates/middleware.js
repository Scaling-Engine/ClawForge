export { middleware } from './lib/auth/middleware.js';

// Next.js requires config to be a static literal in the middleware file
// (re-exports are not statically analyzable at build time)
export const config = {
  // Exclude _next internals, favicon, and /ws/* (WebSocket upgrade paths use ticket-based auth)
  matcher: ['/((?!_next|favicon.ico|ws/).*)'],
};
