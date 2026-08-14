import { Injectable, Logger } from '@nestjs/common';
import { BrowserViewerSessionStatus, BrowserVmState, db } from '@db';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { auth, isTrustedOrigin } from '../auth/auth.server';
import { isPrivateIpv4 } from './browser-vm-network.util';
import { GcpComputeService } from './gcp-compute.service';

const VIEWER_PATH =
  /^\/v1\/integration-browser\/viewer-sessions\/([^/]+)\/vnc$/;

@Injectable()
export class BrowserVncProxyService {
  private readonly logger = new Logger(BrowserVncProxyService.name);
  private readonly websocketServer = new WebSocketServer({ noServer: true });

  constructor(private readonly compute: GcpComputeService) {}

  attach(server: {
    on(
      event: 'upgrade',
      listener: (
        request: IncomingMessage,
        socket: Duplex,
        head: Buffer,
      ) => void,
    ): void;
  }): void {
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '/', 'http://localhost');
      const match = VIEWER_PATH.exec(url.pathname);
      if (!match?.[1]) {
        return;
      }
      void this.handleUpgrade({
        request,
        socket,
        head,
        viewerSessionId: decodeURIComponent(match[1]),
      });
    });
  }

  private async handleUpgrade({
    request,
    socket,
    head,
    viewerSessionId,
  }: {
    request: IncomingMessage;
    socket: Duplex;
    head: Buffer;
    viewerSessionId: string;
  }): Promise<void> {
    try {
      const authorized = await this.authorize({
        request,
        viewerSessionId,
      });
      if (!authorized) {
        this.reject(socket, 403, 'Forbidden');
        return;
      }

      this.websocketServer.handleUpgrade(request, socket, head, (client) => {
        this.proxy({
          client,
          upstreamUrl: this.compute.getViewerWebSocketUrl({
            internalIp: authorized.internalIp,
          }),
          viewerSessionId,
          browserVmId: authorized.browserVmId,
        });
      });
    } catch (error) {
      this.logger.warn('VNC viewer upgrade rejected', {
        error: error instanceof Error ? error.message : String(error),
        viewerSessionId,
      });
      this.reject(socket, 401, 'Unauthorized');
    }
  }

  private async authorize({
    request,
    viewerSessionId,
  }: {
    request: IncomingMessage;
    viewerSessionId: string;
  }): Promise<{
    browserVmId: string;
    internalIp: string;
  } | null> {
    const origin = request.headers.origin;
    if (!origin || !(await isTrustedOrigin(origin))) {
      return null;
    }

    const cookie = request.headers.cookie;
    if (!cookie) {
      return null;
    }
    const headers = new Headers({ cookie });
    const session = await auth.api.getSession({ headers });
    const organizationId = session?.session.activeOrganizationId;
    const userId = session?.user.id;
    if (!organizationId || !userId) {
      return null;
    }

    const permissionBody = {
      permissions: { integration: ['update'] },
      permission: undefined,
    };
    const permission = await auth.api.hasPermission({
      headers,
      body: permissionBody,
    });
    if (permission.success !== true) {
      return null;
    }

    const viewerSession = await db.browserViewerSession.findFirst({
      where: {
        id: viewerSessionId,
        userId,
        expiresAt: { gt: new Date() },
        status: {
          in: [
            BrowserViewerSessionStatus.ready,
            BrowserViewerSessionStatus.active,
          ],
        },
        browserVm: {
          organizationId,
          state: BrowserVmState.running,
          internalIp: { not: null },
        },
      },
      include: { browserVm: true },
    });
    const internalIp = viewerSession?.browserVm.internalIp;
    if (!viewerSession || !internalIp || !isPrivateIpv4(internalIp)) {
      return null;
    }

    return {
      browserVmId: viewerSession.browserVmId,
      internalIp,
    };
  }

  private proxy({
    client,
    upstreamUrl,
    viewerSessionId,
    browserVmId,
  }: {
    client: WebSocket;
    upstreamUrl: string;
    viewerSessionId: string;
    browserVmId: string;
  }): void {
    const protocols = client.protocol ? [client.protocol] : undefined;
    const upstream = new WebSocket(upstreamUrl, protocols);
    const closeBoth = () => {
      if (
        client.readyState === WebSocket.OPEN ||
        client.readyState === WebSocket.CONNECTING
      ) {
        client.close();
      }
      if (
        upstream.readyState === WebSocket.OPEN ||
        upstream.readyState === WebSocket.CONNECTING
      ) {
        upstream.close();
      }
    };

    upstream.on('open', () => {
      void db.$transaction([
        db.browserViewerSession.update({
          where: { id: viewerSessionId },
          data: { status: BrowserViewerSessionStatus.active },
        }),
        db.organizationBrowserVm.update({
          where: { id: browserVmId },
          data: { lastActivityAt: new Date() },
        }),
      ]);
    });
    client.on('message', (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: isBinary });
      }
    });
    upstream.on('message', (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });
    client.on('close', closeBoth);
    client.on('error', closeBoth);
    upstream.on('close', closeBoth);
    upstream.on('error', (error) => {
      this.logger.warn('Private noVNC connection failed', {
        error: error.message,
        viewerSessionId,
      });
      closeBoth();
    });
  }

  private reject(socket: Duplex, status: number, message: string): void {
    socket.end(
      `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
  }

}
