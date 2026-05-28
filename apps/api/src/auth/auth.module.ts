import { Module } from '@nestjs/common';
import { ActingUserResolver } from './acting-user.service';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { AuthController } from './auth.controller';
import { ClerkIdentityService } from './clerk-identity.service';
import { ClerkRequestAuthService } from './clerk-request-auth.service';
import { ClerkSessionService } from './clerk-session.service';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { OrganizationProfileResolverService } from './organization-profile-resolver.service';
import { PermissionEvaluatorService } from './permission-evaluator.service';
import { PermissionGuard } from './permission.guard';
import { SupportContextService } from './support-context.service';

@Module({
  controllers: [AuthController],
  providers: [
    ApiKeyService,
    ApiKeyGuard,
    ClerkIdentityService,
    ClerkRequestAuthService,
    ClerkSessionService,
    HybridAuthGuard,
    OrganizationProfileResolverService,
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
    OrganizationProfileResolverService,
    PermissionEvaluatorService,
    PermissionGuard,
    SupportContextService,
    ActingUserResolver,
  ],
})
export class AuthModule {}
