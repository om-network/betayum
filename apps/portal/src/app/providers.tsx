'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { AnalyticsProvider } from '@trycompai/analytics';
import type { ReactNode } from 'react';

type ProviderProps = {
  children: ReactNode;
  session: {
    session: {
      id: string;
      userId: string;
    } | null;
    user: {
      id: string;
      email: string;
    } | null;
  } | null;
};

export function Providers({ children, session }: ProviderProps) {
  return (
    <ClerkProvider signInUrl="/auth" signUpUrl="/auth">
      <AnalyticsProvider
        userId={session?.user?.id ?? undefined}
        userEmail={session?.user?.email ?? undefined}
      >
        {children}
      </AnalyticsProvider>
    </ClerkProvider>
  );
}
