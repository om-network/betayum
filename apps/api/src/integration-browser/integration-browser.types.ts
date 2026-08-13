import type {
  BrowserViewerSessionStatus,
  BrowserVmState,
  CodexTerminalSessionStatus,
} from '@db';

export interface BrowserConnectionStatus {
  codexConfirmedAt: string | null;
  codexStatus: 'connected' | 'disconnected' | 'unavailable';
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

export interface CodexTerminalSessionResponse {
  error: string | null;
  expiresAt: string;
  id: string;
  status: CodexTerminalSessionStatus;
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

export function toCodexTerminalSessionResponse(session: {
  errorMessage: string | null;
  expiresAt: Date;
  id: string;
  status: CodexTerminalSessionStatus;
}): CodexTerminalSessionResponse {
  const canConnect = session.status === 'ready' || session.status === 'active';
  return {
    id: session.id,
    status: session.status,
    expiresAt: session.expiresAt.toISOString(),
    error: session.errorMessage,
    websocketPath: canConnect
      ? `/v1/integration-browser/codex-sessions/${session.id}/terminal`
      : null,
  };
}
