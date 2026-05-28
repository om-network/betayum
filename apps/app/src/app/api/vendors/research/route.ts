import { requireApiOrganizationPermission } from '@/lib/permissions.server';
import { researchVendor } from '@/trigger/tasks/scrape/research';
import { tasks } from '@trigger.dev/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const researchVendorSchema = z.object({
  website: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    const permission = await requireApiOrganizationPermission(req, 'vendor', 'create');
    if (permission instanceof NextResponse) {
      return permission;
    }

    const parsed = researchVendorSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'A valid website URL is required' },
        { status: 400 },
      );
    }

    const handle = await tasks.trigger<typeof researchVendor>(
      'research-vendor',
      { website: parsed.data.website },
    );

    return NextResponse.json({ success: true, handle });
  } catch (error) {
    console.error('Error in research vendor:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to trigger vendor research',
      },
      { status: 500 },
    );
  }
}
