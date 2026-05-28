import { auth } from '@/utils/auth';
import { db, Departments } from '@db/server';
import { NextRequest, NextResponse } from 'next/server';

const TEST_SESSION_COOKIE = '__session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  if (process.env.E2E_TEST_MODE !== 'true') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Operation timed out after 30 seconds')), 30000);
  });

  try {
    const result = await Promise.race([handleLogin(request), timeoutPromise]);
    return result as NextResponse;
  } catch (error) {
    console.error('[TEST-LOGIN] Error in POST handler:', error);
    return NextResponse.json(
      { error: 'Failed to create test session', details: error },
      { status: 500 },
    );
  }
}

async function handleLogin(request: NextRequest) {
  const body = await request.json().catch((error) => {
    console.error('[TEST-LOGIN] Failed to parse request body:', error);
    return null;
  });

  if (!body || typeof body.email !== 'string') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, name, hasAccess, skipOrg } = body as {
    email: string;
    name?: string;
    hasAccess?: boolean;
    skipOrg?: boolean;
  };

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    await db.user.delete({ where: { email } });
  }

  const user = await db.user.create({
    data: {
      email,
      emailVerified: true,
      name: name || `Test User ${Date.now()}`,
      clerkUserId: `clerk_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    },
  });

  let organizationId: string | null = null;

  if (!skipOrg) {
    const organization = await db.organization.create({
      data: {
        name: `Test Org ${Date.now()}`,
        hasAccess: hasAccess || false,
        members: {
          create: {
            userId: user.id,
            role: 'owner',
            department: Departments.it,
            isActive: true,
            fleetDmLabelId: 0,
          },
        },
      },
    });

    organizationId = organization.id;
  }

  const sessionId = `sess_e2e_${Date.now()}`;
  const sessionToken = createE2ETestSessionToken({
    clerkUserId: user.clerkUserId ?? `clerk_e2e_${user.id}`,
    sessionId,
    organizationId,
  });

  const response = NextResponse.json({
    success: true,
    user,
    session: {
      id: sessionId,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      token: sessionToken,
      createdAt: new Date(),
      updatedAt: new Date(),
      activeOrganizationId: organizationId,
    },
    organizationId,
  });

  response.cookies.set(TEST_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  if (organizationId) {
    await auth.api.setActiveOrganization({
      headers: request.headers,
      body: { organizationId },
    });
    response.cookies.set('active_organization_id', organizationId, {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return response;
}

function createE2ETestSessionToken(input: {
  clerkUserId: string;
  sessionId: string;
  organizationId: string | null;
}): string {
  return `e2e.${Buffer.from(
    JSON.stringify({
      clerkUserId: input.clerkUserId,
      sessionId: input.sessionId,
      organizationId: input.organizationId ?? undefined,
    }),
  ).toString('base64url')}`;
}
