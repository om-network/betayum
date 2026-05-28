import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RESTRICTED_ROLES,
  PRIVILEGED_ROLES,
  toClerkOrganizationPermissionKeys,
  type CompAiPermissionInput,
} from '@trycompai/auth';
import { PermissionEvaluatorService } from './permission-evaluator.service';
import { resolveServiceByName } from './service-token.config';
import { AuthenticatedRequest } from './types';

/**
 * Represents a required permission for an endpoint
 */
export interface RequiredPermission {
  resource: string;
  actions: string[];
}

/**
 * Metadata key for storing required permissions on route handlers
 */
export const PERMISSIONS_KEY = 'required_permissions';

/**
 * PermissionGuard - Validates request permissions
 *
 * This guard:
 * 1. Extracts required permissions from route metadata
 * 2. Preserves API key and service-token scoped permission checks
 * 3. Enforces Clerk organization custom permissions for browser sessions
 * 4. Keeps local role evaluation only for non-browser session fallbacks
 *
 * Usage:
 * ```typescript
 * @UseGuards(HybridAuthGuard, PermissionGuard)
 * @RequirePermission('control', 'delete')
 * async deleteControl() { ... }
 * ```
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private reflector: Reflector,
    private permissionEvaluator: PermissionEvaluatorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permissions from route metadata
    const requiredPermissions = this.reflector.getAllAndOverride<
      RequiredPermission[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    // No permissions required - allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // API key scope enforcement
    if (request.isApiKey) {
      const scopes = request.apiKeyScopes;

      // Legacy keys (empty scopes): full access until April 20, 2026, then blocked
      if (!scopes || scopes.length === 0) {
        const deprecationDate = new Date('2026-04-20T00:00:00Z');
        if (new Date() >= deprecationDate) {
          this.logger.warn(
            `[PermissionGuard] Legacy API key with empty scopes BLOCKED after deprecation date on ${request.method} ${request.url}.`,
          );
          throw new ForbiddenException(
            'This API key is no longer supported. Please regenerate your API key with explicit scopes.',
          );
        }
        this.logger.warn(
          `[PermissionGuard] Legacy API key with empty scopes used on ${request.method} ${request.url}. This key will stop working after April 20, 2026.`,
        );
        return true;
      }

      // Scoped keys: enforce permissions
      const hasAllPerms = requiredPermissions.every((perm) =>
        perm.actions.every((action) =>
          scopes.includes(`${perm.resource}:${action}`),
        ),
      );

      if (!hasAllPerms) {
        throw new ForbiddenException('API key lacks required permission scope');
      }
      return true;
    }

    // Service tokens: check scoped permissions (NOT a blanket bypass)
    if (request.isServiceToken) {
      const service = resolveServiceByName(request.serviceName);
      if (!service) {
        throw new ForbiddenException('Unknown service');
      }

      const hasAllPerms = requiredPermissions.every((perm) =>
        perm.actions.every((action) =>
          service.permissions.includes(`${perm.resource}:${action}`),
        ),
      );

      if (!hasAllPerms) {
        this.logger.warn(
          `[PermissionGuard] Service "${request.serviceName}" denied: missing permission for ${requiredPermissions.map((p) => `${p.resource}:${p.actions.join(',')}`).join('; ')}`,
        );
        throw new ForbiddenException('Service token lacks required permission');
      }

      return true;
    }

    // Build required permissions map, merging actions for duplicate resources
    const permissionBody: Record<string, string[]> = {};
    for (const perm of requiredPermissions) {
      const existing = permissionBody[perm.resource];
      permissionBody[perm.resource] = existing
        ? [...new Set([...existing, ...perm.actions])]
        : perm.actions;
    }

    // Platform admins authenticated through a Clerk session bypass product RBAC.
    if (request.isPlatformAdmin) {
      if (request.authType !== 'session' || !request.clerkUserId) {
        throw new ForbiddenException('Invalid platform admin context');
      }

      return true;
    }

    if (this.shouldUseClerkOrganizationPermissions(request)) {
      return this.canAccessWithClerkOrganizationPermissions({
        request,
        permissionBody,
      });
    }

    try {
      const hasPermission = await this.permissionEvaluator.hasPermissions({
        organizationId: request.organizationId,
        roles: request.userRoles,
        permissions: permissionBody,
      });

      if (!hasPermission) {
        this.logger.warn(
          `[PermissionGuard] Access denied for ${request.method} ${request.url}. Required: ${JSON.stringify(permissionBody)}`,
        );
        throw new ForbiddenException('Access denied');
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(
        `[PermissionGuard] Error checking permissions for ${request.method} ${request.url}:`,
        error,
      );
      throw new ForbiddenException('Unable to verify permissions');
    }
  }

  private shouldUseClerkOrganizationPermissions(
    request: AuthenticatedRequest,
  ): boolean {
    return (
      request.authType === 'session' &&
      !request.sessionDeviceAgent &&
      !request.impersonatedBy
    );
  }

  private canAccessWithClerkOrganizationPermissions({
    request,
    permissionBody,
  }: {
    request: AuthenticatedRequest;
    permissionBody: Record<string, string[]>;
  }): boolean {
    if (
      !request.clerkOrganizationId ||
      !Array.isArray(request.clerkOrganizationPermissions)
    ) {
      throw new ForbiddenException(
        'Missing Clerk organization permission context',
      );
    }

    const grantedPermissions = request.clerkOrganizationPermissions;
    const requiredKeys = this.toRequiredClerkPermissionKeys(permissionBody);
    const hasAllPermissions = requiredKeys.every((key) =>
      grantedPermissions.includes(key),
    );

    if (!hasAllPermissions) {
      this.logger.warn(
        `[PermissionGuard] Clerk org access denied for ${request.method} ${request.url}. Required: ${requiredKeys.join(', ')}`,
      );
      throw new ForbiddenException('Access denied');
    }

    return true;
  }

  private toRequiredClerkPermissionKeys(
    permissionBody: Record<string, string[]>,
  ): string[] {
    const permissions: CompAiPermissionInput[] = [];
    for (const [resource, actions] of Object.entries(permissionBody)) {
      for (const action of actions) {
        permissions.push({ resource, action });
      }
    }

    try {
      return toClerkOrganizationPermissionKeys(permissions);
    } catch {
      this.logger.warn(
        `[PermissionGuard] Invalid permission metadata: ${JSON.stringify(permissionBody)}`,
      );
      throw new ForbiddenException('Invalid permission metadata');
    }
  }

  /**
   * Check if user has restricted role that requires assignment filtering
   */
  static isRestrictedRole(roles: string[] | null): boolean {
    if (!roles || roles.length === 0) {
      return true; // No roles = restricted
    }

    // If user has any privileged role, they're not restricted
    const privileged: readonly string[] = PRIVILEGED_ROLES;
    const restricted: readonly string[] = RESTRICTED_ROLES;
    const hasPrivilegedRole = roles.some((role) => privileged.includes(role));
    if (hasPrivilegedRole) {
      return false;
    }

    // Check if all roles are restricted
    return roles.every((role) => restricted.includes(role));
  }
}
