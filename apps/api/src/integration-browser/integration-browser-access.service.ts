import { Injectable, NotFoundException } from '@nestjs/common';
import { BrowserViewerSessionStatus, db, Prisma } from '@db';

const ACTIVE_VIEWER_STATUSES: BrowserViewerSessionStatus[] = [
  BrowserViewerSessionStatus.provisioning,
  BrowserViewerSessionStatus.ready,
  BrowserViewerSessionStatus.active,
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

  async requireGcpConnection({
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
        provider: { slug: 'gcp' },
      },
      select: { id: true },
    });
    if (!connection) {
      throw new NotFoundException(
        'Active GCP integration connection not found',
      );
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
}
