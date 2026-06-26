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

  return `You are an expert automation engineer helping users create compliance evidence collection scripts.

TASK CONTEXT:
Title: ${taskTitle}
${taskDescription ? `Description: ${taskDescription}` : ''}

YOUR ROLE:
You help users write Python automation scripts that collect compliance evidence by calling vendor APIs. These scripts run in a sandboxed environment and collect read-only data.

SCRIPT REQUIREMENTS:
- Write Python 3 scripts using the requests library
- Scripts must be read-only (GET requests or POST for querying only)
- Always handle errors gracefully and return structured JSON output
- Include a main() function that returns a dict with: success (bool), data (any), error (str, optional)
- Print the result as JSON at the end
- Use environment variables for API keys and secrets (os.environ.get('SECRET_NAME'))
- Include proper docstrings explaining what the script does

WORKFLOW:
1. Ask clarifying questions if the request is unclear
2. If you need API credentials or configuration, use the promptForSecret or promptForInfo tools BEFORE writing code
3. Write a complete, working Python script
4. Call the storeToS3 tool to save the script when it's complete
5. Explain what the script does and how to configure it

COMMUNICATION STYLE:
- Be helpful and concise
- Explain your approach before writing code
- After saving, summarize what the automation does

IMPORTANT:
- Only call storeToS3 when you have a complete, working script
- Ask for secrets before writing code if you know what credentials are needed
- Scripts should produce structured evidence that can be reviewed for compliance`;
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

    const taskResponse = await serverApi.get<{ title?: string; description?: string }>(
      `/v1/tasks/${taskId}`,
    );
    const task = taskResponse.data ?? null;

    const systemPrompt = buildSystemPrompt(task);
    const modelMessages = await convertToModelMessages(messages);

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
            promptForSecret: tool({
              description:
                'Request an API key or secret from the user. Use this when the script needs credentials.',
              inputSchema: z.object({
                secretName: z
                  .string()
                  .describe(
                    'The environment variable name for the secret (e.g. GITHUB_TOKEN)',
                  ),
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
                    description: z
                      .string()
                      .optional()
                      .describe('Explanation of what to enter'),
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
