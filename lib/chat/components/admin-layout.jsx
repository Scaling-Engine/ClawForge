'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { ClockIcon, ZapIcon, KeyIcon, WrenchIcon, UserIcon, ShieldIcon, SettingsSliderIcon, DatabaseIcon, ServerIcon } from './icons.js';

const ADMIN_NAV = [
  { id: 'general', label: 'General', href: '/admin/general', icon: SettingsSliderIcon },
  { id: 'repos', label: 'Repos', href: '/admin/repos', icon: DatabaseIcon },
  { id: 'instances', label: 'Instances', href: '/admin/instances', icon: ServerIcon },
  { id: 'crons', label: 'Crons', href: '/admin/crons', icon: ClockIcon },
  { id: 'triggers', label: 'Triggers', href: '/admin/triggers', icon: ZapIcon },
  { id: 'secrets', label: 'Secrets', href: '/admin/secrets', icon: KeyIcon },
  { id: 'mcp', label: 'MCP Servers', href: '/admin/mcp', icon: WrenchIcon },
  { id: 'users', label: 'Users', href: '/admin/users', icon: UserIcon },
  { id: 'webhooks', label: 'Webhooks', href: '/admin/webhooks', icon: ZapIcon },
];

export function AdminLayout({ session, children }) {
  const [activePath, setActivePath] = useState('');

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
