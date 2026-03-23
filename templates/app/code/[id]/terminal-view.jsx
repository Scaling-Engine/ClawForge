'use client';

import { useEffect, useRef, useState } from 'react';
import { requestTerminalTicket } from 'clawforge/ws/actions';

/**
 * Shell tab content: xterm.js terminal connected via WebSocket to workspace container.
 * Self-contained component with dynamic imports to avoid SSR issues.
 * Handles disconnect/reconnect flow via requestTerminalTicket Server Action.
 *
 * @param {object} props
 * @param {string} props.workspaceId - Workspace UUID
 * @param {number} props.port - ttyd port inside container (default 7681)
 * @param {string} props.ticket - Single-use auth ticket
 * @param {function} [props.onDisconnect] - Called when WebSocket closes or errors
 */
export default function TerminalView({ workspaceId, port, ticket, onDisconnect }) {
  const termRef = useRef(null);
  const instanceRef = useRef(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState('');
  const [isConnecting, setIsConnecting] = useState(true);
  const [currentTicket, setCurrentTicket] = useState(ticket);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (!termRef.current || !currentTicket) return;

    let term = null;
    let ws = null;
    let fitAddon = null;
    let resizeHandler = null;
    let disposed = false;

    async function init() {
      // Dynamic imports to avoid SSR issues with xterm.js DOM dependencies
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');

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

      // Build WebSocket URL from window location
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/terminal/${workspaceId}?ticket=${currentTicket}&port=${port}`;
      console.log('[terminal] connecting to:', wsUrl);
      setIsConnecting(true);
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      // ttyd binary protocol constants
      const TTYD_OUTPUT = 0x30;  // '0' — terminal output
      const TTYD_SET_TITLE = 0x31; // '1' — set window title
      const TTYD_SET_PREFS = 0x32; // '2' — set preferences
      const TTYD_INPUT = 0x30;   // '0' — terminal input
      const TTYD_RESIZE = 0x31;  // '1' — resize: cols,rows

      ws.onopen = () => {
        console.log('[terminal] WebSocket connected');
        setIsConnecting(false);
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
            // Optional: could set document.title here
            break;
          case TTYD_SET_PREFS:
            // Server preferences JSON — ignore
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

      ws.onclose = (event) => {
        if (!disposed) {
          const reason = event.reason || (event.code === 4404 ? 'Workspace not found or not running' :
            event.code === 4500 ? 'Server error connecting to workspace container' :
            event.code === 1006 ? 'Connection lost (network issue or server restart)' :
            event.code === 401 ? 'Authentication failed (ticket expired)' :
            `Closed (code ${event.code})`);
          console.log(`[terminal] WebSocket closed: code=${event.code} reason=${reason}`);
          setDisconnectReason(reason);
          setIsDisconnected(true);
          setIsConnecting(false);
          onDisconnect?.();
        }
      };

      ws.onerror = (event) => {
        if (!disposed) {
          console.error('[terminal] WebSocket error:', event);
          setDisconnectReason('Connection error — check browser console for details');
          setIsDisconnected(true);
          setIsConnecting(false);
          onDisconnect?.();
        }
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
  }, [currentTicket, workspaceId, port]);

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      const { ticket: newTicket } = await requestTerminalTicket(workspaceId, port);
      setIsDisconnected(false);
      setCurrentTicket(newTicket);
    } catch (err) {
      console.error('Failed to reconnect terminal:', err);
    } finally {
      setIsReconnecting(false);
    }
  };

  if (isDisconnected) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        backgroundColor: '#1e1e2e',
      }}>
        <span style={{ color: '#f38ba8', fontSize: '14px' }}>
          Terminal disconnected
        </span>
        {disconnectReason && (
          <span style={{ color: '#a6adc8', fontSize: '12px', maxWidth: '400px', textAlign: 'center' }}>
            {disconnectReason}
          </span>
        )}
        <button
          onClick={handleReconnect}
          disabled={isReconnecting}
          aria-label="Reconnect terminal"
          style={{
            padding: '8px 24px',
            fontSize: '13px',
            backgroundColor: '#a6e3a1',
            color: '#1e1e2e',
            border: 'none',
            borderRadius: '4px',
            cursor: isReconnecting ? 'wait' : 'pointer',
            opacity: isReconnecting ? 0.7 : 1,
          }}
        >
          {isReconnecting ? 'Reconnecting...' : 'Reconnect'}
        </button>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1e1e2e',
        color: '#a6adc8',
        fontSize: '13px',
      }}>
        Connecting to terminal...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <div ref={termRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
