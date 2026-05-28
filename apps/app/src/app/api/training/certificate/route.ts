import { hasPermission } from '@/lib/permissions';
import { resolveCurrentUserOrganizationContext } from '@/lib/permissions.server';
import { db } from '@db/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const certificateRequestSchema = z.object({
  memberId: z.string(),
  organizationId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = certificateRequestSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { memberId, organizationId } = parsed.data;
    const context = await resolveCurrentUserOrganizationContext(organizationId);

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUserMember = await db.member.findFirst({
      where: { organizationId, userId: context.userId, deactivated: false },
      select: { id: true },
    });

    if (!currentUserMember) {
      return NextResponse.json(
        { error: 'You do not have permission to generate certificates.' },
        { status: 403 },
      );
    }

    const isSelf = currentUserMember.id === memberId;
    const canReadTraining = hasPermission(context.permissions, 'training', 'read');

    if (!canReadTraining && !isSelf) {
      return NextResponse.json(
        { error: 'You do not have permission to generate this certificate.' },
        { status: 403 },
      );
    }

    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.API_BASE_URL ||
      'http://localhost:3333';

    // Forward the user's session cookies to the NestJS API for authentication
    const cookieHeader = req.headers.get('cookie') || '';
    const authHeader = req.headers.get('authorization') || '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cookieHeader) headers['cookie'] = cookieHeader;
    if (authHeader) headers['authorization'] = authHeader;
    headers['X-Organization-Id'] = organizationId;

    const response = await fetch(`${apiUrl}/v1/training/generate-certificate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ memberId, organizationId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to generate certificate: ${errorText}` },
        { status: response.status },
      );
    }

    const pdfBuffer = await response.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="training-certificate.pdf"',
      },
    });
  } catch (error) {
    console.error('Error generating certificate:', error);
    return NextResponse.json(
      { error: 'Failed to generate certificate.' },
      { status: 500 },
    );
  }
}
