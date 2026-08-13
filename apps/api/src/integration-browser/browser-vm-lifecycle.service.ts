import { Injectable } from '@nestjs/common';
import { BrowserVmState, db, Prisma } from '@db';
import { createHash } from 'node:crypto';
import { GcpComputeService } from './gcp-compute.service';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

@Injectable()
export class BrowserVmLifecycleService {
  constructor(private readonly compute: GcpComputeService) {}

  async ensureVm(organizationId: string) {
    const existing = await db.organizationBrowserVm.findUnique({
      where: { organizationId },
    });
    if (existing) {
      if (existing.state === BrowserVmState.error) {
        const instance = await this.compute.getInstance(existing.instanceName);
        if (!instance) {
          const operationName = await this.compute.createInstance(
            existing.instanceName,
          );
          return db.organizationBrowserVm.update({
            where: { id: existing.id },
            data: {
              errorMessage: null,
              operationName,
              state: BrowserVmState.provisioning,
            },
          });
        }
      }
      return existing;
    }

    const instanceName = this.buildInstanceName(organizationId);
    let vm;
    try {
      vm = await db.organizationBrowserVm.create({
        data: {
          organizationId,
          projectId: this.compute.projectId,
          zone: this.compute.zone,
          instanceName,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return db.organizationBrowserVm.findUniqueOrThrow({
          where: { organizationId },
        });
      }
      throw error;
    }

    try {
      const operationName = await this.compute.createInstance(instanceName);
      return await db.organizationBrowserVm.update({
        where: { id: vm.id },
        data: { operationName },
      });
    } catch (error) {
      await db.organizationBrowserVm.update({
        where: { id: vm.id },
        data: {
          state: BrowserVmState.error,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown browser VM error',
        },
      });
      throw error;
    }
  }

  async stopIdleVm(organizationId: string): Promise<boolean> {
    const idleBefore = new Date(Date.now() - IDLE_TIMEOUT_MS);
    const vm = await db.organizationBrowserVm.findFirst({
      where: {
        organizationId,
        state: BrowserVmState.running,
        lastActivityAt: { lte: idleBefore },
        viewerSessions: {
          none: {
            status: { in: ['provisioning', 'ready', 'active'] },
            expiresAt: { gt: new Date() },
          },
        },
      },
    });
    if (!vm) {
      return false;
    }

    const operationName = await this.compute.stopInstance(vm.instanceName);
    await db.organizationBrowserVm.update({
      where: { id: vm.id },
      data: {
        state: BrowserVmState.stopping,
        operationName,
      },
    });
    return true;
  }

  private buildInstanceName(organizationId: string): string {
    const suffix = createHash('sha256')
      .update(organizationId)
      .digest('hex')
      .slice(0, 16);
    return `betayum-browser-${suffix}`;
  }
}
