import { getPortalAuthContext } from '@/app/lib/portal-auth';
import { headers } from 'next/headers';
import { UserMenuClient } from './user-menu-client';

// Helper function to get initials
function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const names = name.split(' ');
    const firstInitial = names[0]?.charAt(0) ?? '';
    const lastInitial = names.length > 1 ? names[names.length - 1]?.charAt(0) : '';
    const initials = `${firstInitial}${lastInitial}`.toUpperCase();
    // Ensure we return something, even if splitting/chartAt fails unexpectedly
    return initials || '?';
  }
  if (email) {
    // Use first letter of email if name is missing
    return email.charAt(0).toUpperCase();
  }
  // Fallback if both name and email are missing
  return '?';
}

export async function UserMenu() {
  const authContext = await getPortalAuthContext({ headers: await headers() });

  if (!authContext) {
    return null;
  }

  const user = authContext.user;
  const userInitials = getInitials(user.name, user.email);

  return (
    <UserMenuClient
      name={user.name}
      email={user.email}
      image={user.image ?? null}
      userInitials={userInitials}
    />
  );
}
