# Cloud Build to Cloud Run Deployment

This runbook covers the repository-owned Cloud Build pipeline in
`cloudbuild.yaml` and the triggers declared in `infra/gcp/cloudbuild.tf`.

## Flow

| Environment | Branch    | Trigger                       | Approval          |
| ----------- | --------- | ----------------------------- | ----------------- |
| staging     | `develop` | automatic Cloud Build trigger | none              |
| production  | `release` | Cloud Build trigger           | required approval |

The production approval record is part of the ISO deployment evidence set.

## Pipeline Order

The pipeline uses one Cloud Build trigger per environment. API, app, portal,
migrator, seeder, and Trigger.dev tasks do not have separate deployment
triggers.

1. Build API, app, migrator, seeder, and the small Trigger.dev deployer image in
   parallel. Package the Trigger task source in a separate parallel lane. Build
   the portal image after the app image so only one frontend `next build` runs
   at a time on the Cloud Build worker.
2. Tag every image with `$COMMIT_SHA`.
3. Push each image to the environment Artifact Registry repository after its
   matching build finishes. Image pushes can run in parallel.
4. Deploy the Cloud Run migration job to the new migrator image after the
   migrator image is pushed, and deploy the seed job after the seeder image is
   pushed. Job deploys are create-or-update operations so a missing seed job can
   be bootstrapped by the trigger.
5. Execute the migration job with `--wait`.
6. Stop the deployment if the migration job exits non-zero.
7. Execute the seed job with `--wait` after migrations pass.
8. Stop the deployment if the seed job exits non-zero.
9. Transfer the packaged task source to the private Trigger.dev VM through IAP
   and deploy the consolidated task image after migrations and seed pass.
10. Deploy API, app, and portal Cloud Run revisions with the self-hosted
    `TRIGGER_API_URL` after migrations and seed pass. These deploys run in
    parallel with the Trigger.dev task lane.
11. Smoke check API `/v1/health`, app `/api/health`, and the portal root after
    the service and Trigger.dev task deployments finish.

The migration job and seed job are the required gates before service rollout.
This gated-parallel shape keeps deployment evidence in one Cloud Build run while
avoiding unnecessary linear waits between independent service lanes. Frontend
image builds are intentionally throttled to avoid two memory-heavy Next.js
builds competing on the same worker.

The seed job uses the same database-job service account as the migration job.
That identity needs access to the environment `DATABASE_URL` secret and Cloud SQL
instance before the trigger runs.

Frontend public values are passed as explicit substitutions:

- `_API_URL`
- `_APP_URL`
- `_PORTAL_URL`
- `_AUTH_PRIMARY_DOMAIN`
- `_AUTH_STAGING_DOMAIN`
- `_TRIGGER_URL`
- `_TRIGGER_VM`
- `_TRIGGER_ZONE`

Cloud Build sets the same non-secret runtime URLs and auth domains on updated
Cloud Run revisions. Runtime secrets remain in Secret Manager. The pipeline does
not read committed env files and does not inject secret values into build
arguments.

The Trigger.dev deployment details and one-time secret bootstrap are documented
in [`trigger-self-hosting-gcp.md`](trigger-self-hosting-gcp.md).

## Evidence Locations

- Cloud Build logs: Cloud Build build details for the trigger run.
- Approval records: Cloud Build approval tab for production runs.
- Migration job logs: Cloud Run Job execution logs for `_MIGRATOR_JOB`.
- Seed job logs: Cloud Run Job execution logs for `_SEEDER_JOB`.
- Revision traceability: Cloud Run revisions reference images tagged by
  `$COMMIT_SHA`.
- Smoke-check output: final Cloud Build curl steps after the parallel service
  rollout has completed.

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
