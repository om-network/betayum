import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiExcludeController,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { db } from '@db';
import { OrganizationId } from './auth-context.decorator';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';
import { AuthContext } from './auth-context.decorator';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { SkipOrgCheck } from './skip-org-check.decorator';
import { ClerkOrganizationManagementService } from './clerk-organization-management.service';
import type { AuthContext as AuthContextType } from './types';

@ApiExcludeController()
@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
@UseGuards(HybridAuthGuard)
@ApiSecurity('apikey')
export class AuthController {
  constructor(
    private readonly clerkOrganizations: ClerkOrganizationManagementService,
  ) {}

  @Get('me')
  @SkipOrgCheck()
  @ApiOperation({
    summary: 'Get current user info, organizations, and pending invitations',
  })
  async getMe(@AuthContext() authContext: AuthContextType) {
    const userId = authContext.userId;
    if (!userId) {
      return { user: null, organizations: [], pendingInvitation: null };
    }

    const [user, memberships] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
        },
      }),
      db.member.findMany({
        where: { userId, isActive: true, deactivated: false },
        select: {
          id: true,
          role: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              clerkOrganizationId: true,
              name: true,
              logo: true,
              onboardingCompleted: true,
              hasAccess: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      user,
      organizations: memberships.map((m) => ({
        ...m.organization,
        memberRole: m.role,
        memberId: m.id,
      })),
      pendingInvitation: null,
    };
  }

  @Get('invitations')
  @UseGuards(PermissionGuard)
  @RequirePermission('member', 'read')
  @ApiOperation({ summary: 'List pending invitations for the organization' })
  async listInvitations(@OrganizationId() organizationId: string) {
    const invitations =
      await this.clerkOrganizations.listPendingInvitations(organizationId);

    return { data: invitations };
  }

  @Delete('invitations/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('member', 'delete')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @ApiParam({ name: 'id', description: 'Invitation ID' })
  async deleteInvitation(
    @Param('id') invitationId: string,
    @OrganizationId() organizationId: string,
  ) {
    await this.clerkOrganizations.revokeInvitation({
      organizationId,
      invitationId,
    });

    return { success: true };
  }
}
