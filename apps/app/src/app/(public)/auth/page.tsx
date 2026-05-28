import { getSafeRedirectPath } from '@/utils/auth-callback';
import { SignIn } from '@clerk/nextjs';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@trycompai/ui/card';
import { Icons } from '@trycompai/ui/icons';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Login | Comp AI',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ inviteCode?: string; redirectTo?: string }>;
}) {
  const { inviteCode, redirectTo } = await searchParams;
  const safeRedirectTo = getSafeRedirectPath(redirectTo);
  const { userId } = await clerkAuth();

  if (userId) {
    redirect(inviteCode ? '/setup' : safeRedirectTo || '/');
  }

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader className="space-y-3 pt-10 text-center">
            <Icons.Logo className="mx-auto h-10 w-10" />
            <CardTitle className="text-2xl tracking-tight text-card-foreground">
              Get Started with Comp AI
            </CardTitle>
            <CardDescription className="px-4 text-base text-muted-foreground">
              {`Automate SOC 2, ISO 27001 and GDPR compliance with AI.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-8 pb-6">
            <SignIn
              routing="virtual"
              fallbackRedirectUrl={safeRedirectTo || '/'}
              signUpForceRedirectUrl={inviteCode ? '/setup' : safeRedirectTo || '/'}
            />
          </CardContent>
          <CardFooter className="pb-10" />
        </Card>
      </main>
    </div>
  );
}
