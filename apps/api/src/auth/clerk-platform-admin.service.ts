import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { z } from 'zod';
import { getClerkAuthConfig } from './clerk-auth.config';

const CLERK_API_BASE_URL = 'https://api.clerk.com/v1';

const ClerkUserSchema = z.object({
  id: z.string(),
  private_metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

@Injectable()
export class ClerkPlatformAdminService {
  async isPlatformAdmin(clerkUserId: string): Promise<boolean> {
    const user = await this.fetchClerkUser(clerkUserId);
    return user?.private_metadata?.compAiPlatformAdmin === true;
  }

  async requirePlatformAdmin(clerkUserId: string): Promise<void> {
    const isAdmin = await this.isPlatformAdmin(clerkUserId);
    if (!isAdmin) {
      throw new ForbiddenException(
        'Access denied: Platform admin privileges required',
      );
    }
  }

  private async fetchClerkUser(clerkUserId: string) {
    const { secretKey } = getClerkAuthConfig();
    const response = await fetch(`${CLERK_API_BASE_URL}/users/${clerkUserId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const body = await response.text();
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new BadRequestException(
        body || 'Failed to verify Clerk platform admin capability.',
      );
    }

    const parsed = ClerkUserSchema.safeParse(parseJson(body));
    if (!parsed.success) {
      throw new BadRequestException('Unexpected Clerk user response.');
    }

    return parsed.data;
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new BadRequestException('Clerk user response was not valid JSON.');
  }
}
