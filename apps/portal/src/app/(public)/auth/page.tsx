import { SignIn } from '@clerk/nextjs';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { Logo } from '@trycompai/design-system';
import { ArrowRight } from '@trycompai/design-system/icons';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Login | Comp AI',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await clerkAuth();
  const params = await searchParams;
  const isDeviceAuth = params.device_auth === 'true';
  const callbackPort = typeof params.callback_port === 'string' ? params.callback_port : undefined;
  const state = typeof params.state === 'string' ? params.state : undefined;

  const deviceAuthRedirect =
    isDeviceAuth && callbackPort && state
      ? `/auth/device-callback?callback_port=${encodeURIComponent(callbackPort)}&state=${encodeURIComponent(state)}`
      : undefined;

  if (userId) {
    redirect(deviceAuthRedirect ?? '/');
  }

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="space-y-3 px-6 pt-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center">
              <Logo />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Employee Portal</h1>
            <p className="px-4 text-base text-muted-foreground">
              Enter your email address to receive a one time password.
            </p>
          </div>
          <div className="space-y-6 px-8 pb-6">
            <SignIn
              routing="hash"
              fallbackRedirectUrl={deviceAuthRedirect ?? '/'}
              signUpFallbackRedirectUrl={deviceAuthRedirect ?? '/'}
            />
          </div>
          <div className="px-8 pb-10">
            <div className="from-primary/10 via-primary/5 to-primary/5 rounded-sm bg-gradient-to-r p-4">
              <h3 className="text-sm font-medium">
                Comp AI - AI that handles compliance for you in hours.
              </h3>
              <p className="text-muted-foreground mt-1 text-xs">
                Comp AI makes SOC 2, ISO 27001, HIPAA and GDPR effortless. Eliminate compliance
                busywork, win more deals and accelerate growth.
              </p>
              <Link
                href="https://trycomp.ai"
                target="_blank"
                className="text-primary mt-2 inline-flex items-center gap-2 text-xs font-medium hover:underline hover:underline-offset-2"
              >
                Learn More
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
