type StatementMap = Record<string, readonly string[]>;

export interface AccessRole<TStatements extends StatementMap = StatementMap> {
  statements: TStatements;
}

export interface AccessControl {
  newRole<TStatements extends StatementMap>(
    statements: TStatements,
  ): AccessRole<TStatements>;
}

const defaultStatements = {
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'delete'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
} as const;

function cloneStatements<TStatements extends StatementMap>(
  statements: TStatements,
): TStatements {
  return Object.fromEntries(
    Object.entries(statements).map(([resource, actions]) => [
      resource,
      [...actions],
    ]),
  ) as unknown as TStatements;
}

function createRole<TStatements extends StatementMap>(
  statements: TStatements,
): AccessRole<TStatements> {
  return { statements: cloneStatements(statements) };
}

/**
 * Permission statement extending the shared default org/member resources.
 *
 * Default resources:
 * - organization: ['update', 'delete']
 * - member: ['create', 'update', 'delete']
 * - invitation: ['create', 'delete']
 * - team: ['create', 'update', 'delete']
 * - ac: ['create', 'read', 'update', 'delete'] (for role management)
 */
export const statement = {
  ...defaultStatements,
  // Extend the default resources to include read access.
  organization: ['read', 'update', 'delete'],
  member: ['create', 'read', 'update', 'delete'],
  invitation: ['create', 'read', 'delete'],
  team: ['create', 'read', 'update', 'delete'],
  // GRC Resources — CRUD only
  control: ['create', 'read', 'update', 'delete'],
  evidence: ['create', 'read', 'update', 'delete'],
  policy: ['create', 'read', 'update', 'delete'],
  risk: ['create', 'read', 'update', 'delete'],
  vendor: ['create', 'read', 'update', 'delete'],
  task: ['create', 'read', 'update', 'delete'],
  framework: ['create', 'read', 'update', 'delete'],
  audit: ['create', 'read', 'update'],
  finding: ['create', 'read', 'update', 'delete'],
  questionnaire: ['create', 'read', 'update', 'delete'],
  integration: ['create', 'read', 'update', 'delete'],
  apiKey: ['create', 'read', 'delete'],
  // App access resources
  app: ['read'], // Main app access
  trust: ['read', 'update'], // Trust center access
  // Security product resources
  pentest: ['create', 'read', 'delete'],
  // Training management
  training: ['read', 'update'],
  // Portal self-service
  portal: ['read', 'update'],
  // Secrets manager — encrypted credentials surfaced to AI automations.
  // Read returns DECRYPTED plaintext, so this resource is intentionally
  // separate from `organization` to keep read-only auditors out.
  secret: ['create', 'read', 'update', 'delete'],
} as const;

export const ac: AccessControl = {
  newRole: createRole,
};

/**
 * Owner role - Full access to everything
 */
export const owner = ac.newRole({
  organization: ['read', 'update', 'delete'],
  member: ['create', 'read', 'update', 'delete'],
  invitation: ['create', 'read', 'delete'],
  team: ['create', 'read', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
  // Full GRC access
  control: ['create', 'read', 'update', 'delete'],
  evidence: ['create', 'read', 'update', 'delete'],
  policy: ['create', 'read', 'update', 'delete'],
  risk: ['create', 'read', 'update', 'delete'],
  vendor: ['create', 'read', 'update', 'delete'],
  task: ['create', 'read', 'update', 'delete'],
  framework: ['create', 'read', 'update', 'delete'],
  audit: ['create', 'read', 'update'],
  // Findings are raised by auditors only; owners/admins can view & transition status via update
  finding: ['read', 'update'],
  questionnaire: ['create', 'read', 'update', 'delete'],
  integration: ['create', 'read', 'update', 'delete'],
  apiKey: ['create', 'read', 'delete'],
  // App access
  app: ['read'],
  trust: ['read', 'update'],
  // Security product
  pentest: ['create', 'read', 'delete'],
  // Training management
  training: ['read', 'update'],
  // Portal self-service
  portal: ['read', 'update'],
  // Secrets manager — owner can fully manage decrypted credentials
  secret: ['create', 'read', 'update', 'delete'],
});

/**
 * Admin role - Full access except organization deletion
 */
export const admin = ac.newRole({
  organization: ['read', 'update'], // No delete
  member: ['create', 'read', 'update', 'delete'],
  invitation: ['create', 'read', 'delete'],
  team: ['create', 'read', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
  // Full GRC access
  control: ['create', 'read', 'update', 'delete'],
  evidence: ['create', 'read', 'update', 'delete'],
  policy: ['create', 'read', 'update', 'delete'],
  risk: ['create', 'read', 'update', 'delete'],
  vendor: ['create', 'read', 'update', 'delete'],
  task: ['create', 'read', 'update', 'delete'],
  framework: ['create', 'read', 'update', 'delete'],
  audit: ['create', 'read', 'update'],
  // Findings are raised by auditors only; owners/admins can view & transition status via update
  finding: ['read', 'update'],
  questionnaire: ['create', 'read', 'update', 'delete'],
  integration: ['create', 'read', 'update', 'delete'],
  apiKey: ['create', 'read', 'delete'],
  // App access
  app: ['read'],
  trust: ['read', 'update'],
  // Security product
  pentest: ['create', 'read', 'delete'],
  // Training management
  training: ['read', 'update'],
  // Secrets manager — admin can fully manage decrypted credentials
  secret: ['create', 'read', 'update', 'delete'],
});

/**
 * Auditor role - Read-only access with export capabilities
 * Can view and export GRC data for compliance audits
 */
export const auditor = ac.newRole({
  organization: ['read'],
  member: ['create', 'read'], // Can invite other auditors + view people for audit context
  invitation: ['create', 'read'],
  // Read access to GRC resources (export maps to read)
  control: ['read'],
  evidence: ['read'],
  policy: ['read'],
  risk: ['read'],
  vendor: ['read'],
  task: ['read'],
  framework: ['read'],
  audit: ['read'],
  finding: ['create', 'read', 'update', 'delete'], // Auditors raise and retract findings
  questionnaire: ['read'],
  integration: ['read'],
  // App access
  app: ['read'],
  trust: ['read'],
  // Security product (read-only for auditors)
  pentest: ['read'],
});

/**
 * Employee role - Limited access, assignment-based filtering
 * Can only see tasks assigned to them and complete basic compliance activities
 * Does NOT have app access - portal only
 */
export const employee = ac.newRole({
  // Portal access only — can read policies to sign them
  policy: ['read'],
  portal: ['read', 'update'],
});

/**
 * Contractor role - Same as employee
 * External contractors with limited compliance access
 * Does NOT have app access - portal only
 */
export const contractor = ac.newRole({
  // Portal access only — can read policies to sign them
  policy: ['read'],
  portal: ['read', 'update'],
});

/**
 * All available roles for the organization plugin
 */
export const allRoles = {
  owner,
  admin,
  auditor,
  employee,
  contractor,
} as const;

/**
 * Role hierarchy for privilege checking
 * Higher index = higher privilege
 */
export const ROLE_HIERARCHY = [
  'contractor',
  'employee',
  'auditor',
  'admin',
  'owner',
] as const;

/**
 * Roles that require assignment-based filtering
 */
export const RESTRICTED_ROLES = ['employee', 'contractor'] as const;

export function isRestrictedRole(role: string): boolean {
  return (RESTRICTED_ROLES as readonly string[]).includes(role);
}

export const PRIVILEGED_ROLES = ['owner', 'admin', 'auditor'] as const;

/**
 * Type for role names
 */
export type RoleName = keyof typeof allRoles;

/**
 * Built-in role permissions derived from the role definitions above.
 * Single source of truth — consumers should import this instead of hardcoding.
 */
export const BUILT_IN_ROLE_PERMISSIONS: Record<string, Record<string, string[]>> =
  Object.fromEntries(
    Object.entries(allRoles).map(([name, role]) => [
      name,
      Object.fromEntries(
        Object.entries(role.statements).map(([res, actions]) => [
          res,
          [...actions],
        ]),
      ),
    ]),
  );

// ─── Obligations ─────────────────────────────────────────────────────
// Obligations are separate from permissions. Permissions grant powers;
// obligations impose requirements (e.g. "must complete compliance tasks").

/**
 * Shape of role obligations — boolean flags for each obligation type.
 */
export interface RoleObligations {
  compliance?: boolean;
}

/**
 * Built-in role obligations. Every role that must complete compliance
 * tasks (sign policies, watch training, install device agent) is listed here.
 */
export const BUILT_IN_ROLE_OBLIGATIONS: Record<string, RoleObligations> = {
  owner: { compliance: true },
  admin: {},
  auditor: {},
  employee: { compliance: true },
  contractor: { compliance: true },
};

// ─── JSON field parsers ─────────────────────────────────────────────
// OrganizationRole stores permissions/obligations as JSON text in the DB.

export type RolePermissions = Record<string, string[]>;

function parseJsonField<T>(value: unknown): T | null {
  try {
    if (!value) return null;
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseRolePermissions(value: unknown): RolePermissions | null {
  return parseJsonField<RolePermissions>(value);
}

export function parseRoleObligations(value: unknown): RoleObligations {
  return parseJsonField<RoleObligations>(value) ?? {};
}
