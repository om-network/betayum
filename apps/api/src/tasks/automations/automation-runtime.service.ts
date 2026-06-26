import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

const networkPolicySchema = z.enum(['approved_hosts_only', 'deny_all']);

const secretRefSchema = z
  .object({
    name: z.string().min(1),
    category: z.string().min(1).optional(),
  })
  .strict();

const toolSchema = z
  .object({
    type: z.enum(['http', 'browser', 'firecrawl', 'exa']),
    allowedHosts: z.array(z.string().min(1)).optional(),
  })
  .strict();

const sandboxSchema = z
  .object({
    timeoutMs: z.number().int().positive().max(300000),
    networkPolicy: networkPolicySchema,
  })
  .strict();

const executionRequestSchema = z
  .object({
    organizationId: z.string().min(1),
    taskId: z.string().min(1),
    automationId: z.string().min(1),
    runId: z.string().min(1),
    version: z.number().int().positive(),
    artifactKey: z.string().min(1),
    trigger: z.enum(['manual', 'test']),
    secretRefs: z.array(secretRefSchema).default([]),
    tools: z.array(toolSchema).default([]),
    sandbox: sandboxSchema.default({
      timeoutMs: 120000,
      networkPolicy: 'approved_hosts_only',
    }),
  })
  .strict();

export type AutomationAvailability =
  | 'enabled'
  | 'disabled'
  | 'execution_disabled'
  | 'unhealthy';

export interface AutomationServiceState {
  availability: AutomationAvailability;
  generationEnabled: boolean;
  executionEnabled: boolean;
  workerHealthy: boolean;
}

export type AutomationExecutionRequest = z.infer<typeof executionRequestSchema>;

@Injectable()
export class AutomationRuntimeService {
  getServiceState(): { success: true; state: AutomationServiceState } {
    const generationEnabled = this.isEnabled('TASK_AUTOMATIONS_ENABLED');
    const executionSwitchEnabled = this.isEnabled(
      'TASK_AUTOMATION_EXECUTION_ENABLED',
    );
    const workerHealthy =
      process.env.TASK_AUTOMATION_WORKER_HEALTH !== 'unhealthy' &&
      !!process.env.TASK_AUTOMATION_WORKER_QUEUE_URL;
    const executionEnabled = generationEnabled && executionSwitchEnabled;

    return {
      success: true,
      state: {
        availability: this.getAvailability({
          generationEnabled,
          executionEnabled,
          workerHealthy,
        }),
        generationEnabled,
        executionEnabled,
        workerHealthy,
      },
    };
  }

  buildExecutionRequest(input: unknown): AutomationExecutionRequest {
    const result = executionRequestSchema.safeParse(input);

    if (!result.success) {
      throw new ServiceUnavailableException(
        'Automation worker request contains unsupported inputs',
      );
    }

    const unsafeHost = result.data.tools
      .flatMap((tool) => tool.allowedHosts ?? [])
      .find((host) => this.isInternalHost(host));

    if (unsafeHost) {
      throw new ServiceUnavailableException(
        'Automation worker request targets an internal network host',
      );
    }

    return result.data;
  }

  assertExecutionAvailable(): void {
    const { state } = this.getServiceState();

    if (state.availability === 'enabled') {
      return;
    }

    throw new ServiceUnavailableException(
      'Task automation execution is unavailable',
    );
  }

  sanitizeRunOutput(value: unknown): unknown {
    return this.sanitizeValue({ value });
  }

  private getAvailability({
    generationEnabled,
    executionEnabled,
    workerHealthy,
  }: {
    generationEnabled: boolean;
    executionEnabled: boolean;
    workerHealthy: boolean;
  }): AutomationAvailability {
    if (!generationEnabled) {
      return 'disabled';
    }

    if (!workerHealthy) {
      return 'unhealthy';
    }

    if (!executionEnabled) {
      return 'execution_disabled';
    }

    return 'enabled';
  }

  private isEnabled(name: string): boolean {
    return process.env[name] !== 'false';
  }

  private sanitizeValue({
    value,
    key,
  }: {
    value: unknown;
    key?: string;
  }): unknown {
    if (key && this.isSensitiveKey(key)) {
      return '[redacted]';
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue({ value: item }));
    }

    if (!this.isRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        this.sanitizeValue({ value: entryValue, key: entryKey }),
      ]),
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isSensitiveKey(key: string): boolean {
    return /token|secret|password|authorization|cookie|api[-_]?key/i.test(key);
  }

  private isInternalHost(host: string): boolean {
    const normalized = this.getHostname(host);

    if (
      normalized === 'localhost' ||
      normalized === '0.0.0.0' ||
      normalized === '::1' ||
      normalized === 'metadata.google.internal' ||
      normalized.endsWith('.local')
    ) {
      return true;
    }

    if (
      normalized.startsWith('127.') ||
      normalized.startsWith('10.') ||
      normalized.startsWith('192.168.') ||
      normalized.startsWith('169.254.')
    ) {
      return true;
    }

    const private172Match = normalized.match(/^172\.(\d{1,2})\./);
    if (!private172Match) {
      return false;
    }

    const octet = Number(private172Match[1]);
    return octet >= 16 && octet <= 31;
  }

  private getHostname(host: string): string {
    const normalized = host.toLowerCase().trim();

    try {
      return new URL(
        normalized.includes('://') ? normalized : `http://${normalized}`,
      ).hostname;
    } catch {
      return normalized.replace(/:\d+$/, '');
    }
  }
}
