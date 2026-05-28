import { serverApi } from '@/lib/api-server';
import { auth } from '@/utils/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

interface AdminOrganizationsResponse {
  data: Array<{ id: string }>;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect('/auth');
  }

  const organizationsRes =
    await serverApi.get<AdminOrganizationsResponse>('/v1/admin/organizations');
  if (!organizationsRes.data) {
    redirect('/');
  }

  const orgs = organizationsRes.data.data;
  const activeOrgId = session.session.activeOrganizationId;
  const targetOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];

  if (targetOrg) {
    redirect(`/${targetOrg.id}/admin`);
  }

  redirect('/');
}
