import { Injectable } from '@nestjs/common';
import { db } from '@db';
import {
  BUILT_IN_ROLE_PERMISSIONS,
  parseRolePermissions,
} from '@trycompai/auth';

type PermissionMap = Record<string, string[]>;
const builtInRolePermissions: Record<string, PermissionMap> =
  BUILT_IN_ROLE_PERMISSIONS;

interface HasPermissionsParams {
  organizationId: string;
  roles: string[] | null;
  permissions: PermissionMap;
}

@Injectable()
export class PermissionEvaluatorService {
  async hasPermissions({
    organizationId,
    roles,
    permissions,
  }: HasPermissionsParams): Promise<boolean> {
    const effectivePermissions = await this.resolvePermissions({
      organizationId,
      roles,
    });

    return Object.entries(permissions).every(([resource, actions]) => {
      const granted = effectivePermissions[resource] ?? [];
      return actions.every((action) => granted.includes(action));
    });
  }

  async resolvePermissions({
    organizationId,
    roles,
  }: Omit<HasPermissionsParams, 'permissions'>): Promise<PermissionMap> {
    const roleNames = this.normalizeRoles(roles);
    if (roleNames.length === 0) return {};

    const customRoleNames = roleNames.filter(
      (roleName) => !builtInRolePermissions[roleName],
    );
    const customPermissionsByRole = await this.loadCustomPermissions({
      organizationId,
      roleNames: customRoleNames,
    });

    const combined: PermissionMap = {};
    for (const roleName of roleNames) {
      const permissions =
        builtInRolePermissions[roleName] ??
        customPermissionsByRole.get(roleName);
      if (!permissions) continue;

      this.mergePermissions({ target: combined, source: permissions });
    }

    return combined;
  }

  private normalizeRoles(roles: string[] | null): string[] {
    if (!roles) return [];
    return [
      ...new Set(
        roles
          .flatMap((role) => role.split(','))
          .map((role) => role.trim())
          .filter(Boolean),
      ),
    ];
  }

  private async loadCustomPermissions({
    organizationId,
    roleNames,
  }: {
    organizationId: string;
    roleNames: string[];
  }): Promise<Map<string, PermissionMap>> {
    if (roleNames.length === 0) return new Map();

    const customRoles = await db.organizationRole.findMany({
      where: { organizationId, name: { in: roleNames } },
      select: { name: true, permissions: true },
    });

    const permissionsByRole = new Map<string, PermissionMap>();
    for (const role of customRoles) {
      const permissions = this.toPermissionMap(
        parseRolePermissions(role.permissions),
      );
      if (permissions) {
        permissionsByRole.set(role.name, permissions);
      }
    }

    return permissionsByRole;
  }

  private mergePermissions({
    target,
    source,
  }: {
    target: PermissionMap;
    source: PermissionMap;
  }): void {
    for (const [resource, actions] of Object.entries(source)) {
      const existing = target[resource] ?? [];
      target[resource] = [...new Set([...existing, ...actions])];
    }
  }

  private toPermissionMap(value: unknown): PermissionMap | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;

    const permissions: PermissionMap = {};
    for (const [resource, actions] of Object.entries(value)) {
      if (
        !Array.isArray(actions) ||
        actions.some((action) => typeof action !== 'string')
      ) {
        return null;
      }

      permissions[resource] = actions;
    }

    return permissions;
  }
}
