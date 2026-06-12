# Cloud Build to Cloud Run Deployment

This runbook covers the repository-owned Cloud Build pipeline in
`cloudbuild.yaml` and the triggers declared in `infra/gcp/cloudbuild.tf`.

## Flow

| Environment | Branch | Trigger | Approval |
|-------------|--------|---------|----------|
| staging | `develop` | automatic Cloud Build trigger | none |
| production | `release` | Cloud Build trigger | required approval |

The production approval record is part of the ISO deployment evidence set.

## Pipeline Order

1. Build API, app, portal, and migrator images.
2. Tag every image with `$COMMIT_SHA`.
3. Push images to the environment Artifact Registry repository.
4. Update the Cloud Run migration job to the new migrator image.
5. Execute the migration job with `--wait`.
6. Stop the deployment if the migration job exits non-zero.
7. Deploy API, app, and portal Cloud Run revisions with the same immutable tag.
8. Smoke check API `/v1/health`, app `/api/health`, and the portal root.

Frontend public values are passed as explicit substitutions:

- `_API_URL`
- `_APP_URL`
- `_PORTAL_URL`

Runtime secrets remain in Secret Manager. The pipeline does not read committed
env files and does not inject secret values into build arguments.

## Evidence Locations

- Cloud Build logs: Cloud Build build details for the trigger run.
- Approval records: Cloud Build approval tab for production runs.
- Migration job logs: Cloud Run Job execution logs for `_MIGRATOR_JOB`.
- Revision traceability: Cloud Run revisions reference images tagged by
  `$COMMIT_SHA`.
- Smoke-check output: final Cloud Build curl steps.

## Older GitHub Migration Workflows

The existing `database-migrations-main.yml` and
`database-migrations-release.yml` workflows are superseded by the Cloud Build
migration job after Cloud Build parity is proven in staging. Until then, leave
them active or explicitly disable them in the cutover PR with evidence that:

- the Cloud Run migration job runs against the correct environment database;
- migration logs are visible in Cloud Logging;
- a failed migration blocks service rollout;
- rollback instructions identify the last known-good service revisions.

Do not run both migration systems against the same production release after the
Cloud Build path is accepted as authoritative.
