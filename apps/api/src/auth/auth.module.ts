import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './auth.server';
import { ActingUserResolver } from './acting-user.service';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { AuthController } from './auth.controller';
import { ClerkIdentityService } from './clerk-identity.service';
import { ClerkRequestAuthService } from './clerk-request-auth.service';
import { ClerkSessionService } from './clerk-session.service';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { PermissionEvaluatorService } from './permission-evaluator.service';
import { PermissionGuard } from './permission.guard';
import { SupportContextService } from './support-context.service';

@Module({
  imports: [
    // Better Auth NestJS integration - handles /api/auth/* routes
    BetterAuthModule.forRoot({
      auth,
      // Don't register global auth guard - we use HybridAuthGuard
      disableGlobalAuthGuard: true,
      // CORS is already configured in main.ts — prevent the module from
      // overriding it with its own trustedOrigins-based CORS.
      disableTrustedOriginsCors: true,
      // Body parsing for non-auth routes is handled in main.ts with a
      // custom middleware that skips /api/auth paths. Disable the module's
      // own SkipBodyParsingMiddleware to avoid conflicts.
      disableBodyParser: true,
    }),
  ],
  controllers: [AuthController],
  providers: [
    ApiKeyService,
    ApiKeyGuard,
    ClerkIdentityService,
    ClerkRequestAuthService,
    ClerkSessionService,
    HybridAuthGuard,
    PermissionEvaluatorService,
    PermissionGuard,
    SupportContextService,
    ActingUserResolver,
  ],
  exports: [
    ApiKeyService,
    ApiKeyGuard,
    ClerkIdentityService,
    ClerkRequestAuthService,
    ClerkSessionService,
    HybridAuthGuard,
    PermissionEvaluatorService,
    PermissionGuard,
    SupportContextService,
    ActingUserResolver,
    BetterAuthModule,
  ],
})
export class AuthModule {}
