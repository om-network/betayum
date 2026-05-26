import { getSafeRedirectPath } from '@/utils/auth-callback';
import { SignIn } from '@clerk/nextjs';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { Logo } from '@trycompai/design-system';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Login | Comp AI',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ inviteCode?: string; redirectTo?: string }>;
}) {
  const { userId } = await clerkAuth();
  const { inviteCode, redirectTo } = await searchParams;
  const safeRedirectTo = getSafeRedirectPath(redirectTo);

  if (userId && inviteCode) {
    redirect('/setup');
  }

  if (userId && !inviteCode) {
    redirect('/');
  }

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="space-y-3 px-6 pt-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center">
              <Logo />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Get Started with Comp AI</h1>
            <p className="px-4 text-base text-muted-foreground">
              {`Automate SOC 2, ISO 27001 and GDPR compliance with AI.`}
            </p>
          </div>
          <div className="space-y-6 px-8 pb-6">
            <SignIn
              routing="hash"
              fallbackRedirectUrl={safeRedirectTo}
              signUpFallbackRedirectUrl={safeRedirectTo}
            />
          </div>
          <div className="pb-10">
            <p className="w-full px-6 text-center text-xs text-muted-foreground">
              By clicking continue, you acknowledge that you have read and agree to the{' '}
              <Link
                href="https://trycomp.ai/terms-and-conditions"
                className="underline hover:text-primary"
              >
                Terms and Conditions
              </Link>{' '}
              and{' '}
              <Link
                href="https://trycomp.ai/privacy-policy"
                className="underline hover:text-primary"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
