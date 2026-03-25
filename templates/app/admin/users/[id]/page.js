import { AdminUserDetailPage } from '../../../../lib/chat/components/index.js';

export default async function AdminUserDetailRoute({ params }) {
  // Fetch known agent slugs server-side so they never hit the browser bundle
  let knownAgents = [];
  try {
    const { getInstanceRegistry } = await import('../../../../lib/superadmin/config.js');
    knownAgents = getInstanceRegistry().map(i => i.name);
  } catch {
    // Graceful fallback — SUPERADMIN_INSTANCES may not be set
    knownAgents = [];
  }
  const { id } = await params;
  return <AdminUserDetailPage userId={id} knownAgents={knownAgents} />;
}
