import { runIntegrationTests } from '@/trigger/tasks/integration/run-integration-tests';
import { hasPermission } from '@/lib/permissions';
import { resolveCurrentUserOrganizationContext } from '@/lib/permissions.server';
import { runs, tasks } from '@trigger.dev/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const MAX_POLL_ATTEMPTS = 60; // Max 2 minutes (60 * 2 seconds)
const POLL_INTERVAL_MS = 2000;

const legacyScanSchema = z.object({
  integrationId: z.string().optional(),
});

/**
 * POST /api/cloud-tests/legacy-scan
 * Triggers a legacy integration test run and waits for completion.
 */
export async function POST(request: NextRequest) {
  const organizationId = request.headers.get('x-organization-id')?.trim();

  if (!organizationId) {
    return NextResponse.json(
      { error: 'Organization context required (missing X-Organization-Id).' },
      { status: 400 },
    );
  }

  const context = await resolveCurrentUserOrganizationContext(organizationId);

  if (!context || !hasPermission(context.permissions, 'integration', 'update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = legacyScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    const handle = await tasks.trigger<typeof runIntegrationTests>(
      'run-integration-tests',
      {
        organizationId,
        ...(parsed.data.integrationId ? { integrationId: parsed.data.integrationId } : {}),
      },
    );

    // Poll for completion
    let attempts = 0;
    while (attempts < MAX_POLL_ATTEMPTS) {
      const run = await runs.retrieve(handle.id);

      if (run.isCompleted) {
        if (run.isSuccess) {
          const output = run.output as {
            success?: boolean;
            errors?: string[];
          } | null;

          if (output?.success === false) {
            return NextResponse.json({
              success: false,
              errors: output.errors || ['Scan completed with errors'],
              taskId: run.id,
            });
          }

          return NextResponse.json({
            success: true,
            taskId: run.id,
          });
        }

        return NextResponse.json({
          success: false,
          errors:
            run.isFailed || run.isCancelled
              ? ['Task failed or was canceled']
              : ['Task completed with unexpected status'],
          taskId: run.id,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      attempts++;
    }

    // Timeout
    return NextResponse.json({
      success: false,
      errors: [
        'Scan is taking longer than expected. Check the Trigger.dev dashboard.',
      ],
      taskId: handle.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        errors: [
          error instanceof Error
            ? error.message
            : 'Failed to run integration tests',
        ],
      },
      { status: 500 },
    );
  }
}
