'use client';

import { ShieldIcon } from './icons.js';

export function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <ShieldIcon size={48} className="text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Access Denied</h1>
      <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
      <a href="/" className="text-sm underline text-muted-foreground hover:text-foreground">
        Return home
      </a>
    </div>
  );
}
