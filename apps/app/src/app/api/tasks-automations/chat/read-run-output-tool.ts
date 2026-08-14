import { serverApi } from '@/lib/api-server';
import { tool } from 'ai';
import { z } from 'zod';

const CHUNK_SIZE = 4000;

interface ReadRunOutputParams {
  taskId: string;
  automationId: string;
}

interface RunResponse {
  run: { output: unknown; status: string } | null;
}

export function buildReadRunOutputTool({ taskId, automationId }: ReadRunOutputParams) {
  return {
    readRunOutput: tool({
      description:
        'Read a chunk of a script run output by offset. Use when runScript returns truncated: true. Call repeatedly with increasing offsets until hasMore is false.',
      inputSchema: z.object({
        runId: z.string().describe('The run ID returned by runScript'),
        offset: z.number().int().min(0).describe('Character offset to start reading from'),
      }),
      execute: async ({ runId, offset }) => {
        const result = await serverApi.get<RunResponse>(
          `/v1/tasks/${taskId}/automations/runs/${runId}`,
        );

        if (result.error || !result.data?.run) {
          return { error: result.error ?? 'Run not found' };
        }

        const { output } = result.data.run;

        if (output === null || output === undefined) {
          return { error: 'Run has no output' };
        }

        const serialized = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
        const totalChars = serialized.length;
        const safeOffset = Math.min(offset, totalChars);
        const chunk = serialized.slice(safeOffset, safeOffset + CHUNK_SIZE);
        const nextOffset = safeOffset + chunk.length;
        const hasMore = nextOffset < totalChars;

        return { chunk, offset: safeOffset, nextOffset, totalChars, hasMore };
      },
    }),
  };
}
