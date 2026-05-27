import { getPortalAuthContext, getPortalOrganization } from '@/app/lib/portal-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const authContext = await getPortalAuthContext({ headers: await headers() });

  if (!authContext) {
    return redirect('/auth');
  }

  if (!getPortalOrganization(authContext, orgId)) {
    return redirect('/unauthorized');
  }

  return <>{children}</>;
}
