> Superseded boundary, May 28, 2026: this PRD's authentication migration work is
> still useful, but its authorization boundary has been overridden by GitHub
> issue #23, `prd: use Clerk organizations and roles as authorization source of
> truth`. New implementation work should treat Clerk organizations,
> organization roles, and organization custom permissions as authoritative for
> customer-facing organization authorization.

## Problem Statement

Comp AI currently runs authentication through Better Auth inside the NestJS API
and consumes that auth server from the customer app, portal, and framework
editor. That gives the product a single API-centered auth boundary, but it also
means the codebase owns session lifecycle, OAuth wiring, magic links, OTP,
organization invitations, active organization state, impersonation behavior,
admin auth routes, database auth tables, raw body-parser exceptions, Better Auth
SDK quirks, and app-specific auth clients.

The team wants to switch authentication from Better Auth to Clerk. The migration
must not weaken the existing API-first security model, RBAC model,
customer-facing endpoint permissions, audit logging, API key support, service
token support, multi-product access rules, or portal access behavior.

## Solution

Replace Better Auth as the identity and browser-session provider with Clerk,
while keeping Comp AI's API as the authorization enforcement gateway. Clerk
should own user sign-in, sign-out, OAuth, email-based auth flows, session
cookies, frontend auth providers, session-token verification, organization
membership, active organization, organization roles, and organization custom
permissions. The NestJS API should validate Clerk-authenticated requests,
evaluate Clerk-backed organization authorization, and then resolve Comp
AI-specific product context from the database: local user/profile links, local
organization profile rows, member/employee profile metadata, product access,
platform-admin/support context, and audit attribution.

Comp AI product access, API keys, service tokens, local product profile data,
and audit logs remain in the application's domain model. Clerk organization
membership, organization roles, and organization custom permissions become the
authorization source of truth. Clerk identity IDs are mapped to existing Comp AI
users through an explicit, tested identity mapping layer. Better Auth tables and
routes are retired only after data migration and compatibility windows are
complete.

Reference docs for implementation planning:

- Clerk Next.js App Router auth helper: https://clerk.com/docs/reference/nextjs/app-router/auth
- Clerk Next.js quickstart and middleware: https://clerk.com/docs/nextjs/user-object
- Clerk custom session tokens: https://clerk.com/docs/guides/sessions/customize-session-tokens
- Clerk backend request authentication: https://clerk.com/docs/reference/backend/authenticate-request
- Clerk session-token validation: https://clerk.com/docs/how-to/validate-session-tokens

## User Stories

1. As a Comp AI customer, I want to sign in with Clerk, so that authentication is handled by the new identity provider.
2. As a Comp AI customer, I want my existing account to map to the same Comp AI user record after migration, so that my work history and assignments remain intact.
3. As a Comp AI customer, I want my organization memberships to remain unchanged, so that I keep access to the same workspaces.
4. As a Comp AI customer, I want my active organization experience to keep working when I navigate under an organization route, so that I do not land in the wrong workspace.
5. As a Comp AI customer, I want cross-subdomain sign-in to work across app, portal, API, and framework editor surfaces, so that I do not have to authenticate separately for each product surface.
6. As a Comp AI customer, I want sign-out to clear the correct Clerk session state, so that I can safely leave a shared device.
7. As a Comp AI customer, I want magic-link or email-code login behavior to be replaced with equivalent Clerk flows, so that passwordless login continues to work.
8. As a Comp AI customer, I want OAuth login through supported providers to continue, so that I can use the same identity provider as before.
9. As a Comp AI customer, I want account linking to preserve existing user ownership, so that duplicate accounts are not created during migration.
10. As an organization owner, I want invitations to continue creating member access in Comp AI, so that onboarding teammates still works.
11. As an organization owner, I want invite emails to send users into the Clerk-backed sign-in flow, so that invited users can accept access without Better Auth routes.
12. As an organization owner, I want role changes to update Clerk organization membership roles, so that permissions are governed by Clerk organization authorization.
13. As an organization owner, I want custom organization roles to be migrated into Clerk-compatible roles and custom permissions, so that existing least-privilege policies do not regress.
14. As an organization admin, I want member deactivation to block access even if a Clerk session remains valid, so that offboarding is enforced by the API.
15. As an auditor, I want read-only permissions to remain read-only after migration, so that compliance data is protected.
16. As an employee portal user, I want portal access to continue being limited to the organizations and resources assigned to me, so that employee-only workflows remain scoped.
17. As a restricted employee or contractor, I want assignment-based filtering to continue, so that I only see tasks, policies, devices, or evidence assigned to me.
18. As a platform admin, I want platform-admin routes to validate my Clerk-authenticated identity and database admin status, so that admin access is not granted solely from frontend state.
19. As a platform admin, I want impersonation or equivalent support to be explicitly redesigned, so that support workflows remain auditable.
20. As a platform admin, I want admin auth actions to keep writing audit logs, so that sensitive support activity remains traceable.
21. As an API key customer, I want existing API key authentication to keep working, so that external integrations are not forced onto Clerk.
22. As an internal service, I want service token authentication to keep working, so that background jobs and service-to-service calls continue.
23. As a device-agent user, I want device-agent auth/session behavior to keep working or have a documented replacement, so that device check-ins and agent lifecycle actions remain reliable.
24. As a developer, I want one request auth context shape in the API, so that controllers and guards do not care whether the user arrived via Clerk, API key, or service token.
25. As a developer, I want frontend code to use Clerk SDK hooks and server helpers instead of Better Auth clients, so that auth state is consistent with Clerk.
26. As a developer, I want server components and API routes to forward or resolve auth context consistently, so that protected data fetching still works.
27. As a developer, I want Better Auth dependencies and route exceptions removed after migration, so that the codebase no longer carries unused auth infrastructure.
28. As a developer, I want a reversible rollout plan, so that the migration can be deployed safely across staging and production.
29. As a compliance stakeholder, I want audit logs to preserve actor, organization, member, auth type, and impersonation attribution, so that historical traceability remains intact.
30. As a security reviewer, I want tests that prove unauthorized, wrong-org, deactivated-member, and insufficient-permission users are rejected, so that the migration does not create access regressions.

## Implementation Decisions

- Build a Clerk identity adapter as a deep module. It exposes a stable interface for resolving a Clerk-authenticated request into a Comp AI auth subject with user id, email, session id, Clerk user id, and optional Clerk organization/session claims. Controllers and permission checks should not call Clerk directly.
- Add explicit identity mapping between Clerk users and Comp AI users. Existing users are matched during migration by verified email and then persisted with a Clerk user identifier. New users are created through the same adapter path.
- Original authentication-only boundary: keep Comp AI database organizations,
  members, custom roles, product access, and permission resources as the source
  of truth. Superseded boundary: Clerk organizations, organization roles, and
  organization custom permissions replace local RBAC as the source of truth for
  customer-facing authorization.
- Replace the Better Auth session lookup in hybrid request authentication with Clerk session-token verification. API key and service token branches remain intact and should keep their current precedence before browser-session auth.
- Introduce an organization context resolver as a deep module. It resolves the requested Comp AI organization from explicit request context, route-derived app context, or a safe default during onboarding, then validates active membership before setting request organization context.
- Stop relying on mutable Better Auth session fields for active organization.
  The active organization should come from Clerk organization context and be
  validated against Clerk membership/permissions on every protected request.
- Preserve the existing request auth context contract used by controllers, audit logs, guards, and services. Internal implementation can move to Clerk, but downstream endpoint code should continue receiving user id, email, organization id, member id, roles, auth type, platform admin flag, API key details, and service token details.
- Replace Better Auth permission checks with a Clerk-backed permission evaluator
  that maps existing product permission metadata to Clerk organization custom
  permissions. Local organization role records are migration input/read-model
  data only, not browser-session authorization authority.
- Preserve API key scope enforcement and the existing legacy-key policy behavior separately from Clerk.
- Preserve service token scoped permissions separately from Clerk.
- Replace platform-admin session validation with a Clerk-backed platform admin
  capability plus server-side verification. Platform-admin authorization must
  not rely only on frontend state or unchecked public metadata.
- Redesign impersonation as an explicit platform-admin capability. The implementation may use a Clerk-supported impersonation/session feature if it satisfies audit and org-context requirements; otherwise it should create a Comp AI support-context mechanism that never grants unlogged access.
- Replace frontend Better Auth clients with Clerk providers, server helpers, and hooks in the customer app, portal, and framework editor. Auth UI should use Clerk-backed sign-in/sign-out flows while preserving product navigation and permission-gated rendering.
- Update server-side data fetching to use Clerk server auth helpers where appropriate and to pass validated organization context to the API. The API remains responsible for final authorization.
- Update client-side API calls so authenticated requests carry the Clerk session context supported by the chosen Clerk integration. Do not store long-lived tokens in localStorage.
- Replace API auth routes currently owned by Better Auth with Clerk-compatible routes or remove them when Clerk owns the flow. Keep Comp AI domain auth endpoints such as current user, organizations, invitations, and membership context where they return application-specific data.
- Migrate invitation flows from Better Auth organization invitations to Clerk
  organization invitations plus Clerk sign-in/sign-up entrypoints. Invitation
  acceptance must create or link Comp AI user/profile records only after
  validating Clerk invitation and organization membership state.
- Preserve audit logging behavior. Authentication provider changes must not remove actor attribution, organization scoping, API key attribution, service token attribution, or platform-admin action logging.
- Add a data migration plan for existing Better Auth user, account, session, verification, invitation, organization role, and related records. Sessions and verification tokens should be treated as disposable unless a compatibility window is explicitly required.
- Retire Better Auth dependencies, middleware body-parser exceptions, mocks, SDK imports, and environment variables after the Clerk migration is complete.
- Add Clerk environment validation for each app and the API. Missing publishable keys, secret keys, issuer/domain configuration, and allowed origins should fail fast in the relevant runtime.
- Update local, staging, and production origin/cookie documentation for Clerk's cross-subdomain behavior.
- Keep the rollout staged: first add mapping and Clerk auth behind a feature flag or environment switch, then migrate staging users, then validate production migration, then remove Better Auth.

## Testing Decisions

- Good tests should assert external behavior and security outcomes, not internal SDK calls. A passing migration test proves that a request is accepted or rejected correctly and that request context is populated correctly.
- Test the Clerk identity adapter with mocked valid, expired, missing, and malformed Clerk sessions.
- Test identity mapping for existing verified-email users, new users, email collision cases, and missing Clerk identifiers.
- Test organization context resolution for valid membership, missing organization, wrong organization, deactivated membership, onboarding without an active organization, and multi-organization users.
- Test the hybrid auth guard for API key precedence, service token precedence, Clerk session auth, missing auth, and invalid auth.
- Test the permission evaluator for Clerk built-in/custom organization roles,
  Clerk custom permissions, migrated Comp AI role mappings, restricted roles,
  platform-admin bypass, API key scopes, and service token scopes.
- Test platform-admin auth for non-admin users, deleted users, stale sessions, and database admin verification.
- Test invitation acceptance for existing users, new users, expired invites, revoked invites, and wrong-email attempts.
- Test frontend auth gating where users are signed out, signed in without org access, signed in as read-only, and signed in as admin.
- Test portal access separately from app access because portal resources do not grant customer app access.
- Test device-agent auth or its replacement with the existing device-agent behavior as the compatibility target.
- Use existing API guard and controller tests as prior art for auth, permission, platform-admin, and device-agent coverage.
- Use existing app permission and layout tests as prior art for frontend page-level permission gating.
- Run API Jest tests for the auth module and affected controllers.
- Run app Vitest tests for auth utilities, layouts, permission helpers, and components touched by the migration.
- Add at least one integration-style test that exercises a Clerk-authenticated request through the API guard into a permission-gated endpoint.

## Out of Scope

- Replacing Comp AI RBAC with Clerk authorization or Clerk organization roles.
  This was out of scope for the original authentication-only migration, but is
  now in scope for the superseding organization authorization PRD in GitHub
  issue #23.
- Reworking product-level subscription or feature-flag logic.
- Changing API key or service token formats except where needed to keep the hybrid guard cohesive.
- Redesigning the entire organization/member domain model. This was out of
  scope for the original authentication-only migration, but is now in scope for
  the superseding organization authorization PRD in GitHub issue #23.
- Migrating unrelated server actions to API calls beyond auth-specific changes required by this migration.
- Changing billing, Stripe customer ownership, or entitlement logic except for user identity references that must remain mapped.
- Redesigning the visual UI of login pages beyond replacing Better Auth flows with Clerk flows.
- Removing historical audit logs or rewriting historical actor records.

## Further Notes

- This migration conflicts with the current project rule that states auth is
  implemented by Better Auth in the API. The new architecture should update
  project documentation after the superseding PRD is accepted: Clerk becomes
  the identity/session provider and the source of truth for customer
  organization authorization, while the API remains the enforcement gateway and
  source of truth for product context.
- This PRD's original business-authorization boundary has been superseded. Clerk
  now becomes the source of truth for customer organization membership, active
  organization, organization roles, and organization custom permissions. The API
  remains the enforcement gateway and source of truth for product data,
  entitlements, API keys, service tokens, billing relationships, and audit
  attribution.
- Clerk session tokens are JWT-based by design. The implementation should preserve the existing security intent by avoiding app-issued long-lived JWTs and localStorage token storage; only short-lived Clerk session tokens/cookies should be accepted for browser-session authentication.
- Custom Clerk session claims have practical size limits. Do not put the full permission set into Clerk claims. Store only stable identity/context identifiers if needed and resolve permissions through Clerk organization authorization APIs/session permission claims according to the superseding boundary.
- The highest-risk areas are active organization resolution, custom roles, platform-admin impersonation, device-agent sessions, and invitation acceptance. Those should be implemented and tested as explicit modules rather than incidental UI changes.
