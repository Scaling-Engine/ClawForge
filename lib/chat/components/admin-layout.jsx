'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { InstanceSwitcher } from './instance-switcher.js';
import { ClockIcon, ZapIcon, KeyIcon, WrenchIcon, UserIcon, ShieldIcon, SettingsSliderIcon, DatabaseIcon, ServerIcon, GlobeIcon, SearchIcon, CreditCardIcon, ClusterIcon } from './icons.js';

const SUPERADMIN_NAV = [
  { id: 'superadmin', label: 'Dashboard', href: '/admin/superadmin', icon: GlobeIcon },
  { id: 'superadmin-search', label: 'Job Search', href: '/admin/superadmin/search', icon: SearchIcon },
];

const ADMIN_NAV = [
  { id: 'general', label: 'General', href: '/admin/general', icon: SettingsSliderIcon },
  { id: 'repos', label: 'Repos', href: '/admin/repos', icon: DatabaseIcon },
  { id: 'clusters', label: 'Clusters', href: '/admin/clusters', icon: ClusterIcon },
  { id: 'instances', label: 'Instances', href: '/admin/instances', icon: ServerIcon },
  { id: 'crons', label: 'Crons', href: '/admin/crons', icon: ClockIcon },
  { id: 'triggers', label: 'Triggers', href: '/admin/triggers', icon: ZapIcon },
  { id: 'secrets', label: 'Secrets', href: '/admin/secrets', icon: KeyIcon },
  { id: 'mcp', label: 'MCP Servers', href: '/admin/mcp', icon: WrenchIcon },
  { id: 'users', label: 'Users', href: '/admin/users', icon: UserIcon },
  { id: 'webhooks', label: 'Webhooks', href: '/admin/webhooks', icon: ZapIcon },
  { id: 'billing', label: 'Billing', href: '/admin/billing', icon: CreditCardIcon },
];

export function AdminLayout({ session, children }) {
  const [activePath, setActivePath] = useState('');
  const isSuperadmin = session?.user?.role === 'superadmin';

  useEffect(() => {
    setActivePath(window.location.pathname);
  }, []);

  return (
    <PageLayout session={session}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin</h1>
      </div>
      <div className="flex gap-6">
        {/* Sidebar nav */}
        <nav className="w-48 shrink-0">
          {/* Instance switcher (superadmin only) */}
          {isSuperadmin && <InstanceSwitcher isSuperadminHub={true} />}

          {/* Superadmin nav items (superadmin only) */}
          {isSuperadmin && (
            <ul className="flex flex-col gap-1 mb-3 pb-3 border-b">
              {SUPERADMIN_NAV.map((item) => {
                const isActive = activePath === item.href || activePath.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <a
                      href={item.href}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                        isActive
                          ? 'bg-accent text-foreground font-medium'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                      }`}
                    >
                      <Icon size={14} />
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Standard admin nav */}
          <ul className="flex flex-col gap-1">
            {ADMIN_NAV.map((item) => {
              const isActive = activePath === item.href || activePath.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <a
                    href={item.href}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                      isActive
                        ? 'bg-accent text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    }`}
                  >
                    <Icon size={14} />
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </PageLayout>
  );
}
