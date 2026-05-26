'use client';

import { useClerk } from '@clerk/nextjs';
import { Button } from '@trycompai/design-system';
import { useState } from 'react';

export const Unauthorized = () => {
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut({ redirectUrl: '/auth' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex w-full max-w-md flex-col gap-4">
        <h1 className="text-center text-3xl font-bold">Oops, you don't belong here</h1>
        <p className="text-center">
          You are not authorized to access this page. Please sign in with a different account.
        </p>
        <Button onClick={handleSignOut} disabled={loading}>
          {loading ? 'Signing out...' : 'Sign Out'}
        </Button>
      </div>
    </div>
  );
};
