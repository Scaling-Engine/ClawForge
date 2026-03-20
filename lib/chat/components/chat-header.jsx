'use client';

import { useEffect, useState } from 'react';
import { SidebarTrigger } from './ui/sidebar.js';
import { getAgentName } from '../actions.js';

export function ChatHeader({ chatId }) {
  const [agentName, setAgentName] = useState('');

  useEffect(() => {
    getAgentName().then(setAgentName).catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2 z-10 border-b border-border">
      {/* Mobile-only: open sidebar sheet */}
      <div className="md:hidden">
        <SidebarTrigger />
      </div>
      {agentName && (
        <span className="hidden md:inline text-sm font-medium text-foreground">{agentName}</span>
      )}
    </header>
  );
}
