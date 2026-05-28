import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClerkIdentityService } from './clerk-identity.service';
import { ClerkPlatformAdminService } from './clerk-platform-admin.service';
import { ClerkSessionService } from './clerk-session.service';

interface PlatformAdminRequest {
  userId?: string;
  userEmail?: string;
  clerkUserId?: string;
  sessionId?: string;
  isPlatformAdmin?: boolean;
  headers: {
    authorization?: string;
    cookie?: string;
    [key: string]: string | undefined;
  };
}

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly clerkSessionService: ClerkSessionService,
    private readonly clerkIdentityService: ClerkIdentityService,
    private readonly clerkPlatformAdminService: ClerkPlatformAdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformAdminRequest>();
    const authHeader = request.headers['authorization'];
    const cookieHeader = request.headers['cookie'];

    if (!authHeader && !cookieHeader) {
      throw new UnauthorizedException(
        'Platform admin routes require authentication',
      );
    }

    const session = await this.clerkSessionService.verifyRequest({
      authorization: authHeader,
      cookie: cookieHeader,
    });
    const user = await this.clerkIdentityService.resolveMappedUser(
      session.clerkUserId,
    );

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.clerkPlatformAdminService.requirePlatformAdmin(
      session.clerkUserId,
    );

    // Set request context
    request.userId = user.id;
    request.userEmail = user.email;
    request.clerkUserId = session.clerkUserId;
    request.sessionId = session.sessionId;
    request.isPlatformAdmin = true;

    return true;
  }
}
