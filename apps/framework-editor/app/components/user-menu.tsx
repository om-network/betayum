import { headers } from 'next/headers';
import { getFrameworkEditorUser } from '../lib/framework-auth';
import { UserMenuClient } from './user-menu-client';

export async function UserMenu({ onlySignOut }: { onlySignOut?: boolean }) {
  const user = await getFrameworkEditorUser({ headers: await headers() });

  return <UserMenuClient user={user} onlySignOut={onlySignOut} />;
}
