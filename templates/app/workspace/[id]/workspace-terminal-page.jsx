'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Terminal from './terminal.jsx';
import { requestTerminalTicket, requestSpawnShell, requestGitStatus } from 'clawforge/ws/actions';

const BASE_PORT = 7681;
const MAX_EXTRA_PORT = 7685;

/**
 * Client component managing terminal tabs, WebSocket connections, and git safety.
 *
 * @param {object} props
 * @param {string} props.workspaceId
 * @param {string} props.repoSlug
 * @param {string} props.featureBranch
 */
export default function WorkspaceTerminalPage({ workspaceId, repoSlug, featureBranch }) {
  const [tabs, setTabs] = useState([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [gitStatus, setGitStatus] = useState(null);
  const [disconnectedTabs, setDisconnectedTabs] = useState(new Set());
  const initializedRef = useRef(false);

  // Construct WebSocket URL from current page location
  const getWsUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws/terminal/${workspaceId}`;
  }, [workspaceId]);

  // Request initial terminal ticket on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function initFirstTab() {
      try {
        const { ticket } = await requestTerminalTicket(workspaceId, BASE_PORT);
        setTabs([{ id: `tab-${BASE_PORT}`, port: BASE_PORT, ticket }]);
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
      setTabs((prev) => [...prev, { id: `tab-${nextPort}`, port: nextPort, ticket }]);
      setActiveTabIndex(tabs.length); // Switch to new tab
    } catch (err) {
      console.error('Failed to create new tab:', err);
      alert(`Failed to create new tab: ${err.message}`);
    }
  }, [tabs, workspaceId]);

  // Close a tab
  const handleCloseTab = useCallback((index) => {
    setTabs((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) return prev; // Don't close last tab
      return next;
    });
    setActiveTabIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return Math.max(0, prev - 1);
      return prev;
    });
  }, []);

  // Handle disconnect for a tab
  const handleDisconnect = useCallback((tabId) => {
    setDisconnectedTabs((prev) => new Set(prev).add(tabId));
  }, []);

  // Reconnect a tab
  const handleReconnect = useCallback(async (index) => {
    const tab = tabs[index];
    if (!tab) return;

    try {
      const { ticket } = await requestTerminalTicket(workspaceId, tab.port);
      setTabs((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ticket };
        return next;
      });
      setDisconnectedTabs((prev) => {
        const next = new Set(prev);
        next.delete(tab.id);
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
        // Safe to close -- navigate away
        window.location.href = '/workspaces';
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
          {/* Tab buttons */}
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabIndex(i)}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                backgroundColor: i === activeTabIndex ? '#313244' : 'transparent',
                color: disconnectedTabs.has(tab.id) ? '#f38ba8' : '#cdd6f4',
                border: '1px solid',
                borderColor: i === activeTabIndex ? '#585b70' : 'transparent',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Shell {tab.port === BASE_PORT ? '1' : tab.port - BASE_PORT + 1}
              {disconnectedTabs.has(tab.id) && ' (disconnected)'}
              {tabs.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); handleCloseTab(i); }}
                  style={{ color: '#585b70', cursor: 'pointer', marginLeft: '4px' }}
                >
                  x
                </span>
              )}
            </button>
          ))}

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

      {/* Terminal area */}
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
                  onClick={() => handleReconnect(i)}
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
              />
            )}
          </div>
        ))}
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
                onClick={() => { window.location.href = '/workspaces'; }}
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
