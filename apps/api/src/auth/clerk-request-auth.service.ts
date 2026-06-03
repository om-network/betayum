import { Injectable, UnauthorizedException } from '@nestjs/common';
import { db } from '@db';
import { ClerkIdentityService } from './clerk-identity.service';
import { ClerkSessionService } from './clerk-session.service';
import { AuthenticatedRequest } from './types';

@Injectable()
export class ClerkRequestAuthService {
  constructor(
    private readonly clerkIdentityService: ClerkIdentityService,
    private readonly clerkSessionService: ClerkSessionService,
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
    const user = await this.clerkIdentityService.resolveMappedUser(
      session.clerkUserId,
    );

    const organizationId =
      (request.headers['x-organization-id'] as string | undefined) ??
      session.organizationId;
    if (!organizationId && !skipOrgCheck) {
      throw new UnauthorizedException(
        'No active organization. Please select an organization.',
      );
    }

    let userRoles: string[] | null = null;
    if (organizationId && !skipOrgCheck) {
      const member = await db.member.findFirst({
        where: {
          userId: user.id,
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

    request.userId = user.id;
    request.userEmail = user.email;
    request.userRoles = userRoles;
    request.organizationId = organizationId || '';
    request.authType = 'session';
    request.isApiKey = false;
    request.isServiceToken = false;
    request.isPlatformAdmin = user.role === 'admin';
    request.sessionId = session.sessionId;
    request.sessionDeviceAgent = false;
    request.impersonatedBy = session.impersonatedBy;

    return true;
  }
}
