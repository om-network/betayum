import { serverApi } from '@/lib/api-server';
import { auth } from '@/utils/auth';
import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildGoogleDocsTools } from './google-docs-tools';
import { buildGoogleSheetsTools } from './google-sheets-tools';
import { buildReadRunOutputTool } from './read-run-output-tool';
import { buildSystemPrompt, type GcpContext } from './system-prompt';

export const maxDuration = 120;

type StoreToS3Data = { status: 'uploading' | 'done' | 'error'; key?: string; error?: { message: string } };

function writeS3Event(writer: { write: (chunk: never) => void }, data: StoreToS3Data) {
  (writer as { write: (chunk: unknown) => void }).write({ type: 'data-store-to-s3', data });
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { messages, orgId, taskId, automationId } = body as {
      messages: UIMessage[];
      orgId: string;
      taskId: string;
      automationId: string;
    };

    if (!orgId || !taskId || !automationId) {
      return NextResponse.json({ message: 'Missing required parameters' }, { status: 400 });
    }

    const [taskResponse, automationResponse, connectionsResponse] = await Promise.all([
      serverApi.get<{ title?: string; description?: string }>(`/v1/tasks/${taskId}`),
      serverApi.get<{ automation: { allowedTools: string[] } }>(
        `/v1/tasks/${taskId}/automations/${automationId}`,
      ),
      serverApi.get<Array<{ providerSlug: string; status: string; variables?: Record<string, unknown> }>>(
        `/v1/integrations/connections`,
      ),
    ]);

    const task = taskResponse.data ?? null;
    const allowedTools: string[] | null = automationResponse.data?.automation.allowedTools ?? null;

    const connections = Array.isArray(connectionsResponse.data) ? connectionsResponse.data : [];
    const gcpConnection = connections.find(
      (c) => c.providerSlug === 'gcp' && c.status === 'active',
    );
    const googleWorkspaceConnection = connections.find(
      (c) => c.providerSlug === 'google-workspace' && c.status === 'active',
    );
    const gcpContext: GcpContext = gcpConnection
      ? {
          projectIds: Array.isArray(gcpConnection.variables?.project_ids)
            ? (gcpConnection.variables.project_ids as string[])
            : [],
          organizationId:
            typeof gcpConnection.variables?.organization_id === 'string'
              ? gcpConnection.variables.organization_id
              : undefined,
        }
      : null;

    const hasGoogleWorkspace = !!(gcpConnection || googleWorkspaceConnection);
    const systemPrompt = buildSystemPrompt(task, gcpContext, hasGoogleWorkspace);
    const modelMessages = await convertToModelMessages(messages);

    const optionalTools = {
      runScript: tool({
        description:
          'Re-run the saved automation script (e.g., after fixing a bug or when the user asks to run again). Note: storeToS3 already starts a run automatically, so you only need this for explicit re-runs.',
        inputSchema: z.object({
          secretRefs: z
            .array(z.object({ name: z.string(), category: z.string().optional() }))
            .optional()
            .describe('Secret references to inject as environment variables'),
        }),
        execute: async ({ secretRefs }) => {
          const triggerResult = await serverApi.post<{ run: { id: string } }>(
            `/v1/tasks/${taskId}/automations/${automationId}/draft-script/run`,
            { secretRefs },
          );

          if (triggerResult.error || !triggerResult.data?.run?.id) {
            return { success: false, error: triggerResult.error ?? 'Failed to start run' };
          }

          const runId = triggerResult.data.run.id;
          const deadline = Date.now() + 60_000;

          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 2000));

            const pollResult = await serverApi.get<{
              run: { status: string; success: boolean | null; output: unknown; error: string | null; logs: unknown };
            }>(`/v1/tasks/${taskId}/automations/runs/${runId}`);

            if (pollResult.error) {
              return { success: false, error: pollResult.error };
            }

            const run = pollResult.data?.run;
            if (!run) return { success: false, error: 'Run not found' };

            if (run.status === 'completed' || run.status === 'failed') {
              const serialized =
                run.output === null || run.output === undefined
                  ? ''
                  : typeof run.output === 'string'
                    ? run.output
                    : JSON.stringify(run.output, null, 2);
              const OUTPUT_LIMIT = 2000;
              if (serialized.length > OUTPUT_LIMIT) {
                return {
                  success: run.success ?? false,
                  output: serialized.slice(0, OUTPUT_LIMIT),
                  truncated: true,
                  totalChars: serialized.length,
                  runId,
                  note: 'Output truncated. Use readRunOutput with this runId and increasing offsets to read the full result.',
                  error: run.error,
                };
              }
              return {
                success: run.success ?? false,
                output: run.output,
                logs: run.logs,
                error: run.error,
              };
            }
          }

          return { success: false, error: 'Run timed out after 60 seconds' };
        },
      }),
      promptForSecret: tool({
        description:
          'Request an API key or secret from the user. Use this when the script needs credentials.',
        inputSchema: z.object({
          secretName: z
            .string()
            .describe('The environment variable name for the secret (e.g. GITHUB_TOKEN)'),
          description: z.string().optional().describe('What this secret is used for'),
          category: z.string().optional().default('automation'),
          exampleValue: z
            .string()
            .optional()
            .describe('An example of what this value looks like'),
          reason: z.string().describe('Why this secret is needed'),
        }),
        execute: async (input) => {
          return { requested: true, secretName: input.secretName };
        },
      }),
      promptForInfo: tool({
        description:
          'Request additional configuration information from the user (non-secret values like IDs, URLs, etc.).',
        inputSchema: z.object({
          reason: z.string().describe('Why this information is needed'),
          fields: z.array(
            z.object({
              name: z.string().describe('Field identifier'),
              label: z.string().describe('Human-readable label'),
              description: z.string().optional().describe('Explanation of what to enter'),
              placeholder: z.string().optional(),
              defaultValue: z.string().optional(),
              required: z.boolean().default(true),
            }),
          ),
        }),
        execute: async (input) => {
          return { requested: true, fields: input.fields };
        },
      }),
    };

    type OptionalToolName = keyof typeof optionalTools;

    const enabledOptionalTools =
      allowedTools === null
        ? optionalTools
        : (Object.fromEntries(
            Object.entries(optionalTools).filter(([name]) =>
              allowedTools.includes(name as OptionalToolName),
            ),
          ) as Partial<typeof optionalTools>);

    const googleDocsTools = hasGoogleWorkspace
      ? buildGoogleDocsTools({ taskId, automationId })
      : {};

    const googleSheetsTools = hasGoogleWorkspace
      ? buildGoogleSheetsTools({ taskId, automationId })
      : {};

    const readRunOutputTool = buildReadRunOutputTool({ taskId, automationId });

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model: openai('gpt-5'),
          system: systemPrompt,
          messages: modelMessages,
          stopWhen: stepCountIs(10),
          tools: {
            storeToS3: tool({
              description:
                'Save the generated automation script AND automatically run it. Call this when you have a complete Python script ready. The script will be saved and immediately executed — you will receive a runId to read the output with readRunOutput.',
              inputSchema: z.object({
                content: z.string().describe('The complete Python script content'),
                filename: z
                  .string()
                  .optional()
                  .default('automation.py')
                  .describe('The filename for the script'),
                secretRefs: z
                  .array(z.object({ name: z.string(), category: z.string().optional() }))
                  .optional()
                  .describe('Secret references to inject as environment variables when running'),
              }),
              execute: async ({ content, secretRefs }) => {
                writeS3Event(writer, { status: 'uploading' });
                const key = `first-party://${orgId}/${taskId}/${automationId}/snapshots/${Date.now()}`;

                try {
                  const saveResult = await serverApi.put(
                    `/v1/tasks/${taskId}/automations/${automationId}/draft-script`,
                    { content },
                  );
                  if (saveResult.error) throw new Error(saveResult.error);
                  writeS3Event(writer, { status: 'done', key });

                  const triggerResult = await serverApi.post<{ run: { id: string } }>(
                    `/v1/tasks/${taskId}/automations/${automationId}/draft-script/run`,
                    { secretRefs },
                  );

                  if (triggerResult.error || !triggerResult.data?.run?.id) {
                    return { key, success: true, runStarted: false, runError: triggerResult.error ?? 'Failed to start run' };
                  }

                  const runId = triggerResult.data.run.id;
                  const deadline = Date.now() + 60_000;

                  while (Date.now() < deadline) {
                    await new Promise((r) => setTimeout(r, 2000));

                    const pollResult = await serverApi.get<{
                      run: { status: string; success: boolean | null; output: unknown; error: string | null };
                    }>(`/v1/tasks/${taskId}/automations/runs/${runId}`);

                    if (pollResult.error) {
                      return { key, success: true, runStarted: true, runId, runError: pollResult.error };
                    }

                    const run = pollResult.data?.run;
                    if (!run) {
                      return { key, success: true, runStarted: true, runId, runError: 'Run not found during poll' };
                    }

                    if (run.status === 'completed' || run.status === 'failed') {
                      const serialized =
                        run.output === null || run.output === undefined
                          ? ''
                          : typeof run.output === 'string'
                            ? run.output
                            : JSON.stringify(run.output, null, 2);
                      const OUTPUT_LIMIT = 2000;
                      if (serialized.length > OUTPUT_LIMIT) {
                        return {
                          key,
                          success: true,
                          runId,
                          runSuccess: run.success ?? false,
                          output: serialized.slice(0, OUTPUT_LIMIT),
                          truncated: true,
                          totalChars: serialized.length,
                          note: 'Output truncated. Use readRunOutput with this runId and increasing offsets to read the full result.',
                          error: run.error,
                        };
                      }
                      return {
                        key,
                        success: true,
                        runId,
                        runSuccess: run.success ?? false,
                        output: run.output,
                        error: run.error,
                      };
                    }
                  }

                  return { key, success: true, runStarted: true, runId, runError: 'Run timed out after 60 seconds' };
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Failed to save script';
                  writeS3Event(writer, { status: 'error', error: { message } });
                  throw error;
                }
              },
            }),
            ...enabledOptionalTools,
            ...googleDocsTools,
            ...googleSheetsTools,
            ...readRunOutputTool,
          },
        });

        writer.merge(result.toUIMessageStream());
      },
      onError: (error) => {
        console.error('[AutomationChat] Stream error:', error);
        return error instanceof Error ? error.message : 'An error occurred';
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error('[AutomationChat] Fatal error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
