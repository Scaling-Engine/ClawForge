'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * In-terminal search bar powered by @xterm/addon-search.
 * Intercepts keyboard events (stopPropagation) so typing doesn't go to terminal.
 *
 * @param {object} props
 * @param {object} props.searchAddon - xterm SearchAddon instance
 * @param {function} props.onClose - Called when search bar should close
 */
export default function SearchBar({ searchAddon, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    e.stopPropagation();

    if (e.key === 'Enter' && e.shiftKey) {
      searchAddon?.findPrevious(query);
    } else if (e.key === 'Enter') {
      searchAddon?.findNext(query);
    } else if (e.key === 'Escape') {
      searchAddon?.clearDecorations();
      onClose?.();
    }
  };

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    background: '#181825',
    borderBottom: '1px solid #313244',
  };

  const inputStyle = {
    flex: 1,
    background: '#313244',
    color: '#cdd6f4',
    border: 'none',
    outline: 'none',
    padding: '4px 8px',
    fontSize: '12px',
    borderRadius: '4px',
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  };

  const buttonStyle = {
    background: 'none',
    border: 'none',
    color: '#cdd6f4',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '4px 6px',
    borderRadius: '4px',
  };

  return (
    <div style={containerStyle}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        style={inputStyle}
      />
      <button
        onClick={() => searchAddon?.findPrevious(query)}
        style={buttonStyle}
        title="Previous (Shift+Enter)"
      >
        &#x25B2;
      </button>
      <button
        onClick={() => searchAddon?.findNext(query)}
        style={buttonStyle}
        title="Next (Enter)"
      >
        &#x25BC;
      </button>
      <button
        onClick={() => {
          searchAddon?.clearDecorations();
          onClose?.();
        }}
        style={buttonStyle}
        title="Close (Escape)"
      >
        &#x2715;
      </button>
    </div>
  );
}
