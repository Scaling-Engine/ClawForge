// Next.js 15 unauthorized() boundary — rendered when unauthorized() is called
// from a Server Action or Server Component.
// Instances should include this file in their app/ directory.
export default function UnauthorizedPage() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>401 — Unauthorized</h1>
      <p>You must be signed in to access this page.</p>
      <a href="/login">Sign in</a>
    </div>
  );
}
