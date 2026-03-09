'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * Terminal component that renders xterm.js connected to a WebSocket.
 * Dynamic imports avoid SSR issues with xterm.js DOM dependencies.
 *
 * @param {object} props
 * @param {string} props.workspaceId - Workspace UUID
 * @param {number} props.port - ttyd port inside container
 * @param {string} props.ticket - Single-use auth ticket
 * @param {string} props.wsUrl - WebSocket base URL (ws:// or wss://)
 * @param {function} props.onDisconnect - Called when WebSocket closes or errors
 */
export default function Terminal({ workspaceId, port, ticket, wsUrl, onDisconnect }) {
  const termRef = useRef(null);
  const instanceRef = useRef(null);

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
      const { AttachAddon } = await import('@xterm/addon-attach');

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
      term.loadAddon(fitAddon);
      term.open(termRef.current);
      fitAddon.fit();

      // Connect WebSocket
      const fullUrl = `${wsUrl}?ticket=${ticket}`;
      ws = new WebSocket(fullUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        const attachAddon = new AttachAddon(ws);
        term.loadAddon(attachAddon);
        // Fit again after attach to send correct dimensions
        setTimeout(() => fitAddon.fit(), 100);
      };

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

      instanceRef.current = { term, ws, fitAddon };
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
    <div
      ref={termRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
