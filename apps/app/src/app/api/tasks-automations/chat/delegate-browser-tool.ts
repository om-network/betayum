import { serverApi } from '@/lib/api-server';
import { tasks } from '@trigger.dev/sdk';
import { tool } from 'ai';
import { z } from 'zod';

interface DelegateBrowserToolParams {
  automationId: string;
  organizationId: string;
  taskId: string;
}

const EVIDENCE_ONLY_INSTRUCTIONS = `

Evidence collection is strictly read-only. Observe the existing state and collect only the requested final evidence. Do not change settings, enable features, edit resources, remediate findings, modify code, create configurations, or attempt to make a control pass. If evidence is absent, incomplete, or shows a gap, do not fix it. Report missing or insufficient evidence in the final summary and explain what was observed.`;

export function buildEvidenceOnlyBrowserPrompt(prompt: string): string {
  return `${prompt}${EVIDENCE_ONLY_INSTRUCTIONS}`;
}

export function buildDelegateBrowserTool({
  automationId,
  organizationId,
  taskId,
}: DelegateBrowserToolParams) {
  return {
    delegateBrowserTask: tool({
      description:
        'Delegate browser interaction to the organization Codex browser worker. Use this for websites that require the organization persistent Chrome login. The durable run captures screenshots and attaches them to the task.',
      inputSchema: z.object({
        prompt: z
          .string()
          .min(1)
          .max(20_000)
          .describe('The complete, self-contained browser task for Codex'),
        evidenceDescription: z
          .string()
          .min(1)
          .max(2_000)
          .describe('What screenshot evidence should demonstrate'),
      }),
      execute: async ({ evidenceDescription, prompt }) => {
        const evidenceOnlyPrompt = buildEvidenceOnlyBrowserPrompt(prompt);
        if (process.env.CODEX_AUTOMATION_LOCAL_DIRECT === 'true') {
          const response = await serverApi.post(
            `/v1/tasks/${taskId}/automations/${automationId}/codex-runs`,
            { evidenceDescription, prompt: evidenceOnlyPrompt },
          );
          if (response.error) {
            throw new Error(`Codex delegation failed: ${response.error}`);
          }
          const result = z.object({ runId: z.string() }).parse(response.data);
          return { runId: result.runId, status: 'dispatched' };
        }
        const handle = await tasks.trigger('delegate-browser-task', {
          automationId,
          evidenceDescription,
          organizationId,
          prompt: evidenceOnlyPrompt,
          taskId,
        });
        return {
          runId: handle.id,
          status: 'dispatched',
        };
      },
    }),
  };
}
