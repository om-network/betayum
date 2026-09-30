'use client';

import { TriggerAuthContext } from '@trigger.dev/react-hooks';

export function TriggerProvider({
  accessToken,
  baseURL,
  children,
}: {
  accessToken: string;
  baseURL: string;
  children: React.ReactNode;
}) {
  return (
    <TriggerAuthContext.Provider
      value={{
        accessToken,
        baseURL,
      }}
    >
      {children}
    </TriggerAuthContext.Provider>
  );
}
