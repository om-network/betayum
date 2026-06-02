import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { type ReactNode } from 'react';
import { Toaster as SonnerToaster } from 'sonner';

import { headers } from 'next/headers';
import '../styles/globals.css';
import { Header } from './components/HeaderFrameworks';
import { canAccessFrameworkEditor, getFrameworkEditorUser } from './lib/framework-auth';

export const metadata: Metadata = {
  title: 'Comp AI - Framework Editor',
  description: 'Edit your framework',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getFrameworkEditorUser({ headers: await headers() });
  const hasSession = canAccessFrameworkEditor(user);

  return (
    <ClerkProvider>
      <html lang="en" className="h-full">
        <body className="flex h-full flex-col">
          {hasSession && <Header />}
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
            {children}
            <Toaster />
            <SonnerToaster richColors position="top-right" />
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
