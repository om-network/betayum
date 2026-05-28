# Clerk Runtime Contract

## Decision

Clerk is the identity and browser-session provider. The NestJS API remains the
source of truth for Comp AI authorization: organization membership, custom
roles, product access, API keys, service tokens, platform-admin checks, and
audit attribution.

There is no auth-provider runtime switch anymore. Browser sessions are Clerk
sessions everywhere, while API keys and service tokens remain first-class
machine-auth mechanisms in the hybrid guard.

## Clerk Environment Variables

Required:

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
session token and then resolve Comp AI organization context from the database.

## Failure Modes

- If Clerk server variables are missing, the API must fail fast at startup.
- If a Clerk session maps to no Comp AI user and automatic provisioning is not
  allowed by the identity-mapping slice, the request must fail before
  authorization checks.
- If a Clerk session is valid but the Comp AI member is deactivated or missing
  from the requested organization, the API must reject the request.
- If a Clerk session includes organization claims, they are hints only. The API
  must validate organization membership in the Comp AI database.

## Retirement Notes

- Legacy Better Auth route handlers, client SDK usage, and provider-switch
  environment variables are retired.
- Historical auth tables remain in the database for session records, audit-log
  readability, and custom-role data until a dedicated data-retention migration
  lands.
- New auth work must target Clerk session validation plus API-backed
  authorization only.

## Platform Admin Support Context

Platform-admin debugging uses a Comp AI support-context model instead of
switching the browser's primary Clerk identity.

- Start: a platform admin selects a target user and organization in the admin
  UI. The API verifies the target is an active member, then the app writes a
  signed cross-subdomain cookie.
- Enforcement: the API authenticates the real Clerk admin session first, then
  applies support context only for ordinary customer routes. Request
  authorization runs as the target member while audit attribution records the
  admin actor in `impersonatedBy`.
- Stop: clearing the support-context cookie immediately restores the original
  admin behavior because the underlying Clerk session never changed.
- Security limits: only database-backed platform admins may start support
  context; the cookie is signed with `AUTH_SECRET`; target users must exist,
  belong to the selected organization, remain active, and cannot cross
  organization boundaries.
