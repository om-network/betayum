import { CodexAutomationRunStatus, db } from '@db';
import { logger, task, wait } from '@trigger.dev/sdk';
import { z } from 'zod';
import { promoteCodexAutomationScreenshots } from '../../tasks/automations/codex-automation-promotion';
import { reconcileCodexAutomation } from '../../tasks/automations/codex-automation-reconciliation';

const payloadSchema = z.object({
  automationId: z.string(),
  evidenceDescription: z.string().min(1).max(2_000),
  organizationId: z.string(),
  prompt: z.string().min(1).max(20_000),
  taskId: z.string(),
});

export const delegateBrowserTask = task({
  id: 'delegate-browser-task',
  maxDuration: 300,
  run: async (input: z.input<typeof payloadSchema>, { ctx }) => {
    const payload = payloadSchema.parse(input);
    const token = await wait.createToken({
      idempotencyKey: `codex-browser-${ctx.run.id}`,
      idempotencyKeyTTL: '24h',
      timeout: '30m',
    });
    const apiBaseUrl = requiredConfig('CODEX_AUTOMATION_API_BASE_URL');
    const response = await fetch(
      `${apiBaseUrl}/v1/tasks/${payload.taskId}/automations/${payload.automationId}/codex-runs`,
      {
        body: JSON.stringify({
          evidenceDescription: payload.evidenceDescription,
          prompt: payload.prompt,
          triggerRunId: ctx.run.id,
          triggerWaitpointId: token.id,
        }),
        headers: {
          'content-type': 'application/json',
          'x-organization-id': payload.organizationId,
          'x-service-token': requiredConfig('SERVICE_TOKEN_TRIGGER'),
        },
        method: 'POST',
      },
    );
    if (!response.ok) {
      throw new Error(
        `Codex delegation dispatch failed with ${response.status}`,
      );
    }
    const dispatched = z
      .object({ runId: z.string() })
      .parse(await response.json());
    logger.info('Codex browser delegation dispatched', {
      runId: dispatched.runId,
      triggerRunId: ctx.run.id,
    });

    let completion: { runId: string; summary: string };
    try {
      completion = await wait
        .forToken<{ runId: string; summary: string }>(token)
        .unwrap();
    } catch (error) {
      await db.codexAutomationRun.updateMany({
        where: {
          id: dispatched.runId,
          status: {
            in: [
              CodexAutomationRunStatus.pending,
              CodexAutomationRunStatus.dispatched,
            ],
          },
        },
        data: {
          completedAt: new Date(),
          errorMessage: 'Codex browser delegation timed out after 30 minutes',
          status: CodexAutomationRunStatus.timed_out,
        },
      });
      await reconcileCodexAutomation({
        automationId: payload.automationId,
        message: 'Codex browser delegation timed out after 30 minutes',
        runId: dispatched.runId,
        successful: false,
      });
      throw error;
    }
    if (completion.runId !== dispatched.runId) {
      throw new Error('Codex delegation resumed with a different run');
    }
    return promoteCodexAutomationScreenshots({
      organizationId: payload.organizationId,
      runId: completion.runId,
    });
  },
});

function requiredConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
