import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { db } from '@db';
import { z } from 'zod';

const ClerkIdentitySchema = z.object({
  clerkUserId: z.string().trim().min(1),
  email: z.string().email().transform((value) => value.toLowerCase()),
  emailVerified: z.boolean(),
  name: z.string().trim().min(1).nullable().optional(),
  image: z.string().url().nullable().optional(),
});

type ClerkIdentityInput = z.input<typeof ClerkIdentitySchema>;
type ParsedClerkIdentity = z.output<typeof ClerkIdentitySchema>;

const userSelect = {
  id: true,
  email: true,
  emailVerified: true,
  name: true,
  image: true,
  role: true,
  clerkUserId: true,
} as const;

type CompAiIdentityUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
  role: string | null;
  clerkUserId: string | null;
};

export type ClerkIdentityResolveSource =
  | 'clerk-user-id'
  | 'verified-email-link'
  | 'created-user';

export type ClerkIdentityResolution = {
  user: CompAiIdentityUser;
  source: ClerkIdentityResolveSource;
};

@Injectable()
export class ClerkIdentityService {
  async resolveMappedUser(clerkUserId: string): Promise<CompAiIdentityUser> {
    const parsedClerkUserId = z.string().trim().min(1).safeParse(clerkUserId);

    if (!parsedClerkUserId.success) {
      throw new UnauthorizedException('Invalid Clerk user id.');
    }

    const user = await db.user.findUnique({
      where: { clerkUserId: parsedClerkUserId.data },
      select: userSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Clerk user is not linked to Comp AI.');
    }

    return user;
  }

  async resolveUser(
    input: ClerkIdentityInput,
  ): Promise<ClerkIdentityResolution> {
    const identity = this.parseIdentity(input);

    const userByClerkId = await db.user.findUnique({
      where: { clerkUserId: identity.clerkUserId },
      select: userSelect,
    });

    if (userByClerkId) {
      return { user: userByClerkId, source: 'clerk-user-id' };
    }

    if (!identity.emailVerified) {
      throw new UnauthorizedException(
        'A verified Clerk email is required to link a Comp AI user.',
      );
    }

    const userByEmail = await db.user.findUnique({
      where: { email: identity.email },
      select: userSelect,
    });

    if (userByEmail) {
      if (
        userByEmail.clerkUserId &&
        userByEmail.clerkUserId !== identity.clerkUserId
      ) {
        throw new ConflictException(
          'This email is already linked to a different Clerk user.',
        );
      }

      const linkedUser = await db.user.update({
        where: { id: userByEmail.id },
        data: { clerkUserId: identity.clerkUserId },
        select: userSelect,
      });

      return { user: linkedUser, source: 'verified-email-link' };
    }

    const createdUser = await db.user.create({
      data: {
        email: identity.email,
        emailVerified: true,
        clerkUserId: identity.clerkUserId,
        name: this.resolveName(identity),
        image: identity.image ?? null,
      },
      select: userSelect,
    });

    return { user: createdUser, source: 'created-user' };
  }

  private parseIdentity(input: ClerkIdentityInput): ParsedClerkIdentity {
    const parsed = ClerkIdentitySchema.safeParse(input);

    if (!parsed.success) {
      throw new UnauthorizedException('Invalid Clerk identity.');
    }

    return parsed.data;
  }

  private resolveName(identity: ParsedClerkIdentity): string {
    if (identity.name) {
      return identity.name;
    }

    return identity.email.split('@')[0] ?? identity.email;
  }
}
