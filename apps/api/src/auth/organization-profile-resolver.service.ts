import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { db } from '@db';
import { z } from 'zod';

const RequiredIdSchema = z.string().trim().min(1);

const organizationProfileSelect = {
  id: true,
  clerkOrganizationId: true,
  name: true,
  slug: true,
} as const;

export interface OrganizationProfileContext {
  id: string;
  clerkOrganizationId: string | null;
  name: string;
  slug: string;
}

@Injectable()
export class OrganizationProfileResolverService {
  async resolveByClerkOrganizationId({
    clerkOrganizationId,
  }: {
    clerkOrganizationId: string;
  }): Promise<OrganizationProfileContext | null> {
    const parsedClerkOrganizationId = this.parseRequiredId({
      value: clerkOrganizationId,
      errorMessage: 'Invalid Clerk organization id.',
    });

    return db.organization.findUnique({
      where: { clerkOrganizationId: parsedClerkOrganizationId },
      select: organizationProfileSelect,
    });
  }

  async requireByClerkOrganizationId({
    clerkOrganizationId,
  }: {
    clerkOrganizationId: string;
  }): Promise<OrganizationProfileContext> {
    const organization = await this.resolveByClerkOrganizationId({
      clerkOrganizationId,
    });
    if (!organization) {
      throw new UnauthorizedException(
        'Clerk organization is not linked to a Comp AI organization.',
      );
    }

    return organization;
  }

  async resolveByLocalOrganizationId({
    organizationId,
  }: {
    organizationId: string;
  }): Promise<OrganizationProfileContext | null> {
    const parsedOrganizationId = this.parseRequiredId({
      value: organizationId,
      errorMessage: 'Invalid organization id.',
    });

    return db.organization.findUnique({
      where: { id: parsedOrganizationId },
      select: organizationProfileSelect,
    });
  }

  async requireByLocalOrganizationId({
    organizationId,
  }: {
    organizationId: string;
  }): Promise<OrganizationProfileContext> {
    const organization = await this.resolveByLocalOrganizationId({
      organizationId,
    });
    if (!organization) {
      throw new UnauthorizedException(
        'Organization not found for the provided organization id.',
      );
    }

    return organization;
  }

  async linkClerkOrganization({
    organizationId,
    clerkOrganizationId,
  }: {
    organizationId: string;
    clerkOrganizationId: string;
  }): Promise<OrganizationProfileContext> {
    const parsedOrganizationId = this.parseRequiredId({
      value: organizationId,
      errorMessage: 'Invalid organization id.',
    });
    const parsedClerkOrganizationId = this.parseRequiredId({
      value: clerkOrganizationId,
      errorMessage: 'Invalid Clerk organization id.',
    });

    try {
      return await db.organization.update({
        where: { id: parsedOrganizationId },
        data: { clerkOrganizationId: parsedClerkOrganizationId },
        select: organizationProfileSelect,
      });
    } catch (error) {
      if (hasPrismaErrorCode({ error, code: 'P2002' })) {
        throw new ConflictException(
          'Clerk organization is already linked to another Comp AI organization.',
        );
      }

      if (hasPrismaErrorCode({ error, code: 'P2025' })) {
        throw new NotFoundException(
          'Organization not found for the provided organization id.',
        );
      }

      throw error;
    }
  }

  private parseRequiredId({
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
