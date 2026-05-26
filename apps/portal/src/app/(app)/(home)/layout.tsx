import { getPortalAuthContext } from '@/app/lib/portal-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const authContext = await getPortalAuthContext({ headers: await headers() });

  if (!authContext) {
    return redirect('/auth');
  }

  return <>{children}</>;
}
