export {
  ac,
  statement,
  owner,
  admin,
  auditor,
  employee,
  contractor,
  allRoles,
  ROLE_HIERARCHY,
  RESTRICTED_ROLES,
  isRestrictedRole,
  PRIVILEGED_ROLES,
  BUILT_IN_ROLE_PERMISSIONS,
  BUILT_IN_ROLE_OBLIGATIONS,
  type RoleName,
  type RoleObligations,
  type RolePermissions,
  parseRolePermissions,
  parseRoleObligations,
} from './permissions';

export {
  CLERK_ORGANIZATION_PERMISSION_KEYS,
  getCompAiPermissionActions,
  isCompAiPermissionResource,
  isValidCompAiPermission,
  parseClerkOrganizationPermissionKey,
  parseCompAiPermission,
  toClerkOrganizationPermissionKey,
  toClerkOrganizationPermissionKeys,
  type ClerkOrganizationPermissionKey,
  type CompAiPermission,
  type CompAiPermissionAction,
  type CompAiPermissionInput,
  type CompAiPermissionResource,
} from './clerk-authorization-catalog';

export { createAuthServer, type CreateAuthServerOptions, type AuthServer } from './server';
