'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AppSidebar, SidebarProvider, SidebarInset, ChatNavProvider } from 'clawforge/chat';
import {
  ensureCodeWorkspaceContainer,
  closeInteractiveMode,
  getContainerGitStatus,
  createTerminalSession,
  closeTerminalSession,
  listTerminalSessions,
} from 'clawforge/code/actions';

const TerminalView = dynamic(() => import('./terminal-view.jsx'), { ssr: false });

function defaultNavigateToChat(id) {
  window.location.href = id ? `/chat/${id}` : '/';
}

const PRIMARY_TAB_ID = 'code-primary';

export default function CodePageClient({ workspaceId, repoSlug, featureBranch, user }) {
  const [tabs, setTabs] = useState([
    { id: PRIMARY_TAB_ID, label: 'Code', type: 'code', primary: true },
  ]);
  const [activeTabId, setActiveTabId] = useState(PRIMARY_TAB_ID);
  const [creatingShell, setCreatingShell] = useState(false);
  const [closingTabId, setClosingTabId] = useState(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [gitStatus, setGitStatus] = useState(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');

  // Restore existing sessions on mount
  useEffect(() => {
    listTerminalSessions(workspaceId).then((result) => {
      if (result?.success && result.sessions?.length > 0) {
        const restored = [
          { id: PRIMARY_TAB_ID, label: 'Code', type: 'code', primary: true },
          ...result.sessions.map((s) => ({ id: s.id, label: s.label, type: s.type || 'shell' })),
        ];
        setTabs(restored);
      }
    }).catch(() => {});
  }, [workspaceId]);

  const handleNewShell = useCallback(async () => {
    setCreatingShell(true);
    try {
      const result = await createTerminalSession(workspaceId, 'shell');
      if (result?.success) {
        const newTab = { id: result.sessionId, label: result.label, type: 'shell' };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(result.sessionId);
      }
    } catch (err) {
      console.error('[CodePage] Failed to create shell:', err);
    } finally {
      setCreatingShell(false);
    }
  }, [workspaceId]);

  const handleCloseTab = useCallback(async (tabId) => {
    try {
      await closeTerminalSession(workspaceId, tabId);
    } catch {
      // Best effort
    }
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    setActiveTabId((prev) => (prev === tabId ? PRIMARY_TAB_ID : prev));
  }, [workspaceId]);

  const handleOpenCloseDialog = useCallback(async () => {
    setShowCloseConfirm(true);
    try {
      const status = await getContainerGitStatus(workspaceId);
      setGitStatus(status);
    } catch {
      setGitStatus(null);
    }
  }, [workspaceId]);

  const handleConfirmClose = useCallback(async () => {
    setClosing(true);
    setCloseError('');
    try {
      const result = await closeInteractiveMode(workspaceId, true);
      if (result?.success) {
        window.location.href = result.chatId ? `/chat/${result.chatId}` : '/';
      } else {
        setCloseError(result?.message || 'Failed to close session');
        setClosing(false);
      }
    } catch (err) {
      setCloseError(err.message || 'An unexpected error occurred');
      setClosing(false);
    }
  }, [workspaceId]);

  return (
    <ChatNavProvider value={{ activeChatId: null, navigateToChat: defaultNavigateToChat }}>
      <SidebarProvider>
        <AppSidebar user={user} />
        <SidebarInset>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', overflow: 'hidden' }}>
            {/* Top bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              background: 'var(--background)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--muted-foreground)', fontFamily: 'ui-monospace, monospace' }}>
                  {repoSlug} / {featureBranch}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* + Shell tab button */}
                <button
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    background: 'transparent',
                    color: 'var(--muted-foreground)',
                    border: '1px dashed var(--border)',
                    borderRadius: 4,
                    cursor: creatingShell ? 'default' : 'pointer',
                    fontFamily: 'ui-monospace, monospace',
                    opacity: creatingShell ? 0.5 : 1,
                  }}
                  onClick={handleNewShell}
                  disabled={creatingShell}
                >
                  {creatingShell ? '...' : '+ Shell'}
                </button>
                {/* Close button */}
                <button
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                  onClick={handleOpenCloseDialog}
                >
                  Close Workspace
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              padding: '0 16px',
              background: 'var(--muted)',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              gap: 2,
            }}>
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontFamily: 'ui-monospace, monospace',
                    fontWeight: 500,
                    cursor: 'pointer',
                    borderRadius: '4px 4px 0 0',
                    borderTop: `1px solid ${activeTabId === tab.id ? 'var(--border)' : 'transparent'}`,
                    borderLeft: `1px solid ${activeTabId === tab.id ? 'var(--border)' : 'transparent'}`,
                    borderRight: `1px solid ${activeTabId === tab.id ? 'var(--border)' : 'transparent'}`,
                    background: activeTabId === tab.id ? 'var(--background)' : 'transparent',
                    color: activeTabId === tab.id ? 'var(--foreground)' : 'var(--muted-foreground)',
                    marginBottom: activeTabId === tab.id ? -1 : 0,
                  }}
                  onClick={() => setActiveTabId(tab.id)}
                >
                  <span>{tab.label}</span>
                  {!tab.primary && (
                    <button
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'inherit',
                        padding: 0,
                        fontSize: 10,
                        lineHeight: 1,
                        opacity: 0.6,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setClosingTabId(tab.id);
                      }}
                      title="Close tab"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Tab panels */}
            {tabs.map((tab) => (
              <div
                key={tab.id}
                style={{
                  display: activeTabId === tab.id ? 'flex' : 'none',
                  flex: 1,
                  flexDirection: 'column',
                  minHeight: 0,
                  paddingTop: 8,
                }}
              >
                <TerminalView
                  codeWorkspaceId={workspaceId}
                  wsPath={tab.primary
                    ? `/code/${workspaceId}/ws`
                    : `/code/${workspaceId}/term/${tab.id}/ws`}
                  isActive={activeTabId === tab.id}
                  showToolbar={true}
                  ensureContainer={tab.primary ? ensureCodeWorkspaceContainer : undefined}
                  onCloseSession={tab.primary ? handleOpenCloseDialog : () => setClosingTabId(tab.id)}
                  closeLabel={tab.primary ? 'Close Session' : 'Close Tab'}
                />
              </div>
            ))}
          </div>

          {/* Close workspace confirm */}
          {showCloseConfirm && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)' }}
                onClick={() => !closing && setShowCloseConfirm(false)}
              />
              <div style={{
                position: 'relative', zIndex: 51,
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '24px',
                maxWidth: 400,
                width: '100%',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--foreground)' }}>
                  Close this session?
                </h3>
                {gitStatus?.hasUnsavedWork && (
                  <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 12px' }}>
                    Warning: You have unsaved changes. They will be lost if you close now.
                  </p>
                )}
                {closeError && (
                  <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 12px' }}>{closeError}</p>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    style={{
                      padding: '8px 16px', fontSize: 13, background: 'var(--muted)',
                      color: 'var(--foreground)', border: '1px solid var(--border)',
                      borderRadius: 6, cursor: 'pointer',
                    }}
                    onClick={() => setShowCloseConfirm(false)}
                    disabled={closing}
                  >
                    Cancel
                  </button>
                  <button
                    style={{
                      padding: '8px 16px', fontSize: 13, background: '#ef4444',
                      color: '#fff', border: 'none', borderRadius: 6,
                      cursor: closing ? 'wait' : 'pointer', opacity: closing ? 0.7 : 1,
                    }}
                    onClick={handleConfirmClose}
                    disabled={closing}
                  >
                    {closing ? 'Closing...' : 'Close Session'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Close tab confirm */}
          {closingTabId && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)' }}
                onClick={() => setClosingTabId(null)}
              />
              <div style={{
                position: 'relative', zIndex: 51,
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '24px',
                maxWidth: 360,
                width: '100%',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--foreground)' }}>
                  Close this tab?
                </h3>
                <p style={{ color: 'var(--muted-foreground)', fontSize: 13, margin: '0 0 16px' }}>
                  This will end the shell session.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    style={{
                      padding: '8px 16px', fontSize: 13, background: 'var(--muted)',
                      color: 'var(--foreground)', border: '1px solid var(--border)',
                      borderRadius: 6, cursor: 'pointer',
                    }}
                    onClick={() => setClosingTabId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    style={{
                      padding: '8px 16px', fontSize: 13, background: 'var(--destructive)',
                      color: 'var(--destructive-foreground)', border: 'none', borderRadius: 6, cursor: 'pointer',
                    }}
                    onClick={() => {
                      handleCloseTab(closingTabId);
                      setClosingTabId(null);
                    }}
                  >
                    Close Tab
                  </button>
                </div>
              </div>
            </div>
          )}
        </SidebarInset>
      </SidebarProvider>
    </ChatNavProvider>
  );
}
