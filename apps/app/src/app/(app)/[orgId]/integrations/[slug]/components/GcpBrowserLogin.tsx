'use client';

import { env } from '@/env.mjs';
import { usePermissions } from '@/hooks/use-permissions';
import { apiClient } from '@/lib/api-client';
import { Badge, Button, Section } from '@trycompai/design-system';
import { Checkmark, Close, Screen } from '@trycompai/design-system/icons';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';

type VmState =
  | 'not_created'
  | 'provisioning'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

type ViewerStatus =
  | 'provisioning'
  | 'ready'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'failed';

interface BrowserConnectionStatus {
  vmState: VmState;
  lastConfirmedAt: string | null;
}

interface BrowserViewerSession {
  id: string;
  status: ViewerStatus;
  expiresAt: string;
  websocketPath: string | null;
  error: string | null;
}

interface GcpBrowserLoginProps {
  connectionId: string;
}

const POLL_INTERVAL_MS = 3_000;

function buildWebSocketUrl(path: string): string {
  const url = new URL(path, env.NEXT_PUBLIC_API_URL || 'http://localhost:3333');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function BrowserDesktop({
  websocketPath,
  onDisconnected,
}: {
  websocketPath: string;
  onDisconnected: () => void;
}) {
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
      aria-label="GCP browser desktop"
      className="h-[min(70vh,720px)] min-h-[360px] w-full overflow-hidden rounded-md border bg-gray-950 sm:min-h-[480px] [&_canvas]:max-h-full [&_canvas]:max-w-full"
    />
  );
}

export function GcpBrowserLogin({ connectionId }: GcpBrowserLoginProps) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('integration', 'update');
  const [viewer, setViewer] = useState<BrowserViewerSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const { data: connectionStatus, mutate } = useSWR(
    `/v1/integration-browser/connections/${connectionId}`,
    async (endpoint: string) => {
      const response = await apiClient.get<BrowserConnectionStatus>(endpoint);
      if (!response.data) {
        throw new Error(response.error || 'Failed to load browser status');
      }
      return response.data;
    },
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    setViewer(null);
    setViewerError(null);
  }, [connectionId]);

  const viewerId = viewer?.id;
  const viewerStatus = viewer?.status;

  useEffect(() => {
    if (!viewerId || viewerStatus !== 'provisioning') return;

    const handlePoll = async () => {
      const response = await apiClient.get<BrowserViewerSession>(
        `/v1/integration-browser/viewer-sessions/${viewerId}`,
      );
      if (!response.data) {
        setViewerError(response.error || 'Failed to start browser desktop');
        return;
      }
      if (response.data.status === 'failed') {
        setViewerError(response.data.error || 'Browser desktop failed to start');
        setViewer(null);
        return;
      }
      if (response.data.status === 'expired') {
        setViewerError('The browser desktop session expired');
        setViewer(null);
        return;
      }
      setViewer(response.data);
    };

    const timer = window.setInterval(() => void handlePoll(), POLL_INTERVAL_MS);
    void handlePoll();
    return () => window.clearInterval(timer);
  }, [viewerId, viewerStatus]);

  const handleOpen = async () => {
    setStarting(true);
    setViewerError(null);
    const response = await apiClient.post<BrowserViewerSession>(
      `/v1/integration-browser/connections/${connectionId}/viewer-sessions`,
    );
    setStarting(false);
    if (!response.data) {
      setViewerError(response.error || 'Failed to start browser desktop');
      return;
    }
    setViewer(response.data);
  };

  const handleSave = async () => {
    if (!viewer) return;

    setFinishing(true);
    const response = await apiClient.post<BrowserViewerSession>(
      `/v1/integration-browser/viewer-sessions/${viewer.id}/complete`,
    );
    setFinishing(false);
    if (!response.data) {
      setViewerError(response.error || 'Failed to save browser session');
      return;
    }
    setViewer(null);
    await mutate();
    toast.success('Browser session saved');
  };

  const handleCancel = async () => {
    if (!viewer) return;

    await apiClient.delete(`/v1/integration-browser/viewer-sessions/${viewer.id}`);
    setViewer(null);
    setViewerError(null);
  };

  const handleDisconnected = () => {
    setViewerError('The browser desktop disconnected');
  };

  const isDesktopReady = viewer?.status === 'ready' || viewer?.status === 'active';
  const vmLabel = connectionStatus?.vmState.replaceAll('_', ' ') ?? 'loading';

  return (
    <Section
      title="Browser login"
      description="GCP console session for this organization"
      actions={
        <Badge variant={connectionStatus?.lastConfirmedAt ? 'accent' : 'secondary'}>
          {connectionStatus?.lastConfirmedAt ? 'Session saved' : vmLabel}
        </Badge>
      }
    >
      {viewerError && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{viewerError}</p>
        </div>
      )}

      {!viewer && (
        <div className="flex items-center justify-between gap-4 border-t py-4">
          <p className="text-sm text-muted-foreground">
            {connectionStatus?.lastConfirmedAt
              ? `Last saved ${new Date(connectionStatus.lastConfirmedAt).toLocaleString()}`
              : 'No browser session saved'}
          </p>
          {canManage && (
            <Button
              onClick={() => void handleOpen()}
              loading={starting}
              iconLeft={<Screen />}
            >
              Open desktop
            </Button>
          )}
        </div>
      )}

      {viewer?.status === 'provisioning' && (
        <div className="flex min-h-40 items-center justify-center rounded-md border bg-muted/20">
          <p className="text-sm text-muted-foreground">Starting browser desktop...</p>
        </div>
      )}

      {isDesktopReady && viewer?.websocketPath && (
        <div className="space-y-3">
          <BrowserDesktop
            websocketPath={viewer.websocketPath}
            onDisconnected={handleDisconnected}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => void handleCancel()} iconLeft={<Close />}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSave()}
              loading={finishing}
              iconLeft={<Checkmark />}
            >
              Save session
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
