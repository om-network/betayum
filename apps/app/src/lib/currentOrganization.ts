'use server';

import { auth } from '@/utils/auth';
import type { Organization } from '@db';
import { db } from '@db/server';
import { headers } from 'next/headers';

export async function getCurrentOrganization({
  requestedOrgId,
}: {
  requestedOrgId: string;
}): Promise<Organization | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const userId = session?.session?.userId;

  return db.organization.findFirst({
    where: {
      id: requestedOrgId,
      members: { some: { userId } },
    },
  });
}
