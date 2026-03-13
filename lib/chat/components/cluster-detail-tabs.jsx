'use client';

import Link from 'next/link';

/**
 * Shared tab navigation for cluster detail sub-pages.
 * Renders overview, console, and logs tabs with active state highlighting.
 *
 * @param {{ runId: string, activeTab: string|null }} props
 */
export function ClusterDetailTabs({ runId, activeTab }) {
  const tabs = [
    { key: 'overview', label: 'Overview', href: `/clusters/${runId}` },
    { key: 'console', label: 'Console', href: `/clusters/${runId}/console` },
    { key: 'logs', label: 'Logs', href: `/clusters/${runId}/logs` },
  ];

  return (
    <div className="flex gap-1 border-b pb-2 mb-4">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`px-3 py-1.5 text-sm rounded-md ${
            activeTab === tab.key
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
