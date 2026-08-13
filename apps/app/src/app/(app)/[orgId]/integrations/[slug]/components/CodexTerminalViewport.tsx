'use client';

import { env } from '@/env.mjs';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';

interface CodexTerminalViewportProps {
  onDisconnected: () => void;
  websocketPath: string;
}

function buildWebSocketUrl(path: string): string {
  const url = new URL(path, env.NEXT_PUBLIC_API_URL || 'http://localhost:3333');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function CodexTerminalViewport({
  onDisconnected,
  websocketPath,
}: CodexTerminalViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let dispose: (() => void) | undefined;

    void Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]).then(([{ Terminal }, { FitAddon }]) => {
      if (disposed) return;

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 14,
        theme: {
          background: '#111827',
          foreground: '#f3f4f6',
          cursor: '#22c55e',
          selectionBackground: '#374151',
        },
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(container);

      const socket = new WebSocket(buildWebSocketUrl(websocketPath));
      socket.binaryType = 'arraybuffer';
      const sendResize = () => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            type: 'resize',
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        );
      };
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        sendResize();
      });
      resizeObserver.observe(container);

      const input = terminal.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(new TextEncoder().encode(data));
        }
      });
      socket.addEventListener('open', () => {
        fitAddon.fit();
        sendResize();
        terminal.focus();
      });
      socket.addEventListener('message', (event) => {
        if (event.data instanceof ArrayBuffer) {
          terminal.write(new Uint8Array(event.data));
          return;
        }
        if (event.data instanceof Blob) {
          void event.data
            .arrayBuffer()
            .then((data) => terminal.write(new Uint8Array(data)));
        }
      });
      socket.addEventListener('close', () => {
        if (!disposed) onDisconnected();
      });

      dispose = () => {
        resizeObserver.disconnect();
        input.dispose();
        socket.close();
        terminal.dispose();
      };
    });

    return () => {
      disposed = true;
      dispose?.();
      container.replaceChildren();
    };
  }, [onDisconnected, websocketPath]);

  return (
    <div
      ref={containerRef}
      aria-label="Codex terminal"
      className="h-[min(65vh,640px)] min-h-[360px] w-full overflow-hidden rounded-md border bg-gray-950 p-2"
    />
  );
}
