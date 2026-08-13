import type { BrowserViewerSessionStatus, BrowserVmState } from '@db';

export interface BrowserConnectionStatus {
  lastConfirmedAt: string | null;
  vmState: BrowserVmState | 'not_created';
}

export interface BrowserViewerSessionResponse {
  error: string | null;
  expiresAt: string;
  id: string;
  status: BrowserViewerSessionStatus;
  websocketPath: string | null;
}

export function toBrowserViewerSessionResponse(session: {
  errorMessage: string | null;
  expiresAt: Date;
  id: string;
  status: BrowserViewerSessionStatus;
}): BrowserViewerSessionResponse {
  const canConnect = session.status === 'ready' || session.status === 'active';
  return {
    id: session.id,
    status: session.status,
    expiresAt: session.expiresAt.toISOString(),
    error: session.errorMessage,
    websocketPath: canConnect
      ? `/v1/integration-browser/viewer-sessions/${session.id}/vnc`
      : null,
  };
}
