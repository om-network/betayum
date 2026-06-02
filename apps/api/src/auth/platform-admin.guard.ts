import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClerkAuthService } from './clerk-auth.service';

interface PlatformAdminRequest {
  userId?: string;
  userEmail?: string;
  isPlatformAdmin?: boolean;
  headers: {
    authorization?: string;
    cookie?: string;
    [key: string]: string | undefined;
  };
}

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly clerkAuthService: ClerkAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformAdminRequest>();
    const session = await this.clerkAuthService.resolveSession(
      request as unknown as Request,
      { skipOrgCheck: true },
    );

    if (!session.actor.isPlatformAdmin) {
      throw new ForbiddenException(
        'Access denied: Platform admin privileges required',
      );
    }

    request.userId = session.actor.id;
    request.userEmail = session.actor.email;
    request.isPlatformAdmin = true;

    return true;
  }
}
