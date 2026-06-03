# Clerk Runtime Contract

## Decision

Clerk is the identity and browser-session provider. The NestJS API remains the
source of truth for Comp AI authorization: organization membership, custom
roles, product access, API keys, service tokens, platform-admin checks, and
audit attribution.

This contract covers the migration period where Better Auth and Clerk coexist.
Agents may add Clerk-backed paths behind the migration switch, but must not
remove Better Auth routes, dependencies, or schema until the retirement slice is
ready.

## Runtime Switch

Use `AUTH_PROVIDER` to select the browser-session provider.

- `AUTH_PROVIDER=better-auth` keeps the current Better Auth session path.
- `AUTH_PROVIDER=clerk` enables Clerk session validation for newly migrated
  paths.
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
session token and then resolve Comp AI organization context from the database.

## Failure Modes

- If `AUTH_PROVIDER=clerk` and Clerk server variables are missing, the API must
  fail fast at startup.
- If a Clerk session maps to no Comp AI user and automatic provisioning is not
  allowed by the identity-mapping slice, the request must fail before
  authorization checks.
- If a Clerk session is valid but the Comp AI member is deactivated or missing
  from the requested organization, the API must reject the request.
- If a Clerk session includes organization claims, they are hints only. The API
  must validate organization membership in the Comp AI database.

## Rollout

1. Add Clerk user mapping and tests while Better Auth remains active.
2. Add a Clerk session branch to the API hybrid guard behind `AUTH_PROVIDER`.
3. Migrate customer app, portal, and framework editor paths one at a time.
4. Migrate invitation, platform-admin, and device-agent workflows.
5. Remove Better Auth only after all Clerk-backed slices have landed and the
   retirement issue is ready.
