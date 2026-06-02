import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextFetchEvent } from 'next/server';
import { type NextRequest, NextResponse } from 'next/server';

const clerkProxy = clerkMiddleware(async (auth, request: NextRequest) => {
  const { userId } = await auth();

  if (
    !userId &&
    request.nextUrl.pathname !== '/auth' &&
    request.nextUrl.pathname !== '/sso-callback'
  ) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }
  return NextResponse.next();
});

export async function proxy(request: NextRequest, event?: NextFetchEvent): Promise<NextResponse> {
  const response = await clerkProxy(request, event as NextFetchEvent);
  return (response ?? NextResponse.next()) as NextResponse;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|monitoring|ingest).*)'],
};
