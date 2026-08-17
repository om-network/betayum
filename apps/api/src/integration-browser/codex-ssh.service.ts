import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { db, type Prisma } from '@db';
import { Client, type ClientChannel, type ConnectConfig, utils } from 'ssh2';
import { z } from 'zod';
import {
  decrypt,
  encrypt,
  type EncryptedData,
} from '../secrets/encryption.util';
import { GcpComputeService } from './gcp-compute.service';

const encryptedDataSchema = z.object({
  encrypted: z.string(),
  iv: z.string(),
  salt: z.string(),
  tag: z.string(),
});
const SSH_CONNECT_ATTEMPTS = 10;
const SSH_RETRY_MS = 500;
const SSH_COMMAND_TIMEOUT_MS = 15_000;

export interface CodexSshVm {
  codexSshConfiguredAt: Date | null;
  codexSshHostFingerprint: string | null;
  codexSshPrivateKeyEncrypted: Prisma.JsonValue | null;
  codexSshPublicKey: string | null;
  id: string;
  instanceName: string;
  internalIp: string | null;
  organizationId?: string;
}

export interface CodexSshTerminal {
  client: Client;
  stream: ClientChannel;
}

export interface CodexAutomationRequest {
  apiBaseUrl: string;
  capabilityToken: string;
  evidenceDescription: string;
  prompt: string;
  runId: string;
}

@Injectable()
export class CodexSshService {
  constructor(private readonly compute: GcpComputeService) {}

  async ensureConfigured(vm: CodexSshVm): Promise<CodexSshVm> {
    let privateKeyEncrypted = vm.codexSshPrivateKeyEncrypted;
    let publicKey = vm.codexSshPublicKey;
    let privateKey: string;

    if (privateKeyEncrypted) {
      privateKey = this.decryptPrivateKey(privateKeyEncrypted);
      publicKey ??= this.toPublicKey(privateKey);
    } else {
      privateKey = await this.generatePrivateKey();
      publicKey = this.toPublicKey(privateKey);
      privateKeyEncrypted = this.encryptPrivateKey(privateKey);
      await db.organizationBrowserVm.update({
        where: { id: vm.id },
        data: {
          codexSshPrivateKeyEncrypted: privateKeyEncrypted,
          codexSshPublicKey: publicKey,
        },
      });
    }

    if (vm.codexSshConfiguredAt) {
      return {
        ...vm,
        codexSshPrivateKeyEncrypted: privateKeyEncrypted,
        codexSshPublicKey: publicKey,
      };
    }

    await this.compute.setMetadataItem({
      instanceName: vm.instanceName,
      key: 'betayum-codex-ssh-public-key',
      value: publicKey,
    });
    const codexSshConfiguredAt = new Date();
    await db.organizationBrowserVm.update({
      where: { id: vm.id },
      data: {
        codexSshConfiguredAt,
        codexSshPublicKey: publicKey,
      },
    });
    return {
      ...vm,
      codexSshConfiguredAt,
      codexSshPrivateKeyEncrypted: privateKeyEncrypted,
      codexSshPublicKey: publicKey,
    };
  }

  async getStatus(vm: CodexSshVm): Promise<boolean> {
    return (await this.execute({ vm, command: 'status' })) === 0;
  }

  async logout(vm: CodexSshVm): Promise<void> {
    const exitCode = await this.execute({ vm, command: 'logout' });
    if (exitCode !== 0) {
      throw new ServiceUnavailableException('Codex logout failed');
    }
  }

  async runAutomation({
    request,
    vm,
  }: {
    request: CodexAutomationRequest;
    vm: CodexSshVm;
  }): Promise<void> {
    const client = await this.connect(await this.ensureConfigured(vm));
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        client.end();
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(() => {
        finish(new Error('Codex automation SSH command timed out'));
      }, SSH_COMMAND_TIMEOUT_MS);
      client.exec('automation', (error, stream) => {
        if (error) {
          finish(error);
          return;
        }
        let stdout = '';
        let stderr = '';
        stream.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8');
          if (stdout.includes('Automation dispatched.')) finish();
        });
        stream.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8');
        });
        stream.once('error', (streamError) => {
          finish(streamError);
        });
        stream.once('close', (code: number) => {
          if (code === 0) {
            finish();
            return;
          }
          finish(
            new Error(stderr.trim() || `Codex automation exited with ${code}`),
          );
        });
        stream.end(JSON.stringify(request));
      });
    });
  }

  async openTerminal({
    vm,
    cols,
    rows,
  }: {
    vm: CodexSshVm;
    cols: number;
    rows: number;
  }): Promise<CodexSshTerminal> {
    const client = await this.connect(await this.ensureConfigured(vm));
    return new Promise((resolve, reject) => {
      client.shell({ cols, rows, term: 'xterm-256color' }, (error, stream) => {
        if (error) {
          client.end();
          reject(error);
          return;
        }
        resolve({ client, stream });
      });
    });
  }

  private async execute({
    vm,
    command,
  }: {
    vm: CodexSshVm;
    command: 'status' | 'logout';
  }): Promise<number> {
    const client = await this.connect(await this.ensureConfigured(vm));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error(`Codex SSH ${command} command timed out`));
      }, SSH_COMMAND_TIMEOUT_MS);
      client.exec(command, (error, stream) => {
        if (error) {
          clearTimeout(timeout);
          client.end();
          reject(error);
          return;
        }
        let exitCode = 1;
        stream.on('exit', (code: number) => {
          exitCode = code;
        });
        stream.on('error', (streamError) => {
          clearTimeout(timeout);
          client.end();
          reject(streamError);
        });
        stream.on('close', () => {
          clearTimeout(timeout);
          client.end();
          resolve(exitCode);
        });
        stream.resume();
        stream.stderr.resume();
      });
    });
  }

  private async connect(vm: CodexSshVm): Promise<Client> {
    if (!vm.internalIp || !vm.codexSshPrivateKeyEncrypted) {
      throw new ServiceUnavailableException('Browser VM SSH is not ready');
    }
    const privateKey = this.decryptPrivateKey(vm.codexSshPrivateKeyEncrypted);
    const target = this.compute.getSshTarget({ internalIp: vm.internalIp });
    let lastError: unknown;

    for (let attempt = 1; attempt <= SSH_CONNECT_ATTEMPTS; attempt++) {
      try {
        return await this.connectOnce({
          config: {
            ...target,
            username: 'betayum-codex',
            privateKey,
            hostHash: 'sha256',
            keepaliveInterval: 10_000,
            keepaliveCountMax: 3,
            readyTimeout: 5_000,
          },
          vm,
        });
      } catch (error) {
        lastError = error;
        if (attempt < SSH_CONNECT_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, SSH_RETRY_MS));
        }
      }
    }
    throw new ServiceUnavailableException(
      lastError instanceof Error
        ? `Browser VM SSH is unavailable: ${lastError.message}`
        : 'Browser VM SSH is unavailable',
    );
  }

  private connectOnce({
    config,
    vm,
  }: {
    config: ConnectConfig;
    vm: CodexSshVm;
  }): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      let observedFingerprint: string | null = null;
      client
        .once('ready', () => {
          if (observedFingerprint && !vm.codexSshHostFingerprint) {
            void db.organizationBrowserVm
              .update({
                where: { id: vm.id },
                data: { codexSshHostFingerprint: observedFingerprint },
              })
              .then(() => resolve(client))
              .catch((error: unknown) => {
                client.end();
                reject(
                  error instanceof Error
                    ? error
                    : new Error('Failed to save Codex SSH host fingerprint'),
                );
              });
            return;
          }
          resolve(client);
        })
        // ssh2 can emit another connection error while tearing down a failed
        // handshake. Keep the listener installed so that late errors reject
        // this already-settled promise instead of crashing the Nest process.
        .on('error', reject)
        .connect({
          ...config,
          hostVerifier: (fingerprint: string) => {
            observedFingerprint = fingerprint;
            return (
              !vm.codexSshHostFingerprint ||
              vm.codexSshHostFingerprint === fingerprint
            );
          },
        });
    });
  }

  private generatePrivateKey(): Promise<string> {
    return new Promise((resolve, reject) => {
      utils.generateKeyPair(
        'ed25519',
        { comment: 'betayum-codex' },
        (error, keyPair) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(keyPair.private);
        },
      );
    });
  }

  private toPublicKey(privateKey: string): string {
    const parsed = utils.parseKey(privateKey);
    if (parsed instanceof Error || !parsed.isPrivateKey()) {
      throw new ServiceUnavailableException('Generated SSH key is invalid');
    }
    return `${parsed.type} ${parsed.getPublicSSH().toString('base64')} betayum-codex`;
  }

  private encryptPrivateKey(privateKey: string): Prisma.JsonObject {
    const value = encrypt(privateKey);
    return {
      encrypted: value.encrypted,
      iv: value.iv,
      salt: value.salt,
      tag: value.tag,
    };
  }

  private decryptPrivateKey(value: Prisma.JsonValue): string {
    const encrypted: EncryptedData = encryptedDataSchema.parse(value);
    return decrypt(encrypted);
  }
}
