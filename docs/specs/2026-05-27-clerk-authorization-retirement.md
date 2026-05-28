# Clerk Authorization Retirement

## Decision

Clerk organization membership, organization roles, organization custom
permissions, and Clerk user private metadata are the runtime authorization
authority for browser-session callers.

The Comp AI database keeps local organization, member, invitation, role, and
session-shaped records only as product profiles, migration history, audit
history, or explicit compatibility shims. Those records must not grant browser
organization access, organization permissions, local invitation authority, or
platform-admin capability.

## Runtime Authority

- Customer organization access: Clerk active organization membership.
- Customer permissions: Clerk organization role/custom permission claims,
  evaluated by the API permission guard.
- Platform admin access: Clerk user private metadata
  `compAiPlatformAdmin === true`, verified server-side by the API.
- Support context: signed app cookie that records the real platform admin
  actor and target organization/user, then the API records `impersonatedBy` in
  audit data.
- Machine access: API keys and service tokens remain API-owned and are not
  replaced by Clerk.

## Quarantined Compatibility

The app still exports `auth.api` from `apps/app/src/utils/auth.ts` because many
server components and tests depend on the former Better Auth method names. That
surface is now a compatibility adapter over `/v1/auth/me`, Clerk cookies, and
the app-owned active-organization cookie. It must not call Better Auth SDK
runtime, read Better Auth session organization state as authority, or perform
local role authorization.

The API still keeps device-agent bearer sessions in the historical `session`
table. Those rows are limited to device-agent authentication and cannot confer
platform-admin privileges.

## Local Data That Remains

- `Organization`: product profile/read model linked to Clerk organization.
- `Member`: product profile/read model linked to Clerk membership.
- `OrganizationRole` and built-in role override rows: migration history and
  product metadata until a data-retention migration removes or transforms them.
- Local invitations: historical records and drift detection only. Browser
  organization invitations are Clerk invitations.
- Historical sessions: audit/device-agent compatibility only.

## Rollback Limits

Rollback to local RBAC authority is not supported without restoring the retired
auth boundary and re-validating every customer route. The safe rollback is to
disable affected Clerk organization roles/permissions, use reconciliation to
repair local profile drift, and redeploy the last known-good Clerk-backed API.

If Clerk membership or role claims disagree with local read models, runtime
authorization follows Clerk. Local records must be reconciled; they must not be
used as an emergency authorization override.
