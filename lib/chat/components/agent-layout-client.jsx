'use client';
import { SidebarProvider, SidebarInset } from './ui/sidebar.js';
import { ChatNavProvider } from './chat-nav-context.js';
import { AppSidebar } from './app-sidebar.js';

export function AgentLayoutClient({ agentSlug, user, children }) {
  function navigateToChat(id) {
    window.location.href = id
      ? `/agent/${agentSlug}/chat/${id}`
      : `/agent/${agentSlug}/chat`;
  }

  return (
    <ChatNavProvider value={{ activeChatId: null, navigateToChat }}>
      <SidebarProvider>
        <AppSidebar user={user} agentSlug={agentSlug} />
        <SidebarInset>
          <div className="flex flex-col h-full max-w-4xl mx-auto w-full px-4 py-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ChatNavProvider>
  );
}
