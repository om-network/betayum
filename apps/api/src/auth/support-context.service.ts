import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Departments, db } from '@db';
import {
  SUPPORT_CONTEXT_COOKIE,
  parseSupportContext,
} from '@trycompai/utils/support-context';

type SupportContextActor = {
  id: string;
  role: string | null;
};

type ResolveSupportContextParams = {
  actor: SupportContextActor;
  cookieHeader?: string;
  requestedOrganizationId?: string;
};

type SupportContextTarget = {
  memberId: string;
  memberDepartment: Departments;
  organizationId: string;
  targetUserId: string;
  targetUserEmail: string;
  targetUserRoles: string[] | null;
  impersonatedBy: string;
};

@Injectable()
export class SupportContextService {
  resolveCookieValue(cookieHeader?: string): string | null {
    if (!cookieHeader) {
      return null;
    }

    for (const segment of cookieHeader.split(';')) {
      const [name, ...valueParts] = segment.trim().split('=');
      if (name !== SUPPORT_CONTEXT_COOKIE) {
        continue;
      }

      return decodeURIComponent(valueParts.join('='));
    }

    return null;
  }

  async resolve({
    actor,
    cookieHeader,
    requestedOrganizationId,
  }: ResolveSupportContextParams): Promise<SupportContextTarget | null> {
    const cookieValue = this.resolveCookieValue(cookieHeader);
    if (!cookieValue) {
      return null;
    }

    if (actor.role !== 'admin') {
      throw new UnauthorizedException(
        'Support context requires platform admin privileges.',
      );
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new UnauthorizedException(
        'Support context is unavailable: missing auth secret.',
      );
    }

    let payload: ReturnType<typeof parseSupportContext>;
    try {
      payload = parseSupportContext({ cookieValue, secret });
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Invalid support context.',
      );
    }

    if (payload.actorUserId !== actor.id) {
      throw new UnauthorizedException(
        'Support context actor does not match the authenticated admin.',
      );
    }

    if (
      requestedOrganizationId &&
      requestedOrganizationId !== payload.organizationId
    ) {
      throw new UnauthorizedException(
        'Support context cannot cross organization boundaries.',
      );
    }

    const member = await db.member.findFirst({
      where: {
        organizationId: payload.organizationId,
        userId: payload.targetUserId,
        deactivated: false,
      },
      select: {
        id: true,
        role: true,
        department: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!member) {
      throw new UnauthorizedException(
        'Support context target is not an active member of the organization.',
      );
    }

    return {
      memberId: member.id,
      memberDepartment: member.department,
      organizationId: payload.organizationId,
      targetUserId: member.user.id,
      targetUserEmail: member.user.email,
      targetUserRoles: member.role ? member.role.split(',') : null,
      impersonatedBy: actor.id,
    };
  }
}
