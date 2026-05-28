'use client';

import { clearActiveOrganizationCookieClient } from '@/lib/active-organization-client';
import { useClerk } from '@clerk/nextjs';
import { Button, DropdownMenuItem } from '@trycompai/design-system';
import { useState } from 'react';

export function SignOut({
  asButton = false,
  className = '',
  size = 'sm',
}: {
  asButton?: boolean;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
}) {
  const { signOut } = useClerk();
  const [isLoading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    clearActiveOrganizationCookieClient();
    await signOut({ redirectUrl: '/auth' });
  };

  if (asButton) {
    return (
      <div className={className}>
        <Button onClick={handleSignOut} size={size} loading={isLoading}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenuItem onClick={handleSignOut}>
      {isLoading ? 'Loading...' : 'Sign out'}
    </DropdownMenuItem>
  );
}
