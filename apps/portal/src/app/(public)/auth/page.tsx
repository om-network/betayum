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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await searchParams;
  const { userId } = await clerkAuth();

  if (userId) {
    redirect('/');
  }

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader className="space-y-3 pt-10 text-center">
            <Icons.Logo className="mx-auto h-10 w-10" />
            <CardTitle className="text-2xl tracking-tight text-card-foreground">
              Employee Portal
            </CardTitle>
            <CardDescription className="px-4 text-base text-muted-foreground">
              Sign in to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pb-6">
            <SignIn routing="virtual" fallbackRedirectUrl="/" />
          </CardContent>
          <CardFooter className="pb-10" />
        </Card>
      </main>
    </div>
  );
}
