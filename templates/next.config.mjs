export default {
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  generateBuildId: () => process.env.GITHUB_SHA || `build-${Date.now()}`,
  serverExternalPackages: ['better-sqlite3', 'drizzle-orm', 'dockerode'],
  experimental: {
    authInterrupts: true,
  },
};
