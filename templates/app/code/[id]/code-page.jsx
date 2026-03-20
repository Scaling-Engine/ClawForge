'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { SortableCodeTab } from './sortable-code-tab.jsx';
import TerminalView from './terminal-view.jsx';
import EditorView from './editor-view.jsx';
import { requestTerminalTicket, requestGitStatus, closeWorkspaceAction } from 'clawforge/ws/actions';

const INITIAL_TABS = [
  { id: 'code', label: 'Code' },
  { id: 'shell', label: 'Shell' },
  { id: 'editor', label: 'Editor' },
];

/**
 * Code IDE page client component.
 * Three fixed DnD-sortable tabs: Code (AI streaming placeholder), Shell (xterm.js), Editor (file tree).
 * Tab panels rendered simultaneously with display toggle to preserve xterm.js state.
 *
 * @param {object} props
 * @param {string} props.workspaceId - Workspace UUID
 * @param {string} props.repoSlug - Repository slug (owner/repo)
 * @param {string} props.featureBranch - Feature branch name
 * @param {object} props.user - Authenticated user object
 */
export default function CodePageClient({ workspaceId, repoSlug, featureBranch, user }) {
  const [tabs, setTabs] = useState(INITIAL_TABS);
  const [activeTabId, setActiveTabId] = useState('shell');
  const [showFileTree, setShowFileTree] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [gitStatus, setGitStatus] = useState(null);

  // Shell tab terminal state
  const [shellTicket, setShellTicket] = useState(null);
  const [shellDisconnected, setShellDisconnected] = useState(false);
  const initializedRef = useRef(false);

  // DnD sensors: pointer (desktop), touch (mobile, 250ms delay prevents scroll conflict), keyboard (a11y)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

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

  // Request terminal ticket on mount for the Shell tab
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function initShell() {
      try {
        const { ticket } = await requestTerminalTicket(workspaceId, 7681);
        setShellTicket(ticket);
      } catch (err) {
        console.error('Failed to initialize shell terminal:', err);
      }
    }
    initShell();
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

  // Check git status and show close warning or close immediately
  const handleClose = useCallback(async () => {
    try {
      const status = await requestGitStatus(workspaceId);
      setGitStatus(status);

      if (status.safe) {
        // Fire-and-forget: stop container and notify thread with commits
        closeWorkspaceAction(workspaceId).catch(() => {});
        // Navigate immediately — don't wait for close to complete
        window.location.href = '/chats';
      } else {
        setShowCloseWarning(true);
      }
    } catch (err) {
      // On error, show warning anyway
      setGitStatus({
        hasUncommitted: false,
        uncommittedFiles: [],
        hasUnpushed: false,
        unpushedCommits: [],
        safe: false,
        error: err.message,
      });
      setShowCloseWarning(true);
    }
  }, [workspaceId]);

  // Derive active tab index for panel display (survives DnD reorders)
  const activeTabIndex = tabs.findIndex((t) => t.id === activeTabId);

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
        {/* Left: Repo breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '13px', color: '#a6adc8' }}>
            {repoSlug} <span style={{ color: '#585b70' }}>/</span> {featureBranch}
          </span>
        </div>

        {/* Right: DnD tabs + toolbar buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* DnD-sortable tab buttons: each SortableCodeTab renders with role="tab", aria-selected, aria-controls */}
          <div role="tablist" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
                {tabs.map((tab) => (
                  <SortableCodeTab
                    key={tab.id}
                    id={tab.id}
                    label={tab.label}
                    isActive={tab.id === activeTabId}
                    onClick={() => setActiveTabId(tab.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          {/* Files sidebar toggle */}
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

          {/* Close Workspace button */}
          <button
            onClick={handleClose}
            aria-label="Close workspace"
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
            Close Workspace
          </button>
        </div>
      </div>

      {/* Unsafe close warning panel */}
      {showCloseWarning && (
        <div style={{
          backgroundColor: '#181825',
          borderBottom: '1px solid #f38ba8',
          padding: '12px 16px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: '#f38ba8', fontSize: '13px', fontWeight: '600' }}>
            You have unsaved changes
          </span>
          {gitStatus?.hasUncommitted && (
            <span style={{ color: '#fab387', fontSize: '12px' }}>
              {gitStatus.uncommittedFiles.length} uncommitted file(s).
            </span>
          )}
          {gitStatus?.hasUnpushed && (
            <span style={{ color: '#fab387', fontSize: '12px' }}>
              {gitStatus.unpushedCommits.length} unpushed commit(s).
            </span>
          )}
          {gitStatus?.error && (
            <span style={{ color: '#f38ba8', fontSize: '12px' }}>
              Could not check git status: {gitStatus.error}
            </span>
          )}
          <span style={{ color: '#a6adc8', fontSize: '12px' }}>Close anyway?</span>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button
              onClick={() => setShowCloseWarning(false)}
              style={{
                padding: '4px 16px',
                fontSize: '12px',
                backgroundColor: '#313244',
                color: '#cdd6f4',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Keep Working
            </button>
            <button
              onClick={() => {
                // Fire-and-forget: stop container and notify thread with commits
                closeWorkspaceAction(workspaceId).catch(() => {});
                // Navigate immediately
                window.location.href = '/chats';
              }}
              style={{
                padding: '4px 16px',
                fontSize: '12px',
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
      )}

      {/* Content area: optional file tree sidebar + tab panels */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* File tree sidebar — 240px, toggled by Files button */}
        {showFileTree && (
          <div style={{
            width: '240px',
            minWidth: '240px',
            background: '#181825',
            borderRight: '1px solid #313244',
            overflowY: 'auto',
            flexShrink: 0,
          }}>
            {/* Inline file tree in sidebar (separate from Editor tab's full file tree) */}
            <div style={{
              padding: '6px 8px',
              borderBottom: '1px solid #313244',
              color: '#a6adc8',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Files
            </div>
            <EditorView workspaceId={workspaceId} />
          </div>
        )}

        {/* Tab panels — all rendered, only active is visible */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {tabs.map((tab, i) => (
            <div
              key={tab.id}
              id={`panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${tab.id}`}
              style={{
                position: 'absolute',
                inset: 0,
                display: tab.id === activeTabId ? 'block' : 'none',
                backgroundColor: '#1e1e2e',
              }}
            >
              {tab.id === 'code' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#585b70',
                  fontSize: '13px',
                }}>
                  Select a repo and send a message to start coding.
                </div>
              )}

              {tab.id === 'shell' && (
                <TerminalView
                  workspaceId={workspaceId}
                  port={7681}
                  ticket={shellTicket}
                  onDisconnect={() => setShellDisconnected(true)}
                />
              )}

              {tab.id === 'editor' && (
                <EditorView workspaceId={workspaceId} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
