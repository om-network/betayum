import { db } from '@db';
import { logger, task } from '@trigger.dev/sdk';
import { exec } from 'child_process';
import { unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { decrypt, type EncryptedData } from '../../secrets/encryption.util';
import type { AutomationExecutionRequest } from '../../tasks/automations/automation-runtime.service';

const execAsync = promisify(exec);

async function fetchScriptContent({
  automationId,
  version,
}: {
  automationId: string;
  version: number;
}): Promise<string | null> {
  if (version === 0) {
    const automation = await db.evidenceAutomation.findUnique({
      where: { id: automationId },
      select: { scriptDraft: true },
    });
    return automation?.scriptDraft ?? null;
  }

  const versionRecord = await db.evidenceAutomationVersion.findFirst({
    where: { evidenceAutomationId: automationId, version },
    select: { scriptContent: true },
  });
  return versionRecord?.scriptContent ?? null;
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

async function runPython(
  script: string,
  env: Record<string, string>,
): Promise<{ success: boolean; output: unknown; error?: string; logs: string[] }> {
  const scriptPath = join(tmpdir(), `aut_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);

  try {
    await writeFile(scriptPath, script, 'utf8');

    const { stdout, stderr } = await execAsync(`python3 ${scriptPath}`, {
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
      return {
        success: stdout.trim().length > 0,
        output: { raw: stdout.trim() },
        logs,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, output: null, error: message, logs: [] };
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}

export const runEvidenceAutomation = task({
  id: 'run-evidence-automation',
  maxDuration: 300,
  queue: { concurrencyLimit: 20 },
  run: async (payload: AutomationExecutionRequest) => {
    const { organizationId, automationId, runId, version, secretRefs } = payload;

    await db.evidenceAutomationRun.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date() },
    });

    try {
      const scriptContent = await fetchScriptContent({ automationId, version });

      if (!scriptContent) {
        throw new Error('No script content found — publish or save a draft first');
      }

      logger.info(`Executing script for automation ${automationId} v${version}`);

      const env = await resolveSecrets(organizationId, secretRefs);
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

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Automation run ${runId} failed`, { error: message });

      await db.evidenceAutomationRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          success: false,
          error: message,
          completedAt: new Date(),
        },
      });

      throw error;
    }
  },
});
