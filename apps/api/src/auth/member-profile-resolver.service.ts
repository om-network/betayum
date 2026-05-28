import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Departments, db } from '@db';
import { z } from 'zod';

const RequiredIdSchema = z.string().trim().min(1);

const memberProfileSelect = {
  id: true,
  organizationId: true,
  userId: true,
  clerkUserId: true,
  clerkOrganizationId: true,
  clerkMembershipId: true,
  role: true,
  department: true,
  isActive: true,
  deactivated: true,
} as const;

export interface MemberProfileContext {
  id: string;
  organizationId: string;
  userId: string;
  clerkUserId: string | null;
  clerkOrganizationId: string | null;
  clerkMembershipId: string | null;
  role: string;
  department: Departments;
  isActive: boolean;
  deactivated: boolean;
}

/**
 * Resolves product profile data only. Browser-session authorization must be
 * decided from Clerk membership and permissions before using these profiles.
 */
@Injectable()
export class MemberProfileResolverService {
  async resolveByClerkMembershipId({
    clerkMembershipId,
  }: {
    clerkMembershipId: string;
  }): Promise<MemberProfileContext | null> {
    const parsedClerkMembershipId = parseRequiredId({
      value: clerkMembershipId,
      errorMessage: 'Invalid Clerk membership id.',
    });

    return db.member.findUnique({
      where: { clerkMembershipId: parsedClerkMembershipId },
      select: memberProfileSelect,
    });
  }

  async resolveByClerkUserAndOrganization({
    clerkUserId,
    clerkOrganizationId,
  }: {
    clerkUserId: string;
    clerkOrganizationId: string;
  }): Promise<MemberProfileContext | null> {
    const parsedClerkUserId = parseRequiredId({
      value: clerkUserId,
      errorMessage: 'Invalid Clerk user id.',
    });
    const parsedClerkOrganizationId = parseRequiredId({
      value: clerkOrganizationId,
      errorMessage: 'Invalid Clerk organization id.',
    });

    return db.member.findUnique({
      where: {
        clerkOrganizationId_clerkUserId: {
          clerkOrganizationId: parsedClerkOrganizationId,
          clerkUserId: parsedClerkUserId,
        },
      },
      select: memberProfileSelect,
    });
  }

  async linkClerkMembership({
    memberId,
    clerkUserId,
    clerkOrganizationId,
    clerkMembershipId,
  }: {
    memberId: string;
    clerkUserId: string;
    clerkOrganizationId: string;
    clerkMembershipId: string;
  }): Promise<MemberProfileContext> {
    const parsedMemberId = parseRequiredId({
      value: memberId,
      errorMessage: 'Invalid member profile id.',
    });
    const parsedClerkUserId = parseRequiredId({
      value: clerkUserId,
      errorMessage: 'Invalid Clerk user id.',
    });
    const parsedClerkOrganizationId = parseRequiredId({
      value: clerkOrganizationId,
      errorMessage: 'Invalid Clerk organization id.',
    });
    const parsedClerkMembershipId = parseRequiredId({
      value: clerkMembershipId,
      errorMessage: 'Invalid Clerk membership id.',
    });

    try {
      return await db.member.update({
        where: { id: parsedMemberId },
        data: {
          clerkUserId: parsedClerkUserId,
          clerkOrganizationId: parsedClerkOrganizationId,
          clerkMembershipId: parsedClerkMembershipId,
        },
        select: memberProfileSelect,
      });
    } catch (error) {
      if (hasPrismaErrorCode({ error, code: 'P2002' })) {
        throw new ConflictException(
          'Clerk membership is already linked to another member profile.',
        );
      }

      if (hasPrismaErrorCode({ error, code: 'P2025' })) {
        throw new NotFoundException(
          'Member profile not found for the provided member id.',
        );
      }

      throw error;
    }
  }

  async unlinkClerkMembership({
    clerkMembershipId,
  }: {
    clerkMembershipId: string;
  }): Promise<boolean> {
    const parsedClerkMembershipId = parseRequiredId({
      value: clerkMembershipId,
      errorMessage: 'Invalid Clerk membership id.',
    });

    const result = await db.member.updateMany({
      where: { clerkMembershipId: parsedClerkMembershipId },
      data: { clerkMembershipId: null },
    });

    return result.count > 0;
  }
}

function parseRequiredId({
  value,
  errorMessage,
}: {
  value: string;
  errorMessage: string;
}): string {
  const parsed = RequiredIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new UnauthorizedException(errorMessage);
  }

  return parsed.data;
}

function hasPrismaErrorCode({
  error,
  code,
}: {
  error: unknown;
  code: string;
}): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
