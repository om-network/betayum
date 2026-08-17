import { serverApi } from '@/lib/api-server';
import { normalizeAutomationKickoffMessages } from '@/lib/automation-kickoff';
import { auth } from '@/utils/auth';
import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { shouldStopAutomationAgent } from './agent-lifecycle';
import { buildAutomationFinalizationTool } from './automation-finalization-tool';
import { consumeBackgroundStream } from './background-stream';
import { buildDelegateBrowserTool } from './delegate-browser-tool';
import { buildGoogleDocsTools } from './google-docs-tools';
import { buildGoogleSheetsTools } from './google-sheets-tools';
import { buildAutomationPlatformContext, type IntegrationConnection } from './platform-context';
import { buildReadRunOutputTool } from './read-run-output-tool';
import { buildReadTaskAttachmentTool } from './read-task-attachment-tool';
import { buildSystemPrompt } from './system-prompt';
import { automationTaskContextSchema } from './task-context';
import { buildTaskStatusTool } from './task-status-tool';

export const maxDuration = 120;

type StoreToS3Data = {
  status: 'uploading' | 'done' | 'error';
  key?: string;
  error?: { message: string };
};

function isTriggerServiceToken(value: string | null): boolean {
  const expected = process.env.SERVICE_TOKEN_TRIGGER;
  if (!value || !expected) return false;
  const receivedBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

async function attachOutputToTask(
  taskId: string,
  output: unknown,
  runId: string,
): Promise<{ attachmentId?: string; attachedToTask: boolean }> {
  try {
    if (output === null || output === undefined) return { attachedToTask: false };
    const serialized = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
    if (!serialized.trim()) return { attachedToTask: false };
    const fileData = Buffer.from(serialized).toString('base64');
    const result = await serverApi.post<{ id: string }>(`/v1/tasks/${taskId}/attachments`, {
      fileName: `automation-output-${runId}.json`,
      fileType: 'application/json',
      fileData,
    });
    if (result.error || !result.data?.id) return { attachedToTask: false };
    return { attachedToTask: true, attachmentId: result.data.id };
  } catch {
    return { attachedToTask: false };
  }
}

function writeS3Event(writer: { write: (chunk: never) => void }, data: StoreToS3Data) {
  (writer as { write: (chunk: unknown) => void }).write({ type: 'data-store-to-s3', data });
}

export async function POST(req: Request) {
  try {
    const headerStore = await headers();
    const session = await auth.api.getSession({
      headers: headerStore,
    });
    const serviceToken = headerStore.get('x-service-token');
    const isTriggerWorker = isTriggerServiceToken(serviceToken);

    if (!session?.user && !isTriggerWorker) {
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

    const [taskResponse, automationResponse, connectionsResponse, taskContextResponse] =
      await Promise.all([
        serverApi.get<{ title?: string; description?: string; approverId?: string }>(
          `/v1/tasks/${taskId}`,
        ),
        serverApi.get<{
          automation: {
            allowedTools: string[];
            setupStatus: string | null;
          };
        }>(`/v1/tasks/${taskId}/automations/${automationId}`),
        serverApi.get<IntegrationConnection[]>(`/v1/integrations/connections`),
        serverApi.get(`/v1/tasks/${taskId}/automation-context`),
      ]);

    const task = taskResponse.data ?? null;
    const allowedTools: string[] | null = automationResponse.data?.automation.allowedTools ?? null;
    if (automationResponse.data?.automation.setupStatus === 'action_needed') {
      await serverApi.patch(`/v1/tasks/${taskId}/automations/${automationId}`, {
        setupStatus: 'building',
        setupTask: null,
      });
    }

    const connections = Array.isArray(connectionsResponse.data) ? connectionsResponse.data : [];
    const parsedTaskContext = automationTaskContextSchema.safeParse(taskContextResponse.data);
    const taskContext = parsedTaskContext.success ? parsedTaskContext.data : null;
    if (!parsedTaskContext.success) {
      console.error('[AutomationChat] Invalid task context:', parsedTaskContext.error.flatten());
    }
    const { gcpContext, githubContext, integrationContext } =
      buildAutomationPlatformContext(connections);
    const googleWorkspaceConnection = connections.find(
      (c) => c.providerSlug === 'google-workspace' && c.status === 'active',
    );
    const hasGoogleWorkspace = !!googleWorkspaceConnection;

    const systemPrompt = buildSystemPrompt(
      task,
      gcpContext,
      hasGoogleWorkspace,
      githubContext,
      integrationContext,
      taskContext,
    );
    const modelMessages = await convertToModelMessages(
      normalizeAutomationKickoffMessages(messages),
    );
    const delegateBrowserTools = buildDelegateBrowserTool({
      automationId,
      organizationId: orgId,
      taskId,
    });

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
              run: {
                status: string;
                success: boolean | null;
                output: unknown;
                error: string | null;
                logs: unknown;
              };
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
                const attachment = run.success
                  ? await attachOutputToTask(taskId, run.output, runId)
                  : { attachedToTask: false };
                return {
                  success: run.success ?? false,
                  output: serialized.slice(0, OUTPUT_LIMIT),
                  truncated: true,
                  totalChars: serialized.length,
                  runId,
                  note: 'Output truncated. Use readRunOutput with this runId and increasing offsets to read the full result.',
                  error: run.error,
                  ...attachment,
                };
              }
              const attachment = run.success
                ? await attachOutputToTask(taskId, run.output, runId)
                : { attachedToTask: false };
              return {
                success: run.success ?? false,
                output: run.output,
                logs: run.logs,
                error: run.error,
                ...attachment,
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
          exampleValue: z.string().optional().describe('An example of what this value looks like'),
          reason: z.string().describe('Why this secret is needed'),
        }),
        execute: async (input) => {
          const setupResult = await serverApi.patch(
            `/v1/tasks/${taskId}/automations/${automationId}`,
            { setupStatus: 'action_needed', setupTask: input.reason },
          );
          return {
            requested: true,
            secretName: input.secretName,
            setupTaskSaved: !setupResult.error,
          };
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
          const setupResult = await serverApi.patch(
            `/v1/tasks/${taskId}/automations/${automationId}`,
            { setupStatus: 'action_needed', setupTask: input.reason },
          );
          return {
            requested: true,
            fields: input.fields,
            setupTaskSaved: !setupResult.error,
          };
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
      ? buildGoogleSheetsTools({
          taskId,
          automationId,
          taskTitle: task?.title ?? 'Automation evidence',
        })
      : {};

    const readRunOutputTool = buildReadRunOutputTool({ taskId, automationId });
    const taskStatusTool = buildTaskStatusTool({
      taskId,
      approverId: task?.approverId,
    });
    const automationFinalizationTool = buildAutomationFinalizationTool({ automationId, taskId });
    const readTaskAttachmentTool = buildReadTaskAttachmentTool({
      attachments: taskContext?.attachments ?? [],
      taskId,
    });

    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        const result = streamText({
          model: openai('gpt-5'),
          system: systemPrompt,
          messages: modelMessages,
          stopWhen: shouldStopAutomationAgent,
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
                    return {
                      key,
                      success: true,
                      runStarted: false,
                      runError: triggerResult.error ?? 'Failed to start run',
                    };
                  }

                  const runId = triggerResult.data.run.id;
                  const deadline = Date.now() + 60_000;

                  while (Date.now() < deadline) {
                    await new Promise((r) => setTimeout(r, 2000));

                    const pollResult = await serverApi.get<{
                      run: {
                        status: string;
                        success: boolean | null;
                        output: unknown;
                        error: string | null;
                      };
                    }>(`/v1/tasks/${taskId}/automations/runs/${runId}`);

                    if (pollResult.error) {
                      return {
                        key,
                        success: true,
                        runStarted: true,
                        runId,
                        runError: pollResult.error,
                      };
                    }

                    const run = pollResult.data?.run;
                    if (!run) {
                      return {
                        key,
                        success: true,
                        runStarted: true,
                        runId,
                        runError: 'Run not found during poll',
                      };
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
                        const attachment = run.success
                          ? await attachOutputToTask(taskId, run.output, runId)
                          : { attachedToTask: false };
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
                          ...attachment,
                        };
                      }
                      const attachment = run.success
                        ? await attachOutputToTask(taskId, run.output, runId)
                        : { attachedToTask: false };
                      return {
                        key,
                        success: true,
                        runId,
                        runSuccess: run.success ?? false,
                        output: run.output,
                        error: run.error,
                        ...attachment,
                      };
                    }
                  }

                  return {
                    key,
                    success: true,
                    runStarted: true,
                    runId,
                    runError: 'Run timed out after 60 seconds',
                  };
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Failed to save script';
                  writeS3Event(writer, { status: 'error', error: { message } });
                  throw error;
                }
              },
            }),
            submitTaskForReview: tool({
              description:
                'Submit the task for review after evidence has been collected and logged. Call this as the final step after populating the Google Sheet. If the task has no approver configured and none is provided, skip and report that.',
              inputSchema: z.object({
                approverId: z
                  .string()
                  .optional()
                  .describe(
                    "Member ID of the approver (mem_...). Leave blank to use the task's existing approver.",
                  ),
              }),
              execute: async ({ approverId }) => {
                const effectiveApproverId = approverId ?? task?.approverId;
                if (!effectiveApproverId) {
                  return {
                    success: false,
                    skipped: true,
                    reason: 'No approver configured on this task. Mention this in your report.',
                  };
                }
                const result = await serverApi.post<{ task: { status: string } }>(
                  `/v1/tasks/${taskId}/submit-for-review`,
                  { approverId: effectiveApproverId },
                );
                if (result.error) {
                  return { success: false, error: result.error };
                }
                return { success: true, status: result.data?.task?.status ?? 'in_review' };
              },
            }),
            ...enabledOptionalTools,
            ...googleDocsTools,
            ...googleSheetsTools,
            ...readRunOutputTool,
            ...taskStatusTool,
            ...automationFinalizationTool,
            ...readTaskAttachmentTool,
            ...delegateBrowserTools,
          },
        });

        writer.merge(result.toUIMessageStream());
      },
      onError: (error) => {
        console.error('[AutomationChat] Stream error:', error);
        return error instanceof Error ? error.message : 'An error occurred';
      },
      onFinish: async ({ messages: completedMessages }) => {
        const result = await serverApi.post(
          `/v1/tasks/${taskId}/automations/${automationId}/chat-history`,
          { messages: completedMessages },
        );
        if (result.error) {
          console.error('[AutomationChat] Failed to persist background chat:', result.error);
        }
      },
    });

    return createUIMessageStreamResponse({
      stream,
      consumeSseStream: ({ stream: sseStream }) =>
        consumeBackgroundStream({
          stream: sseStream,
          onError: (error) => {
            console.error('[AutomationChat] Background stream failed:', error);
          },
        }),
    });
  } catch (error) {
    console.error('[AutomationChat] Fatal error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
