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

export const maxDuration = 120;

type StoreToS3Data = { status: 'uploading' | 'done' | 'error'; key?: string; error?: { message: string } };

function writeS3Event(writer: { write: (chunk: never) => void }, data: StoreToS3Data) {
  (writer as { write: (chunk: unknown) => void }).write({ type: 'data-store-to-s3', data });
}

function buildSystemPrompt(task: { title?: string; description?: string } | null | undefined) {
  const taskTitle = task?.title ?? 'Unknown task';
  const taskDescription = task?.description ?? '';

  return `You are an automation engineer. Your job is to immediately write and save a working Python evidence collection script — not to discuss or plan.

TASK:
Title: ${taskTitle}
${taskDescription ? `Description: ${taskDescription}` : ''}

RULES:
- On every response, write a complete script and call storeToS3 to save it. No exceptions.
- Never just reply with text. Always produce and save a script.
- Make reasonable assumptions. Do not ask clarifying questions.
- If credentials are needed, use promptForSecret AFTER you have written the script.
- Scripts use Python 3, the requests library, and os.environ for secrets.
- Scripts must be read-only (GET requests only).
- Always include a main() function returning { success, data, error } and print JSON at the end.
- Handle errors gracefully.
- Never call runScript automatically. Only call it when the user explicitly asks to test or run the script.

After saving, give a one-sentence summary of what the script collects and what secrets it needs (if any).`;
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

    const [taskResponse, automationResponse] = await Promise.all([
      serverApi.get<{ title?: string; description?: string }>(`/v1/tasks/${taskId}`),
      serverApi.get<{ automation: { allowedTools: string[] } }>(
        `/v1/tasks/${taskId}/automations/${automationId}`,
      ),
    ]);

    const task = taskResponse.data ?? null;
    const allowedTools: string[] | null = automationResponse.data?.automation.allowedTools ?? null;

    const systemPrompt = buildSystemPrompt(task);
    const modelMessages = await convertToModelMessages(messages);

    const optionalTools = {
      runScript: tool({
        description:
          'Execute the current draft script as a test run. Only call this when the user explicitly asks to run or test the script. Do NOT call this automatically after saving.',
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

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model: openai('gpt-4o'),
          system: systemPrompt,
          messages: modelMessages,
          stopWhen: stepCountIs(10),
          tools: {
            storeToS3: tool({
              description:
                'Save the generated automation script. Call this when you have a complete Python script ready.',
              inputSchema: z.object({
                content: z.string().describe('The complete Python script content'),
                filename: z
                  .string()
                  .optional()
                  .default('automation.py')
                  .describe('The filename for the script'),
              }),
              execute: async ({ content }) => {
                writeS3Event(writer, { status: 'uploading' });
                const key = `first-party://${orgId}/${taskId}/${automationId}/snapshots/${Date.now()}`;

                try {
                  const saveResult = await serverApi.put(
                    `/v1/tasks/${taskId}/automations/${automationId}/draft-script`,
                    { content },
                  );
                  if (saveResult.error) throw new Error(saveResult.error);
                  writeS3Event(writer, { status: 'done', key });
                  return { key, success: true };
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Failed to save script';
                  writeS3Event(writer, { status: 'error', error: { message } });
                  throw error;
                }
              },
            }),
            ...enabledOptionalTools,
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
