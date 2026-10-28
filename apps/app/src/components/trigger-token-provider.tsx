'use client';

import { healAndSetAccessToken } from '@/actions/trigger/heal-access-token';
import { TriggerProvider } from '@/components/trigger-provider';
import { useEffect, useState } from 'react';

interface TriggerTokenProviderProps {
  baseURL: string;
  triggerJobId?: string;
  initialToken?: string;
  children: React.ReactNode;
}

export function TriggerTokenProvider({
  baseURL,
  triggerJobId,
  initialToken,
  children,
}: TriggerTokenProviderProps) {
  const [token, setToken] = useState<string | null>(initialToken || null);

  useEffect(() => {
    async function ensureToken() {
      if (triggerJobId && !initialToken) {
        try {
          // This runs as a proper server action and can set cookies
          const healedToken = await healAndSetAccessToken(triggerJobId);
          setToken(healedToken);
        } catch (error) {
          console.error('Failed to heal token:', error);
        }
      }
    }

    ensureToken();
  }, [triggerJobId, initialToken]);

  // Realtime credentials must never gate access to the rest of the app.
  return (
    <TriggerProvider accessToken={token || ''} baseURL={baseURL}>
      {children}
    </TriggerProvider>
  );
}
