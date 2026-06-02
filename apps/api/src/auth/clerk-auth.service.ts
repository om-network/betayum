import { Injectable, UnauthorizedException } from '@nestjs/common';
import { db } from '@db';
import { createClerkClient } from '@clerk/backend';
import type { Request } from 'express';
import { ACTIVE_ORGANIZATION_COOKIE, IMPERSONATION_COOKIE } from './clerk-auth.constants';

interface LocalSessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  role: string | null;
  isPlatformAdmin: boolean;
}

export interface ResolvedClerkSession {
  sessionId: string;
  activeOrganizationId: string | null;
  impersonatedBy: string | null;
  user: LocalSessionUser;
  actor: LocalSessionUser;
}

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((part) => part.trim());
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

function getRequestUrl(request: Request): string {
  const host = request.headers.host ?? 'localhost:3333';
  const protocol =
    (request.headers['x-forwarded-proto'] as string | undefined) ??
    (host.includes('localhost') ? 'http' : 'https');
  return `${protocol}://${host}${request.originalUrl ?? request.url}`;
}

function getAuthorizedParties(): string[] {
  const configuredOrigins = process.env.AUTH_TRUSTED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

  return [
    process.env.BASE_URL ?? 'http://localhost:3333',
    'http://localhost:3000',
    'http://localhost:3002',
    ...configuredOrigins,
  ];
}

async function syncLocalUser(clerkUserId: string): Promise<LocalSessionUser> {
  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const primaryEmail = clerkUser.emailAddresses.find(
    (email) => email.id === clerkUser.primaryEmailAddressId,
  );

  if (!primaryEmail?.emailAddress) {
    throw new UnauthorizedException('Clerk user is missing a primary email address');
  }

  const fullName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() ||
    clerkUser.username ||
    primaryEmail.emailAddress;

  let localUser = await db.user.findFirst({
    where: {
      OR: [
        {
          accounts: {
            some: {
              providerId: 'clerk',
              accountId: clerkUser.id,
            },
          },
        },
        { email: primaryEmail.emailAddress },
      ],
    },
  });

  if (!localUser) {
    localUser = await db.user.create({
      data: {
        email: primaryEmail.emailAddress,
        emailVerified: !!primaryEmail.verification?.status && primaryEmail.verification.status === 'verified',
        image: clerkUser.imageUrl,
        name: fullName,
      },
    });
  } else {
    localUser = await db.user.update({
      where: { id: localUser.id },
      data: {
        email: primaryEmail.emailAddress,
        emailVerified: !!primaryEmail.verification?.status && primaryEmail.verification.status === 'verified',
        image: clerkUser.imageUrl,
        lastLogin: new Date(),
        name: fullName,
      },
    });
  }

  await db.account.upsert({
    where: {
      id: `clerk_${localUser.id}`,
    },
    update: {
      accountId: clerkUser.id,
      providerId: 'clerk',
      userId: localUser.id,
      updatedAt: new Date(),
      createdAt: new Date(),
    },
    create: {
      id: `clerk_${localUser.id}`,
      accountId: clerkUser.id,
      providerId: 'clerk',
      userId: localUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return {
    id: localUser.id,
    email: localUser.email,
    emailVerified: localUser.emailVerified,
    name: localUser.name,
    image: localUser.image ?? null,
    createdAt: localUser.createdAt,
    updatedAt: localUser.updatedAt,
    role: localUser.role ?? null,
    isPlatformAdmin: localUser.role === 'admin' || localUser.isPlatformAdmin,
  };
}

@Injectable()
export class ClerkAuthService {
  async resolveSession(
    request: Request,
    options: { skipOrgCheck?: boolean } = {},
  ): Promise<ResolvedClerkSession> {
    const requestState = await clerkClient.authenticateRequest(
      new Request(getRequestUrl(request), {
        method: request.method,
        headers: new Headers(request.headers as Record<string, string>),
      }),
      {
        authorizedParties: getAuthorizedParties(),
        jwtKey: process.env.CLERK_JWT_KEY,
      },
    );

    if (!requestState.isAuthenticated) {
      throw new UnauthorizedException('Invalid or expired Clerk session');
    }

    const auth = requestState.toAuth();
    if (!auth.userId || !auth.sessionId) {
      throw new UnauthorizedException('Invalid Clerk auth payload');
    }

    const actor = await syncLocalUser(auth.userId);
    const impersonatedUserId = getCookieValue(request.headers.cookie, IMPERSONATION_COOKIE);
    const user =
      impersonatedUserId && impersonatedUserId !== actor.id
        ? await db.user
            .findUnique({ where: { id: impersonatedUserId } })
            .then((localUser) => {
              if (!localUser) {
                return actor;
              }
              return {
                id: localUser.id,
                email: localUser.email,
                emailVerified: localUser.emailVerified,
                name: localUser.name,
                image: localUser.image ?? null,
                createdAt: localUser.createdAt,
                updatedAt: localUser.updatedAt,
                role: localUser.role ?? null,
                isPlatformAdmin:
                  localUser.role === 'admin' || localUser.isPlatformAdmin,
              } satisfies LocalSessionUser;
            })
        : actor;

    let activeOrganizationId = getCookieValue(
      request.headers.cookie,
      ACTIVE_ORGANIZATION_COOKIE,
    );

    if (!activeOrganizationId) {
      const membership = await db.member.findFirst({
        where: {
          userId: user.id,
          deactivated: false,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
        select: { organizationId: true },
      });
      activeOrganizationId = membership?.organizationId ?? null;
    }

    if (!activeOrganizationId && !options.skipOrgCheck) {
      throw new UnauthorizedException(
        'No active organization. Please select an organization.',
      );
    }

    return {
      sessionId: auth.sessionId,
      activeOrganizationId,
      impersonatedBy: user.id !== actor.id ? actor.id : null,
      user,
      actor,
    };
  }
}
