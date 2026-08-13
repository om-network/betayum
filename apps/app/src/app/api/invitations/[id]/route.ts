import { auth } from '@/utils/auth';
import { db } from '@db/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session?.activeOrganizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { activeOrganizationId, userId } = session.session;

  const member = await db.member.findFirst({
    where: { userId, organizationId: activeOrganizationId, deactivated: false },
    select: { role: true },
  });

  if (!member || (!member.role.includes('admin') && !member.role.includes('owner'))) {
    return NextResponse.json(
      { error: "You don't have permission to revoke invitations" },
      { status: 403 },
    );
  }

  const { id } = await params;

  const invitation = await db.invitation.findFirst({
    where: { id, organizationId: activeOrganizationId, status: 'pending' },
    select: { id: true },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: 'Invitation not found or already accepted' },
      { status: 404 },
    );
  }

  await db.invitation.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
