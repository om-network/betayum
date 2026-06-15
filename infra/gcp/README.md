# Betayum GCP Cloud Run Baseline

This directory contains the Terraform/OpenTofu baseline for deploying Betayum to
Cloud Run through Cloud Build.

The baseline is intentionally apply-gated. Project ownership, billing,
Terraform state, DNS ownership, and final IAM principal bindings must be
confirmed by an operator before any plan is applied.

## Environment Model

| Environment | Branch    | Approval  | Domain root           |
| ----------- | --------- | --------- | --------------------- |
| staging     | `develop` | automatic | `staging.betayum.com` |
| production  | `release` | required  | `betayum.com`         |

Staging and production should use separate GCP projects. Secret values are not
managed in Terraform; this baseline creates Secret Manager shells only. The
first apply keeps `mount_runtime_secrets = false` so Cloud Run services and the
migrator job can be created before Secret Manager versions exist.

## What This Declares

- Required GCP APIs per environment.
- Artifact Registry repositories for immutable service images.
- Cloud Build deployer service accounts scoped per environment.
- Runtime service accounts for API, app, portal, and migration jobs.
- Private Google Cloud Storage buckets for app data and device-agent artifacts.
- Secret Manager secret shells with environment-scoped names.
- Cloud Run services for API, app, and portal.
- A Cloud Run migration job that Cloud Build runs before service rollout.
- Cloud SQL attachments and IAM client grants when an environment provides a
  `cloud_sql_instance_connection_name`.
- External HTTPS load balancer resources with managed certificates.
- Serverless NEGs and backend services with request logging enabled.
- Optional Cloud Armor attachment through `security_policy_id`.
- Cloud Build triggers for `develop` and `release`, with production approval.
- `_Default` log bucket retention for deployment evidence.

## Object Storage

Runtime object storage uses Google Cloud Storage and Application Default
Credentials. Cloud Run services authenticate with their attached service
accounts; do not seed long-lived GCS interoperability keys for production.

Each environment creates:

- One private app-data bucket exposed to services as
  `APP_OBJECT_STORAGE_BUCKET`.
- One private device-agent artifact bucket exposed as
  `APP_DEVICE_AGENT_ARTIFACTS_BUCKET`.

Customer-data objects must remain private and use organization-prefixed keys.
The API runtime service account receives object-admin access to the app-data
bucket. API and portal runtime service accounts receive read access to the
device-agent artifact bucket for download/proxy behavior. Runtime service
accounts are also granted `roles/iam.serviceAccountTokenCreator` on themselves
so the GCS client can mint V4 signed URLs through Application Default
Credentials.

Some app, portal, and API callers still use the S3-compatible GCS
interoperability helpers. Until those callers are migrated to the API object
storage adapter, seed `APP_GCP_ACCESS_KEY_ID` and `APP_GCP_SECRET_ACCESS_KEY`
secret values when `mount_runtime_secrets = true`; the baseline also wires the
matching `APP_GCP_*` bucket, endpoint, and region environment variables.

## Operator Inputs

Copy the example file and replace placeholders:

```bash
cd infra/gcp
cp terraform.tfvars.example terraform.tfvars
```

Required decisions before `plan`:

- Staging and production project IDs.
- Billing and project ownership.
- OpenTofu/Terraform state backend.
- DNS zone owner for `betayum.com`.
- Optional reserved global edge IP addresses.
- Existing Cloud SQL instance connection names, if the environment uses Cloud
  SQL. The database instance lifecycle is intentionally external to this
  baseline unless the team decides Terraform should own it later.
- Optional custom GCS bucket names. If omitted, bucket names are derived from
  project ID, environment, and bucket purpose.
- Optional Cloud Armor security policy IDs.
- Final Cloud Build GitHub App connection authorization.

## Safe Workflow

Use OpenTofu or Terraform consistently for a workspace. Do not commit
`terraform.tfvars` or state files.

```bash
tofu init
tofu fmt -check
tofu validate
tofu plan -out staging-prod.plan
```

After review and approval:

```bash
tofu apply staging-prod.plan
```

Insert secret values after the Secret Manager shells exist, then set
`mount_runtime_secrets = true` and apply again to wire runtime revisions to the
`latest` secret versions. Cloud Run revisions will not be usable until required
secrets and Cloud Build substitutions are in place.

For Cloud SQL environments, set `DATABASE_URL` to use the mounted Unix socket,
for example:

```text
postgresql://USER:PASSWORD@localhost:5432/DATABASE?host=/cloudsql/PROJECT:REGION:INSTANCE
```

For local object-storage development, use Application Default Credentials:

```bash
gcloud auth application-default login
```

When testing with a deployed service-account identity, prefer impersonation:

```bash
gcloud auth application-default login --impersonate-service-account SERVICE_ACCOUNT_EMAIL
```

## Evidence

Capture these artifacts for ISO-oriented deployment records:

- Reviewed pull request for infrastructure changes.
- `tofu plan` output attached to the change record.
- Cloud Build trigger approval for production.
- Cloud Build build logs.
- Cloud Run migration job execution logs.
- Cloud Run revision history for API, app, and portal.
- Load balancer request logs and certificate status.
