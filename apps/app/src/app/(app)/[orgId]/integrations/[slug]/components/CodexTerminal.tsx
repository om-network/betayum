'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { apiClient } from '@/lib/api-client';
import { Badge, Button, Section } from '@trycompai/design-system';
import { Close, Logout, Terminal } from '@trycompai/design-system/icons';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { CodexTerminalViewport } from './CodexTerminalViewport';

type TerminalStatus =
  | 'provisioning'
  | 'ready'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'failed';

interface BrowserConnectionStatus {
  codexStatus: 'connected' | 'disconnected' | 'unavailable';
}

interface CodexSession {
  error: string | null;
  expiresAt: string;
  id: string;
  status: TerminalStatus;
  websocketPath: string | null;
}

interface CodexTerminalProps {
  connectionId: string;
  title?: string;
}

const POLL_INTERVAL_MS = 3_000;

export function CodexTerminal({ connectionId, title = 'Codex terminal' }: CodexTerminalProps) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('integration', 'update');
  const [session, setSession] = useState<CodexSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [pendingLogout, setPendingLogout] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: connectionStatus, mutate } = useSWR(
    `/v1/integration-browser/connections/${connectionId}`,
    async (endpoint: string) => {
      const response = await apiClient.get<BrowserConnectionStatus>(endpoint);
      if (!response.data) {
        throw new Error(response.error || 'Failed to load Codex status');
      }
      return response.data;
    },
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    setSession(null);
    setPendingLogout(false);
    setError(null);
  }, [connectionId]);

  const handleLogoutSession = useCallback(
    async (sessionId: string) => {
      setLoggingOut(true);
      const response = await apiClient.post<{ success: true }>(
        `/v1/integration-browser/codex-sessions/${sessionId}/logout`,
      );
      setLoggingOut(false);
      setPendingLogout(false);
      if (!response.data) {
        setError(response.error || 'Failed to disconnect Codex');
        return;
      }
      setSession(null);
      await mutate();
      toast.success('Codex account disconnected');
    },
    [mutate],
  );

  const sessionId = session?.id;
  const sessionStatus = session?.status;
  useEffect(() => {
    if (!sessionId || sessionStatus !== 'provisioning') return;

    const handlePoll = async () => {
      const response = await apiClient.get<CodexSession>(
        `/v1/integration-browser/codex-sessions/${sessionId}`,
      );
      if (!response.data) {
        setError(response.error || 'Failed to start Codex terminal');
        return;
      }
      if (response.data.status === 'failed' || response.data.status === 'expired') {
        setError(response.data.error || 'Codex terminal failed to start');
        setSession(null);
        setPendingLogout(false);
        return;
      }
      setSession(response.data);
    };

    const timer = window.setInterval(() => void handlePoll(), POLL_INTERVAL_MS);
    void handlePoll();
    return () => window.clearInterval(timer);
  }, [sessionId, sessionStatus]);

  useEffect(() => {
    if (
      pendingLogout &&
      sessionId &&
      (sessionStatus === 'ready' || sessionStatus === 'active') &&
      !loggingOut
    ) {
      void handleLogoutSession(sessionId);
    }
  }, [handleLogoutSession, loggingOut, pendingLogout, sessionId, sessionStatus]);

  const handleCreateSession = async ({ logout }: { logout: boolean }) => {
    setStarting(true);
    setError(null);
    setPendingLogout(logout);
    const response = await apiClient.post<CodexSession>(
      `/v1/integration-browser/connections/${connectionId}/codex-sessions`,
    );
    setStarting(false);
    if (!response.data) {
      setPendingLogout(false);
      setError(response.error || 'Failed to start Codex terminal');
      return;
    }
    setSession(response.data);
  };

  const handleClose = async () => {
    if (!session) return;
    await apiClient.delete(`/v1/integration-browser/codex-sessions/${session.id}`);
    setSession(null);
    setPendingLogout(false);
    setError(null);
    await mutate();
  };

  const handleDisconnected = useCallback(() => {
    setSession(null);
    setPendingLogout(false);
    void mutate();
  }, [mutate]);

  const connected = connectionStatus?.codexStatus === 'connected';
  const statusLabel =
    connectionStatus?.codexStatus === 'unavailable'
      ? 'Unavailable'
      : connected
        ? 'Connected'
        : 'Not connected';
  const terminalWebsocketPath =
    !pendingLogout &&
    (session?.status === 'ready' || session?.status === 'active') &&
    session.websocketPath
      ? session.websocketPath
      : null;

  return (
    <Section
      title={title}
      description="Codex CLI session for this organization"
      actions={<Badge variant={connected ? 'accent' : 'secondary'}>{statusLabel}</Badge>}
    >
      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {!session && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t py-4">
          {canManage && connected && (
            <Button
              variant="outline"
              onClick={() => void handleCreateSession({ logout: true })}
              loading={starting || loggingOut}
              iconLeft={<Logout />}
            >
              Disconnect
            </Button>
          )}
          {canManage && (
            <Button
              onClick={() => void handleCreateSession({ logout: false })}
              loading={starting}
              iconLeft={<Terminal />}
            >
              Open terminal
            </Button>
          )}
        </div>
      )}

      {(session?.status === 'provisioning' || pendingLogout) && (
        <div className="flex min-h-40 items-center justify-center border-t bg-muted/20">
          <p className="text-sm text-muted-foreground">
            {pendingLogout ? 'Disconnecting Codex...' : 'Starting Codex terminal...'}
          </p>
        </div>
      )}

      {terminalWebsocketPath && session && (
        <div className="space-y-3">
          <CodexTerminalViewport
            websocketPath={terminalWebsocketPath}
            onDisconnected={handleDisconnected}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => void handleClose()} iconLeft={<Close />}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleLogoutSession(session.id)}
              loading={loggingOut}
              iconLeft={<Logout />}
            >
              Disconnect
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
