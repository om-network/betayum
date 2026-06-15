# Cloud Run Managed Edge Cutover

This is a HITL runbook. DNS ownership, managed certificate readiness,
production timing, and rollback execution require an operator.

## Staging First

Validate staging before preparing production:

- `api.staging.betayum.com` resolves to the managed HTTPS edge.
- `app.staging.betayum.com` resolves to the managed HTTPS edge.
- `portal.staging.betayum.com` resolves to the managed HTTPS edge.
- The managed certificate is active for all three staging hostnames.
- Cloud Run ingress is `Internal and Cloud Load Balancing`.
- Direct `*.run.app` URLs do not bypass the load balancer path.

Smoke checks:

```bash
curl --fail https://api.staging.betayum.com/v1/health
curl --fail https://app.staging.betayum.com/api/health
curl --fail https://portal.staging.betayum.com/
```

Auth checks:

- Sign in through `app.staging.betayum.com`.
- Confirm the OAuth callback returns through `api.staging.betayum.com`.
- Confirm API calls from the app include cookies and do not return 401.
- Open `portal.staging.betayum.com` and confirm shared staging session behavior.
- Confirm staging cookies do not collide with production cookies.

## Production Preparation

Before changing public DNS:

- Confirm the production Cloud Build run was approved.
- Confirm migration job logs show a successful production migration.
- Confirm Cloud Run revisions for API, app, and portal use the same commit SHA.
- Confirm the managed certificate is active for:
  - `api.betayum.com`
  - `app.betayum.com`
  - `portal.betayum.com`
- Record prior DNS values, prior load balancer state, and prior service revisions.

Prepare DNS records for:

- `api.betayum.com`
- `app.betayum.com`
- `portal.betayum.com`

Use the reserved edge IP when one is configured in `infra/gcp/terraform.tfvars`.

## Production Cutover

1. Lower TTL before the maintenance window when possible.
2. Point production records to the managed edge.
3. Wait for DNS propagation and certificate health.
4. Run smoke checks:

   ```bash
   curl --fail https://api.betayum.com/v1/health
   curl --fail https://app.betayum.com/api/health
   curl --fail https://portal.betayum.com/
   ```

5. Verify sign-in, OAuth callback, app API calls, and portal calls.
6. Confirm Cloud Run ingress remains `Internal and Cloud Load Balancing`.
7. Attach cutover evidence to the ISO change record.

## Rollback

Rollback decision data:

- prior DNS values;
- prior DNS TTL;
- prior load balancer URL map and backend state;
- prior Cloud Run revision names for API, app, and portal;
- prior production database migration state.

Rollback actions:

1. If DNS or certificate cutover failed before traffic moved, restore prior DNS.
2. If a new service revision is bad, roll back each Cloud Run service to the
   prior known-good revision.
3. If the load balancer path is bad, restore the prior URL map or backend.
4. If a database migration introduced an incompatible state, stop rollout and
   follow the migration-specific recovery plan before service rollback.
5. Rerun smoke checks and attach rollback evidence to the change record.
