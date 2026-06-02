import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { db } from '@db';
import { ClerkAuthService } from './clerk-auth.service';
import { ACTIVE_ORGANIZATION_COOKIE, IMPERSONATION_COOKIE } from './clerk-auth.constants';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { AuthContext } from './auth-context.decorator';
import { SkipOrgCheck } from './skip-org-check.decorator';
import type { AuthContext as AuthContextType } from './types';

function getCookieDomain(): string | undefined {
  const baseUrl = process.env.BASE_URL || '';
  if (baseUrl.includes('staging.trycomp.ai')) {
    return '.staging.trycomp.ai';
  }
  if (baseUrl.includes('trycomp.ai')) {
    return '.trycomp.ai';
  }
  return undefined;
}

function buildSessionResponse(params: {
  sessionId: string;
  activeOrganizationId: string | null;
  impersonatedBy: string | null;
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
    role: string | null;
  };
}) {
  return {
    session: {
      id: params.sessionId,
      userId: params.user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      token: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      activeOrganizationId: params.activeOrganizationId,
      ...(params.impersonatedBy
        ? { impersonatedBy: params.impersonatedBy }
        : {}),
    },
    user: params.user,
  };
}

@Controller({ path: 'api/auth', version: VERSION_NEUTRAL })
@UseGuards(HybridAuthGuard)
export class ApiAuthController {
  constructor(private readonly clerkAuthService: ClerkAuthService) {}

  @Get('get-session')
  @SkipOrgCheck()
  async getSession(@Req() request: Request) {
    const session = await this.clerkAuthService.resolveSession(request, {
      skipOrgCheck: true,
    });

    return buildSessionResponse({
      sessionId: session.sessionId,
      activeOrganizationId: session.activeOrganizationId,
      impersonatedBy: session.impersonatedBy,
      user: session.user,
    });
  }

  @Get('get-full-session')
  @SkipOrgCheck()
  async getFullSession(@Req() request: Request) {
    const session = await this.clerkAuthService.resolveSession(request, {
      skipOrgCheck: true,
    });

    const [activeOrganization, activeMember] = await Promise.all([
      session.activeOrganizationId
        ? db.organization.findUnique({
            where: { id: session.activeOrganizationId },
            select: {
              id: true,
              name: true,
              slug: true,
              logo: true,
              createdAt: true,
            },
          })
        : null,
      session.activeOrganizationId
        ? db.member.findFirst({
            where: {
              organizationId: session.activeOrganizationId,
              userId: session.user.id,
            },
            select: {
              id: true,
              organizationId: true,
              userId: true,
              role: true,
              createdAt: true,
            },
          })
        : null,
    ]);

    return {
      ...buildSessionResponse({
        sessionId: session.sessionId,
        activeOrganizationId: session.activeOrganizationId,
        impersonatedBy: session.impersonatedBy,
        user: session.user,
      }),
      activeOrganization,
      activeMember,
    };
  }

  @Get('organization/list')
  @SkipOrgCheck()
  async listOrganizations(@AuthContext() authContext: AuthContextType) {
    return db.member
      .findMany({
        where: {
          userId: authContext.userId,
          isActive: true,
          deactivated: false,
        },
        select: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      .then((memberships) => memberships.map((membership) => membership.organization));
  }

  @Get('organization/get-active-member')
  async getActiveMember(@AuthContext() authContext: AuthContextType) {
    if (!authContext.userId || !authContext.organizationId) {
      return null;
    }

    return db.member.findFirst({
      where: {
        userId: authContext.userId,
        organizationId: authContext.organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        role: true,
        createdAt: true,
      },
    });
  }

  @Post('organization/set-active')
  @SkipOrgCheck()
  async setActiveOrganization(
    @AuthContext() authContext: AuthContextType,
    @Body() body: { organizationId: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!authContext.userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const membership = await db.member.findFirst({
      where: {
        userId: authContext.userId,
        organizationId: body.organizationId,
        isActive: true,
        deactivated: false,
      },
    });

    if (!membership) {
      throw new UnauthorizedException('You do not have access to this organization');
    }

    response.cookie(ACTIVE_ORGANIZATION_COOKIE, body.organizationId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      domain: getCookieDomain(),
      path: '/',
    });

    return this.getSession(response.req as Request);
  }

  @Post('admin/impersonate-user')
  @SkipOrgCheck()
  async impersonateUser(
    @AuthContext() authContext: AuthContextType,
    @Body() body: { userId: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!authContext.isPlatformAdmin) {
      throw new UnauthorizedException('Platform admin privileges required');
    }

    response.cookie(IMPERSONATION_COOKIE, body.userId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      domain: getCookieDomain(),
      path: '/',
    });

    return { success: true };
  }

  @Post('admin/stop-impersonating')
  @SkipOrgCheck()
  async stopImpersonating(
    @Res({ passthrough: true }) response: Response,
  ) {
    response.clearCookie(IMPERSONATION_COOKIE, {
      domain: getCookieDomain(),
      path: '/',
    });
    return { success: true };
  }
}
