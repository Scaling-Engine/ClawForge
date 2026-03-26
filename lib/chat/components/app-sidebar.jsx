'use client';

import { useState, useEffect } from 'react';
import { CirclePlusIcon, PanelLeftIcon, MessageIcon, BellIcon, SwarmIcon, ClusterIcon, ArrowUpCircleIcon, LifeBuoyIcon, GitPullRequestIcon, ServerIcon, UserIcon, ShieldIcon } from './icons.js';
import { getUnreadNotificationCount, getAppVersion, getPendingPRCount, getAgentName } from '../actions.js';
import { SidebarHistory } from './sidebar-history.js';
import { SidebarUserNav } from './sidebar-user-nav.js';
import { UpgradeDialog } from './upgrade-dialog.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from './ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.js';
import { useChatNav } from './chat-nav-context.js';

export function AppSidebar({ user, agentSlug }) {
  const { navigateToChat } = useChatNav();
  const { state, open, setOpenMobile, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingPRCount, setPendingPRCount] = useState(0);
  const [version, setVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [agentName, setAgentName] = useState('ClawForge');

  useEffect(() => {
    getUnreadNotificationCount()
      .then((count) => setUnreadCount(count))
      .catch(() => {});
    getAppVersion()
      .then(({ version, updateAvailable }) => {
        setVersion(version);
        setUpdateAvailable(updateAvailable);
      })
      .catch(() => {});
    getPendingPRCount()
      .then((count) => setPendingPRCount(count))
      .catch(() => {});
    getAgentName().then(setAgentName).catch(() => {});
  }, []);

  return (
    <>
    <Sidebar>
      <SidebarHeader>
        {/* Top row: brand name + toggle icon (open) or just toggle icon (collapsed) */}
        <div className={collapsed ? 'flex justify-center' : 'flex items-center justify-between'}>
          {!collapsed && (agentSlug ? (
            <button
              className="px-2 font-semibold text-lg flex items-center gap-1.5 hover:text-muted-foreground transition-colors"
              onClick={() => { window.location.href = '/agents'; }}
              title="Switch agent"
            >
              {agentName}<span className="text-xs text-muted-foreground">&#x2197;</span>
            </button>
          ) : (
            <span className="px-2 font-semibold text-lg">{agentName}{version && <span className="text-[11px] font-normal text-muted-foreground"> v{version}</span>}</span>
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="inline-flex shrink-0 items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={toggleSidebar}
              >
                <PanelLeftIcon size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? 'right' : 'bottom'}>
              {collapsed ? 'Open sidebar' : 'Close sidebar'}
            </TooltipContent>
          </Tooltip>
        </div>
        <SidebarMenu>
          {/* New chat */}
          <SidebarMenuItem className="mb-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    navigateToChat(null);
                    setOpenMobile(false);
                  }}
                >
                  <CirclePlusIcon size={16} />
                  {!collapsed && <span>New chat</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">New chat</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Chats history */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    window.location.href = agentSlug ? `/agent/${agentSlug}/chat` : '/chats';
                  }}
                >
                  <MessageIcon size={16} />
                  {!collapsed && <span>Chats</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Chats</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Jobs (formerly Swarm) */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    window.location.href = agentSlug ? `/agent/${agentSlug}/workspaces` : '/swarm';
                  }}
                >
                  <SwarmIcon size={16} />
                  {!collapsed && <span>Jobs</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Jobs</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Subagents */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    window.location.href = agentSlug ? `/agent/${agentSlug}/clusters` : '/clusters';
                  }}
                >
                  <ClusterIcon size={16} />
                  {!collapsed && <span>Subagents</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Subagents</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Pull Requests */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    setOpenMobile(false);
                    window.location.href = agentSlug ? `/agent/${agentSlug}/pull-requests` : '/pull-requests';
                  }}
                >
                  <GitPullRequestIcon size={16} />
                  {!collapsed && (
                    <span className="flex items-center gap-2">
                      Pull Requests
                      {pendingPRCount > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground">
                          {pendingPRCount}
                        </span>
                      )}
                    </span>
                  )}
                  {collapsed && pendingPRCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                      {pendingPRCount}
                    </span>
                  )}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Pull Requests</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Servers (formerly Runners) */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    setOpenMobile(false);
                    window.location.href = '/runners';
                  }}
                >
                  <ServerIcon size={16} />
                  {!collapsed && <span>Servers</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Servers</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Profile */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    setOpenMobile(false);
                    window.location.href = '/profile';
                  }}
                >
                  <UserIcon size={16} />
                  {!collapsed && <span>Profile</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Profile</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Admin (role-gated: admin or superadmin) */}
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    className={collapsed ? 'justify-center' : ''}
                    onClick={() => {
                      setOpenMobile(false);
                      window.location.href = '/admin';
                    }}
                  >
                    <ShieldIcon size={16} />
                    {!collapsed && <span>Admin</span>}
                  </SidebarMenuButton>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right">Admin</TooltipContent>
                )}
              </Tooltip>
            </SidebarMenuItem>
          )}

          {/* Notifications */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => {
                    window.location.href = '/notifications';
                  }}
                >
                  <BellIcon size={16} />
                  {!collapsed && (
                    <span className="flex items-center gap-2">
                      Notifications
                      {unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground">
                          {unreadCount}
                        </span>
                      )}
                    </span>
                  )}
                  {collapsed && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                      {unreadCount}
                    </span>
                  )}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Notifications</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

          {/* Upgrade (only when update is available) */}
          {updateAvailable && (
            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    className={collapsed ? 'justify-center' : ''}
                    onClick={() => setUpgradeOpen(true)}
                  >
                    <span className="relative">
                      <ArrowUpCircleIcon size={16} />
                      {collapsed && (
                        <span className="absolute -top-1 -right-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                    </span>
                    {!collapsed && (
                      <span className="flex items-center gap-2">
                        Upgrade
                        <span className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                          v{updateAvailable}
                        </span>
                      </span>
                    )}
                  </SidebarMenuButton>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right">Upgrade to v{updateAvailable}</TooltipContent>
                )}
              </Tooltip>
            </SidebarMenuItem>
          )}

          {/* Support */}
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarMenuButton
                  className={collapsed ? 'justify-center' : ''}
                  onClick={() => { window.location.href = '/support'; }}
                >
                  <LifeBuoyIcon size={16} />
                  {!collapsed && <span>Support</span>}
                </SidebarMenuButton>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">Support</TooltipContent>
              )}
            </Tooltip>
          </SidebarMenuItem>

        </SidebarMenu>
      </SidebarHeader>

      {!collapsed && (
        <SidebarContent>
          <SidebarGroup className="pt-0">
            <SidebarGroupLabel>Chats</SidebarGroupLabel>
          </SidebarGroup>
          <SidebarHistory agentSlug={agentSlug} />
        </SidebarContent>
      )}

      {/* Spacer when collapsed to push footer down */}
      {collapsed && <div className="flex-1" />}

      <SidebarFooter>
        {user && <SidebarUserNav user={user} collapsed={collapsed} />}
      </SidebarFooter>
    </Sidebar>
    <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} version={version} updateAvailable={updateAvailable} />
    </>
  );
}
