'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { apiClient } from '@/lib/api-client';
import { Badge, Button, Section } from '@trycompai/design-system';
import { Checkmark, Close, Screen } from '@trycompai/design-system/icons';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { GcpBrowserDesktop } from './GcpBrowserDesktop';

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

interface BrowserLoginProps {
  connectionId: string;
  providerName: string;
}

const POLL_INTERVAL_MS = 3_000;
export function BrowserLogin({ connectionId, providerName }: BrowserLoginProps) {
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
      description={`${providerName} login saved in this organization's VM browser`}
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
          <div>
            <p className="text-sm font-medium">Browser session</p>
            <p className="text-sm text-muted-foreground">
              {connectionStatus?.lastConfirmedAt
                ? `Last saved ${new Date(connectionStatus.lastConfirmedAt).toLocaleString()}`
                : 'No browser session saved'}
            </p>
          </div>
          {canManage && (
            <Button onClick={() => void handleOpen()} loading={starting} iconLeft={<Screen />}>
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
          <GcpBrowserDesktop
            websocketPath={viewer.websocketPath}
            onDisconnected={handleDisconnected}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => void handleCancel()} iconLeft={<Close />}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} loading={finishing} iconLeft={<Checkmark />}>
              Save session
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
