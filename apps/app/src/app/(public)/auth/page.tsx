import { LoginForm } from '@/components/login-form';
import { auth } from '@/utils/auth';
import { getSafeRedirectPath } from '@/utils/auth-callback';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@trycompai/ui/card';
import { Icons } from '@trycompai/ui/icons';
import { brandConfig } from '@trycompai/utils/brand';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: `Login | ${brandConfig.displayName}`,
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ inviteCode?: string; redirectTo?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const { inviteCode, redirectTo } = await searchParams;
  const safeRedirectTo = getSafeRedirectPath(redirectTo);

  const orgId = session?.session?.activeOrganizationId;

  if (orgId && inviteCode) {
    redirect('/setup');
  }

  if (orgId && !inviteCode) {
    redirect('/');
  }

  const showGoogle = process.env.APP_DISABLE_GOOGLE_SIGN_IN !== 'true';
  const showGithub = process.env.APP_DISABLE_GITHUB_SIGN_IN !== 'true';
  const showMicrosoft = process.env.APP_DISABLE_MICROSOFT_SIGN_IN !== 'true';

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center space-y-3 pt-10">
            <Icons.Logo className="h-10 w-10 mx-auto" />
            <CardTitle className="text-2xl tracking-tight text-card-foreground">
              Get Started with {brandConfig.displayName}
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground px-4">
              {`Automate SOC 2, ISO 27001 and GDPR compliance with AI.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pb-6 px-8">
            <LoginForm
              inviteCode={inviteCode}
              redirectTo={safeRedirectTo}
              showGoogle={showGoogle}
              showGithub={showGithub}
              showMicrosoft={showMicrosoft}
            />
          </CardContent>
          <CardFooter className="pb-10">
            <p className="w-full px-6 text-center text-xs text-muted-foreground">
              By clicking continue, you acknowledge that you have read and agree to the{' '}
              <Link
                href={`${brandConfig.domains.marketing}/terms-and-conditions`}
                className="underline hover:text-primary"
              >
                Terms and Conditions
              </Link>{' '}
              and{' '}
              <Link
                href={`${brandConfig.domains.marketing}/privacy-policy`}
                className="underline hover:text-primary"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
