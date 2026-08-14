import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { BrowserViewerSessionStatus, BrowserVmState, db } from '@db';
import { BrowserVmLifecycleService } from './browser-vm-lifecycle.service';
import { CodexStatusService } from './codex-status.service';
import { GcpComputeService } from './gcp-compute.service';
import { IntegrationBrowserAccessService } from './integration-browser-access.service';
import type {
  BrowserConnectionStatus,
  BrowserViewerSessionResponse,
} from './integration-browser.types';
import { toBrowserViewerSessionResponse } from './integration-browser.types';

const ACTIVE_VIEWER_STATUSES: BrowserViewerSessionStatus[] = [
  BrowserViewerSessionStatus.provisioning,
  BrowserViewerSessionStatus.ready,
  BrowserViewerSessionStatus.active,
];
const VIEWER_LIFETIME_MS = 30 * 60 * 1000;
const PROVISIONING_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class IntegrationBrowserService {
  constructor(
    private readonly access: IntegrationBrowserAccessService,
    private readonly codexStatus: CodexStatusService,
    private readonly compute: GcpComputeService,
    private readonly vmLifecycle: BrowserVmLifecycleService,
  ) {}

  async getConnectionStatus({
    connectionId,
    organizationId,
  }: {
    connectionId: string;
    organizationId: string;
  }): Promise<BrowserConnectionStatus> {
    await this.access.requireBrowserConnection({
      connectionId,
      organizationId,
    });
    const vm = await db.organizationBrowserVm.findUnique({
      where: { organizationId },
      select: {
        id: true,
        codexConfirmedAt: true,
        codexSshConfiguredAt: true,
        codexSshHostFingerprint: true,
        codexSshPrivateKeyEncrypted: true,
        codexSshPublicKey: true,
        instanceName: true,
        internalIp: true,
        state: true,
        viewerSessions: {
          where: {
            connectionId,
            status: BrowserViewerSessionStatus.completed,
          },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { completedAt: true },
        },
      },
    });
    const codexStatus = await this.codexStatus.getStatus(vm);

    return {
      codexConfirmedAt: vm?.codexConfirmedAt?.toISOString() ?? null,
      codexStatus,
      vmState: vm?.state ?? 'not_created',
      lastConfirmedAt:
        vm?.viewerSessions[0]?.completedAt?.toISOString() ?? null,
    };
  }

  async createViewerSession({
    connectionId,
    organizationId,
    userId,
  }: {
    connectionId: string;
    organizationId: string;
    userId: string;
  }): Promise<BrowserViewerSessionResponse> {
    await this.access.requireBrowserConnection({
      connectionId,
      organizationId,
    });
    const vm = await this.vmLifecycle.ensureVm(organizationId);
    const { claimed, session } = await this.access.claimViewerSession({
      browserVmId: vm.id,
      connectionId,
      organizationId,
      userId,
      expiresAt: new Date(Date.now() + VIEWER_LIFETIME_MS),
    });
    if (!claimed) {
      if (session.userId === userId && session.connectionId === connectionId) {
        return this.reconcileViewerSession({
          sessionId: session.id,
          organizationId,
          userId,
        });
      }
      throw new ConflictException(
        'Another user is currently controlling this organization browser',
      );
    }

    return toBrowserViewerSessionResponse(session);
  }

  async reconcileViewerSession({
    sessionId,
    organizationId,
    userId,
  }: {
    sessionId: string;
    organizationId: string;
    userId: string;
  }): Promise<BrowserViewerSessionResponse> {
    const session = await this.access.requireViewerSession({
      sessionId,
      organizationId,
      userId,
    });
    if (!ACTIVE_VIEWER_STATUSES.includes(session.status)) {
      return toBrowserViewerSessionResponse(session);
    }
    if (session.expiresAt <= new Date()) {
      return this.updateSessionStatus({
        sessionId,
        status: BrowserViewerSessionStatus.expired,
      });
    }

    const instance = await this.compute.getInstance(
      session.browserVm.instanceName,
    );
    if (!instance) {
      if (
        Date.now() - session.browserVm.createdAt.getTime() >
        PROVISIONING_TIMEOUT_MS
      ) {
        return this.failSession({
          sessionId,
          message: 'Browser VM provisioning timed out',
        });
      }
      return toBrowserViewerSessionResponse(session);
    }

    if (instance.status === 'TERMINATED') {
      if (session.browserVm.state === BrowserVmState.starting) {
        return toBrowserViewerSessionResponse(session);
      }
      const operationName = await this.compute.startInstance(instance.name);
      await db.organizationBrowserVm.update({
        where: { id: session.browserVmId },
        data: {
          state: BrowserVmState.starting,
          operationName,
          instanceId: instance.id,
          internalIp: instance.internalIp,
          errorMessage: null,
        },
      });
      return toBrowserViewerSessionResponse(session);
    }

    if (instance.status !== 'RUNNING' || !instance.internalIp) {
      return toBrowserViewerSessionResponse(session);
    }

    const ready = await this.compute.isViewerReady(instance.internalIp);
    await db.organizationBrowserVm.update({
      where: { id: session.browserVmId },
      data: {
        state: BrowserVmState.running,
        instanceId: instance.id,
        internalIp: instance.internalIp,
        lastActivityAt: new Date(),
      },
    });
    if (!ready || session.status === BrowserViewerSessionStatus.active) {
      return toBrowserViewerSessionResponse(session);
    }

    return this.updateSessionStatus({
      sessionId,
      status: BrowserViewerSessionStatus.ready,
    });
  }

  async completeViewerSession({
    sessionId,
    organizationId,
    userId,
  }: {
    sessionId: string;
    organizationId: string;
    userId: string;
  }): Promise<BrowserViewerSessionResponse> {
    const current = await this.access.requireViewerSession({
      sessionId,
      organizationId,
      userId,
    });
    if (
      !ACTIVE_VIEWER_STATUSES.includes(current.status) ||
      current.expiresAt <= new Date()
    ) {
      throw new BadRequestException(
        'Browser viewer session is no longer active',
      );
    }
    const [session] = await db.$transaction([
      db.browserViewerSession.update({
        where: { id: sessionId },
        data: {
          status: BrowserViewerSessionStatus.completed,
          completedAt: new Date(),
          leaseKey: null,
        },
      }),
      db.organizationBrowserVm.update({
        where: { id: current.browserVmId },
        data: { lastActivityAt: new Date() },
      }),
    ]);
    return toBrowserViewerSessionResponse(session);
  }

  async cancelViewerSession({
    sessionId,
    organizationId,
    userId,
  }: {
    sessionId: string;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    await this.access.requireViewerSession({
      sessionId,
      organizationId,
      userId,
    });
    await db.browserViewerSession.update({
      where: { id: sessionId },
      data: {
        leaseKey: null,
        status: BrowserViewerSessionStatus.cancelled,
      },
    });
  }

  private async updateSessionStatus({
    sessionId,
    status,
  }: {
    sessionId: string;
    status: BrowserViewerSessionStatus;
  }): Promise<BrowserViewerSessionResponse> {
    const session = await db.browserViewerSession.update({
      where: { id: sessionId },
      data:
        status === BrowserViewerSessionStatus.expired
          ? { leaseKey: null, status }
          : { status },
    });
    return toBrowserViewerSessionResponse(session);
  }

  private async failSession({
    sessionId,
    message,
  }: {
    sessionId: string;
    message: string;
  }): Promise<BrowserViewerSessionResponse> {
    const session = await db.browserViewerSession.update({
      where: { id: sessionId },
      data: {
        status: BrowserViewerSessionStatus.failed,
        errorMessage: message,
        leaseKey: null,
      },
    });
    return toBrowserViewerSessionResponse(session);
  }
}
