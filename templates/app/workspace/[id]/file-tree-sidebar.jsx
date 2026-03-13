'use client';

import { useState, useEffect, useCallback } from 'react';
import { requestFileTree } from 'clawforge/ws/actions';

/**
 * Collapsible file tree sidebar for workspace directories.
 * Polls the container's file system every 10 seconds via Server Action.
 *
 * @param {object} props
 * @param {string} props.workspaceId - Workspace UUID
 * @param {function} [props.onFileClick] - Called with file path when a file is clicked
 * @param {function} [props.onDirectoryClick] - Called with directory path when a directory is clicked
 */
export default function FileTreeSidebar({ workspaceId, onFileClick, onDirectoryClick }) {
  const [files, setFiles] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const fetchFiles = useCallback(async () => {
    const result = await requestFileTree(workspaceId);
    setFiles(result);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    fetchFiles();
    const interval = setInterval(fetchFiles, 10000);
    return () => clearInterval(interval);
  }, [fetchFiles]);

  const toggleExpanded = useCallback((path) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Build tree structure from flat file list
  const buildTree = useCallback((entries) => {
    const root = { children: {} };

    for (const entry of entries) {
      const parts = entry.path.replace(/^\/workspace\/?/, '').split('/').filter(Boolean);
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        if (!node.children[name]) {
          node.children[name] = {
            name,
            path: entry.path,
            type: i === parts.length - 1 ? entry.type : 'directory',
            children: {},
          };
        }
        if (i === parts.length - 1) {
          node.children[name].type = entry.type;
          node.children[name].path = entry.path;
        }
        node = node.children[name];
      }
    }

    return root;
  }, []);

  const renderNode = useCallback((node, depth = 0) => {
    const sortedChildren = Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return sortedChildren.map((child) => {
      const isDir = child.type === 'directory';
      const isOpen = expanded.has(child.path);
      const hasChildren = Object.keys(child.children).length > 0;

      return (
        <div key={child.path}>
          <div
            onClick={() => {
              if (isDir) {
                toggleExpanded(child.path);
                onDirectoryClick?.(child.path);
              } else {
                onFileClick?.(child.path);
              }
            }}
            style={{
              padding: '2px 8px',
              paddingLeft: `${8 + depth * 16}px`,
              cursor: 'pointer',
              color: isDir ? '#89b4fa' : '#cdd6f4',
              fontSize: '12px',
              fontFamily: 'Menlo, Monaco, "Courier New", monospace',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={child.path}
          >
            {isDir && (
              <span style={{ display: 'inline-block', width: '12px', fontSize: '8px' }}>
                {isOpen ? '\u25BC' : '\u25B6'}
              </span>
            )}
            {!isDir && <span style={{ display: 'inline-block', width: '12px' }} />}
            {' '}{child.name}
          </div>
          {isDir && isOpen && hasChildren && renderNode(child, depth + 1)}
        </div>
      );
    });
  }, [expanded, toggleExpanded, onFileClick, onDirectoryClick]);

  const tree = buildTree(files);

  return (
    <div style={{
      width: '250px',
      minWidth: '250px',
      background: '#181825',
      borderRight: '1px solid #313244',
      overflowY: 'auto',
      fontSize: '12px',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 8px',
        borderBottom: '1px solid #313244',
        color: '#a6adc8',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        <span>Files</span>
        <button
          onClick={fetchFiles}
          style={{
            background: 'none',
            border: 'none',
            color: '#a6adc8',
            cursor: 'pointer',
            fontSize: '12px',
            padding: '2px 4px',
          }}
          title="Refresh file tree"
        >
          &#x21BB;
        </button>
      </div>
      {loading ? (
        <div style={{ padding: '12px 8px', color: '#585b70', fontSize: '12px' }}>
          Loading...
        </div>
      ) : files.length === 0 ? (
        <div style={{ padding: '12px 8px', color: '#585b70', fontSize: '12px' }}>
          No files found
        </div>
      ) : (
        renderNode(tree)
      )}
    </div>
  );
}
