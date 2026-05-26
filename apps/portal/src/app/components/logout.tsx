'use client';

import { useClerk } from '@clerk/nextjs';
import { DropdownMenuItem } from '@trycompai/design-system';
import { useState } from 'react';

export function Logout() {
  const [isLoading, setLoading] = useState(false);
  const { signOut } = useClerk();

  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut({ redirectUrl: '/auth' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenuItem onClick={handleLogout}>
      {isLoading ? 'Loading...' : 'Sign Out'}
    </DropdownMenuItem>
  );
}
