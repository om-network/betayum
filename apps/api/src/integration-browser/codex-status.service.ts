import { Injectable } from '@nestjs/common';
import { BrowserVmState, db, type Prisma } from '@db';
import { CodexSshService } from './codex-ssh.service';

interface CodexStatusVm {
  codexConfirmedAt: Date | null;
  codexSshConfiguredAt: Date | null;
  codexSshHostFingerprint: string | null;
  codexSshPrivateKeyEncrypted: Prisma.JsonValue | null;
  codexSshPublicKey: string | null;
  id: string;
  instanceName: string;
  internalIp: string | null;
  state: BrowserVmState;
}

export type CodexConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'unavailable';

@Injectable()
export class CodexStatusService {
  constructor(private readonly ssh: CodexSshService) {}

  async getStatus(vm: CodexStatusVm | null): Promise<CodexConnectionStatus> {
    if (!vm) {
      return 'disconnected';
    }
    if (vm.state !== BrowserVmState.running) {
      return vm.codexConfirmedAt ? 'connected' : 'disconnected';
    }
    if (
      !vm.internalIp ||
      !vm.codexSshConfiguredAt ||
      !vm.codexSshPrivateKeyEncrypted
    ) {
      return 'disconnected';
    }
    try {
      const connected = await this.ssh.getStatus(vm);
      if (connected !== Boolean(vm.codexConfirmedAt)) {
        await db.organizationBrowserVm.update({
          where: { id: vm.id },
          data: { codexConfirmedAt: connected ? new Date() : null },
        });
      }
      return connected ? 'connected' : 'disconnected';
    } catch {
      return 'unavailable';
    }
  }
}
