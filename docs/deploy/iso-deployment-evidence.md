# ISO Deployment Evidence Runbook

This runbook maps the Cloud Build and Cloud Run deployment path to operational
evidence for ISO-oriented controls.

## Deployment Evidence

Capture these for each production deployment:

- Reviewed pull request and commit SHA.
- Cloud Build logs for the production trigger.
- Cloud Build approval records.
- One Cloud Build run per environment deployment, including throttled image
  builds, the migration and seed gates, parallel service rollout, and final
  smoke checks.
- Artifact Registry image tags using the same commit SHA.
- Cloud Run migration job logs.
- Cloud Run seed job logs.
- Cloud Run revision history for API, app, and portal.
- Smoke-check output for API `/v1/health`, app `/api/health`, and portal `/`.
- Managed certificate status for `betayum.com` hostnames.
- Load balancer request logs around cutover.

## Control Mapping

| Control need           | Evidence                                             |
| ---------------------- | ---------------------------------------------------- |
| Change approval        | PR approval plus Cloud Build approval records        |
| Least privilege        | `infra/gcp/iam.tf` service accounts and IAM bindings |
| Environment separation | separate staging and production GCP projects         |
| Secret management      | Secret Manager shells and rotation records           |
| Audit logs             | Cloud Build logs, Cloud Run logs, load balancer logs |
| Traceability           | commit SHA image tags and Cloud Run revision history |
| Migration/seed order   | migration and seed job logs before service rollout   |

## Rollback Evidence

Attach:

- failed deployment build URL;
- failed migration or seed job logs when applicable;
- prior and restored Cloud Run revision names;
- prior and restored DNS or load balancer settings;
- smoke-check output after rollback.

## DNS Cutover Evidence

Use the managed-edge runbook for DNS cutover timing and rollback readiness.

For staging and production, record:

- planned cutover window;
- prior DNS values and TTL;
- new managed edge IP;
- managed certificate state;
- smoke-check output;
- auth and OAuth callback verification notes;
- rollback readiness.

## Secret Rotation

Use this secret rotation procedure for any Cloud Run runtime secret.

1. Add a new Secret Manager version for the affected secret.
2. Confirm the new version has no plaintext value in source control or logs.
3. Redeploy affected Cloud Run services or jobs so they read the latest version.
4. Smoke check impacted flows.
5. Disable or destroy the old secret version according to retention policy.
6. Attach the rotation record to the change ticket.

## Older GitHub Workflows

`database-migrations-main.yml` and `database-migrations-release.yml` remain
documented as superseded by Cloud Build only after staging proves parity. The
Cloud Build migration and seed jobs become authoritative when evidence shows:

- the jobs run before service deployment;
- failed migrations or seed runs block rollout;
- migration and seed job logs are retained;
- production approval records exist for `release` deployments.

Leave unrelated workflows active unless a separate reviewed change retires them.
