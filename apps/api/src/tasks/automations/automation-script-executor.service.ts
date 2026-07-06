import { Injectable, Logger } from '@nestjs/common';
import { db } from '@db';
import { exec } from 'child_process';
import { unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { decrypt, type EncryptedData } from '../../secrets/encryption.util';
import type { AutomationExecutionRequest } from './automation-runtime.service';
import { ConnectionService } from '../../integration-platform/services/connection.service';
import { OAuthCredentialsService } from '../../integration-platform/services/oauth-credentials.service';
import { CredentialVaultService } from '../../integration-platform/services/credential-vault.service';

const execAsync = promisify(exec);
const logger = new Logger('AutomationScriptExecutor');

async function fetchScriptContent(automationId: string, version: number): Promise<string | null> {
  if (version === 0) {
    const automation = await db.evidenceAutomation.findUnique({
      where: { id: automationId },
      select: { scriptDraft: true },
    });
    return automation?.scriptDraft ?? null;
  }

  const record = await db.evidenceAutomationVersion.findFirst({
    where: { evidenceAutomationId: automationId, version },
    select: { scriptContent: true },
  });

  if (record?.scriptContent) return record.scriptContent;

  const automation = await db.evidenceAutomation.findUnique({
    where: { id: automationId },
    select: { scriptDraft: true },
  });
  return automation?.scriptDraft ?? null;
}

async function resolveSecrets(
  organizationId: string,
  secretRefs: { name: string; category?: string }[],
): Promise<Record<string, string>> {
  if (secretRefs.length === 0) return {};

  const secrets = await db.secret.findMany({
    where: {
      organizationId,
      OR: secretRefs.map((ref) => ({
        name: ref.name,
        ...(ref.category ? { category: ref.category } : {}),
      })),
    },
    select: { name: true, value: true },
  });

  const env: Record<string, string> = {};
  for (const secret of secrets) {
    try {
      const parsed = JSON.parse(secret.value) as EncryptedData;
      env[secret.name] = decrypt(parsed);
    } catch {
      logger.warn(`Failed to decrypt secret: ${secret.name}`);
    }
  }
  return env;
}

async function runPython(script: string, env: Record<string, string>) {
  const scriptPath = join(tmpdir(), `aut_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);

  try {
    await writeFile(scriptPath, script, 'utf8');

    const { stdout, stderr } = await execAsync(`python3 "${scriptPath}"`, {
      timeout: 60_000,
      env: { ...process.env, ...env },
    });

    const logs = stderr ? stderr.split('\n').filter(Boolean) : [];

    try {
      const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
      return {
        success: parsed.success === true,
        output: parsed.data ?? parsed,
        error: typeof parsed.error === 'string' ? parsed.error : undefined,
        logs,
      };
    } catch {
      return { success: true, output: { raw: stdout.trim() }, logs };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, output: null, error: message, logs: [] };
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}

@Injectable()
export class AutomationScriptExecutorService {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly oauthCredentialsService: OAuthCredentialsService,
    private readonly credentialVaultService: CredentialVaultService,
  ) {}

  private async resolveIntegrationTokens(organizationId: string): Promise<Record<string, string>> {
    try {
      const connection = await this.connectionService.getConnectionByProviderSlug('gcp', organizationId);
      if (!connection || connection.status !== 'active') return {};

      const oauthCreds = await this.oauthCredentialsService.getCredentials('gcp', organizationId);
      if (!oauthCreds) return {};

      const token = await this.credentialVaultService.getValidAccessToken(connection.id, {
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: oauthCreds.clientId,
        clientSecret: oauthCreds.clientSecret,
        clientAuthMethod: 'body',
      });
      if (!token) return {};

      return { GCP_ACCESS_TOKEN: token };
    } catch {
      return {};
    }
  }

  async executeInBackground(request: AutomationExecutionRequest): Promise<void> {
    setImmediate(() => void this.execute(request));
  }

  private async execute(request: AutomationExecutionRequest): Promise<void> {
    const { organizationId, automationId, runId, version, secretRefs } = request;

    try {
      await db.evidenceAutomationRun.update({
        where: { id: runId },
        data: { status: 'running', startedAt: new Date() },
      });

      const scriptContent = await fetchScriptContent(automationId, version);

      if (!scriptContent) {
        throw new Error('No script content found — save a draft or publish first');
      }

      logger.log(`Executing script for automation ${automationId} v${version}`);

      const [secrets, integrationTokens] = await Promise.all([
        resolveSecrets(organizationId, secretRefs),
        this.resolveIntegrationTokens(organizationId),
      ]);
      const env = { ...secrets, ...integrationTokens };
      const result = await runPython(scriptContent, env);

      await db.evidenceAutomationRun.update({
        where: { id: runId },
        data: {
          status: result.success ? 'completed' : 'failed',
          success: result.success,
          output: result.output as never,
          error: result.error ?? null,
          logs: result.logs as never,
          completedAt: new Date(),
        },
      });

      logger.log(`Run ${runId} ${result.success ? 'completed' : 'failed'}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Run ${runId} failed: ${message}`);

      await db.evidenceAutomationRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          success: false,
          error: message,
          completedAt: new Date(),
        },
      }).catch(() => {});
    }
  }
}
