import { Module } from '@nestjs/common';
import { ActingUserResolver } from './acting-user.service';
import { ApiAuthController } from './api-auth.controller';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { AuthController } from './auth.controller';
import { ClerkAuthService } from './clerk-auth.service';
import { HybridAuthGuard } from './hybrid-auth.guard';
import { PermissionGuard } from './permission.guard';

@Module({
  imports: [],
  controllers: [AuthController, ApiAuthController],
  providers: [
    ApiKeyService,
    ApiKeyGuard,
    ClerkAuthService,
    HybridAuthGuard,
    PermissionGuard,
    ActingUserResolver,
  ],
  exports: [
    ApiKeyService,
    ApiKeyGuard,
    ClerkAuthService,
    HybridAuthGuard,
    PermissionGuard,
    ActingUserResolver,
  ],
})
export class AuthModule {}
