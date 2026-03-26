'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import Terminal from './terminal.jsx';
import { SortableTab } from './sortable-tab.jsx';
import FileTreeSidebar from './file-tree-sidebar.jsx';
import { requestTerminalTicket, requestSpawnShell, requestGitStatus, closeWorkspaceAction } from 'clawforge/ws/actions';

const BASE_PORT = 7681;
const MAX_EXTRA_PORT = 7685;

/**
 * Client component managing terminal tabs, WebSocket connections, and git safety.
 * V2 additions: DnD tab reordering, file tree sidebar, search bar integration.
 *
 * @param {object} props
 * @param {string} props.workspaceId
 * @param {string} props.repoSlug
 * @param {string} props.featureBranch
 * @param {string} [props.agentSlug] - When present, routes WS connections through the hub relay
 *   at /agent/[slug]/ws/terminal/[workspaceId] instead of connecting directly to the spoke.
 */
export default function WorkspaceTerminalPage({ workspaceId, repoSlug, featureBranch, agentSlug }) {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [gitStatus, setGitStatus] = useState(null);
  const [disconnectedTabs, setDisconnectedTabs] = useState(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const [showFileTree, setShowFileTree] = useState(false);
  const initializedRef = useRef(false);

  // Derive activeTabIndex from activeTabId for rendering (survives reorders -- Pitfall #3)
  const activeTabIndex = tabs.findIndex((t) => t.id === activeTabId);

  // DnD sensor: 5px activation distance prevents click/drag conflicts (Pitfall #2)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setTabs((prev) => {
        const oldIndex = prev.findIndex((t) => t.id === active.id);
        const newIndex = prev.findIndex((t) => t.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, []);

  // Construct WebSocket URL from current page location.
  // Hub mode: routes through /agent/[slug]/ws/terminal/[workspaceId] when agentSlug is set.
  // Spoke mode (legacy): direct /ws/terminal/[workspaceId] connection.
  const getWsUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (agentSlug) {
      // Hub mode: route through /agent/[slug]/ws/terminal/[workspaceId]
      return `${proto}//${window.location.host}/agent/${agentSlug}/ws/terminal/${workspaceId}`;
    }
    // Spoke mode (direct connection, legacy): /ws/terminal/[workspaceId]
    return `${proto}//${window.location.host}/ws/terminal/${workspaceId}`;
  }, [workspaceId, agentSlug]);

  // Request initial terminal ticket on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function initFirstTab() {
      try {
        const { ticket } = await requestTerminalTicket(workspaceId, BASE_PORT);
        const firstTabId = `tab-${BASE_PORT}`;
        setTabs([{ id: firstTabId, port: BASE_PORT, ticket }]);
        setActiveTabId(firstTabId);
      } catch (err) {
        console.error('Failed to initialize terminal:', err);
      }
    }
    initFirstTab();
  }, [workspaceId]);

  // Browser beforeunload warning
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Add new tab
  const handleNewTab = useCallback(async () => {
    const usedPorts = tabs.map((t) => t.port);
    let nextPort = null;
    for (let p = BASE_PORT + 1; p <= MAX_EXTRA_PORT; p++) {
      if (!usedPorts.includes(p)) {
        nextPort = p;
        break;
      }
    }

    if (!nextPort) {
      alert('Maximum tabs reached (5 total)');
      return;
    }

    try {
      // Spawn ttyd on the new port via Server Action
      await requestSpawnShell(workspaceId, nextPort);

      // Request ticket for the new port
      const { ticket } = await requestTerminalTicket(workspaceId, nextPort);
      const newTab = { id: `tab-${nextPort}`, port: nextPort, ticket };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } catch (err) {
      console.error('Failed to create new tab:', err);
      alert(`Failed to create new tab: ${err.message}`);
    }
  }, [tabs, workspaceId]);

  // Close a tab (by ID, not index -- survives DnD reorders)
  const handleCloseTab = useCallback((tabId) => {
    setTabs((prev) => {
      const index = prev.findIndex((t) => t.id === tabId);
      if (index === -1) return prev;
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) return prev; // Don't close last tab
      return next;
    });
    setActiveTabId((prevId) => {
      if (prevId !== tabId) return prevId;
      // Closing active tab -- switch to adjacent
      const currentTabs = tabs;
      const index = currentTabs.findIndex((t) => t.id === tabId);
      const remaining = currentTabs.filter((t) => t.id !== tabId);
      if (remaining.length === 0) return prevId;
      const newIndex = Math.min(index, remaining.length - 1);
      return remaining[newIndex].id;
    });
  }, [tabs]);

  // Handle disconnect for a tab
  const handleDisconnect = useCallback((tabId) => {
    setDisconnectedTabs((prev) => new Set(prev).add(tabId));
  }, []);

  // Reconnect a tab (by ID)
  const handleReconnect = useCallback(async (tabId) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    try {
      const { ticket } = await requestTerminalTicket(workspaceId, tab.port);
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, ticket } : t))
      );
      setDisconnectedTabs((prev) => {
        const next = new Set(prev);
        next.delete(tabId);
        return next;
      });
    } catch (err) {
      console.error('Failed to reconnect:', err);
    }
  }, [tabs, workspaceId]);

  // Check git status and show close warning
  const handleClose = useCallback(async () => {
    try {
      const status = await requestGitStatus(workspaceId);
      setGitStatus(status);

      if (status.safe) {
        // Fire-and-forget: stop container and notify thread with commits
        closeWorkspaceAction(workspaceId).catch(() => {});
        // Navigate immediately -- don't wait for close to complete
        window.location.href = agentSlug ? `/agent/${agentSlug}/workspaces` : '/workspaces';
      } else {
        setShowCloseWarning(true);
      }
    } catch (err) {
      // On error, show warning anyway
      setGitStatus({ hasUncommitted: false, uncommittedFiles: [], hasUnpushed: false, unpushedCommits: [], safe: false, error: err.message });
      setShowCloseWarning(true);
    }
  }, [workspaceId]);

  const wsUrl = getWsUrl();

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#1e1e2e',
      color: '#cdd6f4',
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        backgroundColor: '#181825',
        borderBottom: '1px solid #313244',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '13px', color: '#a6adc8' }}>
            {repoSlug} <span style={{ color: '#585b70' }}>/</span> {featureBranch}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* DnD-sortable tab buttons */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
              {tabs.map((tab) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  isDisconnected={disconnectedTabs.has(tab.id)}
                  onSelect={() => setActiveTabId(tab.id)}
                  onClose={() => handleCloseTab(tab.id)}
                  showClose={tabs.length > 1}
                />
              ))}
            </SortableContext>
          </DndContext>

          <button
            onClick={handleNewTab}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              backgroundColor: 'transparent',
              color: '#a6adc8',
              border: '1px solid #585b70',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            + New Tab
          </button>

          <button
            onClick={() => setShowFileTree((prev) => !prev)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              backgroundColor: showFileTree ? '#313244' : 'transparent',
              color: '#a6adc8',
              border: '1px solid #585b70',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {showFileTree ? 'Hide Files' : 'Files'}
          </button>

          <button
            onClick={handleClose}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: '#f38ba8',
              color: '#1e1e2e',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginLeft: '8px',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Terminal area with optional file tree sidebar */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {showFileTree && (
          <FileTreeSidebar
            workspaceId={workspaceId}
            onFileClick={(path) => {
              console.log('File clicked:', path);
            }}
          />
        )}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {tabs.map((tab, i) => (
            <div
              key={tab.id}
              style={{
                position: 'absolute',
                inset: 0,
                display: i === activeTabIndex ? 'block' : 'none',
              }}
            >
              {disconnectedTabs.has(tab.id) ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: '16px',
                }}>
                  <span style={{ color: '#f38ba8', fontSize: '14px' }}>Disconnected</span>
                  <button
                    onClick={() => handleReconnect(tab.id)}
                    style={{
                      padding: '8px 24px',
                      fontSize: '14px',
                      backgroundColor: '#a6e3a1',
                      color: '#1e1e2e',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Reconnect
                  </button>
                </div>
              ) : (
                <Terminal
                  workspaceId={workspaceId}
                  port={tab.port}
                  ticket={tab.ticket}
                  wsUrl={wsUrl}
                  onDisconnect={() => handleDisconnect(tab.id)}
                  showSearch={tab.id === activeTabId && showSearch}
                  onSearchToggle={() => setShowSearch((prev) => !prev)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Close warning modal */}
      {showCloseWarning && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: '#1e1e2e',
            border: '1px solid #f38ba8',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '70vh',
            overflow: 'auto',
          }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '16px', color: '#f38ba8' }}>
              Warning: Unsaved Changes
            </h2>

            {gitStatus?.hasUncommitted && (
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '13px', color: '#fab387', marginBottom: '8px' }}>
                  Uncommitted Files ({gitStatus.uncommittedFiles.length})
                </h3>
                <pre style={{
                  fontSize: '11px',
                  backgroundColor: '#181825',
                  padding: '8px',
                  borderRadius: '4px',
                  overflow: 'auto',
                  maxHeight: '150px',
                  margin: 0,
                }}>
                  {gitStatus.uncommittedFiles.join('\n')}
                </pre>
              </div>
            )}

            {gitStatus?.hasUnpushed && (
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '13px', color: '#fab387', marginBottom: '8px' }}>
                  Unpushed Commits ({gitStatus.unpushedCommits.length})
                </h3>
                <pre style={{
                  fontSize: '11px',
                  backgroundColor: '#181825',
                  padding: '8px',
                  borderRadius: '4px',
                  overflow: 'auto',
                  maxHeight: '150px',
                  margin: 0,
                }}>
                  {gitStatus.unpushedCommits.join('\n')}
                </pre>
              </div>
            )}

            {gitStatus?.error && (
              <p style={{ fontSize: '12px', color: '#f38ba8' }}>
                Could not check git status: {gitStatus.error}
              </p>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                onClick={() => setShowCloseWarning(false)}
                style={{
                  padding: '8px 20px',
                  fontSize: '13px',
                  backgroundColor: '#313244',
                  color: '#cdd6f4',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Fire-and-forget: stop container and notify thread with commits
                  closeWorkspaceAction(workspaceId).catch(() => {});
                  // Navigate immediately -- don't wait for close to complete
                  window.location.href = agentSlug ? `/agent/${agentSlug}/workspaces` : '/workspaces';
                }}
                style={{
                  padding: '8px 20px',
                  fontSize: '13px',
                  backgroundColor: '#f38ba8',
                  color: '#1e1e2e',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Close Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
