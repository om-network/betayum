import { Injectable, Logger } from '@nestjs/common';
import { BrowserVmState, CodexTerminalSessionStatus, db } from '@db';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { RawData } from 'ws';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { auth, isTrustedOrigin } from '../auth/auth.server';
import { isPrivateIpv4 } from './browser-vm-network.util';
import { CodexSshService } from './codex-ssh.service';

const TERMINAL_PATH =
  /^\/v1\/integration-browser\/codex-sessions\/([^/]+)\/terminal$/;
const resizeMessageSchema = z.object({
  type: z.literal('resize'),
  cols: z.number().int().min(20).max(300),
  rows: z.number().int().min(5).max(120),
});

@Injectable()
export class CodexTerminalProxyService {
  private readonly logger = new Logger(CodexTerminalProxyService.name);
  private readonly websocketServer = new WebSocketServer({ noServer: true });

  constructor(private readonly ssh: CodexSshService) {}

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
      const match = TERMINAL_PATH.exec(url.pathname);
      if (!match?.[1]) {
        return;
      }
      void this.handleUpgrade({
        request,
        socket,
        head,
        sessionId: decodeURIComponent(match[1]),
      });
    });
  }

  private async handleUpgrade({
    request,
    socket,
    head,
    sessionId,
  }: {
    request: IncomingMessage;
    socket: Duplex;
    head: Buffer;
    sessionId: string;
  }): Promise<void> {
    try {
      const authorized = await this.authorize({ request, sessionId });
      if (!authorized) {
        this.reject(socket, 403, 'Forbidden');
        return;
      }
      this.websocketServer.handleUpgrade(request, socket, head, (client) => {
        void this.proxy({ client, session: authorized });
      });
    } catch (error) {
      this.logger.warn('Codex terminal upgrade rejected', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
      this.reject(socket, 401, 'Unauthorized');
    }
  }

  private async authorize({
    request,
    sessionId,
  }: {
    request: IncomingMessage;
    sessionId: string;
  }) {
    const origin = request.headers.origin;
    const cookie = request.headers.cookie;
    if (!origin || !cookie || !(await isTrustedOrigin(origin))) {
      return null;
    }
    const headers = new Headers({ cookie });
    const authSession = await auth.api.getSession({ headers });
    const organizationId = authSession?.session.activeOrganizationId;
    const userId = authSession?.user.id;
    if (!organizationId || !userId) {
      return null;
    }
    const permission = await auth.api.hasPermission({
      headers,
      body: {
        permissions: { integration: ['update'] },
      },
    });
    if (permission.success !== true) {
      return null;
    }

    const session = await db.codexTerminalSession.findFirst({
      where: {
        id: sessionId,
        userId,
        expiresAt: { gt: new Date() },
        status: {
          in: [
            CodexTerminalSessionStatus.ready,
            CodexTerminalSessionStatus.active,
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
    const internalIp = session?.browserVm.internalIp;
    if (!session || !internalIp || !isPrivateIpv4(internalIp)) {
      return null;
    }
    return session;
  }

  private async proxy({
    client,
    session,
  }: {
    client: WebSocket;
    session: NonNullable<
      Awaited<ReturnType<CodexTerminalProxyService['authorize']>>
    >;
  }): Promise<void> {
    try {
      const terminal = await this.ssh.openTerminal({
        vm: session.browserVm,
        cols: 120,
        rows: 30,
      });
      await db.$transaction([
        db.codexTerminalSession.update({
          where: { id: session.id },
          data: { status: CodexTerminalSessionStatus.active },
        }),
        db.organizationBrowserVm.update({
          where: { id: session.browserVmId },
          data: { lastActivityAt: new Date() },
        }),
      ]);

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        terminal.stream.end();
        terminal.client.end();
        if (
          client.readyState === WebSocket.OPEN ||
          client.readyState === WebSocket.CONNECTING
        ) {
          client.close();
        }
        void this.completeSession(session.id);
      };

      client.on('message', (data, isBinary) => {
        if (isBinary) {
          terminal.stream.write(this.toBuffer(data));
          return;
        }
        const parsed = resizeMessageSchema.safeParse(
          this.parseMessage(data),
        );
        if (parsed.success) {
          terminal.stream.setWindow(
            parsed.data.rows,
            parsed.data.cols,
            0,
            0,
          );
        }
      });
      terminal.stream.on('data', (data: Buffer) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: true });
        }
      });
      terminal.stream.stderr.on('data', (data: Buffer) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: true });
        }
      });
      client.on('close', close);
      client.on('error', close);
      terminal.stream.on('close', close);
      terminal.stream.on('error', close);
      terminal.client.on('error', close);
    } catch (error) {
      this.logger.warn('Codex SSH terminal connection failed', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: session.id,
      });
      if (client.readyState === WebSocket.OPEN) {
        client.close(1011, 'Codex terminal unavailable');
      }
      await this.completeSession(session.id);
    }
  }

  private async completeSession(sessionId: string): Promise<void> {
    await db.codexTerminalSession.updateMany({
      where: {
        id: sessionId,
        status: {
          in: [
            CodexTerminalSessionStatus.ready,
            CodexTerminalSessionStatus.active,
          ],
        },
      },
      data: {
        leaseKey: null,
        status: CodexTerminalSessionStatus.completed,
      },
    });
  }

  private parseMessage(data: RawData): unknown {
    try {
      return JSON.parse(this.toBuffer(data).toString('utf8'));
    } catch {
      return null;
    }
  }

  private toBuffer(data: RawData): Buffer {
    if (Array.isArray(data)) {
      return Buffer.concat(data);
    }
    if (data instanceof ArrayBuffer) {
      return Buffer.from(new Uint8Array(data));
    }
    return Buffer.from(data);
  }

  private reject(socket: Duplex, status: number, message: string): void {
    socket.end(
      `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
  }

}
