'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

const STATUS = { connected: '#22c55e', connecting: '#eab308', disconnected: '#ef4444' };
const RECONNECT_INTERVAL = 3000;

const TERM_THEMES = {
  dark: { background: '#1a1b26', foreground: '#a9b1d6', cursor: '#c0caf5', selectionBackground: '#33467c' },
  light: { background: '#f5f5f5', foreground: '#171717', cursor: '#171717', selectionBackground: '#d4d4d4' },
};

const TOOLBAR_COLORS = {
  dark: { color: '#787c99', border: 'rgba(169,177,214,0.15)', hoverColor: '#a9b1d6' },
  light: { color: '#555555', border: 'rgba(23,23,23,0.15)', hoverColor: '#171717' },
};

function getSystemTheme() {
  const cs = getComputedStyle(document.documentElement);
  return {
    background: cs.getPropertyValue('--muted').trim() || '#1a1b26',
    foreground: cs.getPropertyValue('--muted-foreground').trim() || '#a9b1d6',
    cursor: cs.getPropertyValue('--foreground').trim() || '#c0caf5',
    selectionBackground: cs.getPropertyValue('--border').trim() || '#33467c',
  };
}

function resolveTheme(mode) {
  if (mode === 'system') return getSystemTheme();
  return TERM_THEMES[mode] || TERM_THEMES.dark;
}

const THEME_CYCLE = ['dark', 'light', 'system'];

export default function TerminalView({ codeWorkspaceId, wsPath, isActive = true, showToolbar = true, ensureContainer, onCloseSession, closeLabel = 'Close Session' }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const retryTimer = useRef(null);
  const statusRef = useRef(null);
  const styleRef = useRef(null);
  const toolbarRef = useRef(null);
  const disconnectedAtRef = useRef(null);
  const ensuredRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [containerError, setContainerError] = useState(null);
  const [termTheme, setTermTheme] = useState('dark');

  const setStatus = useCallback((color) => {
    if (statusRef.current) statusRef.current.style.backgroundColor = color;
    setConnected(color === STATUS.connected);
  }, []);

  const sendResize = useCallback(() => {
    const fit = fitAddonRef.current;
    const ws = wsRef.current;
    const term = termRef.current;
    if (!fit || !term || !ws || ws.readyState !== WebSocket.OPEN) return;
    fit.fit();
    const payload = JSON.stringify({ columns: term.cols, rows: term.rows });
    ws.send('1' + payload);
  }, []);

  const applyTheme = useCallback((mode) => {
    const theme = resolveTheme(mode);
    const tb = TOOLBAR_COLORS[mode] || TOOLBAR_COLORS.dark;
    const term = termRef.current;
    if (term) term.options.theme = theme;
    if (styleRef.current) {
      styleRef.current.textContent = `.xterm { padding: 5px; background-color: ${theme.background} !important; } .xterm-viewport { background-color: ${theme.background} !important; }`;
    }
    if (containerRef.current) containerRef.current.style.backgroundColor = theme.background;
    if (toolbarRef.current) {
      toolbarRef.current.style.background = theme.background;
      toolbarRef.current.style.setProperty('--tb-color', tb.color);
      toolbarRef.current.style.setProperty('--tb-border', tb.border);
      toolbarRef.current.style.setProperty('--tb-hover', tb.hoverColor);
    }
  }, []);

  const connect = useCallback(() => {
    const term = termRef.current;
    if (!term) return;

    setStatus(STATUS.connecting);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = wsPath || `/code/${codeWorkspaceId}/ws`;
    const ws = new WebSocket(`${protocol}//${window.location.host}${path}`);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      const handshake = JSON.stringify({ AuthToken: '', columns: term.cols, rows: term.rows });
      ws.send(handshake);
      setStatus(STATUS.connected);
      disconnectedAtRef.current = null;
      ensuredRef.current = false;
    };

    ws.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
      const type = data[0];
      const payload = data.slice(1);

      switch (type) {
        case '0':
          term.write(payload);
          break;
        case '1':
          // Ignore terminal title changes
          break;
        case '2':
          break;
      }
    };

    ws.onclose = () => {
      setStatus(STATUS.disconnected);

      if (!disconnectedAtRef.current) {
        disconnectedAtRef.current = Date.now();
      }

      if (Date.now() - disconnectedAtRef.current > 60_000) {
        setContainerError('Failed to connect');
        return;
      }

      if (!ensuredRef.current && ensureContainer) {
        ensuredRef.current = true;
        ensureContainer(codeWorkspaceId).catch(() => {});
      }

      retryTimer.current = setTimeout(connect, RECONNECT_INTERVAL);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [codeWorkspaceId, wsPath, setStatus, ensureContainer]);

  useEffect(() => {
    const saved = localStorage.getItem('terminal-theme') || 'dark';
    setTermTheme(saved);

    const theme = resolveTheme(saved);
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 16,
      fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", Menlo, monospace',
      theme,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.open(containerRef.current);

    const style = document.createElement('style');
    style.textContent = `.xterm { padding: 5px; background-color: ${theme.background} !important; } .xterm-viewport { background-color: ${theme.background} !important; }`;
    containerRef.current.appendChild(style);
    styleRef.current = style;

    containerRef.current.style.backgroundColor = theme.background;
    const tb = TOOLBAR_COLORS[saved] || TOOLBAR_COLORS.dark;
    if (toolbarRef.current) {
      toolbarRef.current.style.background = theme.background;
      toolbarRef.current.style.setProperty('--tb-color', tb.color);
      toolbarRef.current.style.setProperty('--tb-border', tb.border);
      toolbarRef.current.style.setProperty('--tb-hover', tb.hoverColor);
    }

    fitAddon.fit();

    term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('0' + data);
      }
    });

    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(sendResize, 100);
    };
    window.addEventListener('resize', handleResize);

    let cancelled = false;

    if (ensureContainer) {
      (async () => {
        try {
          const result = await ensureContainer(codeWorkspaceId);
          if (result?.status === 'error') {
            const msg = result.message || 'Unknown container error';
            console.error('ensureContainer:', msg);
            if (!cancelled) setContainerError(msg);
            return;
          }
        } catch (err) {
          console.error('ensureContainer:', err);
          if (!cancelled) setContainerError(err.message || String(err));
          return;
        }
        if (!cancelled) connect();
      })();
    } else {
      connect();
    }

    return () => {
      cancelled = true;
      clearTimeout(resizeTimeout);
      clearTimeout(retryTimer.current);
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) wsRef.current.close();
      term.dispose();
    };
  }, [connect, sendResize, codeWorkspaceId]);

  useEffect(() => {
    if (isActive && termRef.current && fitAddonRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        termRef.current?.focus();
      });
    }
  }, [isActive]);

  const sendCommand = useCallback((text) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const encoder = new TextEncoder();

    ws.send(new Uint8Array([0x30, 0x03]));

    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const buf = new Uint8Array(text.length * 3 + 1);
      buf[0] = 0x30;
      const { written } = encoder.encodeInto(text, buf.subarray(1));
      ws.send(buf.subarray(0, written + 1));

      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(new Uint8Array([0x30, 0x0d]));
      }, 50);
    }, 150);
  }, []);

  const handleReconnect = async () => {
    clearTimeout(retryTimer.current);
    if (wsRef.current) wsRef.current.close();
    disconnectedAtRef.current = null;
    ensuredRef.current = false;
    if (ensureContainer) {
      try {
        setContainerError(null);
        const result = await ensureContainer(codeWorkspaceId);
        if (result?.status === 'error') {
          const msg = result.message || 'Unknown container error';
          console.error('ensureContainer:', msg);
          setContainerError(msg);
          return;
        }
      } catch (err) {
        console.error('ensureContainer:', err);
        setContainerError(err.message || String(err));
        return;
      }
    }
    connect();
  };

  const cycleTheme = useCallback(() => {
    setTermTheme((prev) => {
      const idx = THEME_CYCLE.indexOf(prev);
      const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
      localStorage.setItem('terminal-theme', next);
      applyTheme(next);
      return next;
    });
  }, [applyTheme]);

  return (
    <>
      <style>{`
        .code-toolbar-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 1px solid var(--tb-border, rgba(169,177,214,0.15));
          color: var(--tb-color, #787c99);
          padding: 5px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: all 0.15s ease;
          white-space: nowrap;
          line-height: 1;
        }
        .code-toolbar-btn:hover {
          background: transparent;
          color: var(--tb-hover, #a9b1d6);
        }
        .code-toolbar-btn:active {
          transform: scale(0.97);
        }
        .code-toolbar-btn--reconnect:hover {
          color: var(--tb-hover, #a9b1d6);
        }
        .code-toolbar-btn--theme:hover {
          border-color: rgba(168,153,215,0.3);
          color: #a899d7;
          background: rgba(168,153,215,0.08);
        }
        .code-toolbar-btn--close:hover {
          border-color: rgba(239,68,68,0.3);
          color: #ef4444;
          background: rgba(239,68,68,0.08);
        }
      `}</style>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, margin: '0 16px 16px' }}>
        <div style={{ height: '100%', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
          {(!connected || containerError) && (
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              background: containerError ? 'rgba(255,235,235,0.95)' : 'rgba(26,27,38,0.92)',
              color: containerError ? '#991b1b' : '#a9b1d6',
              padding: '14px 28px',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
              fontWeight: 500,
              border: '1px solid rgba(169,177,214,0.2)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
              zIndex: 10,
              textAlign: 'center',
              maxWidth: 320,
              letterSpacing: '0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              {containerError
                ? `Container error: ${containerError}`
                : 'Connecting to terminal...'}
            </div>
          )}

          {showToolbar && (
            <div
              ref={toolbarRef}
              style={{
                flexShrink: 0,
                height: 42,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                background: '#1a1b26',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className="code-toolbar-btn code-toolbar-btn--theme"
                  onClick={cycleTheme}
                >
                  {termTheme}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className="code-toolbar-btn code-toolbar-btn--reconnect"
                  onClick={handleReconnect}
                >
                  <div
                    ref={statusRef}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      backgroundColor: STATUS.connecting,
                      boxShadow: `0 0 6px ${STATUS.connecting}`,
                      transition: 'all 0.3s ease',
                    }}
                  />
                  Reconnect
                </button>
                {onCloseSession && (
                  <button
                    className="code-toolbar-btn code-toolbar-btn--close"
                    onClick={onCloseSession}
                  >
                    {closeLabel}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
