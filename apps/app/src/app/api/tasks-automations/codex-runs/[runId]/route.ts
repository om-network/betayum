import { serverApi } from '@/lib/api-server';
import { auth } from '@/utils/auth';
import { runs } from '@trigger.dev/sdk';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  automationId: z.string().min(1),
  orgId: z.string().min(1),
  taskId: z.string().min(1),
});

const runPayloadSchema = z.object({
  automationId: z.string(),
  organizationId: z.string(),
  taskId: z.string(),
});

const completionOutputSchema = z.object({
  attachmentIds: z.array(z.string()),
  screenshots: z.array(
    z.object({
      attachmentId: z.string().nullable(),
      fileName: z.string(),
      mimeType: z.string(),
    }),
  ),
  summary: z.string(),
});

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { runId } = await params;
  const url = new URL(request.url);
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) {
    return NextResponse.json({ message: 'Invalid run scope' }, { status: 400 });
  }
  if (session.session?.activeOrganizationId !== query.data.orgId) {
    return NextResponse.json({ message: 'Run scope does not match' }, { status: 403 });
  }

  const automation = await serverApi.get(
    `/v1/tasks/${query.data.taskId}/automations/${query.data.automationId}`,
  );
  if (automation.error) {
    return NextResponse.json({ message: 'Automation not found' }, { status: 404 });
  }

  if (runId.startsWith('car_')) {
    const codexRun = await serverApi.get(
      `/v1/tasks/${query.data.taskId}/automations/${query.data.automationId}/codex-runs/${runId}`,
    );
    if (codexRun.error) {
      return NextResponse.json({ message: 'Run not found' }, { status: 404 });
    }
    const localRun = z
      .object({
        organizationId: z.string(),
        status: z.string(),
        summary: z.string().nullable(),
        screenshots: z.array(z.object({ attachmentId: z.string().nullable() })),
      })
      .parse(codexRun.data);
    if (localRun.organizationId !== query.data.orgId) {
      return NextResponse.json({ message: 'Run scope does not match' }, { status: 403 });
    }
    const status =
      localRun.status === 'promoted'
        ? 'COMPLETED'
        : localRun.status === 'timed_out'
          ? 'TIMED_OUT'
          : localRun.status === 'failed'
            ? 'FAILED'
            : 'EXECUTING';
    return NextResponse.json({
      output:
        status === 'COMPLETED'
          ? {
              attachmentIds: localRun.screenshots.flatMap((screenshot) =>
                screenshot.attachmentId ? [screenshot.attachmentId] : [],
              ),
              screenshots: [],
              summary: localRun.summary ?? '',
            }
          : null,
      status,
    });
  }

  const run = await runs.retrieve(runId);
  const payload = runPayloadSchema.safeParse(run.payload);
  if (
    !payload.success ||
    payload.data.automationId !== query.data.automationId ||
    payload.data.organizationId !== query.data.orgId ||
    payload.data.taskId !== query.data.taskId
  ) {
    return NextResponse.json({ message: 'Run scope does not match' }, { status: 403 });
  }

  const output = completionOutputSchema.safeParse(run.output);
  return NextResponse.json({
    output: output.success ? output.data : null,
    status: run.status,
  });
}
