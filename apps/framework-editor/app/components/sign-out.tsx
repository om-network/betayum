'use client';

import { useClerk } from '@clerk/nextjs';
import { Button, DropdownMenuItem } from '@trycompai/design-system';
import { useState } from 'react';

export function SignOut({ asButton = false }: { asButton?: boolean }) {
  const [isLoading, setLoading] = useState(false);
  const { signOut } = useClerk();

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut({ redirectUrl: '/auth' });
    } finally {
      setLoading(false);
    }
  };

  if (asButton) {
    return <Button onClick={handleSignOut}>{isLoading ? 'Loading...' : 'Sign out'}</Button>;
  }

  return (
    <DropdownMenuItem onClick={handleSignOut}>
      {isLoading ? 'Loading...' : 'Sign out'}
    </DropdownMenuItem>
  );
}
