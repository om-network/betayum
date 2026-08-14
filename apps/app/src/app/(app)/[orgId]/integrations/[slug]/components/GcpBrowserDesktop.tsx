'use client';

import { env } from '@/env.mjs';
import { useEffect, useRef } from 'react';

interface GcpBrowserDesktopProps {
  websocketPath: string;
  onDisconnected: () => void;
}

function buildWebSocketUrl(path: string): string {
  const url = new URL(path, env.NEXT_PUBLIC_API_URL || 'http://localhost:3333');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function GcpBrowserDesktop({ websocketPath, onDisconnected }: GcpBrowserDesktopProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let disconnect: (() => void) | undefined;

    void import('@novnc/novnc')
      .then(({ default: RFB }) => {
        if (disposed) return;

        const rfb = new RFB(container, buildWebSocketUrl(websocketPath));
        rfb.scaleViewport = true;
        rfb.resizeSession = false;
        rfb.focusOnClick = true;
        rfb.background = '#111827';
        rfb.addEventListener('disconnect', (event) => {
          if (!disposed && !event.detail.clean) onDisconnected();
        });
        disconnect = () => rfb.disconnect();
      })
      .catch(() => {
        if (!disposed) onDisconnected();
      });

    return () => {
      disposed = true;
      disconnect?.();
      container.replaceChildren();
    };
  }, [onDisconnected, websocketPath]);

  return (
    <div
      ref={containerRef}
      aria-label="Organization browser desktop"
      className="h-[min(70vh,720px)] min-h-[360px] w-full overflow-hidden rounded-md border bg-gray-950 sm:min-h-[480px] [&_canvas]:max-h-full [&_canvas]:max-w-full"
    />
  );
}
