import { requireApiOrganizationPermission } from '@/lib/permissions.server';
import { auth } from '@trigger.dev/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ALLOWED_TASK_IDS = [
  'parse-questionnaire',
  'vendor-questionnaire-orchestrator',
  'answer-question',
] as const;

const requestSchema = z.object({
  taskId: z.enum(ALLOWED_TASK_IDS),
});

export async function POST(req: NextRequest) {
  try {
    const permission = await requireApiOrganizationPermission(req, 'questionnaire', 'update');
    if (permission instanceof NextResponse) {
      return permission;
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid taskId' },
        { status: 400 },
      );
    }

    const token = await auth.createTriggerPublicToken(parsed.data.taskId, {
      multipleUse: true,
      expirationTime: '1hr',
    });

    return NextResponse.json({ success: true, token });
  } catch (error) {
    console.error('Error creating trigger token:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create trigger token',
      },
      { status: 500 },
    );
  }
}
