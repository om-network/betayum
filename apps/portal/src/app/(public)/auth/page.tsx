import { SignIn } from '@clerk/nextjs';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { ArrowRight } from '@trycompai/design-system/icons';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Login | Comp AI',
};

function AuthLogo() {
  return (
    <svg
      viewBox="0 0 272 272"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-10 w-10"
    >
      <path
        d="M204 52.885L195.465 46.2399L136.011 0L0 105.77V166.217L136.011 272L272 166.217V105.77L204 52.885ZM136.011 26.631L178.349 59.5553L156.598 76.4509L154.653 77.9583L136.011 63.4621L81.6113 105.77L100.253 120.266L117.369 133.594L136.011 148.091L190.4 105.758L171.781 91.2613L173.725 89.7538L195.476 72.8583L237.791 105.77L216.04 122.691L136.023 184.934L93.6851 152.01L76.5692 138.707L55.9827 122.703L34.2431 105.783L136.011 26.631Z"
        fill="#16171B"
      />
    </svg>
  );
}

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
              <AuthLogo />
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
