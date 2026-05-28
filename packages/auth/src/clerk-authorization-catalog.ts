import { statement } from './permissions';

export type CompAiPermissionResource = keyof typeof statement;

export type CompAiPermissionAction<
  Resource extends CompAiPermissionResource = CompAiPermissionResource,
> = (typeof statement)[Resource][number];

export type CompAiPermission = {
  [Resource in CompAiPermissionResource]: {
    resource: Resource;
    action: CompAiPermissionAction<Resource>;
  };
}[CompAiPermissionResource];

export interface CompAiPermissionInput {
  resource: string;
  action: string;
}

export type ClerkOrganizationPermissionKey = `org:${CompAiPermissionResource}:${string}`;

const permissionEntries = Object.entries(statement) as Array<
  [CompAiPermissionResource, readonly string[]]
>;

function buildClerkOrganizationPermissionKey({
  resource,
  action,
}: CompAiPermissionInput): ClerkOrganizationPermissionKey {
  return `org:${resource}:${action}` as ClerkOrganizationPermissionKey;
}

export const CLERK_ORGANIZATION_PERMISSION_KEYS: readonly ClerkOrganizationPermissionKey[] =
  permissionEntries.flatMap(([resource, actions]) =>
    actions.map((action) => buildClerkOrganizationPermissionKey({ resource, action })),
  );

export function isCompAiPermissionResource(resource: string): resource is CompAiPermissionResource {
  return Object.prototype.hasOwnProperty.call(statement, resource);
}

export function getCompAiPermissionActions(resource: string): readonly string[] {
  if (!isCompAiPermissionResource(resource)) {
    return [];
  }

  return statement[resource];
}

export function isValidCompAiPermission(input: CompAiPermissionInput): input is CompAiPermission {
  const actions = getCompAiPermissionActions(input.resource);
  return actions.includes(input.action);
}

export function parseCompAiPermission(input: CompAiPermissionInput): CompAiPermission | null {
  if (!isValidCompAiPermission(input)) {
    return null;
  }

  return input;
}

export function toClerkOrganizationPermissionKey(
  permission: CompAiPermission,
): ClerkOrganizationPermissionKey {
  return buildClerkOrganizationPermissionKey(permission);
}

export function parseClerkOrganizationPermissionKey(
  input: CompAiPermissionInput,
): ClerkOrganizationPermissionKey | null {
  const permission = parseCompAiPermission(input);
  if (!permission) {
    return null;
  }

  return toClerkOrganizationPermissionKey(permission);
}

export function toClerkOrganizationPermissionKeys(
  permissions: readonly CompAiPermissionInput[],
): ClerkOrganizationPermissionKey[] {
  const keys: ClerkOrganizationPermissionKey[] = [];

  for (const permission of permissions) {
    const key = parseClerkOrganizationPermissionKey(permission);
    if (!key) {
      throw new Error(`Invalid Comp AI permission: ${permission.resource}:${permission.action}`);
    }

    keys.push(key);
  }

  return keys;
}
