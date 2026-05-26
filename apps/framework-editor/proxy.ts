import { clerkMiddleware } from '@clerk/nextjs/server';
import { type NextRequest, NextResponse } from 'next/server';

async function handleProxy(_request: NextRequest) {
  return NextResponse.next();
}

export const proxy = clerkMiddleware(async (_auth, request) => handleProxy(request));

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
