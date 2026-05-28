# Clerk Runtime Contract

## Decision

Clerk is the identity, browser-session, organization membership, organization
invitation, active organization, organization role, and customer-facing
authorization provider.

Clerk organizations and Clerk organization roles/custom permissions are the
source of truth for customer organization membership and RBAC. The NestJS API
remains the enforcement gateway and the source of truth for Comp AI product
data: local organization profile rows, member/employee profile metadata,
product settings, product entitlements, API keys, service tokens, billing
relationships, and audit attribution.

Local organization and member records may be kept as product profile/read-model
rows linked to Clerk identifiers, but they must not decide whether a browser
session belongs to an organization or what customer-facing permissions the
session has.

This contract supersedes the earlier Clerk migration boundary that kept Comp AI
database membership and organization roles authoritative. The replacement PRD is
GitHub issue #23: `prd: use Clerk organizations and roles as authorization
source of truth`.

This contract covers the migration period where Better Auth and Clerk coexist.
Agents may add Clerk-backed paths behind the migration switch, but must not
remove Better Auth routes, dependencies, or schema until the relevant retirement
slice is ready. New Clerk work should target the Clerk-organization authority
model unless a task explicitly says it is finishing the legacy migration slice.

## Runtime Switch

Use `AUTH_PROVIDER` to select the browser-session provider.

- `AUTH_PROVIDER=better-auth` keeps the current Better Auth session path.
- `AUTH_PROVIDER=clerk` enables Clerk session validation and Clerk organization
  authorization for newly migrated paths.
- Missing `AUTH_PROVIDER` defaults to `better-auth` during the migration.

API key and service token authentication are not controlled by this switch and
must keep working in both modes.

## Clerk Environment Variables

Required when `AUTH_PROVIDER=clerk`:

- API: `CLERK_SECRET_KEY`
- API: `CLERK_JWT_ISSUER`
- API: `CLERK_AUTHORIZED_PARTIES`
- API: `CLERK_JWKS_URL` (optional; defaults to Clerk's Backend API JWKS)
- App, portal, and framework editor: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- App, portal, and framework editor: `CLERK_SECRET_KEY`
- App, portal, and framework editor: `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- App, portal, and framework editor: `NEXT_PUBLIC_CLERK_SIGN_UP_URL`

`CLERK_AUTHORIZED_PARTIES` is a comma-separated allowlist of trusted frontend
origins that may mint browser sessions for the API.

## Domains

Local development:

- Customer app: `http://localhost:3000`
- Portal: `http://localhost:3002`
- API: `http://localhost:3333`
- Framework editor: `http://localhost:3008`

Staging:

- Customer app: `https://app.staging.trycomp.ai`
- Portal: `https://portal.staging.trycomp.ai`
- API: `https://api.staging.trycomp.ai`
- Framework editor: `https://framework-editor.staging.trycomp.ai`

Production:

- Customer app: `https://app.trycomp.ai`
- Portal: `https://portal.trycomp.ai`
- API: `https://api.trycomp.ai`
- Framework editor: `https://framework-editor.trycomp.ai`

Production Clerk instances must be configured with a root domain so Clerk
sessions work across Comp AI subdomains. The API must still validate the Clerk
session token, validate the active Clerk organization/membership/permissions,
and then resolve the linked local Comp AI organization profile row for product
data access.

## Failure Modes

- If `AUTH_PROVIDER=clerk` and Clerk server variables are missing, the API must
  fail fast at startup.
- If a Clerk session maps to no Comp AI user and automatic provisioning is not
  allowed by the identity-mapping slice, the request must fail before
  authorization checks.
- If a Clerk session has no active organization and the route requires
  organization context, the API must reject the request.
- If a Clerk session is valid but the Clerk user is not a member of the active
  Clerk organization, the API must reject the request.
- If the active Clerk organization has no linked local Comp AI organization
  profile row and automatic provisioning is not allowed by the organization
  mapping slice, the API must reject the request before product data access.
- If the Clerk organization role/custom permissions do not satisfy the
  endpoint's `@RequirePermission` metadata, the API must reject the request.
- Local member profile rows are not authorization authority. If Clerk membership
  and local profile data disagree, browser-session authorization follows Clerk
  and the local drift must be reconciled separately.

## Rollout

1. Define the Clerk authorization catalog that maps Comp AI resource/action
   permissions to Clerk organization custom permission keys.
2. Link existing local users and organizations to Clerk users and Clerk
   organizations while Better Auth remains active.
3. Redesign local member rows into member/employee profile read models linked to
   Clerk organization memberships.
4. Add Clerk organization authorization to the API hybrid guard and permission
   guard behind `AUTH_PROVIDER=clerk`.
5. Migrate organization switching, people management, invitations, platform
   admin, portal, and device-agent workflows to Clerk organization authority.
6. Add webhook and reconciliation coverage for Clerk organization, membership,
   invitation, role, and permission drift.
7. Remove Better Auth and local RBAC authority only after Clerk-backed slices
   have landed and the retirement issue is ready.
