import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { BrowserVmState, CodexTerminalSessionStatus, db } from '@db';
import { BrowserVmLifecycleService } from './browser-vm-lifecycle.service';
import { CodexSshService } from './codex-ssh.service';
import { GcpComputeService } from './gcp-compute.service';
import { IntegrationBrowserAccessService } from './integration-browser-access.service';
import type { CodexTerminalSessionResponse } from './integration-browser.types';
import { toCodexTerminalSessionResponse } from './integration-browser.types';

const ACTIVE_STATUSES: CodexTerminalSessionStatus[] = [
  CodexTerminalSessionStatus.provisioning,
  CodexTerminalSessionStatus.ready,
  CodexTerminalSessionStatus.active,
];
const SESSION_LIFETIME_MS = 30 * 60 * 1000;
const PROVISIONING_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class CodexTerminalService {
  constructor(
    private readonly access: IntegrationBrowserAccessService,
    private readonly compute: GcpComputeService,
    private readonly ssh: CodexSshService,
    private readonly vmLifecycle: BrowserVmLifecycleService,
  ) {}

  async createSession({
    connectionId,
    organizationId,
    userId,
  }: {
    connectionId: string;
    organizationId: string;
    userId: string;
  }): Promise<CodexTerminalSessionResponse> {
    await this.access.requireBrowserConnection({
      connectionId,
      organizationId,
    });
    const vm = await this.vmLifecycle.ensureVm(organizationId);
    const { claimed, session } = await this.access.claimCodexTerminalSession({
      browserVmId: vm.id,
      connectionId,
      organizationId,
      userId,
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
    });
    if (!claimed) {
      if (session.userId === userId && session.connectionId === connectionId) {
        return this.reconcileSession({
          sessionId: session.id,
          organizationId,
          userId,
        });
      }
      throw new ConflictException(
        'Another user is currently controlling Codex for this organization',
      );
    }
    return toCodexTerminalSessionResponse(session);
  }

  async reconcileSession({
    sessionId,
    organizationId,
    userId,
  }: {
    sessionId: string;
    organizationId: string;
    userId: string;
  }): Promise<CodexTerminalSessionResponse> {
    const session = await this.access.requireCodexTerminalSession({
      sessionId,
      organizationId,
      userId,
    });
    if (!ACTIVE_STATUSES.includes(session.status)) {
      return toCodexTerminalSessionResponse(session);
    }
    if (session.expiresAt <= new Date()) {
      return this.updateStatus({
        sessionId,
        status: CodexTerminalSessionStatus.expired,
      });
    }

    const instance = await this.compute.getInstance(
      session.browserVm.instanceName,
    );
    if (!instance) {
      return this.handleMissingInstance({
        sessionId,
        createdAt: session.createdAt,
        current: toCodexTerminalSessionResponse(session),
      });
    }
    if (instance.status === 'TERMINATED') {
      if (session.browserVm.state !== BrowserVmState.starting) {
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
      }
      return toCodexTerminalSessionResponse(session);
    }
    if (instance.status !== 'RUNNING' || !instance.internalIp) {
      return toCodexTerminalSessionResponse(session);
    }

    const vm = await db.organizationBrowserVm.update({
      where: { id: session.browserVmId },
      data: {
        state: BrowserVmState.running,
        instanceId: instance.id,
        internalIp: instance.internalIp,
        lastActivityAt: new Date(),
      },
    });
    try {
      const configured = await this.ssh.ensureConfigured(vm);
      const connected = await this.ssh.getStatus(configured);
      await db.organizationBrowserVm.update({
        where: { id: vm.id },
        data: { codexConfirmedAt: connected ? new Date() : null },
      });
    } catch {
      if (Date.now() - session.createdAt.getTime() > PROVISIONING_TIMEOUT_MS) {
        return this.failSession({
          sessionId,
          message: 'Codex terminal provisioning timed out',
        });
      }
      return toCodexTerminalSessionResponse(session);
    }
    if (session.status === CodexTerminalSessionStatus.active) {
      return toCodexTerminalSessionResponse(session);
    }
    return this.updateStatus({
      sessionId,
      status: CodexTerminalSessionStatus.ready,
    });
  }

  async logout({
    sessionId,
    organizationId,
    userId,
  }: {
    sessionId: string;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    const session = await this.access.requireCodexTerminalSession({
      sessionId,
      organizationId,
      userId,
    });
    if (!ACTIVE_STATUSES.includes(session.status)) {
      throw new BadRequestException('Codex terminal session is not active');
    }
    await this.ssh.logout(session.browserVm);
    await db.$transaction([
      db.organizationBrowserVm.update({
        where: { id: session.browserVmId },
        data: { codexConfirmedAt: null, lastActivityAt: new Date() },
      }),
      db.codexTerminalSession.update({
        where: { id: sessionId },
        data: {
          leaseKey: null,
          status: CodexTerminalSessionStatus.completed,
        },
      }),
    ]);
  }

  async cancel({
    sessionId,
    organizationId,
    userId,
  }: {
    sessionId: string;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    await this.access.requireCodexTerminalSession({
      sessionId,
      organizationId,
      userId,
    });
    await db.codexTerminalSession.update({
      where: { id: sessionId },
      data: {
        leaseKey: null,
        status: CodexTerminalSessionStatus.cancelled,
      },
    });
  }

  private async handleMissingInstance({
    sessionId,
    createdAt,
    current,
  }: {
    sessionId: string;
    createdAt: Date;
    current: CodexTerminalSessionResponse;
  }): Promise<CodexTerminalSessionResponse> {
    if (Date.now() - createdAt.getTime() <= PROVISIONING_TIMEOUT_MS) {
      return current;
    }
    return this.failSession({
      sessionId,
      message: 'Browser VM provisioning timed out',
    });
  }

  private async updateStatus({
    sessionId,
    status,
  }: {
    sessionId: string;
    status: CodexTerminalSessionStatus;
  }): Promise<CodexTerminalSessionResponse> {
    const session = await db.codexTerminalSession.update({
      where: { id: sessionId },
      data:
        status === CodexTerminalSessionStatus.expired
          ? { leaseKey: null, status }
          : { status },
    });
    return toCodexTerminalSessionResponse(session);
  }

  private async failSession({
    sessionId,
    message,
  }: {
    sessionId: string;
    message: string;
  }): Promise<CodexTerminalSessionResponse> {
    const session = await db.codexTerminalSession.update({
      where: { id: sessionId },
      data: {
        status: CodexTerminalSessionStatus.failed,
        errorMessage: message,
        leaseKey: null,
      },
    });
    return toCodexTerminalSessionResponse(session);
  }
}
