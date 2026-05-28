import { serverApi } from '@/lib/api-server';
import { auth } from '@/utils/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect(`/${orgId}/overview`);
  }

  const adminOrgRes = await serverApi.get(`/v1/admin/organizations/${orgId}`, orgId);

  if (!adminOrgRes.data) {
    redirect(`/${orgId}/overview`);
  }

  return <>{children}</>;
}
