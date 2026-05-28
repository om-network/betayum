import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClerkIdentityService } from './clerk-identity.service';
import { ClerkPlatformAdminService } from './clerk-platform-admin.service';
import { ClerkSessionService } from './clerk-session.service';
import { MemberProfileResolverService } from './member-profile-resolver.service';
import { OrganizationProfileResolverService } from './organization-profile-resolver.service';
import { SupportContextService } from './support-context.service';
import { AuthenticatedRequest } from './types';

@Injectable()
export class ClerkRequestAuthService {
  constructor(
    private readonly clerkIdentityService: ClerkIdentityService,
    private readonly clerkSessionService: ClerkSessionService,
    private readonly organizationProfileResolver: OrganizationProfileResolverService,
    private readonly memberProfileResolver: MemberProfileResolverService,
    private readonly supportContextService: SupportContextService,
    private readonly clerkPlatformAdminService: ClerkPlatformAdminService,
  ) {}

  async authenticate(
    request: AuthenticatedRequest,
    skipOrgCheck = false,
  ): Promise<boolean> {
    const authorization = request.headers['authorization'] as
      | string
      | undefined;
    const cookie = request.headers['cookie'] as string | undefined;

    const session = await this.clerkSessionService.verifyRequest({
      authorization,
      cookie,
    });
    const actorUser = await this.clerkIdentityService.resolveMappedUser(
      session.clerkUserId,
    );

    const requestedLocalOrganizationId = request.headers[
      'x-organization-id'
    ] as string | undefined;
    const clerkOrganizationId = session.organizationId;
    const hasSupportContextCookie =
      this.supportContextService.resolveCookieValue(cookie) !== null;
    const actorIsPlatformAdmin = hasSupportContextCookie
      ? await this.clerkPlatformAdminService.isPlatformAdmin(
          session.clerkUserId,
        )
      : false;
    const supportContext = hasSupportContextCookie
      ? await this.supportContextService.resolve({
          actor: {
            id: actorUser.id,
            isPlatformAdmin: actorIsPlatformAdmin,
          },
          cookieHeader: cookie,
          requestedOrganizationId: requestedLocalOrganizationId,
        })
      : null;

    if (!supportContext && !clerkOrganizationId && !skipOrgCheck) {
      throw new UnauthorizedException(
        'No active organization. Please select an organization.',
      );
    }

    if (!supportContext && !session.organizationRole && !skipOrgCheck) {
      throw new UnauthorizedException(
        'Clerk organization membership is required for the active organization.',
      );
    }

    const organizationId = supportContext
      ? supportContext.organizationId
      : await this.resolveLocalOrganizationId({
          clerkOrganizationId,
          skipOrgCheck,
        });

    if (
      !supportContext &&
      organizationId &&
      requestedLocalOrganizationId &&
      requestedLocalOrganizationId !== organizationId
    ) {
      throw new UnauthorizedException(
        'Requested organization does not match the active Clerk organization.',
      );
    }

    let resolvedUserId = actorUser.id;
    let resolvedUserEmail = actorUser.email;
    let userRoles: string[] | null = null;
    let impersonatedBy = session.impersonatedBy;
    let isPlatformAdmin = actorIsPlatformAdmin;

    if (supportContext) {
      resolvedUserId = supportContext.targetUserId;
      resolvedUserEmail = supportContext.targetUserEmail;
      userRoles = supportContext.targetUserRoles;
      request.memberId = supportContext.memberId;
      request.memberDepartment = supportContext.memberDepartment;
      impersonatedBy = supportContext.impersonatedBy;
      isPlatformAdmin = false;
    } else if (organizationId && clerkOrganizationId && !skipOrgCheck) {
      const profile =
        await this.memberProfileResolver.resolveByClerkUserAndOrganization({
          clerkUserId: session.clerkUserId,
          clerkOrganizationId,
        });

      userRoles = profile?.role ? profile.role.split(',') : null;
      request.memberId = profile?.id;
      request.memberDepartment = profile?.department;
    }

    request.clerkUserId = session.clerkUserId;
    request.clerkOrganizationId = clerkOrganizationId;
    request.clerkOrganizationRole = session.organizationRole;
    request.clerkOrganizationPermissions = session.organizationPermissions;
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

  private async resolveLocalOrganizationId({
    clerkOrganizationId,
    skipOrgCheck,
  }: {
    clerkOrganizationId?: string;
    skipOrgCheck: boolean;
  }): Promise<string> {
    if (!clerkOrganizationId || skipOrgCheck) {
      return '';
    }

    const organization =
      await this.organizationProfileResolver.requireByClerkOrganizationId({
        clerkOrganizationId,
      });

    return organization.id;
  }
}
