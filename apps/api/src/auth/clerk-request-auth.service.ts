import { Injectable, UnauthorizedException } from '@nestjs/common';
import { db } from '@db';
import { ClerkIdentityService } from './clerk-identity.service';
import { ClerkSessionService } from './clerk-session.service';
import { SupportContextService } from './support-context.service';
import { AuthenticatedRequest } from './types';

@Injectable()
export class ClerkRequestAuthService {
  constructor(
    private readonly clerkIdentityService: ClerkIdentityService,
    private readonly clerkSessionService: ClerkSessionService,
    private readonly supportContextService: SupportContextService,
  ) {}

  async authenticate(
    request: AuthenticatedRequest,
    skipOrgCheck = false,
  ): Promise<boolean> {
    const authorization = request.headers['authorization'] as string | undefined;
    const cookie = request.headers['cookie'] as string | undefined;

    const session = await this.clerkSessionService.verifyRequest({
      authorization,
      cookie,
    });
    const actorUser = await this.clerkIdentityService.resolveMappedUser(
      session.clerkUserId,
    );

    const requestedOrganizationId =
      (request.headers['x-organization-id'] as string | undefined) ??
      session.organizationId;
    const supportContext = await this.supportContextService.resolve({
      actor: {
        id: actorUser.id,
        role: actorUser.role,
      },
      cookieHeader: cookie,
      requestedOrganizationId,
    });

    const organizationId =
      supportContext?.organizationId ?? requestedOrganizationId;
    if (!organizationId && !skipOrgCheck) {
      throw new UnauthorizedException(
        'No active organization. Please select an organization.',
      );
    }

    let resolvedUserId = actorUser.id;
    let resolvedUserEmail = actorUser.email;
    let userRoles: string[] | null = null;
    let impersonatedBy = session.impersonatedBy;
    let isPlatformAdmin = actorUser.role === 'admin';

    if (supportContext) {
      resolvedUserId = supportContext.targetUserId;
      resolvedUserEmail = supportContext.targetUserEmail;
      userRoles = supportContext.targetUserRoles;
      request.memberId = supportContext.memberId;
      request.memberDepartment = supportContext.memberDepartment;
      impersonatedBy = supportContext.impersonatedBy;
      isPlatformAdmin = false;
    } else if (organizationId && !skipOrgCheck) {
      const member = await db.member.findFirst({
        where: {
          userId: actorUser.id,
          organizationId,
          deactivated: false,
        },
        select: {
          id: true,
          role: true,
          department: true,
        },
      });

      if (!member) {
        throw new UnauthorizedException(
          'User is not a member of the active organization',
        );
      }

      userRoles = member.role ? member.role.split(',') : null;
      request.memberId = member.id;
      request.memberDepartment = member.department;
    }

    request.userId = resolvedUserId;
    request.userEmail = resolvedUserEmail;
    request.userRoles = userRoles;
    request.organizationId = organizationId || '';
    request.authType = 'session';
    request.isApiKey = false;
    request.isServiceToken = false;
    request.isPlatformAdmin = isPlatformAdmin;
    request.sessionId = session.sessionId;
    request.sessionDeviceAgent = false;
    request.impersonatedBy = impersonatedBy;

    return true;
  }
}
