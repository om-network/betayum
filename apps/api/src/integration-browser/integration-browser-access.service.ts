import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BrowserViewerSessionStatus,
  CodexTerminalSessionStatus,
  db,
  Prisma,
} from '@db';

const ACTIVE_VIEWER_STATUSES: BrowserViewerSessionStatus[] = [
  BrowserViewerSessionStatus.provisioning,
  BrowserViewerSessionStatus.ready,
  BrowserViewerSessionStatus.active,
];
const ACTIVE_CODEX_STATUSES: CodexTerminalSessionStatus[] = [
  CodexTerminalSessionStatus.provisioning,
  CodexTerminalSessionStatus.ready,
  CodexTerminalSessionStatus.active,
];

@Injectable()
export class IntegrationBrowserAccessService {
  async claimViewerSession({
    browserVmId,
    connectionId,
    organizationId,
    userId,
    expiresAt,
  }: {
    browserVmId: string;
    connectionId: string;
    organizationId: string;
    userId: string;
    expiresAt: Date;
  }) {
    await db.browserViewerSession.updateMany({
      where: {
        leaseKey: organizationId,
        status: { in: ACTIVE_VIEWER_STATUSES },
        expiresAt: { lte: new Date() },
      },
      data: {
        leaseKey: null,
        status: BrowserViewerSessionStatus.expired,
      },
    });

    const existing = await db.browserViewerSession.findUnique({
      where: { leaseKey: organizationId },
    });
    if (existing) {
      return { claimed: false, session: existing };
    }

    try {
      const session = await db.browserViewerSession.create({
        data: {
          browserVmId,
          connectionId,
          expiresAt,
          leaseKey: organizationId,
          userId,
        },
      });
      return { claimed: true, session };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const session = await db.browserViewerSession.findUniqueOrThrow({
          where: { leaseKey: organizationId },
        });
        return { claimed: false, session };
      }
      throw error;
    }
  }

  async requireBrowserConnection({
    connectionId,
    organizationId,
  }: {
    connectionId: string;
    organizationId: string;
  }): Promise<void> {
    const connection = await db.integrationConnection.findFirst({
      where: {
        id: connectionId,
        organizationId,
        status: 'active',
        provider: { slug: { in: ['gcp', 'github'] } },
      },
      select: { id: true },
    });
    if (!connection) {
      throw new NotFoundException(
        'Active GCP or GitHub integration connection not found',
      );
    }
  }

  async claimCodexTerminalSession({
    browserVmId,
    connectionId,
    organizationId,
    userId,
    expiresAt,
  }: {
    browserVmId: string;
    connectionId: string;
    organizationId: string;
    userId: string;
    expiresAt: Date;
  }) {
    await db.codexTerminalSession.updateMany({
      where: {
        leaseKey: organizationId,
        status: { in: ACTIVE_CODEX_STATUSES },
        expiresAt: { lte: new Date() },
      },
      data: {
        leaseKey: null,
        status: CodexTerminalSessionStatus.expired,
      },
    });

    const existing = await db.codexTerminalSession.findUnique({
      where: { leaseKey: organizationId },
    });
    if (existing) {
      return { claimed: false, session: existing };
    }

    try {
      const session = await db.codexTerminalSession.create({
        data: {
          browserVmId,
          connectionId,
          expiresAt,
          leaseKey: organizationId,
          userId,
        },
      });
      return { claimed: true, session };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const session = await db.codexTerminalSession.findUniqueOrThrow({
          where: { leaseKey: organizationId },
        });
        return { claimed: false, session };
      }
      throw error;
    }
  }

  async requireViewerSession({
    sessionId,
    organizationId,
    userId,
  }: {
    sessionId: string;
    organizationId: string;
    userId: string;
  }) {
    const session = await db.browserViewerSession.findFirst({
      where: {
        id: sessionId,
        userId,
        browserVm: { organizationId },
      },
      include: { browserVm: true },
    });
    if (!session) {
      throw new NotFoundException('Browser viewer session not found');
    }
    return session;
  }

  async requireCodexTerminalSession({
    sessionId,
    organizationId,
    userId,
  }: {
    sessionId: string;
    organizationId: string;
    userId: string;
  }) {
    const session = await db.codexTerminalSession.findFirst({
      where: {
        id: sessionId,
        userId,
        browserVm: { organizationId },
      },
      include: { browserVm: true },
    });
    if (!session) {
      throw new NotFoundException('Codex terminal session not found');
    }
    return session;
  }
}
