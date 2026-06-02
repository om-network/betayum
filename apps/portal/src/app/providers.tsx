'use client';

import { useUser } from '@clerk/nextjs';
import { AnalyticsProvider } from '@trycompai/analytics';
import type { ReactNode } from 'react';

type ProviderProps = {
  children: ReactNode;
};

export function Providers({ children }: ProviderProps) {
  const { user } = useUser();
  const primaryEmail = user?.primaryEmailAddress?.emailAddress;

  return (
    <AnalyticsProvider userId={user?.id} userEmail={primaryEmail}>
      {children}
    </AnalyticsProvider>
  );
}
