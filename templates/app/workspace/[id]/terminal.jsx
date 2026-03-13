'use client';

import { useEffect, useRef } from 'react';
import SearchBar from './search-bar.jsx';

/**
 * Terminal component that renders xterm.js connected to a WebSocket.
 * Dynamic imports avoid SSR issues with xterm.js DOM dependencies.
 *
 * V2 additions: SearchAddon, WebLinksAddon, SerializeAddon, search bar overlay.
 *
 * @param {object} props
 * @param {string} props.workspaceId - Workspace UUID
 * @param {number} props.port - ttyd port inside container
 * @param {string} props.ticket - Single-use auth ticket
 * @param {string} props.wsUrl - WebSocket base URL (ws:// or wss://)
 * @param {function} props.onDisconnect - Called when WebSocket closes or errors
 * @param {function} [props.onSearchToggle] - Called when Ctrl+F / Cmd+F pressed (optional, V2)
 * @param {boolean} [props.showSearch] - Whether to show search bar (optional, V2)
 */
export default function Terminal({ workspaceId, port, ticket, wsUrl, onDisconnect, onSearchToggle, showSearch }) {
  const termRef = useRef(null);
  const instanceRef = useRef(null);

  // Refit terminal when search bar toggles (changes available height)
  useEffect(() => {
    if (instanceRef.current?.fitAddon) {
      setTimeout(() => instanceRef.current.fitAddon.fit(), 50);
    }
  }, [showSearch]);

  useEffect(() => {
    if (!termRef.current || !ticket) return;

    let term = null;
    let ws = null;
    let fitAddon = null;
    let resizeHandler = null;
    let disposed = false;

    async function init() {
      // Dynamic imports to avoid SSR
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { SearchAddon } = await import('@xterm/addon-search');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');
      const { SerializeAddon } = await import('@xterm/addon-serialize');

      // Import xterm CSS
      await import('@xterm/xterm/css/xterm.css');

      if (disposed) return;

      term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e2e',
          foreground: '#cdd6f4',
          cursor: '#f5e0dc',
        },
      });

      fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      const webLinksAddon = new WebLinksAddon((event, uri) => window.open(uri, '_blank'));
      const serializeAddon = new SerializeAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(searchAddon);
      term.loadAddon(webLinksAddon);
      term.loadAddon(serializeAddon);

      term.open(termRef.current);
      fitAddon.fit();

      // Intercept Ctrl+F / Cmd+F to open search bar instead of browser find
      term.attachCustomKeyEventHandler((event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
          event.preventDefault();
          if (onSearchToggle) onSearchToggle();
          return false;
        }
        return true;
      });

      // Connect WebSocket
      const fullUrl = `${wsUrl}?ticket=${ticket}`;
      ws = new WebSocket(fullUrl);
      ws.binaryType = 'arraybuffer';

      // ttyd binary protocol constants (ASCII char codes)
      const TTYD_OUTPUT = 0x30;       // '0' — terminal output
      const TTYD_SET_TITLE = 0x31;    // '1' — set window title
      const TTYD_SET_PREFS = 0x32;    // '2' — set preferences (JSON)
      const TTYD_INPUT = 0x30;        // '0' — terminal input
      const TTYD_RESIZE = 0x31;       // '1' — resize: cols,rows

      ws.onopen = () => {
        // Send initial resize to ttyd
        const { cols, rows } = term;
        const resizeMsg = new TextEncoder().encode(`1${JSON.stringify({ columns: cols, rows })}`);
        ws.send(resizeMsg.buffer);
      };

      // Handle messages FROM ttyd (type-prefixed binary)
      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data);
        if (data.length === 0) return;
        const type = data[0];
        const payload = data.slice(1);

        switch (type) {
          case TTYD_OUTPUT:
            term.write(payload);
            break;
          case TTYD_SET_TITLE:
            // Optional: document.title = new TextDecoder().decode(payload);
            break;
          case TTYD_SET_PREFS:
            // Server preferences JSON — ignore for now
            break;
        }
      };

      // Handle input TO ttyd (prepend '0' type byte)
      term.onData((data) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const encoder = new TextEncoder();
        const payload = encoder.encode(data);
        const msg = new Uint8Array(1 + payload.length);
        msg[0] = TTYD_INPUT;
        msg.set(payload, 1);
        ws.send(msg.buffer);
      });

      // Handle resize → ttyd
      term.onResize(({ cols, rows }) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const resizeMsg = new TextEncoder().encode(`1${JSON.stringify({ columns: cols, rows })}`);
        ws.send(resizeMsg.buffer);
      });

      // Fit again after setup
      setTimeout(() => fitAddon.fit(), 100);

      ws.onclose = () => {
        if (!disposed && onDisconnect) onDisconnect();
      };

      ws.onerror = () => {
        if (!disposed && onDisconnect) onDisconnect();
      };

      // Handle window resize
      resizeHandler = () => {
        if (fitAddon && !disposed) fitAddon.fit();
      };
      window.addEventListener('resize', resizeHandler);

      instanceRef.current = { term, ws, fitAddon, searchAddon, serializeAddon };
    }

    init();

    return () => {
      disposed = true;
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      if (ws && ws.readyState <= 1) ws.close();
      if (term) term.dispose();
      instanceRef.current = null;
    };
  }, [ticket, wsUrl, onDisconnect]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {showSearch && instanceRef.current?.searchAddon && (
        <SearchBar
          searchAddon={instanceRef.current.searchAddon}
          onClose={() => onSearchToggle?.()}
        />
      )}
      <div ref={termRef} style={{ flex: 1 }} />
    </div>
  );
}
