import { env } from '@/env.mjs';
import { serverApi } from '@/lib/api-server';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import {
  SUPPORT_CONTEXT_COOKIE,
  createSupportContextPayload,
  parseSupportContext,
  signSupportContext,
} from '@trycompai/utils/support-context';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const supportContextRequestSchema = z.object({
  organizationId: z.string().trim().min(1),
  targetUserId: z.string().trim().min(1),
});

const SUPPORT_CONTEXT_DURATION_MS = 30 * 60 * 1000;

type SupportContextApiResponse = {
  organizationId: string;
  organizationName: string;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail: string;
};

type MeApiResponse = {
  user: {
    id: string;
  } | null;
};

export async function GET() {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SUPPORT_CONTEXT_COOKIE)?.value;
  if (!cookieValue) {
    return NextResponse.json({ active: false });
  }

  try {
    const payload = parseSupportContext({
      cookieValue,
      secret: env.AUTH_SECRET,
    });

    return NextResponse.json({
      active: true,
      context: {
        organizationId: payload.organizationId,
        organizationName: payload.organizationName,
        targetUserId: payload.targetUserId,
        targetUserName: payload.targetUserName,
        targetUserEmail: payload.targetUserEmail,
        expiresAt: payload.expiresAt,
      },
    });
  } catch {
    const response = NextResponse.json({ active: false });
    applyCookie({
      response,
      value: '',
      expires: new Date(0),
      domain: await resolveCookieDomain(),
    });
    return response;
  }
}

export async function POST(request: Request) {
  const { userId } = await clerkAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const meResponse = await serverApi.get<MeApiResponse>('/v1/auth/me');
  const actorUserId = meResponse.data?.user?.id;
  if (!actorUserId) {
    return NextResponse.json(
      { error: meResponse.error ?? 'Unable to resolve current user' },
      { status: meResponse.status || 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = supportContextRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid support context payload' }, { status: 400 });
  }

  const { organizationId, targetUserId } = parsed.data;
  const apiResponse = await serverApi.post<SupportContextApiResponse>(
    `/v1/admin/organizations/${organizationId}/support-context`,
    { targetUserId },
  );

  if (!apiResponse.data) {
    return NextResponse.json(
      { error: apiResponse.error ?? 'Failed to start support context' },
      { status: apiResponse.status || 500 },
    );
  }

  const expiresAt = Date.now() + SUPPORT_CONTEXT_DURATION_MS;
  const signedCookie = signSupportContext({
    payload: createSupportContextPayload({
      actorUserId,
      organizationId: apiResponse.data.organizationId,
      organizationName: apiResponse.data.organizationName,
      targetUserId: apiResponse.data.targetUserId,
      targetUserName: apiResponse.data.targetUserName,
      targetUserEmail: apiResponse.data.targetUserEmail,
      expiresAt,
    }),
    secret: env.AUTH_SECRET,
  });

  const response = NextResponse.json({
    active: true,
    context: {
      organizationId: apiResponse.data.organizationId,
      organizationName: apiResponse.data.organizationName,
      targetUserId: apiResponse.data.targetUserId,
      targetUserName: apiResponse.data.targetUserName,
      targetUserEmail: apiResponse.data.targetUserEmail,
      expiresAt,
    },
  });
  applyCookie({
    response,
    value: signedCookie,
    expires: new Date(expiresAt),
    domain: await resolveCookieDomain(),
  });

  return response;
}

export async function DELETE(request: Request) {
  const { userId } = await clerkAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const organizationId = requestUrl.searchParams.get('organizationId');

  if (organizationId) {
    await serverApi.delete(
      `/v1/admin/organizations/${organizationId}/support-context`,
    );
  }

  const response = NextResponse.json({ success: true });
  applyCookie({
    response,
    value: '',
    expires: new Date(0),
    domain: await resolveCookieDomain(),
  });
  return response;
}

function applyCookie({
  response,
  value,
  expires,
  domain,
}: {
  response: NextResponse;
  value: string;
  expires: Date;
  domain?: string;
}) {
  response.cookies.set({
    name: SUPPORT_CONTEXT_COOKIE,
    value,
    expires,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    domain,
  });
}

async function resolveCookieDomain(): Promise<string | undefined> {
  const headerStore = await headers();
  const host = headerStore.get('host');
  if (!host) {
    return undefined;
  }

  const hostname = host.split(':')[0];
  if (hostname.endsWith('.staging.trycomp.ai')) {
    return '.staging.trycomp.ai';
  }
  if (hostname.endsWith('.trycomp.ai')) {
    return '.trycomp.ai';
  }

  return undefined;
}
